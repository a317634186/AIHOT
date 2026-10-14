# Admin statistics page (October 14, 2026)

`/admin/stats` (the admin's landing page) shows traffic, content, sources, pipeline and engagement for a 7, 30 or 90 day window. Data comes from `GET /api/admin/stats?days=N` (`packages/backend/src/admin/stats.ts`), all read from the database.

## Traffic counting

The site had no traffic measurement at all. Pages now report to the site's own counter through `apps/web/app/components/TrafficBeacon.tsx`: one page view per navigation and one event per outbound purchase click (`a.db-buy`, `a.db-action-buy`, `a.db-ending-card`). `POST /api/site/hit` (`apps/api/src/routes/traffic.ts`, `packages/backend/src/site/traffic.ts`) drops bots by user agent, admin and API paths and malformed input, throttles one address to 120 hits a minute, and writes three tables (migration `0042_site_traffic.sql`):

- `traffic_hits(day, kind, path, hits)`: views per path and clicks per `path→destination host`.
- `traffic_visitors(day, visitor)`: distinct visitors per day. `visitor` is a SHA-256 of `SESSION_SECRET | day | address | user agent`, so it changes every day and cannot be reversed or joined across days. No cookie or browser identifier is used; the privacy notice says so.
- `traffic_referrers(day, host, hits)`: external referrer hosts for views.

Retention runs in the daily `ops.retention` job: visitors 100 days, hits and referrers 400 days. Counts exclude crawlers and anyone with JavaScript off; they are not comparable to server logs or to Google Analytics.

## What the page shows

- Today's and windowed views, visitors, outbound clicks and click-through rate; a line chart of the three series; top pages (item pages grouped), referrer hosts and click destinations.
- Daily publications stacked by content type; coverage tiles (offers with a purchase link, with a price, items with an image, items whose source stated a deadline); content type, category and offer-age breakdowns; stored status counts.
- Per-source collected and published counts for the window, health and last success.
- Model calls per day by outcome, failing models in the last 24 hours with a sample error, and failed scheduled jobs in the last 7 days.
- Likes and feedback totals.

## Chart colours

The admin's existing SVG charts (`features/admin/charts.tsx`) take one colour per series. Six categorical slots are defined as `--chart-1` to `--chart-6` in `app.css`, with separate values for the light and dark themes, taken from the data-visualisation reference palette and validated with its checker on both surfaces (lightness band, chroma floor, colour-vision-deficiency separation, normal-vision floor, contrast). Series are assigned slots in fixed order and never cycled.
