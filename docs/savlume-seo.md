# Savlume SEO implementation and next steps

Primary site: https://savlume.com
Sitemap index: https://savlume.com/sitemap.xml

## Implemented

- Server-rendered, unique titles and descriptions for listings, categories, retailers and individual articles. Product descriptions use the actual stored summary and status. Expired/out-of-stock items are identified in search titles rather than presented as current deals.
- Canonical HTTPS URLs remove tracking parameters. `/all` duplicates canonicalize to the corresponding main feed page; single category/merchant filters redirect to dedicated URLs. Paginated pages retain their own canonical URL. Search and combined-filter results, empty lists and utility pages are noindex; admin/login keeps noindex. Explicit editorial SEO exclusions are respected without withdrawing the public item.
- `WebSite`, `Organization`, `CollectionPage`/`ItemList`, `Article` and `BreadcrumbList` JSON-LD describe actual visible content. No invented reviews, aggregate ratings, seller identity, stock or merchant-verified Product/Offer markup. The site publishes editorial summaries and routes purchases to retailers.
- Dedicated original-text share cards for each public article at `/og/items/{id}.png`, with Open Graph/Twitter metadata. The shared image renderer uses bundled fonts. Withdrawn or blocked items return 404 instead of exposing cached cards.
- A sitemap index with `/sitemaps/pages.xml` and automatically split `/sitemaps/items-N.xml` files (5,000 URLs per file). News, guides, recalls, older offers and expired-reference pages can be included when publicly eligible, summarized and not manually SEO-excluded. No arbitrary latest-100-offers cutoff. Item lastmod values derive from stored publication/offer update times.
- Canonical `/deals/{category}` and `/stores/{merchant}` pages with genuine category/store-filtered content, short introductions, and visible internal links. Only categories/merchants with eligible content enter the sitemap and browse links.
- Compact visible list headings, detail breadcrumbs, publication times, image alt text/dimensions and lazy loading for list images. The mobile three-tab navigation and automatic feed loading are retained.
- Each loaded batch has a normal HTML link to a separately server-rendered next batch in a collapsed “Browse older updates by page” control. Visitors can continue scrolling automatically. Crawlers and browsers without JavaScript can follow actual links. Invalid, out-of-range, or empty paginated URLs return 404.
- API responses have `X-Robots-Tag: noindex, nofollow`; the website pages remain the search landing destinations.

## Search-intent and keyword map

These phrases reflect the site's real content. They are not claims of measured keyword volume or difficulty.

| Page | Search-intent terms |
| --- | --- |
| `/` | US shopping deals, coupon codes, price comparisons, retailer offers |
| `/flash` | retailer deals, flash sales, popular product offers, deal-guide picks |
| `/coupons` | coupon codes, cashback offers, freebies, redemption conditions |
| `/news` | shopping news, retailer updates, product recalls |
| `/deals/electronics` | electronics deals, gaming deals, headphone deals, computer accessories |
| `/deals/home` | home and kitchen deals, appliance deals, cookware offers |
| `/deals/grocery` | grocery deals, household offers, multipack savings |
| `/deals/beauty` | beauty deals, personal care offers, hair tools |
| `/deals/fashion` | fashion deals, shoe deals, clothing offers |
| `/deals/kids` | toy deals, baby products, kids shopping updates |
| `/stores/amazon`, `/stores/walmart`, `/stores/target` | merchant name + deals/offers, with actual product content |
| `/items/{id}` | exact brand/model/product + retailer + reported price/coupon/conditions |

Keywords are used naturally in titles, summaries, headings and internal links. There is no meta-keyword stuffing, fabricated review text, irrelevant keyword list or “all-time low” claim without price evidence.

## Search Console and measurement

No Google Search Console or Bing Webmaster account access is available in this workspace; no authenticated sitemap submission or ownership verification was performed.

1. Add `savlume.com` as a Domain property in Google Search Console and apply Google's supplied DNS TXT verification record through Cloudflare.
2. Submit `https://savlume.com/sitemap.xml` in the property's Sitemaps screen.
3. Inspect the homepage, `/flash`, a category page, a merchant page and a product article. Use the live URL test and request indexing for representative URLs.
4. Review indexing exclusions and search impressions/clicks/queries after data accumulates. Improve articles around queries actually attracting impressions; do not assume ranking from deployment alone.
5. For ongoing content, prioritize correct product variants, usable purchase links, source dates, explained coupons/shipping/membership and independently observed price changes. Correct stale/mismatched source prices before treating them as search acquisition pages.

No ranking, traffic increase or rich-result eligibility is guaranteed. AdSense site approval and Search Console ownership are separate services.

## References

- [Google: pagination and incremental loading](https://developers.google.com/search/docs/specialty/ecommerce/pagination-and-incremental-page-loading)
- [Google: title links](https://developers.google.com/search/docs/appearance/title-link)
- [Google: descriptions](https://developers.google.com/search/docs/appearance/snippet)
- [Google: Article structured data](https://developers.google.com/search/docs/appearance/structured-data/article)
- [Google: build and submit sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [Google: meta keywords are not a ranking signal](https://developers.google.com/search/blog/2009/09/google-does-not-use-keywords-meta-tag)

## Follow-up round (October 13, 2026)

A second pass fixed machine-readable gaps that page-level checks had not surfaced.

- **Reported item totals are no longer truncated.** A hard `LIMIT` in the shopping read layer capped every list, feed, API and MCP response at 1500 rows while the sitemap still listed the rest. The bound is now well above the working set, so the API's `total` is the real total and the oldest eligible items resolve again.
- **The empty machine exits carry content.** `/feed.xml`, `/feed/full.xml` and `/feed/daily.xml` used to read an Active-only view that no offer satisfies, so they served empty channels. They now read the non-expired ranking view and keep each item's stored status label. `/api/v1/hot-topics`, `/api/v1/selected/snapshot`, the MCP top-deals tool and `/hot` use the same view. `view=top` keeps its Active-only meaning and is documented separately.
- **Machine surfaces are cacheable.** The sitemap index and its children, `llms.txt`, the RSS feeds, `/robots.txt`, the manifest, the read APIs and the share images now carry explicit cache lifetimes; the sitemap and share images also carry validators, and matching conditional requests answer 304. Share images previously re-rendered on every request.
- **The sitemap index and `pages.xml` carry `lastmod`**, derived from the newest content each entry actually lists rather than a build time.
- **`/openapi-v1.json` serves the real document**, limited to the operations this deployment mounts, instead of a one-path stub that pointed at endpoints returning 404.
- **`BreadcrumbList` covers the item and utility pages**, each paired with a visible Home trail. Listing, landing and daily pages carry no breadcrumb markup: the only trail they could state is the site root plus the page itself, and Google states neither needs a `ListItem`.
- **`/api/site/meta` reads the changelog file** instead of returning a hard-coded version.
- **The first card image is eager with high fetch priority.** Every list image used to be lazy, including the one most likely to be the largest contentful paint.

Verified after deployment: API total 1588 with the previously dropped oldest items resolving, 50 items in each fixed feed, non-empty hot-topics and snapshot (1189 each), `lastmod` on all 35 page entries, three real OpenAPI paths, `BreadcrumbList` on the item and utility pages (listing and landing pages deliberately carry none), 304 on a conditional read-API request, and the three shopping smoke scripts passing. Typecheck, the production web build and the 19 web tests passed; the full backend suite returned 226/230, with the four pre-existing shutdown and X/WeChat fixture failures unchanged.

## Validation

The live initial audit found no canonical or JSON-LD on shopping pages, the same description on every item and only 107 sitemap URLs (100 recent offers + 7 pages). After the update, the live sitemap contained 279 URLs, including all 253 eligible article/product pages at verification time. The SEO smoke script validates sitemap coverage, duplicate URLs, XML timestamps, category/store metadata, canonical URLs, search noindex, crawlable pagination, structured JSON and per-item PNG share cards. Counts change as new material is published.

Commands:

```bash
npm run typecheck
npm run build -w @aihot/web
node --test apps/web/tests/*.test.ts
node scripts/smoke-shopping-seo.ts https://savlume.com
node scripts/smoke.ts --base https://savlume.com
node scripts/smoke-shopping.ts https://savlume.com
```

Typecheck, production builds and all **15 web tests** passed. Real-browser mobile/desktop checks verified canonical/JSON-LD updates after navigation, selected category filters, continuous loading and no horizontal overflow.

The full backend regression on a fresh isolated test database returned 198/202: the existing analyze/translate shutdown asynchronous fixture failures and X/WeChat recovery failures remain. Shopping sitemap, privacy/exclusion, image visibility and other SEO-specific integration checks passed. No database migration or re-analysis of content was required.

**Edge caching caveat:** Cloudflare's default cache covers static extensions only, so the sitemap, RSS, `llms.txt` and the public API stay uncached at the edge despite correct `s-maxage` headers on the origin. Add a Cache Rule for those paths in the Cloudflare dashboard if edge caching is wanted; the application side needs no further change.
