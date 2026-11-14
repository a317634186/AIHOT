// Read-only audit of public purchase destinations; never prints full URLs or secrets.
import { isDirectRetailerProductUrl } from '@aihot/industry/shopping';
import { closeDb, sql } from '@aihot/backend/db';

try {
  const rows = await sql<{ buy_url: string }[]>`
    SELECT d.data->>'buyUrl' AS buy_url
    FROM shopping_offers d
    JOIN publications p ON p.article_id=d.article_id
    WHERE p.visibility='public'
      AND d.data->>'kind' IN ('product_deal','coupon_offer','cashback_offer','freebie')
      AND nullif(d.data->>'buyUrl','') IS NOT NULL`;
  const hiddenHosts = new Map<string, number>();
  let direct = 0;
  for (const row of rows) {
    if (isDirectRetailerProductUrl(row.buy_url)) { direct++; continue; }
    let host = 'invalid-url';
    try { host = new URL(row.buy_url).hostname; } catch {}
    hiddenHosts.set(host, (hiddenHosts.get(host) ?? 0) + 1);
  }
  console.log(JSON.stringify({
    event: 'audit-complete',
    totalWithPurchaseUrl: rows.length,
    directRetailerProductLinks: direct,
    filteredPurchaseUrls: rows.length - direct,
    topFilteredHosts: [...hiddenHosts].sort((a, b) => b[1] - a[1]).slice(0, 12),
  }));
} finally {
  await closeDb();
}
