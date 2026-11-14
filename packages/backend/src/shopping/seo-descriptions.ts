import { createHash } from 'node:crypto';
import { z } from 'zod';
import { cents, isOffer, isCalibratedRegularPrice, safeCopy, truncateAtWord, type Offer } from '@aihot/contracts/shopping';
import { sql } from '../db.ts';
import { modelFor } from '../editorial/models.ts';
import { promptText, promptVersion } from '../editorial/prompts.ts';
import { BudgetExceededError, ProviderRejectedError } from '../providers/receipts.ts';
import { chatJson, markReceiptsCompleted, ModelOutputError } from '../providers/llm.ts';
import { shoppingItems, type ShoppingItem } from '../publication/shopping.ts';
import { keywordBankMatches } from './keyword-grounding.ts';
import { supportedItemSeoTitle } from '@aihot/contracts/shopping';

const BatchSchema = z.object({
  items: z.array(z.object({
    id: z.string().trim().min(1).max(80),
    seoDescription: z.string().trim().min(30).max(240).nullable().optional(),
    seoTitle: z.string().trim().min(20).max(120).nullable().optional(),
    searchKeywords: z.array(z.string().trim().min(2).max(80)).max(8).optional(),
  })).max(20),
});

const BOILERPLATE_RE = /^(?:source[- ]reported price|retailer[- ]verified price|last retailer[- ]verified price|the source did not report|the source price or coupon|checking the retailer|unverified\s*:)/i;
const TRAILING_DISCLAIMER_RE = /\s*(?:not confirmed by the retailer\.?|confirm current price at checkout\.?|check the (?:source and )?retailer for current (?:pricing|terms|availability)\.?|the reported price or coupon details need review\.?)\s*/gi;

export function supportedSeoDescription(
  raw: string | null | undefined,
  currentPriceCents: number | null,
  listedPriceCents: number | null,
  extraCents: number[] = [],
): string | null {
  if (!raw) return null;
  const cleaned = safeCopy(raw)
    .replace(TRAILING_DISCLAIMER_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length < 45 || BOILERPLATE_RE.test(cleaned)) return null;
  const compact = truncateAtWord(cleaned, 160);
  const claimed = [...compact.matchAll(/\$\s*(\d[\d,]*(?:\.\d{1,2})?)(?!\d|\.\d)/g)]
    .map((m) => cents(m[1]))
    .filter((v): v is number => v !== null);
  const allowed = new Set(
    [currentPriceCents, listedPriceCents, ...extraCents].filter((v): v is number => v !== null && Number.isSafeInteger(v)),
  );
  if (claimed.some((v) => !allowed.has(v))) return null;
  if (currentPriceCents !== null && claimed.length > 0 && !claimed.includes(currentPriceCents)) return null;
  return compact;
}

function extractMoneyCents(text: string): number[] {
  return [...text.matchAll(/\$\s*(\d[\d,]*(?:\.\d{1,2})?)(?!\d|\.\d)/g)]
    .map((m) => cents(m[1]))
    .filter((v): v is number => v !== null);
}

export async function refreshMissingShoppingSeoDescriptions(limit = 30) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error('Supply a batch limit from 1 to 200');
  const candidates = await sql<{ article_id: string; revision: number; title: string; body_text: string | null; excerpt: string | null; data: Offer; input_revision: number }[]>`
    SELECT d.article_id, a.revision, a.title, a.body_text, a.excerpt, d.data, d.input_revision
    FROM shopping_offers d
    JOIN publications p ON p.article_id = d.article_id
    JOIN articles a ON a.id = d.article_id
    JOIN sources s ON s.id = a.source_id
    WHERE p.visibility = 'public' AND p.eligible AND a.processing_state <> 'blocked'
      AND s.participation_mode = 'editorial' AND p.seo_excluded_at IS NULL
      AND p.timeline_at <= now() + interval '5 minutes'
      AND COALESCE(d.data->>'status', 'Unverified') NOT IN ('Expired', 'Out of Stock')
      AND NOT (
        NULLIF(d.data->>'promotionEndedAt', '') IS NOT NULL
        AND NULLIF(d.data->>'verifiedAt', '') IS NULL
        AND COALESCE((d.data->>'priceRestored')::boolean, false) = false
      )
      AND (
        COALESCE(NULLIF(trim(d.data->>'seoDescription'), ''), '') = ''
        OR COALESCE(d.data->>'seoDescriptionPriceCents', 'null') IS DISTINCT FROM COALESCE(d.data->>'checkoutPriceCents', d.data->>'listedPriceCents', 'null')
        OR COALESCE(NULLIF(trim(d.data->>'seoTitle'), ''), '') = ''
      )
    ORDER BY p.timeline_at DESC
    LIMIT ${Math.min(limit * 2, 120)}`;

  const ready: Array<{
    id: string;
    revision: number;
    inputRevision: number;
    storedOffer: Offer;
    item: ShoppingItem;
    needsDescription: boolean;
    needsTitle: boolean;
    currentCents: number | null;
    listedCents: number | null;
    extraCents: number[];
    payload: Record<string, unknown>;
  }> = [];

  const money = (v: number | null) =>
    v === null ? null : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v / 100);

  for (const row of candidates) {
    if (ready.length >= limit) break;
    const item = (await shoppingItems({ id: row.article_id })).items[0];
    if (!item || item.id !== row.article_id || item.indexable === false) continue;
    if (['Expired', 'Out of Stock'].includes(item.offer.status) || item.priceDisplay.state !== 'current') continue;
    const currentCents = item.priceDisplay.amountCents;
    const listedCents = item.offer.listedPriceCents;
    const needsDescription = !item.offer.seoDescription?.trim() || item.offer.seoDescriptionPriceCents !== currentCents;
    const needsTitle = !item.offer.seoTitle?.trim();
    const sourceSnippet = `${row.title} ${truncateAtWord(String(row.body_text || row.excerpt || ''), 1200)}`.replace(/\s+/g, ' ').trim();
    ready.push({
      id: row.article_id,
      revision: row.revision,
      inputRevision: row.input_revision,
      storedOffer: row.data,
      item,
      needsDescription,
      needsTitle,
      currentCents,
      listedCents,
      extraCents: extractMoneyCents(sourceSnippet),
      payload: {
        id: row.article_id,
        kind: item.offer.kind,
        activityScope: item.offer.activityScope ?? null,
        title: item.title,
        brand: item.offer.brand,
        product: item.offer.product,
        model: item.offer.model,
        variant: item.offer.variant,
        merchant: item.offer.merchant ?? (isOffer(item.offer) ? item.offer.seller : null),
        publisher: item.source,
        currentPrice: money(currentCents),
        listedPrice: listedCents !== null && listedCents !== currentCents ? money(listedCents) : null,
        dailySale: isCalibratedRegularPrice(row.data),
        coupon: row.data.priceRestored || row.data.promotionEndedAt ? null : item.offer.coupon,
        deadline: row.data.priceRestored || row.data.promotionEndedAt ? null : item.offer.deadlineOriginal ?? item.offer.expiresAt,
        highlights: item.offer.aiOverview?.highlights?.slice(0, 2) ?? [],
        summary: truncateAtWord(item.summary, 400),
        sourceExcerpt: truncateAtWord(sourceSnippet, 600),
        existingSeoTitle: item.offer.seoTitle ?? null,
        needsSeoTitle: needsTitle,
        localKeywordMatches: keywordBankMatches({ title: `${item.title} ${item.summary}`, category: item.category }),
      },
    });
  }

  if (!ready.length) return { scanned: candidates.length, requested: 0, updated: 0, failed: 0 };

  let updated = 0;
  let failed = 0;
  const dayBucket = Math.floor(Date.now() / (6 * 3600_000));
  for (let start = 0; start < ready.length; start += 5) {
    const batch = ready.slice(start, start + 5);
    const batchKey = createHash('sha256')
      .update(batch.map((b) => `${b.id}@${b.revision}:${b.currentCents ?? 'na'}`).join(','))
      .digest('hex')
      .slice(0, 16);
    const subject = `seo-batch:${dayBucket}:${batchKey}`;
    const [blocked] = await sql`SELECT 1 FROM receipts WHERE purpose = 'shopping_seo_description' AND subject = ${subject} AND status IN ('pending', 'unknown') LIMIT 1`;
    if (blocked) continue;
    try {
      const result = await chatJson({
        model: await modelFor('understand'),
        purpose: 'shopping_seo_description',
        subject,
        promptVersion: promptVersion('shopping-seo-description'),
        system: promptText('shopping-seo-description'),
        user: JSON.stringify({ items: batch.map((b) => b.payload) }),
        schema: BatchSchema,
        maxTokens: 1500,
        temperature: 0.2,
      });
      const byId = new Map(result.data.items.map((entry) => [entry.id, entry]));
      for (const entry of batch) {
        const output = byId.get(entry.id);
        const generated = supportedSeoDescription(
          output?.seoDescription,
          entry.currentCents,
          entry.listedCents,
          isOffer(entry.storedOffer) ? entry.extraCents : [],
        );
        const generatedTitle = entry.needsTitle ? supportedItemSeoTitle(output?.seoTitle, entry.item) : null;
        if (!generated && !generatedTitle) continue;
        const patch: Record<string, unknown> = {};
        if (generated) {
          patch.seoDescription = generated;
          patch.seoDescriptionPriceCents = entry.currentCents;
        }
        if (generatedTitle) {
          patch.seoTitle = generatedTitle;
          patch.searchKeywords = [...new Set((output?.searchKeywords ?? []).map(value => safeCopy(value).trim()).filter(Boolean))].slice(0, 8);
        }
        const nextOffer: Offer = {
          ...entry.storedOffer,
          ...(generated ? { seoDescription: generated, seoDescriptionPriceCents: entry.currentCents } : {}),
          ...(generatedTitle ? { seoTitle: generatedTitle } : {}),
        };
        const rows = await sql`
          UPDATE shopping_offers d
          SET data = d.data || ${sql.json(patch as never)}::jsonb,
              updated_at = now()
          WHERE d.article_id = ${entry.id}
            AND d.input_revision = ${entry.inputRevision}
            AND COALESCE(d.data->>'checkoutPriceCents', 'null') = COALESCE(${sql.json((nextOffer.checkoutPriceCents ?? null) as never)}::text, 'null')
            AND COALESCE(d.data->>'listedPriceCents', 'null') = COALESCE(${sql.json((nextOffer.listedPriceCents ?? null) as never)}::text, 'null')
          RETURNING d.article_id`;
        if (rows.length > 0) updated++;
      }
      await markReceiptsCompleted([result.receiptId]);
    } catch (error) {
      if (error instanceof BudgetExceededError) throw error;
      failed += batch.length;
      continue;
    }
  }
  return { scanned: candidates.length, requested: ready.length, updated, failed };
}
