// The admin statistics page: traffic (anonymous counters), content, sources, pipeline and engagement,
// as daily series over a window plus totals. Everything comes from the database; nothing is sampled.
import { sql } from "../db.ts";
import { trafficDay } from "../site/traffic.ts";

type Row = Record<string, any>;
const days = (n: number) => Array.from({ length: n }, (_, i) => new Date(Date.now() - (n - 1 - i) * 86400_000).toLocaleDateString("sv-SE", { timeZone: "America/New_York" }));
const byDay = (rows: Row[], key: string, field: string) => { const m = new Map<string, number>(); for (const r of rows) m.set(String(r[key]).slice(0, 10), Number(r[field])); return m; };

export async function siteStats(window = 30) {
  const n = Math.max(7, Math.min(90, window));
  const labels = days(n);
  const since = labels[0]!;
  const today = trafficDay();
  const [views, visitors, clicks, paths, referrers, clickTargets] = await Promise.all([
    sql`SELECT day::text AS day, sum(hits)::int AS n FROM traffic_hits WHERE kind='view' AND day>=${since} GROUP BY 1`,
    sql`SELECT day::text AS day, count(*)::int AS n FROM traffic_visitors WHERE day>=${since} GROUP BY 1`,
    sql`SELECT day::text AS day, sum(hits)::int AS n FROM traffic_hits WHERE kind='click' AND day>=${since} GROUP BY 1`,
    sql`SELECT CASE WHEN path LIKE '/items/%' THEN '/items/* (all item pages)' ELSE path END AS path, sum(hits)::int AS hits FROM traffic_hits WHERE kind='view' AND day>=${since} GROUP BY 1 ORDER BY 2 DESC LIMIT 15`,
    sql`SELECT host, sum(hits)::int AS hits FROM traffic_referrers WHERE day>=${since} GROUP BY 1 ORDER BY 2 DESC LIMIT 12`,
    sql`SELECT split_part(path,'→',2) AS host, sum(hits)::int AS hits FROM traffic_hits WHERE kind='click' AND day>=${since} GROUP BY 1 ORDER BY 2 DESC LIMIT 12`,
  ]);
  const v = byDay(views, "day", "n"), u = byDay(visitors, "day", "n"), c = byDay(clicks, "day", "n");
  const sumLast = (m: Map<string, number>, k: number) => labels.slice(-k).reduce((a, d) => a + (m.get(d) ?? 0), 0);
  const traffic = {
    daily: labels.map((d) => ({ day: d, views: v.get(d) ?? 0, visitors: u.get(d) ?? 0, clicks: c.get(d) ?? 0 })),
    today: { views: v.get(today) ?? 0, visitors: u.get(today) ?? 0, clicks: c.get(today) ?? 0 },
    last7: { views: sumLast(v, 7), visitors: sumLast(u, 7), clicks: sumLast(c, 7) },
    window: { views: sumLast(v, n), visitors: sumLast(u, n), clicks: sumLast(c, n) },
    paths, referrers, clickTargets,
  };

  const [publishedByKind, kinds, categories, coverage, ages, statuses] = await Promise.all([
    sql`SELECT to_char(p.timeline_at AT TIME ZONE 'America/New_York','YYYY-MM-DD') AS day, coalesce(d.data->>'kind','other') AS kind, count(*)::int AS n
        FROM publications p JOIN shopping_offers d ON d.article_id=p.article_id
        WHERE p.visibility='public' AND p.eligible AND p.timeline_at>=${since}::date GROUP BY 1,2`,
    sql`SELECT coalesce(d.data->>'kind','other') AS kind, count(*)::int AS n FROM publications p JOIN shopping_offers d ON d.article_id=p.article_id WHERE p.visibility='public' AND p.eligible GROUP BY 1 ORDER BY 2 DESC`,
    sql`SELECT coalesce(p.category,'(none)') AS category, count(*)::int AS n FROM publications p JOIN shopping_offers d ON d.article_id=p.article_id WHERE p.visibility='public' AND p.eligible GROUP BY 1 ORDER BY 2 DESC`,
    sql`SELECT count(*)::int AS total,
          count(*) FILTER (WHERE d.data->>'kind' IN ('product_deal','coupon_offer','cashback_offer','freebie'))::int AS offers,
          count(*) FILTER (WHERE d.data->>'kind' IN ('product_deal','coupon_offer','cashback_offer','freebie') AND d.data->>'buyUrl' IS NOT NULL)::int AS offers_with_link,
          count(*) FILTER (WHERE d.data->>'kind' IN ('product_deal','coupon_offer','cashback_offer','freebie') AND (d.data->>'listedPriceCents' IS NOT NULL OR d.data->>'checkoutPriceCents' IS NOT NULL))::int AS offers_with_price,
          count(*) FILTER (WHERE d.data->>'imageUrl' IS NOT NULL)::int AS with_image,
          count(*) FILTER (WHERE d.data->>'deadlineOriginal' IS NOT NULL OR d.data->>'expiresAt' IS NOT NULL)::int AS with_deadline,
          count(*) FILTER (WHERE p.timeline_at>now()-interval '24 hours')::int AS last24h
        FROM publications p JOIN shopping_offers d ON d.article_id=p.article_id WHERE p.visibility='public' AND p.eligible`,
    sql`SELECT CASE WHEN p.timeline_at>now()-interval '1 day' THEN '0-1d' WHEN p.timeline_at>now()-interval '3 days' THEN '1-3d' WHEN p.timeline_at>now()-interval '7 days' THEN '3-7d' ELSE '7d+' END AS bucket, count(*)::int AS n
        FROM publications p JOIN shopping_offers d ON d.article_id=p.article_id WHERE p.visibility='public' AND p.eligible AND d.data->>'kind' IN ('product_deal','coupon_offer','cashback_offer','freebie') GROUP BY 1`,
    sql`SELECT d.data->>'status' AS status, count(*)::int AS n FROM publications p JOIN shopping_offers d ON d.article_id=p.article_id WHERE p.visibility='public' AND p.eligible GROUP BY 1 ORDER BY 2 DESC`,
  ]);
  const kindKeys = ["product_deal", "coupon_offer", "cashback_offer", "freebie", "shopping_news", "buying_guide", "recall"];
  const pk = new Map<string, number>(); for (const r of publishedByKind) pk.set(`${r.day}|${r.kind}`, r.n);
  const content = {
    publishedDaily: labels.map((d) => ({ day: d, ...Object.fromEntries(kindKeys.map((k) => [k, pk.get(`${d}|${k}`) ?? 0])) })),
    kinds, categories, coverage: coverage[0], ages, statuses,
  };

  const [sources, receiptsDaily, receiptIssues, failedJobs, engagement] = await Promise.all([
    sql`SELECT s.id, s.name, s.enabled, s.health, s.last_ok_at, s.interval_minutes,
          (SELECT count(*)::int FROM articles a WHERE a.source_id=s.id AND a.discovered_at>=${since}::date) AS collected,
          (SELECT count(*)::int FROM publications p WHERE p.source_id=s.id AND p.visibility='public' AND p.eligible AND p.timeline_at>=${since}::date) AS published
        FROM sources s WHERE s.id LIKE 'shopping-%' ORDER BY published DESC, collected DESC`,
    sql`SELECT to_char(created_at AT TIME ZONE 'America/New_York','YYYY-MM-DD') AS day, status, count(*)::int AS n FROM receipts WHERE created_at>=${since}::date GROUP BY 1,2`,
    sql`SELECT model, count(*)::int AS failed, left(max(error),120) AS sample FROM receipts WHERE status='failed' AND created_at>now()-interval '24 hours' GROUP BY 1 ORDER BY 2 DESC`,
    sql`SELECT job, count(*)::int AS n, max(started_at) AS last FROM job_runs WHERE status='failed' AND started_at>now()-interval '7 days' GROUP BY 1 ORDER BY 2 DESC`,
    sql`SELECT (SELECT count(*)::int FROM shopping_likes) AS likes, (SELECT count(*)::int FROM shopping_likes WHERE created_at>now()-interval '7 days') AS likes7,
          (SELECT count(*)::int FROM feedback) AS feedback, (SELECT count(*)::int FROM feedback WHERE status='new') AS feedback_new`,
  ]);
  const rk = new Map<string, number>(); for (const r of receiptsDaily) rk.set(`${r.day}|${r.status}`, r.n);
  const pipeline = {
    receiptsDaily: labels.map((d) => ({ day: d, completed: rk.get(`${d}|completed`) ?? 0, failed: rk.get(`${d}|failed`) ?? 0, other: ["pending", "received", "unknown"].reduce((a, s) => a + (rk.get(`${d}|${s}`) ?? 0), 0) })),
    receiptIssues, failedJobs,
  };
  return { generatedAt: new Date().toISOString(), days: n, labels, traffic, content, sources, pipeline, engagement: engagement[0] };
}
