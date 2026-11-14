import { z } from 'zod';
import { sql } from '../db.ts';
import { modelFor } from '../editorial/models.ts';
import { promptText, promptVersion } from '../editorial/prompts.ts';
import { chatJson, markReceiptsCompleted } from '../providers/llm.ts';
import { resetShoppingSeoCatalogCache, shoppingSeoCatalog } from '../publication/shopping-seo.ts';
import { shoppingItems } from '../publication/shopping.ts';
import { keywordBankProductPhrases } from './keyword-grounding.ts';
import { CATEGORIES } from '@aihot/industry/taxonomy';
import { MERCHANTS } from '@aihot/industry/shopping';

const HubOutput = z.object({
  items: z.array(z.object({
    path: z.string().trim().min(4).max(120),
    seoTitle: z.string().trim().min(20).max(120),
  })).max(8),
});

type HubCandidate = {
  path: string;
  label: string;
  kind: 'category' | 'store' | 'brand';
  count: number;
  key: string;
};

function normalized(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function supportedHubSeoTitle(raw: string, label: string): string | null {
  if (/\$\s*\d|\b\d+(?:\.\d+)?\s*%|\bsave\s+\$?\d/i.test(raw)) return null;
  const cleaned = raw
    .replace(/\s*[|·-]\s*Savlume(?:\s*Shopping)?\s*$/i, '')
    .replace(/\b(?:reported|listed)\s+(?:at|for|from)\b[^.!?|]*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length < 55 || cleaned.length > 68) return null;
  const title = cleaned;
  const labelWords = new Set(normalized(label).split(' ').filter(word => word.length >= 3));
  const titleWords = new Set(normalized(title).split(' '));
  if (labelWords.size > 0 && ![...labelWords].some(word => titleWords.has(word))) return null;
  return title;
}

export async function refreshMissingShoppingHubSeoTitles(limit = 8) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 30) throw new Error('Supply a batch limit from 1 to 30');
  if (process.env.MODEL_CALLS_ENABLED === 'false') return { scanned: 0, requested: 0, updated: 0 };

  const catalog = await shoppingSeoCatalog();
  const [rows] = await Promise.all([
    sql<{ path: string; seo_title: string }[]>`SELECT path, seo_title FROM shopping_hub_seo_titles`,
  ]);
  const existing = new Set(rows.map(row => row.path));
  const usedTitles = new Set(rows.map(row => normalized(row.seo_title)));
  const candidates: HubCandidate[] = [
    ...catalog.categories.map(item => ({ path: `/deals/${item.key}`, label: CATEGORIES.find(category => category.key === item.key)?.label ?? item.key, kind: 'category' as const, count: item.count, key: item.key })),
    ...catalog.merchants.map(item => ({ path: `/stores/${item.key}`, label: MERCHANTS.find(merchant => merchant.id === item.key)?.name ?? item.key, kind: 'store' as const, count: item.count, key: item.key })),
    ...catalog.brands.map(item => ({ path: `/brands/${item.slug}`, label: item.label, kind: 'brand' as const, count: item.count, key: item.key })),
  ]
    .filter(item => item.count >= 3 && !existing.has(item.path))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);

  if (!candidates.length) return { scanned: 0, requested: 0, updated: 0 };

  const payloads = await Promise.all(candidates.map(async candidate => {
    const page = await shoppingItems({
      view: 'deals',
      category: candidate.kind === 'category' ? candidate.key : undefined,
      merchant: candidate.kind === 'store' ? candidate.key : undefined,
      brand: candidate.kind === 'brand' ? candidate.label : undefined,
      sort: 'popular',
      limit: 40,
    });
    const titles = page.items.map(item => item.offer.product || item.title).filter(Boolean).slice(0, 12);
    const phraseCounts = new Map<string, number>();
    const categoryCounts = new Map<string, number>();
    for (const item of page.items) {
      if (item.category) categoryCounts.set(item.category, (categoryCounts.get(item.category) ?? 0) + 1);
      for (const phrase of keywordBankProductPhrases({
        title: `${item.title} ${item.offer.product ?? ''} ${item.offer.brand ?? ''}`,
        category: item.category,
      })) phraseCounts.set(phrase, (phraseCounts.get(phrase) ?? 0) + 1);
    }
    const productTypeCounts = [...phraseCounts].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, count]) => ({ name, count }));
    return {
      path: candidate.path,
      label: candidate.label,
      kind: candidate.kind,
      itemTitles: titles,
      productTypeCounts,
      categoryCounts: [...categoryCounts].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count })),
    };
  }));

  let updated = 0;
  const dayBucket = Math.floor(Date.now() / 86_400_000);
  for (let start = 0; start < payloads.length; start += 4) {
    const batch = payloads.slice(start, start + 4);
    const result = await chatJson({
      model: await modelFor('understand'),
      purpose: 'shopping_hub_seo_title',
      subject: `shopping-hub-seo:${dayBucket}:${batch.map(item => item.path).join(',')}`,
      promptVersion: promptVersion('shopping-hub-seo-title'),
      system: promptText('shopping-hub-seo-title'),
      user: JSON.stringify({ items: batch }),
      schema: HubOutput,
      maxTokens: 1200,
      temperature: 0.2,
    });
    const byPath = new Map(result.data.items.map(item => [item.path, item.seoTitle]));
    for (const candidate of batch) {
      const title = supportedHubSeoTitle(byPath.get(candidate.path) ?? '', candidate.label);
      if (!title) continue;
      if (usedTitles.has(normalized(title))) continue;
      const inserted = await sql`
        INSERT INTO shopping_hub_seo_titles(path, seo_title)
        VALUES (${candidate.path}, ${title})
        ON CONFLICT(path) DO NOTHING
        RETURNING path
      `;
      if (inserted.length > 0) {
        usedTitles.add(normalized(title));
        updated++;
      }
    }
    await markReceiptsCompleted([result.receiptId]);
  }
  resetShoppingSeoCatalogCache();
  return { scanned: candidates.length, requested: payloads.length, updated };
}
