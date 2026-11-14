// Remove publisher affiliate/analytics parameters from already saved direct retailer links.
import { createHash } from 'node:crypto';
import { cleanMerchantLink, offerIdentity, type Offer } from '@aihot/contracts/shopping';
import { merchantFor } from '@aihot/industry/shopping';
import { closeDb, sql } from '@aihot/backend/db';
import { stopBoss } from '@aihot/backend/jobs/queue';

type Row = { article_id: string; data: Offer };

try {
  const rows = await sql<Row[]>`
    SELECT d.article_id, d.data
    FROM shopping_offers d
    JOIN publications p ON p.article_id=d.article_id
    WHERE p.visibility='public'
      AND d.data->>'kind' IN ('product_deal','coupon_offer','cashback_offer','freebie')
      AND nullif(d.data->>'buyUrl','') IS NOT NULL
    ORDER BY p.timeline_at DESC`;
  let cleaned = 0;
  let skippedChanged = 0;
  for (const row of rows) {
    const original = row.data.buyUrl;
    if (!original || !merchantFor(original)) continue;
    let cleanedUrl: string;
    try { cleanedUrl = cleanMerchantLink(original); } catch { continue; }
    if (cleanedUrl === original) continue;
    const saved = await sql.begin(async tx => {
      const [current] = await tx<{ data: Offer }[]>`
        SELECT data FROM shopping_offers WHERE article_id=${row.article_id} FOR UPDATE`;
      if (!current || current.data.buyUrl !== original) return false;
      const data = { ...current.data, buyUrl: cleanedUrl } as Offer;
      const identity = offerIdentity(data);
      data.identity = identity ? createHash('sha256').update(identity).digest('hex') : null;
      await tx`
        UPDATE shopping_offers
        SET data=${tx.json(data as never)}, identity_key=${data.identity}, updated_at=now()
        WHERE article_id=${row.article_id}`;
      await tx`
        UPDATE shopping_price_observations h
        SET offer_context=shopping_price_context(d.data)
        FROM shopping_offers d
        WHERE d.article_id=${row.article_id} AND h.article_id=d.article_id`;
      return true;
    });
    if (saved) cleaned++;
    else skippedChanged++;
  }
  console.log(JSON.stringify({ event: 'complete', scanned: rows.length, cleaned, skippedChanged }));
} finally {
  await stopBoss();
  await closeDb();
}
