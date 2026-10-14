# Savlume SEO and AI-search audit

Date: October 11, 2026. Site: https://savlume.com
Scope: every sitemap URL, home/section/category/retailer pages, product and shopping-news detail pages, structured data, machine-readable channels, source attribution, pagination, network/proxy handling and mobile navigation.

## Results

| Check | Before | After |
| --- | --- | --- |
| Sitemap URLs scanned | 279 | 278 |
| Eligible item URLs | 253 | 252; one exact duplicate explicitly excluded |
| Non-200, mismatched canonical or missing/duplicate H1 among sitemap pages | 0 | 0 |
| Repeated search titles/descriptions | 1 duplicate group | 0 |
| Title length over 90 characters (heuristic, not a search-engine limit) | 116 | 95 |
| Machine guide discovery | Pointed at default verified-only API/RSS | Explicit all-content API/RSS, pagination, source guidance and text versions |
| API all-content pagination | Offset ignored; offer-only view | Offset works; includes public shopping news and guides |
| Public machine-feed items | Restricted default view could be empty | 253 public items available via documented `mode=all` |
| Article modification time | Offer-check bookkeeping could change it | Dedicated content timestamp; routine check metadata excluded |
| Text representation | Not implemented | Canonical-linked Markdown for each public item |
| Entity identity | Repeated inline entities without stable IDs | Linked Organization/WebSite/WebPage/Article IDs |
| Related detail links | Mainly category/footer links | Up to four eligible same-category articles per item |
| Cloudflare origin IP handling | Proxy addresses could represent visitors | Only official Cloudflare networks trusted for CF-Connecting-IP |

Full inventories: [before](audits/seo-geo-before-20261011.json), [after](audits/seo-geo-after-20261011.json). Counts reflect the snapshot, not a fixed catalog size. The non-indexed duplicate is retained publicly and can be restored via the existing SEO controls. A database backup precedes the change and the exclusion has an admin audit record.

## Search titles, descriptions and canonical URLs

The site keeps its English US-shopping focus, three bottom tabs and category navigation. Long item metadata titles now remove redundant “Reported” phrasing and, when useful, use the stored product/model/variant/condition/merchant identity. Full on-page article headlines remain intact; descriptions preserve verification status and source summary. Titles are not blindly cut to an arbitrary character limit, which could drop critical variants or buying conditions. Some long, specific product titles remain intentionally descriptive.

Tracking parameters do not enter canonicals. Irrelevant item filter/offset parameters no longer make an otherwise valid detail page disappear. Existing category/retailer canonical redirects, per-page pagination canonicals, search/filter noindex and manual SEO exclusions remain. Canonical/JSON-LD behavior was tested under both SSR and client navigation.

## Semantic content and GEO

- Product pages contain visible, source-grounded answers to price, verification, restrictions, deadlines and later rewards. Answers use stored structured facts; there is no new paid model call during page rendering.
- Listed/reference prices are explicitly distinguished from a conditional checkout price; rewards are not netted into the checkout amount. Expired and unverified states are retained in the answers.
- Source publication time, the site's publication timeline and content-update time are labeled separately where available. Verification/check times remain in the evidence section.
- Organization, WebSite, WebPage, Article, CollectionPage and BreadcrumbList use consistent identifiers and links. No invented review stars, aggregate ratings, stock, authors or merchant offers were added. No FAQ rich-result eligibility is claimed for the visible buying questions.
- The About page explains the actual AI-assisted summarization process, verification limits and correction process, without claiming human product testing or a staffed newsroom. Source and methodology links are visible from details.
- Related content is a same-category reading suggestion, not a claim that products are technically interchangeable. Unavailable and explicitly SEO-excluded entries are omitted from that module.
- `/items/{id}/markdown` exposes an escaped text representation of the same public data, source links, status, timestamps and canonical URL. It has a canonical HTTP Link and noindex header to keep the HTML article the search destination. Missing/withdrawn/blocked items remain inaccessible.
- `/llms.txt` is a documented convenience for tools, not a recognized ranking boost or a replacement for normal crawling. It links to all updates, categories, retailers, methodology, source semantics and machine interfaces.
- `/api/v1/items?mode=all&limit=24&offset=24` and `/feed/all.xml` now carry the full public shopping stream, including news. MCP latest/search uses the same publication reader. Verified-only endpoints remain available and are not portrayed as the complete catalog.
- Generic retailer home/all-deals pages are rejected by future AI discovery to reduce duplicate policy/navigation summaries masquerading as fresh product finds.

## Timestamp migration and duplicates

Migration `0041_shopping_content_timestamp.sql` adds `shopping_offers.content_updated_at`. Changes to product facts, prices, eligibility or stored status update it; changes only to lastCheckedAt, verifiedAt or verificationNote do not. Sitemap lastmod and Article dateModified now use the content timestamp plus publication changes. Existing rows use their previously stored update value as a baseline; the system does not invent an earlier edit date it cannot recover.

One pair of Woot pages had the same title, summary and source identity. The redundant homepage-derived entry was marked noindex via `setSeoIndexed`, with an audit reason pointing to the retained article. Both records remain in the public information stream as requested; only the duplicate is excluded from search discovery. No source material or price records were deleted.

## Crawling and network checks

Cloudflare proxying is active. Public HTML remains dynamic/no-store so changing prices, statuses, private sessions and reactions are not cached as stale full pages. Existing static build assets retain their own cache rules. The origin now trusts the published 22 Cloudflare IPv4/IPv6 networks for real-client headers; arbitrary direct `CF-Connecting-IP` spoofing was tested and rejected. Configurations are in `deploy/cloudflare-realip.conf` and `deploy/savlume.nginx.conf`; refresh the trusted ranges when Cloudflare changes its official list.

Robots permits public content through its default group and blocks administrative/auth paths. Requests using Googlebot, bingbot, OAI-SearchBot and ChatGPT-User user-agent strings returned normal 200 HTML for the home, Flash Deals and a detail page, plus robots.txt; no challenge page was detected. **These are user-agent probes from this server, not requests from independently verified engine crawler IPs and not proof of indexing.** Cloudflare account-level bot policies were not changed without account access. No broad firewall or bot-protection bypass was installed.

Observed sample HTML probe times were about 0.3–0.4 seconds from this server. This is not a global speed test or real-user Core Web Vitals measurement. The full SSR payload grew with the evidence/related-content modules; no unsupported performance-score improvement is claimed. Mobile and desktop had no horizontal overflow, and continuous loading still appended 24 to 48 cards. Advertising domains were blocked in browser tests to avoid real ad impressions/clicks.

## Validation and limits

- Typecheck, production builds and all **16 web tests** passed.
- New integration tests passed for shared all-item/text visibility, offset pagination, missing/withdrawn text responses and stable lastmod under routine checks.
- Buying-answer tests passed for listed-vs-checkout distinctions, rewards, expiry and non-offer news.
- Full backend regression: **201/205**. Existing analyze/translate shutdown fixture failures and X/WeChat recovery failures remain; the full suite is not green.
- SEO smoke: **278 URLs / 252 eligible item URLs**, valid metadata/JSON-LD, canonical pagination and item share images.
- GEO smoke: documented all-content feed returned **253 public items**; Markdown, entity links, visible timestamps, RSS and crawler-UA probes passed.
- Full post-deployment sitemap crawl: zero non-200/H1/canonical errors, zero duplicate indexed titles/descriptions.
- Native mobile flow, detail answers, four related links and desktop rendering were checked.

No Google Search Console or Bing Webmaster account access is configured. No authenticated sitemap submission, URL-indexing request, real-engine URL Inspection, Bing AI Performance report or ranking/citation measurement was performed. No indexing, rich result, AI citation or traffic growth is guaranteed.

## Next steps for the owner

1. Verify `savlume.com` in Google Search Console and Bing Webmaster Tools. Submit `https://savlume.com/sitemap.xml` and inspect representative home, category, store and product URLs.
2. In Cloudflare, confirm public pages are not covered by broad “block AI crawlers”/challenge rules for the search crawlers you want to allow. Keep administrative restrictions. Search visibility and model-training permissions are separate decisions.
3. Track actual impressions, clicks, indexed pages and query groups; use Bing AI Performance if available in the account to monitor citations. Compare against this dated baseline rather than simulated rank scores.
4. Improve source-specific product matching, historical price coverage and manual correction quality. Clear, original, accurate buying context matters more than producing additional generic summaries.
5. Review real-user Core Web Vitals after advertising is active; do not infer them from a headless test with ads blocked.

## Official references

- [Google AI features and site requirements](https://developers.google.com/search/docs/appearance/ai-features): ordinary search eligibility and helpful content remain the foundation; there is no required special AI markup or AI text file.
- [OpenAI crawler overview](https://developers.openai.com/api/docs/bots): OAI-SearchBot is distinct from GPTBot training crawling and ChatGPT-User requests.
- [Bing webmaster guidelines](https://www.bing.com/webmasters/help/webmaster-guidelines-30fba23a): crawlability, reliable content and accurate markup apply to search and AI grounding.
- [Bing AI Performance](https://blogs.bing.com/webmaster/2026/2/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview/): account-level citation measurement, not a ranking guarantee.
- [Cloudflare real visitor IPs](https://developers.cloudflare.com/support/troubleshooting/restoring-visitor-ips/restoring-original-visitor-ips/) and [official address ranges](https://www.cloudflare.com/ips/).

## Follow-up round: October 13, 2026

Second audit pass over the same scope, driven by machine-readable findings rather than page markup. All changes are in the shopping-mode code paths (`apps/api/src/routes/shopping.ts`, `packages/backend/src/publication/shopping.ts`, `packages/backend/src/publication/shopping-seo.ts`, `packages/backend/src/reports/compose.ts`, `apps/web/app/lib/shopping-seo.ts`, `apps/web/app/routes/dealbrief.tsx`, `apps/web/app/root.tsx`).

| Finding | Before | After |
| --- | --- | --- |
| Reported public item total | Capped at 1500 rows by a hard `LIMIT`; the oldest ~30 eligible items were unreachable through the API, feeds and MCP while the sitemap still listed them | Safety bound raised well above the working set; API reports the real total (1549 at verification) and the previously dropped items resolve on both API and page |
| `/feed.xml`, `/feed/full.xml`, `/feed/daily.xml` | Permanently empty: all three read the `top` view, which requires merchant-verified `Active` offers and there are none | Read the non-expired ranking view; 50 items each, with the stored status label preserved on every entry. `/feed/all.xml` and `/feed/reviews.xml` unchanged |
| `/api/v1/hot-topics`, `/api/v1/selected/snapshot`, MCP `get_top_deals`, `/hot` | Same empty `top` view | Editorial ranking view (`picks`): non-expired offers ordered by stored score, each keeping its own status label. No price, stock or verification claim is derived from the ranking |
| `view=top` semantics | Active-only | Unchanged. Zero Active offers remains the honest result, and the ranking view is documented separately so the two are not confused |
| Daily briefing deal half | Built from the empty `top` view | Built from the ranking view |
| `pubDate`/alternate naming | Every item page advertised `/feed.xml` as “Verified offers” while the feed was empty and would not have been verified anyway | Renamed to the ranking view’s actual content on the shell link and the `/agent` page |
| `/api/v1/items`, `/api/v1/items/{id}`, `/api/v1/hot-topics`, `/api/v1/selected/snapshot` | `no-store`, no `ETag` | Short shared lifetime plus a weak `ETag` whose content identity excludes the per-request `checkedAt`; verified 304 on a matching `If-None-Match` |
| `/sitemap.xml`, `/sitemaps/pages.xml`, `/sitemaps/items-N.xml` | `no-store`; index and `pages.xml` carried no `lastmod` | Shared cache lifetime plus `ETag`; both files now carry `lastmod` derived from the newest content they actually list, per category and per retailer |
| `/llms.txt`, `/manifest.webmanifest`, `/robots.txt` | `no-store` or no explicit header (robots relied on a CDN default) | Explicit cache headers; robots set to one hour, matching the non-shopping variant |
| `/og/items/{id}.png` | `no-store`; every request re-rendered the card | Long shared lifetime plus the renderer’s own content `ETag`; verified 304 on a matching `If-None-Match` |
| `/openapi-v1.json` | A one-path stub | The maintained document, trimmed to the operations shopping mode actually mounts, so no advertised path returns 404 |
| `BreadcrumbList` | Item, category and retailer pages only | Utility pages gained a `Home > page` trail that matches their visible breadcrumb. Listing and landing pages were briefly given a self-referential trail and then had it removed — see the breadcrumb-alignment section below |
| `/api/site/meta` | Hard-coded changelog version | Reads the industry changelog file |
| First card image | `loading="lazy"` on every list image, including the first | The first card image is eager with high fetch priority; later images stay lazy |

### Limits of this round

- Counts above are a snapshot taken at verification time; the catalog grows continuously.
- The `ETag` on the read APIs is weak and computed over the response payload with the request timestamp removed. It answers 304 only when the underlying content is byte-identical; a single new item changes it.
- Cached responses are shared, so `Cache-Control` on read APIs is deliberately short (60 s) and the per-visitor like state is not part of those responses.
- `/api/shopping` (the browser feed endpoint) remains `no-store`: it carries per-item like counts and is read during infinite scroll.
- No ranking, indexing, rich-result or AI-citation improvement is claimed or measured. Search Console and Bing Webmaster access are still not configured.
- Test-harness notes, unrelated to these changes. Local re-runs need a freshly migrated `*_test` database for a clean signal; CI migrates a new one each time and is unaffected. Three cases are order- or state-dependent rather than broken: `tests/token-security.test.ts` passes on a fresh database and fails on a second run against the same one, because a receipt's logical key is built from the model, purpose and the hashed system/user content but not the per-run `subject`, while that case uses a constant secret, so the second run reuses the first run's receipt and the provider stub is never called; `tests/selection-eval-runtime.test.ts` counts provider calls and saves/restores `settings` rows for `models.score`/`models.prefilter`, so a leftover row from an earlier run shifts the count; `tests/events.test.ts` has been observed reporting asynchronous activity after the test ended, the same shutdown-race class as the pre-existing `analyze-shutdown`/`translate-shutdown` failures. A second full run on the same code returned the original four failures and none of these three, which is the evidence that they are intermittent rather than regressions from this work.
- Edge caching by content type, measured after the change: `/og/**/*.png`, `/icon.png` and `/robots.txt` answer `cf-cache-status: HIT`, while `/sitemap.xml`, `/sitemaps/*.xml`, `/feed*.xml`, `/llms.txt` and `/api/v1/*` remain `DYNAMIC` even though they now send valid `s-maxage` directives. Cloudflare's default cache covers a fixed list of static extensions and does not include XML, plain text or JSON. Owner action: add a Cache Rule for these paths in the Cloudflare dashboard. The origin headers are already correct; without the rule every crawler or agent request reaches the origin and re-runs the query.

### Utility-page metadata, measured after the change

`/daily`, `/hot`, `/more`, `/topics` and `/changelog` render a generic title (`Shopping Information · Savlume`) and `noindex, follow`. The title is generic because none of them appears in the `fixed` metadata map in `apps/web/app/lib/shopping-seo.ts`, and the same absence is what makes them noindex.

`/daily` is not an empty shell: it served **13 cards** with an `h1` of "Daily Briefing" at verification time. It has **no inbound link anywhere on the site and is not in the sitemap**, so it is reachable only by typing the address.

**A decision is required, and the two effects are coupled.** Adding any of these paths to the `fixed` map changes two things at once: it gives the page a specific title and description, *and* it flips the page from `noindex` to `index, follow` (the noindex expression is `filtered || (!fixed[path] && !landing) || (…list… || !!landing) && total === 0`). Making `/daily` indexable would put a dated briefing into search without it being in the sitemap yet; leaving it as is keeps a real page invisible. Nothing was changed here — `view=top` semantics, the noindex expression and the metadata map are all as they were.

`/hot`, `/more`, `/topics` and `/changelog` are legacy or browsing aids with no product content of their own; `noindex` plus a generic title is appropriate for them and no change is recommended.

### Breadcrumb markup aligned with visible trails

Listing pages (`/`, `/all`, `/flash`, `/news`, `/reviews`, `/coupons`, `/archive`) and landing pages (`/deals/*`, `/stores/*`) emitted a `BreadcrumbList` whose only two items were the site root and the page itself. Google states that neither the top-level path nor the page itself needs a `ListItem`, and none of those pages renders a breadcrumb trail, so the markup described something no reader could see. `BreadcrumbList` is now emitted **only where a trail exists and is visible**:

- **Item pages** keep `Home > category > merchant` — a genuine hierarchy, and the page renders that exact trail.
- **Utility pages** (`/about`, `/privacy`, `/terms`, `/agent`) keep `Home > page`, and the markup's final `name` is now the string the visible trail actually shows (`About Savlume`), not the longer search title (`About Savlume: How We Find and Check Deals`) it previously used.
- **Listing, landing and daily pages** carry no breadcrumb markup. Their position is conveyed by the sticky section/category navigation, which sets `aria-current` on the active entry.

The `/all` contradiction noted earlier in this document is resolved by the same change: it canonicalises to `/` and no longer emits a self-referential trail.

Nothing about titles, descriptions, canonicals, `ItemList`, `CollectionPage` or `noindex` changed. Verified live after deployment: item and utility pages still carry `BreadcrumbList`, listing and landing pages no longer do, and each remaining `name` matches the rendered trail character for character.
