// Recheck direct retailer URLs previously suggested by paid web-search receipts, without another model call.
import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import { cleanMerchantLink, offerIdentity, type Offer } from '@aihot/contracts/shopping';
import { isDirectRetailerProductUrl, merchantFor } from '@aihot/industry/shopping';
import { sql, closeDb } from '@aihot/backend/db';
import { guardedFetch } from '@aihot/backend/lib/http-fetch';
import { stopBoss } from '@aihot/backend/jobs/queue';

type Row = { article_id: string; title: string; source_id: string; source_url: string; body_text: string | null; data: Offer };
type Candidate = { id: string; url: string; title: string; matchEvidence?: string };
const limit = Math.min(5000, Math.max(1, Number(process.argv[2] ?? 5000)));
const concurrency = 8;
const ignored = new Set('a an and at by for from in into of on or the to with new sale deal offer mens men womens women size color colors assorted select free shipping pack piece set premium product bundle bundles game games pc pcdd digital download edition collection items item store'.split(' '));

function words(value: string) {
  return [...new Set(value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter(x => x.length > 2 && !ignored.has(x)))];
}
function matches(row: Row, text: string, strict = true) {
  const wanted = words(row.data.product || row.title), hay = text.toLowerCase().normalize('NFKD');
  if (wanted.length < 2) return false;
  const hits = wanted.filter(x => hay.includes(x)).length;
  if (hits < Math.min(wanted.length, Math.max(2, Math.ceil(wanted.length * (strict ? 0.6 : 0.4))))) return false;
  if (!strict) return true;
  const models = String(row.data.model ?? '').split(/[^A-Za-z0-9]+/).filter(x => /\d/.test(x) && x.length >= 3).map(x => x.toLowerCase());
  return models.every(x => hay.includes(x));
}
function parse(text: string): Candidate[] {
  const i = text.indexOf('{'), j = text.lastIndexOf('}');
  if (i < 0 || j <= i) return [];
  try {
    const value = JSON.parse(text.slice(i, j + 1));
    return Array.isArray(value.results) ? value.results.filter((x: any) => x && typeof x.id === 'string' && typeof x.url === 'string' && typeof x.title === 'string') : [];
  } catch { return []; }
}
function responseCandidates(response: any): Candidate[] {
  const text = (response?.output ?? []).filter((x: any) => x.type === 'message').flatMap((x: any) => x.content ?? [])
    .filter((x: any) => x.type === 'output_text').map((x: any) => x.text).join('\n');
  return parse(text);
}
async function verify(raw: string, row: Row) {
  const start = cleanMerchantLink(raw), initial = merchantFor(start);
  if (!initial || !isDirectRetailerProductUrl(start)) return null;
  try {
    const page = await guardedFetch(start, { route: 'direct', timeoutMs: 5000, maxBytes: 2_000_000, headers: { 'accept-language': 'en-US,en;q=0.9' } });
    if (page.status === 200) {
      const $ = load(page.text()), title = $('meta[property="og:title"]').attr('content') || $('title').first().text() || '';
      const url = cleanMerchantLink(page.url), merchant = merchantFor(url);
      const evidence = `${title} ${$('meta[name="description"]').attr('content') ?? ''} ${$('body').text().slice(0, 8000)} ${url}`;
      if (merchant?.id === initial.id && isDirectRetailerProductUrl(url) && matches(row, evidence)) return { url, merchant, title };
    }
  } catch {}
  const u = new URL(start), reader = 'https://r.jina.ai/https://' + u.host + u.pathname + u.search;
  try {
    const page = await guardedFetch(reader, { route: 'direct', timeoutMs: 12000, maxBytes: 2_500_000, headers: { 'x-base': 'final', 'x-return-format': 'markdown' } });
    if (page.status !== 200) return null;
    const text = page.text(), rawFinal = text.match(/^URL Source:\s*(\S+)$/mi)?.[1];
    if (!rawFinal) return null;
    const url = cleanMerchantLink(rawFinal.replaceAll('&amp;', '&')), merchant = merchantFor(url), title = text.match(/^Title:\s*(.+)$/mi)?.[1] ?? '';
    if (merchant?.id === initial.id && isDirectRetailerProductUrl(url) && matches(row, `${title} ${text} ${url}`)) return { url, merchant, title };
  } catch {}
  return null;
}
async function save(row: Row, url: string, merchant: NonNullable<ReturnType<typeof merchantFor>>) {
  return sql.begin(async tx => {
    const [current] = await tx<{ data: Offer }[]>`SELECT data FROM shopping_offers WHERE article_id=${row.article_id} FOR UPDATE`;
    if (!current || (current.data.buyUrl ?? null) !== (row.data.buyUrl ?? null)) return false;
    if (current.data.buyUrl && isDirectRetailerProductUrl(current.data.buyUrl)) return false;
    const data = { ...current.data, buyUrl: url, merchant: merchant.name, merchantId: merchant.id } as Offer;
    const identity = offerIdentity(data); data.identity = identity ? createHash('sha256').update(identity).digest('hex') : null;
    const [prior] = await tx<{ max_id: string | null }[]>`SELECT max(id)::text AS max_id FROM shopping_price_observations WHERE article_id=${row.article_id}`;
    await tx`UPDATE shopping_offers SET data=${tx.json(data as never)},identity_key=${data.identity},updated_at=now() WHERE article_id=${row.article_id}`;
    await tx`UPDATE shopping_price_observations h SET offer_context=shopping_price_context(d.data) FROM shopping_offers d WHERE d.article_id=${row.article_id} AND h.article_id=d.article_id`;
    if (prior?.max_id) await tx`DELETE FROM shopping_price_observations WHERE article_id=${row.article_id} AND id>${prior.max_id}::bigint`;
    return true;
  });
}

try {
  const receipts = await sql<{ response: any }[]>`SELECT response FROM receipts WHERE purpose='shopping_link_resolution' AND status='completed' ORDER BY created_at DESC LIMIT 5000`;
  const candidates = receipts.flatMap(r => responseCandidates(r.response));
  const unique = new Map<string, Candidate[]>();
  for (const candidate of candidates) { const list = unique.get(candidate.id) ?? []; list.push(candidate); unique.set(candidate.id, list); }
  const ids = [...unique.keys()];
  const rows = await sql<Row[]>`
    SELECT d.article_id,a.title,a.source_id,a.url AS source_url,a.body_text,d.data
    FROM shopping_offers d JOIN publications p ON p.article_id=d.article_id JOIN articles a ON a.id=d.article_id
    WHERE p.visibility='public' AND d.data->>'kind' IN ('product_deal','coupon_offer','cashback_offer','freebie')
      AND nullif(d.data->>'buyUrl','') IS NULL AND d.article_id=ANY(${ids}::text[])
    ORDER BY p.timeline_at DESC LIMIT ${limit}`;
  const byId = new Map(rows.map(r => [r.article_id, r]));
  let cursor = 0, saved = 0, attempted = 0;
  async function work() {
    while (cursor < rows.length) {
      const row = rows[cursor++]!;
      for (const candidate of unique.get(row.article_id) ?? []) {
        const evidence = `${candidate.title} ${candidate.matchEvidence ?? ''} ${candidate.url}`;
        if (!matches(row, evidence, false)) continue;
        attempted++;
        const result = await verify(candidate.url, row);
        if (result && await save(row, result.url, result.merchant)) {
          saved++;
          console.log(JSON.stringify({ event: 'replayed-candidate', id: row.article_id, source: row.source_id, merchant: result.merchant.name, url: result.url, title: result.title }));
          break;
        }
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, work));
  console.log(JSON.stringify({ event: 'complete', receipts: receipts.length, candidates: candidates.length, candidateItems: unique.size, rows: byId.size, attempted, saved }));
} finally { await stopBoss(); await closeDb(); }
