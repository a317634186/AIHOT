// Amazon /clp/{ASIN} links are campaign pages, not the product detail page. Normalize only after the /dp/{ASIN} page matches.
import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import { offerIdentity, type Offer } from '@aihot/contracts/shopping';
import { isDirectRetailerProductUrl, merchantFor } from '@aihot/industry/shopping';
import { sql, closeDb } from '@aihot/backend/db';
import { guardedFetch } from '@aihot/backend/lib/http-fetch';
import { stopBoss } from '@aihot/backend/jobs/queue';

type Row = { article_id: string; title: string; product: string | null; model: string | null; data: Offer };
const ignored = new Set('a an and at by for from in into of on or the to with new sale deal offer mens men womens women size color colors assorted select free shipping pack piece set premium product'.split(' '));
const words = (v: string) => [...new Set(v.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter(x => x.length > 2 && !ignored.has(x)))];
function matches(row: Row, text: string) {
  const wanted = words(row.product || row.title), hay = text.toLowerCase().normalize('NFKD');
  if (wanted.length < 2) return false;
  const hits = wanted.filter(x => hay.includes(x)).length;
  if (hits < Math.min(wanted.length, Math.max(2, Math.ceil(wanted.length * 0.6)))) return false;
  const codes = String(row.model ?? '').split(/[^A-Za-z0-9]+/).filter(x => /\d/.test(x) && x.length >= 3).map(x => x.toLowerCase());
  return codes.every(x => hay.includes(x));
}
async function save(row: Row, url: string) {
  return sql.begin(async tx => {
    const [current] = await tx<{ data: Offer }[]>`SELECT data FROM shopping_offers WHERE article_id=${row.article_id} FOR UPDATE`;
    if (!current || current.data.buyUrl !== row.data.buyUrl) return false;
    if (!merchantFor(url) || !isDirectRetailerProductUrl(url)) return false;
    const data = { ...current.data, buyUrl: url, merchant: 'Amazon', merchantId: 'amazon' } as Offer;
    const identity = offerIdentity(data); data.identity = identity ? createHash('sha256').update(identity).digest('hex') : null;
    const [prior] = await tx<{ max_id: string | null }[]>`SELECT max(id)::text AS max_id FROM shopping_price_observations WHERE article_id=${row.article_id}`;
    await tx`UPDATE shopping_offers SET data=${tx.json(data as never)},identity_key=${data.identity},updated_at=now() WHERE article_id=${row.article_id}`;
    await tx`UPDATE shopping_price_observations h SET offer_context=shopping_price_context(d.data) FROM shopping_offers d WHERE d.article_id=${row.article_id} AND h.article_id=d.article_id`;
    if (prior?.max_id) await tx`DELETE FROM shopping_price_observations WHERE article_id=${row.article_id} AND id>${prior.max_id}::bigint`;
    return true;
  });
}

try {
  const raw = await sql<Row[]>`
    SELECT a.id AS article_id,a.title,d.data->>'product' AS product,d.data->>'model' AS model,d.data
    FROM articles a JOIN publications p ON p.article_id=a.id JOIN shopping_offers d ON d.article_id=a.id
    WHERE p.visibility='public' AND d.data->>'merchantId'='amazon' AND d.data->>'buyUrl' LIKE 'https://www.amazon.com/clp/%'
    ORDER BY p.timeline_at DESC`;
  const rows = raw.flatMap(row => {
    const m = /^https:\/\/www\.amazon\.com\/clp\/([A-Z0-9]{10})\/?(?:\?.*)?$/i.exec(row.data.buyUrl ?? '');
    return m ? [{ ...row, asin: m[1]!.toUpperCase() }] : [];
  });
  let cursor = 0, updated = 0, unresolved = 0;
  async function work() {
    while (cursor < rows.length) {
      const row = rows[cursor++]!, url = `https://www.amazon.com/dp/${row.asin}`;
      try {
        const page = await guardedFetch(url, { route: 'direct', timeoutMs: 12000, maxBytes: 4_000_000, headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', 'accept-language': 'en-US,en;q=0.9' } });
        if (page.status !== 200 || !isDirectRetailerProductUrl(page.url)) { unresolved++; continue; }
        const $ = load(page.text()), title = $('meta[property="og:title"]').attr('content') || $('title').first().text() || '';
        const evidence = `${title} ${$('meta[name="description"]').attr('content') ?? ''} ${$('body').text().slice(0, 12000)} ${page.url}`;
        if (!matches(row, evidence)) { unresolved++; console.log(JSON.stringify({ event: 'asin-mismatch', id: row.article_id, asin: row.asin, title: title.slice(0, 180) })); continue; }
        if (await save(row, url)) { updated++; console.log(JSON.stringify({ event: 'canonicalized-amazon-product', id: row.article_id, asin: row.asin, url, title: title.slice(0, 180) })); }
      } catch { unresolved++; }
    }
  }
  await Promise.all(Array.from({ length: 3 }, work));
  console.log(JSON.stringify({ event: 'complete', candidates: rows.length, updated, unresolved }));
} finally { await stopBoss(); await closeDb(); }
