# DealBrief source verification

Checked from this server on October 11, 2026. HTTP 200 alone is not integration or price verification. Detailed results: `dealbrief-source-audit.json`. Only public feeds and ordinary permitted pages were accessed; access restrictions were not bypassed.

| Source | Result and v1 use |
|---|---|
| [Amazon](https://www.amazon.com/gp/goldbox) | Official page reachable. Use observed product links for evidence checks; no bulk API configured. Marketplace seller/fulfillment must be explicit. |
| [Walmart](https://www.walmart.com/shop/deals) | Official deals page reachable. Product checks are conditional on matching structured evidence, not on marketplace name. |
| [Target](https://www.target.com/c/top-deals/-/N-4xw74) | HTTP 200 but sparse shell at candidate page; official announcements can also be found through Gemini search. |
| [Best Buy](https://www.bestbuy.com/site/top-deals/pcmcat1563302963224.c) | Candidate deals URL returned 404. Not enabled as a collector; product links can be checked when found. |
| [Costco](https://www.costco.com/warehouse-savings.html) | HTTP 200 but sparse shell; membership and location pricing require additional evidence. |
| [Sam’s Club](https://www.samsclub.com/) | Homepage reachable; member/account pricing is not independently verified. |
| [Newegg](https://www.newegg.com/) | Homepage and sale links reachable; no broad catalog collector configured. |
| [B&H Photo](https://www.bhphotovideo.com/) | 403 access restriction; not bypassed. |
| [Home Depot](https://www.homedepot.com/) | 403 access restriction; not bypassed. |
| [Lowe’s](https://www.lowes.com/) | 200 Access Denied page; correctly treated as blocked, not usable content. |
| [CVS](https://www.cvs.com/) | Homepage reachable; location, coupons and account eligibility not verified. |
| [Walgreens](https://www.walgreens.com/) | Homepage reachable; account/location coupon eligibility not verified. |
| [Sephora](https://www.sephora.com/) | 403 access restriction; not bypassed. |
| [Ulta Beauty](https://www.ulta.com/) | Homepage reachable; no validated dated promotion feed enabled. |
| [Nike](https://www.nike.com/w/sale-3yaep) | Official sale page reachable; dynamic variants and bag-price conditions need individual evidence. |
| [Adidas](https://www.adidas.com/us/sale) | 403 access restriction; not bypassed. |
| [Slickdeals](https://slickdeals.net/) | ENABLED: Frontpage public RSS and article reverified. Five initial entries completed AI processing; source-reported offers remain Unverified. API requires a partner token; community signals do not establish merchant verification. |
| [DealNews](https://www.dealnews.com/pages/rss.html) | ENABLED: public RSS, title/link/date/description/image and article checked. Exact main-card selector verified. Purchase redirects may return 403 from the server; retained as source purchase links, not confirmed merchant destinations. |
| [Hip2Save](https://hip2save.com/) | ENABLED: public RSS and full article checked. Nested affiliate destinations are unwrapped only from URLs present in the source. Original images used. |
| [The Krazy Coupon Lady](https://thekrazycouponlady.com/) | Homepage reachable; no public RSS discovered in page. No selector/API invented; not enabled. |
| [9to5Toys](https://9to5toys.com/) | ENABLED: public RSS and article checked. Roundups are guides, not single live offers; merchant links require exact-source extraction. |
| [Doctor of Credit](https://www.doctorofcredit.com/category/deals/) | Shopping-category RSS verified but mixed financial/payment-card content and a future-dated entry found in sample. Not enabled; would need category and time filtering before use. |
| [r/buildapcsales](https://www.reddit.com/r/buildapcsales/.rss) | Atom feed reachable; community lead only. Not enabled as editorial recommendations. |
| [r/frugalmalefashion](https://www.reddit.com/r/frugalmalefashion/.rss) | 429 rate limit; not bypassed. |
| [r/deals](https://www.reddit.com/r/deals/.rss) | 429 rate limit; not bypassed. |
| [r/freebies](https://www.reddit.com/r/freebies/.rss) | 429 rate limit; not bypassed. |
| [Keepa](https://keepa.com/api-docs/plans-tokens.html) | Paid API subscription/key required; no account provided, no history adapter active. No price-history claims generated. |
| [Rakuten](https://www.rakuten.com/help/article/what-is-cash-back-360002117047) | Official help reachable. Personalized cashback eligibility not connected; no verified cashback result claimed. |
| [TopCashback](https://www.topcashback.com/) | Homepage reachable. No authorized/account-specific cashback feed connected. |
| [Ibotta](https://ibotta.com/) | Public site reachable. Offer redemption depends on account/app rules; no authenticated integration. |
| [CPSC](https://www.cpsc.gov/Newsroom/CPSC-RSS-Feed) | ENABLED: official recall RSS and detail page checked; title, link, publication date, body, original image available. Shopping News / official safety evidence. |

## Enabled feeds

| Source | Verified endpoint | Purpose |
|---|---|---|
| DealNews | https://www.dealnews.com/?rss=1 | Editorial discovery; offers start Unverified |
| Hip2Save | https://hip2save.com/feed/ | Editorial discovery; offers start Unverified |
| 9to5Toys | https://9to5toys.com/feed/ | Editorial discovery; offers start Unverified |
| CPSC | https://www.cpsc.gov/Newsroom/CPSC-RSS-Feed/Recalls-RSS | Official recall news |
| Slickdeals Frontpage | https://slickdeals.net/newsearch.php?mode=frontpage&searcharea=deals&searchin=first&rss=1 | Editorial/frontpage product discovery; five-entry initial import |

## AI discovery

Gemini `gemini-3.8-flash-high` was tested through the configured gateway’s `/responses` endpoint with `web_search`. The response included a completed search call, queries and official Target source citations. The scheduled task now runs every three hours and imports at most eight cited pages after fetching the actual page. It accepts configured official merchant domains and DealNews, Hip2Save, 9to5Toys and Slickdeals, including a final-redirect domain check. Search prose is never treated as page content or price verification; unsupported domains and future-dated sources are recorded as skipped. All searches use the existing `llm` receipts and budget breaker.

Google reference: https://ai.google.dev/gemini-api/docs/google-search/ . Keepa dependency: https://keepa.com/api-docs/plans-tokens.html . Slickdeals partner API: https://corp-site.slickdeals.net/api-resources/ .

First scheduled discovery validation returned 10 cited URLs, examined up to 8, and imported 2 readable official pages (Target product page and Best Buy Q&A). Editorial filtering rejected the unrelated Q&A; a listing without a concrete price is retained as reference and excluded from the Latest Deals product-offer stream. Six other candidate pages were skipped for unavailable/insufficient content. This is bounded discovery, not an exhaustive scan of every shop.

## Reviews & Picks expansion

Six additional publisher/independent review feeds, AI discovery candidates and blocked-source findings are documented in [Reviews & Picks delivery](savlume-reviews-delivery.md). The new review-search schedule uses the existing gateway Gemini tool; GPT is used for analysis with an evidence-checked search fallback.

## Redirected purchase links (October 13, 2026)

Publishers rarely link a merchant directly. 9to5Toys wraps every Amazon link in `amzn.to`; Hip2Save uses `on.ltk.com`, `go.shopmy.us` and `shoplowes.me`; others use `howl.link`, `bhpho.to` and `lvnta.com`. The extractor only kept anchors whose host was already a configured merchant, so these articles reached the model with an empty link list and could never receive a purchase link. At the time of the change 111 of the 204 public offers without a link had such a redirector in their stored body.

Resolution now follows the redirectors listed in `LINK_REDIRECTORS` (`industry/shopping.ts`) one `Location` at a time with HEAD requests, through the same network guard as every other fetch, and stops as soon as a hop names a configured merchant. The merchant page is not requested in that step, a chain that ends anywhere else yields nothing, and at most eight distinct redirector links are followed per article. The destination and the anchor's own text (for example "brand new 2026 Mac Studio at $200 off") join the link list the model chooses from, under the unchanged rule that it must pick the exact offered product and never a store homepage. Attribution parameters are stripped as before; Impact/LTK-style `clickid`, `sourceid`, `sharedid` and similar keys were added to that list. Links to Apple's podcast, TV, music and app hosts no longer count as Apple store destinations.

Backfill: `docker compose exec -T worker node scripts/relink-shopping-offers.ts 25` re-extracts up to that many public offers that still have no link and whose source body contains a redirector, through the normal receipts and budget. Nothing is written for an article whose links cannot be resolved; its page keeps saying the destination is not confirmed. Resolved links enter the 30-minute merchant check like any other and stay source-reported until a matching merchant structured-data check succeeds, which no configured merchant currently exposes to this crawler.

## Source expansion (October 13, 2026)

Sixty-two candidate feeds were probed from this server (status, item count, newest entry, content type), then each shortlisted feed was parsed by the repository RSS reader and its first article passed through the repository body extractor. robots.txt was read for every domain kept; none disallows the article paths for general crawlers. Only public feeds and ordinary pages were accessed; nothing blocked was bypassed. Each new feed starts with a three-item import and publishes summaries with source links only (`site_fulltext` off), as the existing feeds do.

| Source | Feed | Check | Decision |
|---|---|---|---|
| Ben’s Bargains | https://bensbargains.com/rss/ | 20 entries, all within 24 h; bargain page body is short (about 200 characters) but holds the full offer text, comparable to Slickdeals pages | Enabled, 120 min |
| CNET Deals | https://www.cnet.com/rss/deals/ | 25 entries, about 12/day; readable article | Enabled, 180 min |
| PCMag Deals | https://www.pcmag.com/feeds/rss/deals | 100 entries, about 10/day; readable | Enabled, 180 min |
| TechRadar Deals | https://www.techradar.com/feeds/tag/deals | 50 entries, about 11/day; readable. Complements the existing TechRadar review and guide feeds | Enabled, 180 min |
| The Verge Good Deals | https://www.theverge.com/rss/good-deals/index.xml | 10 entries, a few per week; readable | Enabled, 240 min |
| MacRumors Deals | https://feeds.macrumors.com/MacRumors-Deals | 20 entries, all within 24 h; readable. Apple-focused, some entries are product news the editorial filter will route | Enabled, 180 min |
| Android Police Deals | https://www.androidpolice.com/feed/deals/ | 10 entries, about 1–2/day; readable | Enabled, 240 min |
| Money Saving Mom | https://moneysavingmom.com/feed/ | 75 entries, 20+/day; readable. Household, grocery and kids offers, a gap in the existing sources | Enabled, 120 min |
| Southern Savers | https://www.southernsavers.com/feed/ | 25 entries, 20+/day; readable. Grocery and drugstore offers | Enabled, 120 min |
| Hey, It’s Free! | https://www.heyitsfree.net/feed/ | 20 entries, about 2/day; readable. Freebies, which the offer model already classifies | Enabled, 240 min |
| Costco Insider | https://www.costcoinsider.com/feed/ | 10 entries, about 2/week; readable coupon-book posts. Membership pricing stays source-reported | Enabled, 360 min |
| PCMag Reviews | https://www.pcmag.com/feeds/rss/reviews | 100 entries, about 1–2/day; readable long-form review | Enabled as Reviews & Picks, 240 min |
| WIRED Gear | https://www.wired.com/feed/category/gear/latest/rss | 20 entries, about 20/day; readable long-form. Mixed reviews and gear news; the editorial filter rejects plain news | Enabled as Reviews & Picks, 240 min |
| DealCatcher | https://www.dealcatcher.com/rss | Feed works, but the extractor finds no readable body on deal pages | Not enabled |
| The Krazy Coupon Lady | https://thekrazycouponlady.com/rss | Feed works (1,700 entries, 1.3 MB) but deal pages render without a readable body and the newest entry was four days old | Not enabled |
| Digital Trends | https://www.digitaltrends.com/feed/ | Only a general news feed; the review-filtered URL returns the same news items | Not enabled |
| Tom’s Guide deals tag | https://www.tomsguide.com/feeds/tag/deals | Works, but the enabled Tom’s Guide feed already carries these articles | Not added |
| TechBargains, Brad’s Deals, Clark Deals, Wirecutter, Woot RSS, Dealmoon, GottaDeal, Dealsea, Reviewed, RTINGS, Consumer Reports, IGN Deals, CNET Cheapskate | various | 403 or 404 from this server; not bypassed | Not enabled |
| FDA, USDA FSIS, NHTSA, FTC recall and alert feeds | various | 403, 404 or 503 from this server; CPSC remains the recall source | Not enabled |
| Engadget, 9to5Mac, AppleInsider, Android Authority, Good Housekeeping, The Kitchn, The Inventory | general feeds | Reachable but general news or recipe feeds without a deals or review channel; The Inventory not evaluated beyond the feed | Not enabled |
