# Savlume buyer-facing review round (October 14, 2026)

An outside review of the live site found it reading like a compliance document rather than a deals guide: no expiry handling, a "Recommended" tab that was really a firehose, hedging copy on every surface, cards without the numbers that make a shopper click, a detail page dominated by empty modules, misfiled "reviews", hot-linked publisher images, and no operational safety net. This round addresses those in order.

## Timing and expiry

- `offerTiming()` (`packages/contracts/src/shopping.ts`) derives one timing state per offer from stored evidence only: an exact `expiresAt`, a deadline day parsed from the source's own wording, or, when nothing was stated, age against the kind's shelf life (`SHOPPING.productDealShelfDays` = 3, `SHOPPING.couponShelfDays` = 10). States: `current`, `ending` (within two days), `likely-ended` (age only, never asserted as fact), `ended` (deadline passed, expired or out of stock).
- Every card and detail page shows when the item was posted ("2h ago") and, when the source stated it, when it ends ("Ends today", "Ends Oct 19", "Ended Oct 11"). Items older than their shelf life with no deadline say "May have ended".
- Best Deals and Coupons list only `current` and `ending` offers. Recommended keeps everything, labelled, as the full site stream the owner asked for. Past offers additionally collects `ended` items.
- A new `ending` view feeds a "Limited-time deals" strip on Recommended and Best Deals. An offer qualifies only with a stated end date, a purchase link, a single product and a source-stated markdown of at least 20% (10% when the source calls it a platform flash sale). Up to twenty are ranked by a composite of the markdown, the lowest price in Savlume's own records (two or more observations; never a market-wide claim), source-stated popularity, and the site's own outbound clicks and likes, with offers ending within two days pushed up. The strip renders only when such offers exist.
- Merchant rechecks now cover the last 14 days of offers (24 per run) instead of a backlog that never cleared.

## Copy and cards

- "AI Picks" is "Recommended" everywhere (tabs, error page, tests). The header no longer carries a "preview" badge; the footer, About, Terms and Privacy no longer describe the site as a personal preview or say its thresholds are uncalibrated.
- Stored headlines are read through `plainTitle()`, which removes "Reported at" wording and "(Price Unspecified)"; the headline prompt now forbids both for new items.
- Cards show the price, the regular price struck through and a "46% off" badge when the source stated both (`offerSavings()`, hidden under 5% or over 95%), a coupon chip, the retailer, the posting age and the timing label. The "source-reported · before tax" caption is gone; one sentence on the detail page states the sourcing instead.
- Buttons: "Shop at Amazon", "Get offer at Walmart", "Get this deal" for publisher redirects, and "See deal at {source}" when no merchant link exists, so every card has a destination.
- The buying answers block keeps its questions (they carry the GEO value) but answers in plain language.

## Detail page

Order is now product, price row, timing, one sourcing sentence, summary, call to action, then the AI reasons, the buying answers, review findings, price history only when two prices or a second retailer exist, actions, and the fact panels showing only rows with a value. The "Evidence" panel became "Sources & checks" with the source links first.

## Reviews & Picks

`isReviewContent()` treats announcement headlines ("X reports/launches/highlights Y", "reportedly priced") as news unless the headline itself evaluates, and the extraction prompt no longer attaches a review to launch reports or relays. Existing misfiled items move to News on their next read; no data migration was needed.

## Images

Card and hero images are served through the signed image proxy (`image-336/720/1200` renditions, disk cached) instead of hot-linking publisher hosts. `offer.imageUrl` stays the original for metadata. The privacy notice was updated accordingly.

## Operations

- Public pages send `public, max-age=0, s-maxage=60`; `apps/web/server.ts` keeps browser revalidation while granting the shared lifetime, and the host Nginx now runs a page microcache (`proxy_cache savlume_pages`, bypassed for admin sessions, never storing `Set-Cookie`, `private` or non-200 responses). `deploy/savlume.nginx.conf` is the maintained copy.
- A nightly `pg_dump` (custom format) runs from root's crontab at 03:17 to `/root/backups`, keeping 14 days. Off-server copies still need an object store (`DB_BACKUP_STORE_*`).
- Model calls retry 429/5xx and connection refusals twice with short pauses inside the same receipt; timeouts are never retried.
- The working tree is committed to git locally (no push).

Still owner actions: alert webhook (`ALERT_WEBHOOK_URL`), Search Console and analytics, off-server backup storage, key rotation for the model gateway, and an affiliate program with disclosure when ready.

## Amazon Associates (October 15, 2026)

The site is enrolled in Amazon Associates with tag `savlume-20` (`AFFILIATE` in `industry/shopping.ts`; a public link parameter, not a secret). `affiliateLink()` adds the tag to Amazon product links at read time in the publication layer, so stored links stay clean and every exit (pages, feeds, API, text versions) is consistent; any publisher tag on a resolved link is replaced. Amazon links carry `rel="sponsored"`. The required disclosure appears in the footer and on About, and Amazon prices show "as of" the source time beside them, as the operating agreement requires. Links to other retailers are untouched. Affiliate links must not be placed in e-mails; a future newsletter links to Savlume pages instead.

## Volume control, cost and retention (October 15, 2026)

**Admission instead of first come.** Every collected article still gets the cheap prefilter and one score (the second independent score call is skipped in shopping mode; `scoreCalls()` in `analyze.ts`). The score then passes an admission gate (`admissionGate` in `jobs/content.ts`) before any paid writing, structure or extraction runs: below 60% of `SHOPPING.dailyPublishCap` (350) anything scoring at least `admissionFloor` (40) is admitted; up to the cap only selected items (at or above the source tier's threshold); at the cap nothing more that day. Gated articles are recorded as `block` with `output.gated=true` and `processing_state='skipped'`. A per-source cap (`_aihot.dailyQuota`, default `sourceDailyQuota` 60; DealNews 120, Slickdeals 90, Ben's Bargains and Hip2Save 60) bounds how many of a source's articles are scored at all. The scoring prompt now names price advantage as the main driver. The fuller "understand" copy is written only for selected items. The structure step is unchanged: its category and entity output feed publication and would need the extraction schema and the publish step reworked to merge; a later round.

**Duplicates.** Beyond the strict stored identity, the read layer merges two listings of the same product (name and model) at the same retailer at the same price with the same stated deadline; the newer stays and the other becomes an extra source.

**Marketplace sellers and inflated markdowns.** Cards label listings sold by someone other than the retailer ("Sold by …"). Best Deals orders each day's offers with first-party listings first, and drops markdowns above 70% that are not at a registry retailer.

**Discovery.** The AI discovery job rejects hub, index and shallow-path pages by URL and title, and gained a query for Amazon lightning and deal-of-the-day markdowns as reported by the deal guides. Amazon's own deals page is not scraped: the conditions of use and the Associates agreement forbid it; the official route is the Product Advertising API once the account qualifies (three sales in 180 days), whose item search filters by minimum saving percent.

**Saved items and price-drop alerts.** A heart on every card and detail page keeps a list in the browser (`/saved`, `localStorage`, nothing server-side). "Price-drop alert" on offer pages registers a watch (`price_watches`, migration 0043) through browser push (Web Push with a VAPID pair generated once into `settings`; the service worker is `apps/web/public/sw.js`) or e-mail with a confirmation link. A half-hourly job (`shopping.price-watch`) compares each watched offer's current price with the price the watcher saw (or the last notified price) and sends one message per new low of at least 3%, linking to the Savlume page. E-mail requires `SMTP_URL` (for example `smtps://user:pass@smtp.example.com:465`) and `MAIL_FROM`; until both are set the page offers push only. Amazon affiliate links never appear in e-mail.
