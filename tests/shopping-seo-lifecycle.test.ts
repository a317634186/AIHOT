import { stub, tag } from './setup.ts';
import { SHOPPING } from '@aihot/industry/shopping';
Object.defineProperty(SHOPPING, 'enabled', { value: true, configurable: true });
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { sql, closeDb } from '@aihot/backend/db';
import { stopBoss } from '@aihot/backend/jobs/queue';
import { upsertMaterial } from '@aihot/backend/content/materials';
import { publishArticle } from '@aihot/backend/publication/publish';
import { shoppingItems, detailRelatedShopping } from '@aihot/backend/publication/shopping';
import { deduplicateExistingShoppingOffers, deduplicateShoppingOffer, expireShoppingOffers, verifyShopping } from '@aihot/backend/shopping/offers';
import { refreshMissingShoppingSeoDescriptions, supportedSeoDescription } from '@aihot/backend/shopping/seo-descriptions';
import { resetShoppingSeoCatalogCache } from '@aihot/backend/publication/shopping-seo';
import { submitIndexNow } from '@aihot/backend/operations/indexnow';
import { officialProductEvidence } from '@aihot/backend/shopping/offers';
import type { guardedFetch } from '@aihot/backend/lib/http-fetch';
import { brandSlug, itemPath, itemSeoDescription, parseItemRouteSegment, type Offer } from '@aihot/contracts/shopping';
import { buildApp } from '../apps/api/src/app.ts';

const source = 'seo-lifecycle-' + tag();
await sql`INSERT INTO sources(id, name, kind, tier, participation_mode) VALUES(${source}, 'Synthetic SEO source', 'external', 'T2', 'editorial')`;
const createdIds: string[] = [];

let aiReplyItems: Array<{ id: string; seoDescription: string }> = [];
const provider = await stub(async (_hit, req) => {
  const parsed = JSON.parse(req.body);
  const userPayload = JSON.parse(parsed.messages.at(-1).content);
  const out = aiReplyItems.length
    ? aiReplyItems
    : (userPayload.items ?? []).map((it: any) => ({
        id: it.id,
        seoDescription: `${it.brand ? it.brand + ' ' : ''}${it.product ?? it.title} for ${it.currentPrice ?? '$35.00'} at ${it.merchant}. Compact 25W Qi2 magnetic charging for travel.${it.coupon ? ' Use code SAVE10.' : ''}`,
      }));
  return {
    choices: [{ message: { content: JSON.stringify({ items: out }) } }],
    usage: { prompt_tokens: 10, completion_tokens: 20 },
  };
});
Object.assign(process.env, {
  LLM_BASE_URL: provider.url + '/v1',
  LLM_API_KEY: 'test-key',
  LLM_MODEL: 'default',
  UNDERSTAND_MODEL: 'default',
  COLLECT_ENABLED: 'false',
});

const app = await buildApp();
after(async () => {
  if (createdIds.length) {
    await sql`UPDATE publications SET visibility = 'withdrawn' WHERE article_id = ANY(${createdIds}::text[])`;
  }
  await app.close();
  await provider.close();
  await stopBoss();
  await closeDb();
});

async function createOfferFixture(overrides: {
  title?: string;
  category?: string;
  publishedAt?: Date;
  offer?: Record<string, unknown>;
} = {}) {
  const key = tag();
  const publishedAt = overrides.publishedAt ?? new Date();
  const productName = (overrides.offer?.product as string | undefined) ?? `Picogo Qi2 25W Power Bank ${key}`;
  const title = overrides.title ?? `Baseus ${productName} for $35.00 with code SAVE10 at Amazon`;
  const evidence = (overrides.offer?.priceEvidence as string | undefined) ?? `Apply code SAVE10 at checkout on ${productName} for $35.00, down from regular price $50.00.`;
  const { articleId } = await upsertMaterial({
    sourceId: source,
    url: `https://example.invalid/deal/${key}`,
    title,
    bodyText: `${title}. ${evidence}`,
    bodyStatus: 'ok',
    via: 'fetch',
    publishedAt,
    discoveredAt: publishedAt,
  });
  createdIds.push(articleId);
  await sql`INSERT INTO analyses(article_id, input_revision, origin, relevance, category, title_zh, summary_zh, score, selected)
            VALUES(${articleId}, 1, 'rule', 'pass', ${overrides.category ?? 'electronics'}, ${title}, 'Compact magnetic wireless charger for phones.', 85, true)`;
  await publishArticle(articleId);
  await sql`UPDATE publications SET timeline_at = ${publishedAt}, published_at = ${publishedAt} WHERE article_id = ${articleId}`;
  const baseOffer = {
    kind: 'product_deal',
    activityScope: 'single_product',
    brand: 'Baseus',
    product: `Picogo Qi2 25W Power Bank ${key}`,
    model: `PB-${key}`,
    variant: '10,000mAh',
    condition: 'new',
    merchant: 'Amazon',
    merchantId: 'amazon',
    seller: 'Baseus Official',
    fulfillment: 'Amazon',
    buyUrl: `https://www.amazon.com/dp/B0${key.replace(/[^A-Za-z0-9]/g, '').toUpperCase().padEnd(8, '0').slice(0, 8)}`,
    imageUrl: null,
    imageSource: null,
    listedPriceCents: 5000,
    checkoutPriceCents: 3500,
    currency: 'USD',
    priceEvidence: `Apply code SAVE10 at checkout for $35.00, down from regular price $50.00.`,
    comparison: null,
    shipping: 'Free shipping with Prime',
    cashback: null,
    giftCard: null,
    points: null,
    coupon: 'Apply code SAVE10',
    steps: [],
    restrictions: [],
    membership: null,
    subscription: null,
    renewal: null,
    cancellation: null,
    region: 'US',
    expiresAt: new Date(Date.now() + 2 * 86400_000).toISOString(),
    deadlineOriginal: 'Ends soon',
    warranty: null,
    returns: null,
    status: 'Unverified',
    verifiedAt: null,
    lastCheckedAt: null,
    verificationNote: 'Synthetic fixture',
    identity: null,
    aiOverview: {
      format: 'recommendation',
      summary: 'Worth considering if you want compact Qi2 25W magnetic charging on the go.',
      bestFor: 'iPhone and Qi2 travelers',
      highlights: ['Delivers 25W Qi2 magnetic wireless fast charging in a pocket-sized shell.'],
      priceReason: 'Reported $35.00 is $15.00 below the $50.00 reference.',
      cautions: ['Check Prime shipping terms.'],
    },
    ...overrides.offer,
  };
  await sql`INSERT INTO shopping_offers(article_id, input_revision, data) VALUES(${articleId}, 1, ${sql.json(baseOffer as never)})`;
  return { articleId, key, baseOffer };
}

test('meta description strips boilerplate, follows Product + Price + Merchant + Selling Point + Code/Deadline, and refreshes via AI batch', async () => {
  assert.equal(supportedSeoDescription('Source-reported price: $35.00; not confirmed by the retailer.', 3500, 5000), null);
  assert.equal(supportedSeoDescription('Baseus Power Bank for $19.00 at Amazon. Pocket Qi2 charger.', 3500, 5000), null);
  assert.ok(supportedSeoDescription('Baseus Picogo Power Bank for $35.00 at Amazon. Compact 25W Qi2 magnetic wireless charging. Code SAVE10 · Ends Nov 8.', 3500, 5000));

  const { articleId } = await createOfferFixture();
  const beforeItem = (await shoppingItems({ id: articleId })).items[0]!;
  const fallbackDesc = itemSeoDescription(beforeItem);
  assert.doesNotMatch(fallbackDesc, /Source-reported|not confirmed|did not report|need review/i);
  assert.match(fallbackDesc, /Baseus Picogo Qi2 25W Power Bank.*\$35\.00.*at Amazon/);
  assert.match(fallbackDesc, /Code SAVE10/);
  assert.match(fallbackDesc, /Ends /);

  const batchRes = await refreshMissingShoppingSeoDescriptions(20);
  assert.ok(batchRes.updated >= 1);
  const afterItem = (await shoppingItems({ id: articleId })).items[0]!;
  assert.ok(afterItem.offer.seoDescription);
  assert.equal(afterItem.offer.seoDescriptionPriceCents, 3500);
  assert.equal(itemSeoDescription(afterItem), afterItem.offer.seoDescription);

  // Price change invalidates stale AI description until next scheduled refresh
  await sql`UPDATE shopping_offers SET data = data || ${sql.json({ checkoutPriceCents: 4200, listedPriceCents: 5000, coupon: null, priceRestored: true, promotionEndedAt: new Date().toISOString(), status: 'Active', verifiedAt: new Date().toISOString() } as never)}::jsonb WHERE article_id = ${articleId}`;
  const changedPriceItem = (await shoppingItems({ id: articleId })).items[0]!;
  assert.equal(changedPriceItem.offer.seoDescription, null);
  assert.match(itemSeoDescription(changedPriceItem), /\$42\.00/);
});

test('ended promotions restore latest retailer price, stay visible as daily sales, and rank below active deals', async () => {
  const groupKey = 'dailyrank' + tag();
  const endedDeal = await createOfferFixture({
    title: `Rank fixture ${groupKey} ended deal`,
    offer: {
      merchant: 'Wayfair',
      merchantId: 'wayfair',
      seller: 'Wayfair',
      buyUrl: 'https://www.wayfair.com/appliances/pdp/demo-cordless-vacuum-srnz1023.html',
      product: `Demo Cordless Vacuum ${groupKey}`,
      model: `VC-${groupKey}`,
      variant: null,
      coupon: null,
      priceEvidence: `Wayfair offers Demo Cordless Vacuum ${groupKey} for $79.00, down from regular price $129.00.`,
      listedPriceCents: 12900,
      checkoutPriceCents: 7900,
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    },
  });
  const activeDeal = await createOfferFixture({
    title: `Rank fixture ${groupKey} active deal for $89.00 at Amazon`,
    publishedAt: new Date(Date.now() - 3600_000),
    offer: {
      product: `Active Vacuum ${groupKey}`,
      model: `AC-${groupKey}`,
      coupon: null,
      priceEvidence: `Amazon offers Active Vacuum ${groupKey} for $89.00, down from regular price $129.00.`,
      listedPriceCents: 12900,
      checkoutPriceCents: 8900,
      expiresAt: new Date(Date.now() + 86400_000).toISOString(),
    },
  });

  await expireShoppingOffers();
  const mockRetailer: typeof guardedFetch = async (url) => {
    const html = `<meta property="og:title" content="Demo Cordless Vacuum VC-${groupKey}"><script type="application/ld+json">${JSON.stringify({
      '@type': 'Product',
      name: `Demo Cordless Vacuum ${groupKey} VC-${groupKey}`,
      sku: `VC-${groupKey}`,
      offers: {
        '@type': 'Offer',
        price: '119.00',
        priceCurrency: 'USD',
        availability: 'https://schema.org/InStock',
        itemCondition: 'https://schema.org/NewCondition',
      },
    })}</script>`;
    return { status: 200, url, headers: new Headers(), body: Buffer.from(html), text: () => html };
  };
  await verifyShopping(endedDeal.articleId, mockRetailer);

  const restored = (await shoppingItems({ id: endedDeal.articleId })).items[0]!;
  assert.equal(restored.priceDisplay.amountCents, 11900);
  assert.equal(restored.priceDisplay.state, 'current');
  assert.equal(restored.offer.priceRestored, true);
  assert.ok(restored.offer.promotionEndedAt);
  assert.match(restored.summary, /currently listed at \$119\.00/);

  for (const sort of ['popular', 'discount', 'latest'] as const) {
    const feed = await shoppingItems({ view: 'deals', q: `Rank fixture ${groupKey}`, sort });
    assert.deepEqual(
      feed.items.map((x) => x.id),
      [activeDeal.articleId, endedDeal.articleId],
      `Active deal must outrank daily-sale restored item under sort=${sort}`,
    );
  }
});

test('all public offers stay indexable across recent and older historical windows', async () => {
  const thirtyFiveDaysAgo = new Date(Date.now() - 35 * 86400_000);
  const fiveDaysAgo = new Date(Date.now() - 5 * 86400_000);

  const thinOldExpired = await createOfferFixture({
    publishedAt: thirtyFiveDaysAgo,
    offer: {
      status: 'Expired',
      expiresAt: thirtyFiveDaysAgo.toISOString(),
    },
  });
  const recentExpired = await createOfferFixture({
    publishedAt: fiveDaysAgo,
    offer: {
      status: 'Expired',
      expiresAt: fiveDaysAgo.toISOString(),
    },
  });
  const commentedOldExpired = await createOfferFixture({
    publishedAt: thirtyFiveDaysAgo,
    offer: {
      status: 'Expired',
      expiresAt: thirtyFiveDaysAgo.toISOString(),
    },
  });
  const userId = randomUUID();
  const handle = 'seo_u_' + tag();
  await sql`INSERT INTO community_users(id, handle, handle_key, password_salt, password_hash) VALUES(${userId}, ${handle}, ${handle}, 's', 'h')`;
  await sql`INSERT INTO community_posts(id, author_id, kind, article_id, body, status, content_hash, published_at)
            VALUES(${randomUUID()}, ${userId}, 'product_comment', ${commentedOldExpired.articleId}, 'Great battery life in real travel use.', 'published', ${tag()}, now())`;

  assert.equal((await shoppingItems({ id: thinOldExpired.articleId })).items[0]!.indexable, true);
  assert.equal((await shoppingItems({ id: recentExpired.articleId })).items[0]!.indexable, true);
  assert.equal((await shoppingItems({ id: commentedOldExpired.articleId })).items[0]!.indexable, true);

  const sitemap = (await app.inject('/sitemaps/items-1.xml')).body;
  assert.ok(sitemap.includes(itemPath({ id: thinOldExpired.articleId, title: 'Past offer item' })) || sitemap.includes(thinOldExpired.articleId));
  assert.ok(sitemap.includes(itemPath({ id: recentExpired.articleId, title: 'Past offer item' })));
  assert.ok(sitemap.includes(itemPath({ id: commentedOldExpired.articleId, title: 'Past offer item' })));
});

test('detail recommendations return 8-12 similar deals plus deduplicated same-merchant and same-category offers', async () => {
  const target = await createOfferFixture({ category: 'electronics', offer: { merchant: 'Amazon', merchantId: 'amazon' } });
  for (let i = 0; i < 16; i++) {
    await createOfferFixture({
      category: 'electronics',
      offer: {
        merchant: i % 2 === 0 ? 'Amazon' : 'Walmart',
        merchantId: i % 2 === 0 ? 'amazon' : 'walmart',
        seller: i % 2 === 0 ? 'Amazon' : 'Walmart',
        buyUrl: i % 2 === 0 ? `https://www.amazon.com/dp/B0TEST00${String(i).padStart(2, '0')}` : `https://www.walmart.com/ip/demo/${100000 + i}`,
      },
    });
  }
  const targetItem = (await shoppingItems({ id: target.articleId })).items[0]!;
  const groups = await detailRelatedShopping(targetItem);
  assert.ok(groups.related.length >= 8 && groups.related.length <= 12, `Expected 8-12 related items, got ${groups.related.length}`);
  assert.ok(groups.merchantRelated.length > 0, 'Expected same-merchant deals');
  assert.ok(groups.categoryRelated.length > 0, 'Expected same-category deals');
  const allIds = [...groups.related, ...groups.merchantRelated, ...groups.categoryRelated].map((x) => x.id);
  assert.equal(new Set(allIds).size, allIds.length, 'Sections must not duplicate offers');
  assert.ok(!allIds.includes(target.articleId));
  assert.ok(groups.merchantRelated.every((x) => x.offer.merchantId === 'amazon'));
  assert.ok(groups.categoryRelated.every((x) => x.category === 'electronics'));

  const apiPayload = (await app.inject('/api/shopping?id=' + target.articleId)).json();
  assert.equal(apiPayload.related.length, groups.related.length);
  assert.equal(apiPayload.merchantRelated.length, groups.merchantRelated.length);
  assert.equal(apiPayload.categoryRelated.length, groups.categoryRelated.length);
});

test('duplicate storewide events and product deals only shelve one canonical page and prevent shelving future duplicates', async () => {
  const firstEvent = await createOfferFixture({
    title: 'Woot Warehouse Clean Out: Multi-Category Clearance Event',
    offer: {
      kind: 'shopping_news',
      activityScope: 'storewide',
      merchant: 'Woot',
      merchantId: 'woot',
      product: null,
      model: null,
      variant: null,
      coupon: null,
      listedPriceCents: null,
      checkoutPriceCents: null,
      buyUrl: 'https://www.woot.com/category/electronics',
      imageFallbackUrl: 'https://d.dlnws.com/example-product.jpg',
      imageFallbackSource: 'https://www.dealnews.com/example',
    },
  });
  // Second duplicate event arrives before publishArticle runs
  const key2 = tag();
  const dupTitle = 'Woot Warehouse Clean Out: Up to 80% Off Open-Box Items';
  const { articleId: secondEventId } = await upsertMaterial({
    sourceId: source,
    url: `https://example.invalid/deal/${key2}`,
    title: dupTitle,
    bodyText: dupTitle,
    bodyStatus: 'ok',
    via: 'fetch',
    publishedAt: new Date(),
  });
  createdIds.push(secondEventId);
  await sql`INSERT INTO analyses(article_id, input_revision, origin, relevance, category, title_zh, summary_zh, score, selected)
            VALUES(${secondEventId}, 1, 'rule', 'pass', 'electronics', ${dupTitle}, 'Duplicate warehouse clean out sale.', 80, true)`;
  await sql`INSERT INTO shopping_offers(article_id, input_revision, data) VALUES(${secondEventId}, 1, ${sql.json({
    kind: 'product_deal',
    activityScope: 'storewide',
    merchant: 'Woot',
    merchantId: 'woot',
    product: 'Woot Warehouse Clean Out sale',
    model: null,
    variant: null,
    condition: null,
    seller: null,
    fulfillment: null,
    buyUrl: 'https://www.woot.com/category/electronics',
    imageUrl: null,
    imageSource: null,
    listedPriceCents: null,
    checkoutPriceCents: null,
    currency: 'USD',
    priceEvidence: null,
    comparison: null,
    shipping: null,
    cashback: null,
    giftCard: null,
    points: null,
    coupon: null,
    steps: [],
    restrictions: [],
    membership: null,
    subscription: null,
    renewal: null,
    cancellation: null,
    region: 'US',
    expiresAt: null,
    deadlineOriginal: null,
    warranty: null,
    returns: null,
    status: 'Unverified',
    verifiedAt: null,
    lastCheckedAt: null,
    verificationNote: 'Fixture',
    identity: null,
  } as never)})`;
  const canonicalId = await deduplicateShoppingOffer(secondEventId);
  assert.equal(canonicalId, firstEvent.articleId);
  // Even when publishArticle runs right afterward, editorial_overrides keeps the duplicate withdrawn
  await publishArticle(secondEventId);
  const [pubRow] = await sql`SELECT visibility FROM publications WHERE article_id = ${secondEventId}`;
  assert.equal(pubRow?.visibility, 'withdrawn');
  assert.equal((await shoppingItems({ id: secondEventId })).items[0]?.id, firstEvent.articleId);
  assert.equal((await shoppingItems({ id: firstEvent.articleId })).items.length, 1);

  // Sweep also withdraws already-public duplicate product deals while keeping the canonical item
  const asin = 'B0DUP' + tag().replace(/[^A-Za-z0-9]/g, '').toUpperCase().padEnd(5, '0').slice(0, 5);
  const prodA = await createOfferFixture({
    title: `Apple AirPods Pro 3 ${asin} for $199.00 at Amazon`,
    offer: {
      product: `Apple AirPods Pro 3 ${asin}`,
      model: `APP3-${asin}`,
      coupon: null,
      buyUrl: `https://www.amazon.com/dp/${asin}?language=en_US`,
      listedPriceCents: 24900,
      checkoutPriceCents: 19900,
      priceEvidence: `Amazon offers Apple AirPods Pro 3 ${asin} for $199.00, down from regular price $249.00.`,
      imageFallbackUrl: 'https://example.invalid/airpods.jpg',
    },
  });
  const prodB = await createOfferFixture({
    title: `AirPods Pro 3 ${asin} for $199.00 at Amazon`,
    offer: {
      product: `AirPods Pro 3 ${asin}`,
      model: null,
      coupon: null,
      buyUrl: `https://www.amazon.com/gp/product/${asin}/ref=sr_1_1?psc=1`,
      listedPriceCents: 24900,
      checkoutPriceCents: 19900,
      priceEvidence: `Amazon offers AirPods Pro 3 ${asin} for $199.00, down from regular price $249.00.`,
    },
  });
  const swept = await deduplicateExistingShoppingOffers(14);
  assert.ok(swept.withdrawn >= 1);
  assert.equal((await shoppingItems({ id: prodA.articleId })).items.length, 1);
  assert.equal((await shoppingItems({ id: prodB.articleId })).items[0]?.id, prodA.articleId);
  assert.equal((await shoppingItems({ view: 'deals', q: asin })).items.length, 1);
});

test('sitemaps/pages.xml uses truthful per-page lastmod and excludes thin/overlapping utility pages', async () => {
  const thinStoreItem = await createOfferFixture({
    title: 'Dell UltraSharp Monitor for $299.00 at Dell',
    category: 'electronics',
    offer: {
      product: 'Dell UltraSharp 27 Monitor',
      model: 'U2724D',
      coupon: null,
      merchant: 'Dell',
      merchantId: 'dell',
      seller: 'Dell',
      buyUrl: 'https://www.dell.com/en-us/shop/dell-ultrasharp-27-monitor-u2724d/apd/210-bgtg/monitors-monitor-accessories',
      listedPriceCents: 39900,
      checkoutPriceCents: 29900,
      priceEvidence: 'Dell offers Dell UltraSharp 27 Monitor for $299.00, down from regular price $399.00.',
    },
  });
  assert.ok(thinStoreItem.articleId);
  resetShoppingSeoCatalogCache();
  const pagesXml = (await app.inject('/sitemaps/pages.xml')).body;
  for (const excluded of ['/more</loc>', '/agent</loc>', '/all</loc>', '/flash</loc>']) {
    assert.ok(!pagesXml.includes(excluded), `Expected ${excluded} to be excluded from pages.xml`);
  }
  for (const included of ['/categories</loc>', '/stores</loc>', '/about</loc>', '/privacy</loc>', '/terms</loc>', '/stores/amazon</loc>']) {
    assert.ok(pagesXml.includes(included), `Expected ${included} in pages.xml`);
  }
  const lastmodFor = (suffix: string) => {
    const re = new RegExp(`<url><loc>https?://[^/<]+${suffix}</loc><lastmod>([^<]+)</lastmod></url>`);
    return pagesXml.match(re)?.[1] ?? null;
  };
  const homeMod = lastmodFor('/');
  const privacyMod = lastmodFor('/privacy');
  assert.ok(homeMod && privacyMod);
  assert.notEqual(homeMod, privacyMod, 'Static /privacy lastmod must not mirror dynamic home feed lastmod');
  assert.ok(pagesXml.includes('/brands/baseus</loc>'), 'Brands with >= 3 items should appear in pages.xml');
  assert.equal(brandSlug("M&M's"), 'mms');
});

test('keyword-rich canonical item URLs, IndexNow coverage, seasonal hubs, and Walmart/ProductGroup verification work end to end', async () => {
  const bfDeal = await createOfferFixture({
    title: 'Samsung 65-inch OLED TV Early Black Friday Deal for $1,199.00 at Best Buy',
    category: 'electronics',
    offer: {
      brand: 'Samsung',
      product: 'Samsung 65-inch S90D OLED 4K TV',
      model: 'QN65S90D',
      coupon: null,
      selected: false,
      merchant: 'Best Buy',
      merchantId: 'best-buy',
      seller: 'Best Buy',
      buyUrl: 'https://www.bestbuy.com/site/samsung-65-s90d-oled/6576598.p',
      listedPriceCents: 199900,
      checkoutPriceCents: 119900,
      priceEvidence: 'Best Buy offers Samsung 65-inch S90D OLED 4K TV for $1,199.00, down from regular price $1,999.00.',
    },
  });
  // Ensure unselected eligible items are still pushed by IndexNow with semantic slug URLs
  await sql`UPDATE publications SET selected = false, indexable = false, updated_at = now() WHERE article_id = ${bfDeal.articleId}`;
  await sql`DELETE FROM settings WHERE key = 'indexnow.watermark'`;
  const indexNowRes = await submitIndexNow(new Date(Date.now() + 5000));
  const canonicalItem = itemPath({ id: bfDeal.articleId, title: 'Samsung 65-inch OLED TV', offer: { brand: 'Samsung', product: 'Samsung 65-inch S90D OLED 4K TV', merchant: 'Best Buy' } });
  assert.match(canonicalItem, /^\/items\/samsung-.*--[a-z0-9]{20,32}$/);
  assert.equal(itemPath({ id: bfDeal.articleId, title: 'Samsung 65-inch OLED TV', offer: { brand: 'Samsung', product: 'Samsung 65-inch S90D OLED 4K TV', merchant: 'Best Buy' } }).endsWith('--'+bfDeal.articleId), true);
  assert.equal(parseItemRouteSegment(`samsung-tv--${bfDeal.articleId}`), bfDeal.articleId);
  assert.equal(parseItemRouteSegment(`samsung-tv-${bfDeal.articleId}`), bfDeal.articleId);
  assert.equal(parseItemRouteSegment('campaign-deal--campaign-target-2026-11-08'), 'campaign-target-2026-11-08');
  assert.ok(indexNowRes.urls >= 10, `Expected IndexNow to cover all indexable shopping items, got ${indexNowRes.urls}`);

  // Seasonal hubs return live deals
  const bfFeed = await shoppingItems({ view: 'black-friday' });
  assert.ok(bfFeed.items.some((x) => x.id === bfDeal.articleId));
  const cmFeed = await shoppingItems({ view: 'cyber-monday' });
  assert.ok(cmFeed.items.length >= 1);

  // Phase 3: ProductGroup.hasVariant (Nike) & Walmart __NEXT_DATA__ structured verification
  const nikeHtml = `<script type="application/ld+json">${JSON.stringify([{
    '@context': 'https://schema.org',
    '@type': 'ProductGroup',
    name: "Nike Vomero 18 Men's Road Running Shoes",
    productGroupID: 'HM6803-015',
    brand: { '@type': 'Brand', name: 'Nike' },
    hasVariant: [{
      '@type': 'Product',
      name: "Nike Vomero 18 Men's Road Running Shoes - Size 10",
      sku: 'HM6803-015',
      offers: {
        '@type': 'Offer',
        price: '88.00',
        priceCurrency: 'USD',
        availability: 'https://schema.org/InStock',
      },
    }],
  }])}</script>`;
  const nikeEv = officialProductEvidence(nikeHtml, {
    kind: 'product_deal',
    product: "Nike Vomero 18 Men's Road Running Shoes",
    model: 'HM6803-015',
    variant: null,
    condition: 'new',
    merchant: 'Nike',
    merchantId: 'nike',
    seller: 'Nike',
    buyUrl: 'https://www.nike.com/t/vomero-18/HM6803-015',
    checkoutPriceCents: 8800,
    restrictions: [],
    coupon: null,
    membership: null,
    subscription: null,
    renewal: null,
    minimumSpend: null,
    cashback: null,
    giftCard: null,
    points: null,
    region: 'US',
  } as unknown as Offer);
  assert.equal(nikeEv?.price, 8800);
  assert.equal(nikeEv?.brand, 'Nike');

  const walmartHtml = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: {
      pageProps: {
        initialData: {
          data: {
            product: {
              name: 'Hyper Tough 110-Piece Screwdriver Set with Storage Rack',
              brand: 'Hyper Tough',
              sellerName: null,
              averageRating: 4.9,
              numberOfReviews: 39,
              availabilityStatusV2: { value: 'IN_STOCK' },
              priceInfo: { currentPrice: { price: 25, currencyUnit: 'USD' } },
              imageInfo: { thumbnailUrl: 'https://i5.walmartimages.com/asr/example.jpg' },
            },
          },
        },
      },
    },
  })}</script>`;
  const wmEv = officialProductEvidence(walmartHtml, {
    kind: 'product_deal',
    product: 'Hyper Tough 110-Piece Screwdriver Set',
    model: null,
    variant: null,
    condition: 'new',
    merchant: 'Walmart',
    merchantId: 'walmart',
    seller: 'Walmart',
    buyUrl: 'https://www.walmart.com/ip/Hyper-Tough/18658274022',
    checkoutPriceCents: 2500,
    restrictions: [],
    coupon: null,
    membership: null,
    subscription: null,
    renewal: null,
    minimumSpend: null,
    cashback: null,
    giftCard: null,
    points: null,
    region: 'US',
  } as unknown as Offer);
  assert.equal(wmEv?.price, 2500);
  assert.equal(wmEv?.rating?.value, 4.9);
});
