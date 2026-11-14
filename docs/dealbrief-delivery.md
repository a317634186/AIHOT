# Savlume deployment and review

Site: <https://savlume.com> · Admin: <https://savlume.com/admin>.

The site name is **Savlume**; the current tagline is **Find Deals. Save Smarter.** The configured domain is **savlume.com**; no formal business identity is claimed. Public pages and generated summaries use en-US, USD, and America/New_York. The dated entries below preserve the branding and layout that applied at the time.

## Reviews & Picks, videos and new slogan — October 11, 2026

Added the top-only **Reviews & Picks** channel after News; bottom tabs remain three, and selecting a category still returns to AI Picks. Six verified review/guide RSS sources are now enabled, with source-attributed findings, limitations, buyer questions and original-video links. AI review discovery runs every six hours using the existing gateway and receipt budgets. Gemini search was verified; GPT provided analysis but no verifiable web-search event in its diagnostic, so its unsupported search answer was rejected and Gemini fallback verified. At review time: **16 articles**, all included in AI Picks, with **one original-source video**. The slogan is now **AI Picks. Better Deals.**, including the share PNG with cache-versioned metadata.

Typecheck/build, **17/17 web tests**, **3/3 review-specific unit tests**, live page/video/text checks and public/SEO smoke passed. Backend **207/211**, with previously recorded fixture/recovery failures. [Full delivery, source audit and model limitations](savlume-reviews-delivery.md).

## Category selection always returns to AI Picks — October 11, 2026

The user changed the navigation rule: choosing any top product category now always navigates to that category's **AI Picks** aggregation, regardless of the current Flash Deals/News section. All categories similarly returns to AI Picks (or its retailer-filtered collection if a retailer is selected). Existing search and retailer filters are preserved; pagination resets. The canonical `/deals/{category}` route already reads the complete recommended feed and highlights AI Picks in both top/bottom navigation. Selecting the currently highlighted category from Flash Deals/News also switches to AI Picks. Explicit bottom section switching remains available; the next category click always returns to AI Picks.

Validation: typecheck/build and **16/16 web tests** passed. Browser tests cover transitions from Flash Deals and News, All categories, selected-category state, full recommended API requests and three bottom tabs. Required backend regression **205/207**, with the existing analyze/translate shutdown fixture failures; no backend implementation changed. Live browser verification compared the rendered electronics results against the actual recommended/category API, checked same-category clicks and mobile/desktop layout, and confirmed 24→48 scrolling. Public smoke suites passed.

## AI Picks label and all single-product activities — October 11, 2026

Renamed the first bottom tab from Picks to **AI Picks**, matching the top label and error-page home action. The bottom still has exactly three tabs: AI Picks / Flash Deals / News.

Flash Deals now preserves existing historical/source-supported picks and also includes every public, named single-product product_deal/coupon_offer/cashback_offer/freebie activity that is not known expired or out of stock. Upcoming offers retain that explicit status. The additional product-activity path does not require a purchase URL, numeric price, historical reduction, preferred guide domain, selection score or a seven-day freshness window. Missing fields remain visibly unknown and the source report remains available. Exact and recognizable date-only expired deadlines are still excluded. General news, recalls, guides, storewide promotions, collections, financial signup offers and events are not classified as additional single-product activities.

Future model extraction includes an activityScope distinguishing single products/fixed packs from multi-product, storewide, event and financial promotions. Existing records use their offer kind and product identity, with conservative exclusions for obvious generic collection/event names. Eligibility is shared with the browser expiry refresh; this prevents eligible new activities from disappearing after hydration. Existing recorded-low and source-popularity badges retain their stronger evidence requirements.

Validation: typecheck/build, **16/16 web tests**, and **11/11 shopping unit tests** passed. Full backend regression: **203/207** with the established analyze/translate shutdown fixture and X/WeChat recovery failures. New integration tests cover product-specific coupons/cashback/freebies with missing price/destination, older product offers, filters/pagination, general-sale exclusions and expired states. Live checks confirmed no eligible single-product activities were missing, correct AI Picks label, 24→48 loading, English mobile/desktop rendering and intact SEO/public smoke checks. Counts grow as the existing worker publishes new sources; an initial snapshot had 149 Flash Deals versus the prior roughly 90.

## Combined top navigation and section-aware categories — October 11, 2026

Moved product categories onto the **same horizontal row as AI Picks / Flash Deals / News**, instead of a separate row. The bottom still has exactly three entries: Picks, Flash Deals and News. Category links operate within the current content section and retain search/retailer filters; bottom section switches keep the selected category and reset pagination. Removed the duplicate category dropdown and preserved its value as a hidden filter field so retailer/search submissions retain it. The top row scrolls horizontally and keeps the selected category visible. All UI labels remain English.

Validation: typecheck/build and **16/16 web tests** passed, including category changes inside Flash Deals, switching to News with the category preserved, and continuous loading. Live mobile measurements confirmed section links and category links have the same vertical position. Desktop/mobile layout, three bottom tabs, public smoke and SEO smoke passed. Required backend regression **201/204**, with the existing analyze-shutdown and X/WeChat recovery failures; no backend code changed for this navigation adjustment.

## Comprehensive SEO / AI-search audit — October 11, 2026

Completed a full before/after crawl and deployed linked entity schemas, clearer item metadata, visible buying answers, reliable content-update timestamps, same-category related links, public text versions, expanded llms.txt, complete paginated API/RSS/MCP reading and trusted Cloudflare client-IP handling. One exact duplicate was retained publicly but excluded from indexing with an audit record. Migration 0041 and a pre-change database backup were applied. The site remains fully English with three bottom tabs and continuous scrolling.

Post-deployment crawl: **278 sitemap URLs**, **252 indexable detail pages**, no status/canonical/H1 errors and no duplicate indexed title/description groups. Full machine feed exposes all **253** public records, including the reference duplicate. Typecheck/build, **16/16 web tests**, SEO/GEO smoke and mobile/desktop checks passed. Backend regression: **201/205**, with the known analyze/translate shutdown and X/WeChat recovery failures. User-agent crawl probes succeeded but are not proof of actual search-engine indexing; no Search Console/Bing account is connected. [Detailed findings, evidence, limits and next steps](savlume-seo-geo-audit.md).

## English interface and top category navigation — October 11, 2026

Interpreted the user's audience requirement as an all-English public website. Renamed the visible AI推荐 / 秒杀 labels to **AI Picks / Flash Deals**. Bottom navigation remains exactly three entries: **Picks / Flash Deals / News**. Added a horizontally scrollable category navigation row beneath the top tabs, containing All categories plus the nine existing shopping categories. Links preserve the active Flash Deals/News section, search and retailer filters, reset pagination, use canonical category landing pages when possible, and highlight/scroll the active category. Existing compact dropdown filters remain available.

Removed remaining Chinese public skip-link/login strings and tightened the public smoke check so it no longer exempts the old Chinese tab names. Audited all 253 public items' titles, summaries, reasons and offer fields at review time: no Chinese text was found. Internal operational/admin screens beyond the publicly accessible login were outside this shopper-facing change.

Validation: typecheck/build and **16/16 web tests** passed, including category link behavior and the three-bottom-tab invariant. Live mobile/desktop checks passed for English tabs, ten category choices including All, category switching within Flash Deals, canonical-category navigation, continuous scrolling and no page overflow. Public/SEO smoke checks passed. Full backend regression had five failures: the existing analyze/translate shutdown fixture and X/WeChat recovery failures, plus an unrelated image-cache expiry/eviction timing test; no backend code was changed for this UI update.

## Search-engine optimization — October 11, 2026

Implemented unique keyword-oriented listing/category/merchant titles, source-based item descriptions, HTTPS canonical URLs, Open Graph/Twitter cards, public-item share images, Article/Breadcrumb/WebSite/Organization/CollectionPage JSON-LD and expanded XML sitemaps. Single category/retailer filters redirect to canonical `/deals/{category}` and `/stores/{merchant}` pages. Internal search, combined filters, empty/utility pages and explicit editorial SEO exclusions use noindex. Listing headings and internal browse links are visible and compact. The three-tab mobile navigation and automatic scrolling remain; a collapsed optional page browser supplies standard HTML links for crawlers and no-JavaScript readers. Fixed a stale offset race so asynchronous pagination cannot issue a duplicate batch and skip the following one.

Sitemap coverage changed from 100 recent offers plus 7 static pages to **253 eligible item pages and 26 static/category/merchant pages** at verification time. It automatically splits at 5,000 items per file and excludes private/blocked/withdrawn and manually SEO-excluded content. Existing publication scores and selection thresholds were unchanged. SEO eligibility now includes public shopping summaries regardless of selected score; noindex remains controllable via the explicit exclusion flag. There are no fabricated product ratings, availability claims or merchant-offer rich-result declarations.

Validation: typecheck/build passed; **15/15 web tests** including SSR metadata, canonicalization, JSON-LD escaping, no-JavaScript links, invalid pagination, filters and mobile interactions. Backend **198/202**, with the existing analyze/translate shutdown fixture and X/WeChat recovery failures; the new sitemap and image-visibility tests passed. Live SEO/public smoke and browser checks passed on https://savlume.com, including 24 → 48 automatic loading, category navigation, correct selected filters and client-side metadata changes. No database migration was required. Search Console ownership/submission was not performed because no account access or verification token was available. See [SEO setup, keyword map and submission steps](savlume-seo.md).

## AdSense code installation — October 11, 2026

Installed the user's confirmed Google AdSense script in the shared HTML head (`apps/web/app/root.tsx`), with publisher `ca-pub-5475520925189241`, asynchronous loading and anonymous cross-origin mode. The two snippets supplied by the user were identical; only one script is present per HTML document. The shared layout applies it to all rendered pages, including admin/login and error pages. Updated the factual privacy sentence that previously claimed no third-party advertising was configured.

Typecheck/build and **14/14 web tests** passed. Local browser tests block advertising domains to avoid loading real ads during testing. Live HTML checks confirmed one exact script in the head of the home/all/flash/news/about/privacy/terms/login pages and a real item page. No ads were clicked or impressions deliberately generated for verification. Backend regression: **197/200**, with the same analyze-shutdown fixture and X/WeChat recovery failures. Public smoke checks passed. This delivery installs the script; it does not assert AdSense account/site approval or that Google is already serving ads.

## Domain deployment — October 11, 2026

Production address: **https://savlume.com**. Both `savlume.com` and `www.savlume.com` DNS records were already pointed to this server. Configured a separate host Nginx vhost, a Let's Encrypt certificate covering both names, automatic HTTP/www redirects to the main HTTPS address and acme.sh renewal/reload. Application SITE_URL was changed to the HTTPS domain so feeds, sitemap, MCP host/origin validation and authentication use it. Port 3000 now binds to loopback behind the trusted proxy. Public smoke checks, a real-browser HTTPS/mobile/infinite-scroll check and a secure admin login/logout all passed. Deployment paths and certificate renewal notes are in [DEPLOYMENT.md](../DEPLOYMENT.md).

## Expanded 秒杀 discovery — October 11, 2026

The user explicitly broadened the 秒杀 column to retailer offers, source-supported popular products and deal-guide picks. The feed now includes recent AI-processed product/freebie offers with a stated USD price and purchase destination from DealNews, Hip2Save, 9to5Toys and Slickdeals. A seven-day source-publication freshness window applies to source picks; future-dated entries, expired/out-of-stock/upcoming offers, past stated deadline dates, missing amounts/destinations and unsupported domains are excluded. Date-only deadlines are shown as source wording without an invented cutoff time. Every pick identifies its source and retains its Active/Unverified status. Original strong historical-price eligibility remains as a separate optional comparison badge; guide picks do not imply a historical low.

The existing AI extraction now optionally classifies platform-sale/popularity evidence using at most 20 words quoted from the actual material. Unsupported quotes and inferred popularity are rejected. “Popular” requires a source-stated bestseller/trending/hot/frontpage signal; high AI scores alone do not qualify. Existing AI-processed priced guide offers can appear immediately without paying to regenerate their descriptions.

Slickdeals Frontpage public RSS was verified (25 entries; a sample article had 2,647 usable text characters and 3 images) and enabled with a five-item initial batch, two-hour polling and summary-only publication. All five initial items completed AI processing. Existing source collection additionally found five new records across DealNews/Hip2Save/9to5Toys. AI discovery now runs every three hours and accepts configured merchants plus the four deal guides, checks redirect destinations, prefers final-answer citations, fetches actual source pages, and sends them through the normal receipt/budget-controlled editorial worker. A production search completed with receipt 1856: seven cited URLs, six readable pages imported, and one unusable Best Buy homepage skipped. Imported pages are still editorial candidates, not guaranteed product recommendations. The subsequent prompt revision specifically excludes general shipping/membership announcements and homepages.

Live validation found **89** qualifying source offers from all four guides. Mobile scrolling appended **24 → 48** unique cards; tab switching, source badges and desktop/mobile overflow checks passed. One pre-existing Akluer price inconsistency was corrected using explicit original source evidence: $70 with code, versus its separately retained $140 list price; the prior data is backed up in the Docker data volume under `offer-corrections/`. No products or historical prices were fabricated.

Build/typecheck and **14/14 web tests** passed. New tests cover source-only picks without history, evidence-supported labels, freshness, known deadline dates, missing prices, lookalike domains and guide-feed pagination. Full backend regression: **197/201**, with the existing analyze/translate shutdown fixture failures and X/WeChat recovery failures. Public smoke suites passed.

## Savlume name update — October 11, 2026

The user selected **Savlume** as the website name. Updated the header/footer, page titles, about/terms/privacy copy, price-record attribution, default image labels, site identity, crawler name, RSS/PWA/OpenAPI branding, logo accessibility title and social sharing image. The existing savings-arrow mark and tagline “Smarter Deals. Better Decisions.” remain. The name update preceded domain binding; see the current domain deployment above.

Existing internal route filenames, browser visitor storage/header keys and MCP tool prefix remain stable so existing links, likes and clients continue to work. Public-facing display copy uses Savlume.

Fixed a discovered share-image font issue: the shopping social card now uses the project’s bundled Noto Sans fonts through Satori, rendering glyphs as paths before PNG conversion. The production 1200×630 image was visually checked and correctly displays Savlume and the tagline. Typecheck/build and 14/14 web checks passed; backend regression remained 195/198 with the previously recorded three failures. Public smoke and live branding checks passed for the pages, RSS, app manifest, API description, logo and social card. Mobile and desktop were checked for overflow.

## AI推荐 and 秒杀 navigation — October 11, 2026

Top navigation is **AI推荐 / 秒杀 / News**; mobile bottom navigation remains **Picks / 秒杀 / News**. AI推荐 (`/`) and the chronological all-content search view (`/all`) now show every public, eligible, non-blocked shopping item in newest-first publication-timeline order, regardless of editorial score or content type. Past/expired offers stay visibly labeled in this full information feed. News retains its original news view. Infinite scrolling, filters, item details and mobile behavior are preserved.

The middle 秒杀 tab (`/flash`, API `view=flash`) uses only stored comparable DealBrief price observations. A qualifying product/freebie needs a buying destination, USD price, current Active/Unverified state, a valid future exact deadline, at least two comparable observations, an earlier higher price, and a latest observation matching the current price. The current price must be no higher than the lowest retained observation. Comparison stays within the same recorded product/variant/seller/eligibility context and price type, among up to 120 records from the last 90 days. MSRP, mixed listed/checkout amounts and later rewards cannot qualify a price reduction. No scoring threshold was changed. Source-reported items keep their Unverified label. Cards show the prior observed price/date, reduction and deadline. Expired entries disappear on the next public read and are removed from an open flash feed within 30 seconds.

At deployment, the full feed contained **196** public content groups. The price database held **107 single-observation products**, and no public offers had a usable exact future deadline. Therefore **0 live flash deals** qualified. The tab explicitly explains the missing evidence; no fake products or historical prices were inserted. Qualifying products appear automatically after sufficient real records and deadline evidence arrive.

Validation: build/typecheck passed, web tests **14/14**, backend regression **195/198** (the same analyze-shutdown fixture and X/WeChat recovery failures remain). New tests cover newest-first inclusion despite scores, retaining labeled past offers, flash history/deadline eligibility, variant separation, pagination/filtering, expiry, and rejection of single records/MSRP/reward-based claims. Live mobile checks verified all three tabs, News → Picks navigation, 24 → 48 automatic loading, exact equivalence of the homepage and all-public content sets, chronological order and no mobile/desktop overflow. Both public smoke suites passed.

## Detail-page update — October 11, 2026

- Blue AI overview card with expandable product facts and a source link. Existing items use their stored AI-written summary/reason immediately. Future offer extraction also saves a dedicated overview, source-supported use case, highlights and cautions. Opening a page never triggers a model call.
- Price observations use **DealBrief's own records only**, per the user's final preference. No Keepa subscription, external price-history plugin or provider integration is configured. Migration 0040 starts source-reported baseline records at migration time; it does not invent earlier prices. A database trigger captures later price/condition changes and fresh successful merchant checks. Exact-model merchant checks may now observe price changes while preserving all seller, variant, condition, region and eligibility safeguards. Failed checks do not create new price evidence. A one-record item shows “Price tracking has started”; two or more compatible records show a chart. Records are explicitly source-reported or merchant-verified, before tax, without subtracting later rewards. The detail response includes up to 120 compatible records from the last 90 days.
- Comparison cards show this offer plus other recorded offers with matching product name, model, variant and condition. Unknown identities and expired/out-of-stock competing offers are excluded. Missing competing quotes are clearly stated. No complete-market or all-time-low claim is made.
- Real anonymous likes with a reversible button, durable counts, idempotent writes, origin checks and a rate limit. A random identifier in browser local storage is hashed on the server; counts represent browsers rather than verified individuals. Withdrawal disables public reactions. Privacy text explains this behavior.
- Share uses the native device share menu, then clipboard, with a selectable link fallback on browsers that restrict copying (including HTTP contexts). No share is sent automatically. Mobile detail pages have a fixed Like / Share / View offer action bar; desktop uses an inline bar.

Validation: typecheck, production build and **14/14 web tests** passed, including browser tests for the AI overview, chart, matching comparison, like/unlike persistence, native-share stub, clipboard and manual-copy fallback. Shopping unit checks **7/7** passed, including changed-price evidence requiring the same exact product. Full backend regression **193/196**; the same analyze-shutdown asynchronous fixture and X/WeChat recovery failures remain. New integration checks cover price snapshots, failed-check exclusion, variant separation, concurrent like deduplication, unlike, invalid input, cross-origin rejection and withdrawn-item privacy. Public smoke checks passed. Live mobile and desktop views were inspected; a temporary browser test like was undone and its count restored. Database backup was taken before the additive migration in `.data/backups/pre-detail-features-*.sql.gz`.

## Continuous scrolling update — October 11, 2026

All shopping listing pages now append the next 24 items automatically when the reader approaches the bottom. Picks/Recommended, News, search results and filtered lists preserve their existing content and order. The URL does not change while scrolling. Changing the view, filters or search remounts the feed and aborts any pending request; already visible rows remain in place during loading. Repeated item identities are deduplicated. Failed requests show an inline retry button, and an exhausted feed shows “You’re all caught up.” Browsers without IntersectionObserver have a Load more fallback.

Validation: build and typecheck passed; web suite **13/13** including the new real-browser test with a synthetic local API. That test covers automatic append, overlapping batches, failed-request retry, end-of-feed behavior, abandoning a pending News request, and preserving search/category/retailer filters on desktop. Live mobile Picks loaded **24 → 48 → 72** cards; News and desktop Picks loaded **24 → 48**, without pagination navigation or duplicate cards. Public site and shopping smoke checks passed. Required backend regression on a fresh isolated database: **191/194**; remaining failures are the existing analyze-shutdown asynchronous fixture error and X/WeChat recovery tests. No backend code changed for continuous scrolling.

## Homepage feed update — October 11, 2026

The primary navigation now contains **Recommended** and **News**. Recommended (`/`) opens the full shopping information feed, ordered by the existing editorial score. News retains the original `/news` page and its news/recall/buying-guide view. The mobile bottom navigation uses **Picks** (the full feed at `/`) and **News** (`/news`). `/all` remains an all-content timeline, newest first, also used by search.

The full feed includes public, eligible current offers, promotion news, recalls and buying guides, including Unverified offers and items without prices. Expired/out-of-stock offers remain in the archive; withdrawn and blocked material remains excluded. No scoring thresholds changed. Top Deals, Latest Deals, Coupons and Daily Briefing are no longer separate primary navigation entries. Old standalone pages and machine endpoints remain compatible. The full feed opens directly into the cards without the introductory hero or a separate preview section. Desktop keeps three-column cards; mobile keeps compact image-and-text rows.

Fixed a reproduced client-navigation 404: returning to `/` requests `/_.data`, which the shopping loader previously treated as an unknown page. Root data requests now resolve to the homepage. Regression coverage includes homepage data requests with the `shopping-home` route selector. The error-page copy is also consistently English.

Validation: production build and typecheck passed; web tests **12/12** passed; the unified-feed integration test covers inclusion, both orderings, filtering, pagination, expiration and withdrawal. Live checks confirmed Recommended and the chronological `/all` feed contain the same 191 content groups at review time, ordered correctly across pages. Browser checks cover 390px mobile, bottom News → Picks navigation and desktop cards; public site and shopping smoke checks passed. Full backend regression: **189/194**, with failures in the analyze shutdown fixture, X/WeChat recovery, translation shutdown and translation revision cases; the full suite is not green. These failures are outside the changed feed/navigation paths.

## What is implemented

- React Router website, existing Fastify API, PostgreSQL and pg-boss worker, Docker restart policy, existing admin authentication, model receipts and budget breakers.
- Four verified RSS sources: DealNews, Hip2Save, 9to5Toys, official CPSC recalls. Two models through the supplied gateway: Gemini for scoring/writing, GPT for prefilter/structure and shopping extraction.
- Gemini search was proven through a completed `web_search_call` and actual official citations. The six-hour discovery job rotates product and shopping-event queries, retrieves cited official merchant pages, and sends actual page text through the same editorial pipeline. Search output alone is never published as evidence.
- Separate product categories, content types, offer mechanics and restrictions. Search and merchant/category filters work. Shopping News includes promotion announcements, consumer policy changes and recalls.
- Per-item original images, source attribution, source links, merchant links and original-source purchase redirects where a direct destination cannot be resolved. No product image is generated. A failed redirect check stays Unverified.
- Separate listed price, conditional checkout price, shipping, minimum spend, later cashback, gift cards and points. Prices are integer cents. Unit costs are computed only from supplied quantity/price fields. Unknowns remain explicit; no Keepa/history integration is claimed.
- Per-offer model/variant, seller, condition, eligibility, subscription/renewal/cancellation, deadline source wording, status, last attempted check and last successful verification. Strictly identical complete identities merge; unknown identifiers do not. Same-model/variant/condition offers at other merchants can be compared without merging conditions.
- Top Deals requires a selected offer with current Active evidence. Latest Deals can contain source-reported Unverified leads, labeled prominently. Product listings without a concrete price are not current-deal recommendations. No invented votes, comments or score widgets.
- Active, Expired, Out of Stock, Unverified and Upcoming schema support. Exact expiry and evidence-age rules are applied on every public read. Every 30 minutes the worker checks up to 12 due merchant offers; failure makes a current claim Unverified, never automatically Expired and never refreshes the successful verification timestamp.
- A public page request never calls a model. The website, RSS, API and MCP read the shared `publication/shopping.ts` layer. Expired/out-of-stock offers leave current lists but retain their history page. Withdrawn items disappear from all shopping exits.
- Daily briefing defaults to 08:00 Eastern; `BRIEFING_HOUR` changes the hour. Local-calendar boundaries correctly handle DST. Empty editions are not published. Briefing candidates use current eligibility, and historical issue item statuses refresh on read.
- Old AI sources disabled/isolated, old AI material withdrawn, original data retained. Model leaderboard and Codex reset monitoring are disabled. Backup: `.data/backups/pre-dealbrief-20261011.sql.gz`. The idempotent migration runs during setup.

## Evidence limitations

`Active` is intentionally conservative. Automatic checks currently require merchant structured product/offer data matching exact model, variant, condition, seller, USD price, US eligibility and stock. A general accessible HTML page is insufficient. Account-targeted, subscription, cashback/gift-card, member and coupon-combination offers are not automatically certified by this adapter. They remain Unverified even when an editor site reports a strong deal. Merchant APIs or manual evidence workflows can expand this later.

Date-only deadlines remain in the source wording; the system does not invent a cutoff timezone. Automatic exact expiration currently requires an explicit offset timestamp supported by source text, or a clear expired source marker. Upcoming is reserved in the schema; no unsupported future dates are fabricated. Repost volume does not affect shopping ranking. Cross-store comparison covers recorded matching offers, not the whole internet.

No historical-low badges are enabled. No DealBrief affiliate account is configured. Known attribution parameters on direct merchant destinations are removed; original publisher redirect links may retain their tracking and are identified as source purchase links. Images load from original hosts as requested, which is disclosed in privacy text.

## Editorial policy and calibration

The independent two-score process and `attentionScore` output remain. Five weighted axes measure value, reliability, evidence, US accessibility and actionability, with type-specific weights in `industry/prompts/selection-score.md`. The upstream numeric thresholds (T1 60, T1.5 65, T2 76) are **provisional and not calibrated for shopping**. Official origin does not establish value. 100–200 human-labeled shopping examples are needed before claiming measured recommendation quality.

No MSRP-as-market-price shortcuts; no rewards subtracted from checkout; no invented historical lows, personal testing, discounts, coupon stacking or merchant affiliation. US-only scope, exact variants and visible limitations take precedence over promotional language. Travel-package and financial signup promotions are outside this version's categories.

## Sources and dependencies

See [the per-source report](dealbrief-sources.md) and [raw verification results](dealbrief-source-audit.json). Every requested candidate was checked; an HTTP success is distinguished from a usable feed or product verification. Blocked pages, restricted APIs and missing account data are listed explicitly.

Optional inputs: official domain; final brand/materials; real operator/contact details if desired; human-labeled shopping examples; authorized merchant/affiliate/cashback API access to extend exact price, eligibility and reward checks. Gemini search already works with the configured gateway; no separate search key is required for this implementation.

## Running and previewing

```bash
cd /root/apps/aihot
npm ci
npm run typecheck
npm run build -w @aihot/web
node --test apps/web/tests/*.test.ts
docker compose build api
docker compose up -d
node scripts/smoke-shopping.ts http://161.33.0.74:3000
```

Admin login uses `ADMIN_PASSWORD` in the private `.env`; no username is needed. API credentials remain there, mode 600, ignored by Git and Docker builds. Database port is private. Backups and originals are preserved; do not run `docker compose down -v`.

For isolated development/tests, set `COLLECT_ENABLED=false`, `MODEL_CALLS_ENABLED=false`, `SHOPPING_SEARCH_ENABLED=false` and keep push/indexing flags off. The regression suite uses local model stubs with only its stub model-call switch enabled. Test database names must end in `_test` or `_ci`; migrate before running `npm test`.

## Validation

- Typecheck and production Docker/web builds passed.
- Updated browser-route tests: **11/11 passed**, covering fresh navigation, filters, missing pages, admin privacy and forwarded-IP handling.
- Shopping-specific unit/integration tests: **9/9 passed**, including checkout/reward separation, unknown shipping, expiry/staleness, exact grouping, DST, source-only buying URLs, strict verification, cross-exit expiration and withdrawal.
- Full backend suite: **190/194 passed**. Four remaining failures: the existing X/WeChat recovery-count tests and two shutdown test files whose substantive shutdown assertions pass but whose local HTTP fixtures emit an asynchronous empty-JSON error after teardown. These failures are disclosed; the full suite is not claimed green. Most legacy invariants explicitly exercise generic news mode; separate shopping tests exercise the enabled shopping reader and API.
- Public smoke: main English pages, RSS, API, MCP initialize, icons and share image passed; old AI modules and sensitive paths return 404, unauthenticated admin API returns 401.
- Desktop and 390-pixel mobile previews inspected. Mobile first screen displays real image/text rows, small search and bottom tabs. No fabricated live deals were inserted.

## Review examples

See [real English examples](dealbrief-examples.md). These are genuine crawled-source summaries, with verification state recorded at review time. They are not promises that a price will still be available. Test fixtures are confined to the throwaway database and labeled DEMO.

## Best Deals label update — 2026-10-11

Renamed Flash Deals to Best Deals in the top navigation, mobile bottom navigation, section heading and SEO title. The existing `/flash` URL and `flash` filter remain compatible. Deployed the web service and verified the live home, deals and reviews navigation; bottom navigation retains three items.

Validation: typecheck, production web/Docker builds, all 17 web tests, public smoke, shopping smoke and SEO smoke passed. Isolated backend suite: 207/211 passed; the same four existing analyze/translate shutdown and X/WeChat recovery failures remain. The temporary test database was removed.

## Hide Unverified labels — 2026-10-13

Removed the Unverified status badge from feed cards and item detail headers, the retailer-comparison status suffix, and the generated share-image heading. Item SEO descriptions no longer receive an Unverified prefix. About-page copy now describes source reports without referring to the removed label. These rendering rules apply to both existing and future items. Internal offer status, source attribution and verification logic stay accurate; Expired, Out of Stock, Upcoming and Active labels retain their existing behavior.

Validation: typecheck, production builds and 17/17 web tests passed. Existing assertions cover list/detail suppression, retailer comparisons and removal of the metadata prefix; an expired fixture confirms its status remains visible. The isolated backend suite passed 211/214 tests, with the existing analyze-shutdown, X-recovery and WeChat-recovery failures. Deployed API and web and verified the live home, Best Deals, News, Reviews & Picks, product details, metadata and share-image endpoint. Standard public smoke passed.
