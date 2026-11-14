import { SITE } from "@aihot/industry/site";
import { Link, useSearchParams } from "react-router";
import type { Route } from "./+types/stats";
import { adminGet } from "../../lib/admin.server";
import { LineChart, ShareBars, StackedBars } from "../../features/admin/charts";
import { bj, num, pct } from "../../features/admin/format";
import { AdminPage, Badge, Card, DataTable, Dot, Stat, Time, healthTone } from "../../features/admin/ui";

type Row = Record<string, any>;
interface Stats {
  generatedAt: string; days: number; labels: string[];
  traffic: { daily: Array<{ day: string; views: number; visitors: number; clicks: number }>; today: Row; last7: Row; window: Row; paths: Row[]; referrers: Row[]; clickTargets: Row[] };
  content: { publishedDaily: Row[]; kinds: Row[]; categories: Row[]; coverage: Row; ages: Row[]; statuses: Row[] };
  sources: Row[];
  pipeline: { receiptsDaily: Array<{ day: string; completed: number; failed: number; other: number }>; receiptIssues: Row[]; failedJobs: Row[] };
  engagement: Row;
}

export async function loader({ request }: Route.LoaderArgs) {
  const days = Number(new URL(request.url).searchParams.get("days")) || 30;
  return adminGet<Stats>(request, `/api/admin/stats?days=${days}`);
}
export const meta: Route.MetaFunction = () => [{ title: `数据统计 · ${SITE.name} 后台` }];

// Categorical hues in fixed order, defined per theme in app.css and validated for both surfaces (docs/savlume-admin-stats.md).
const C = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"] as const;
const KIND_LABEL: Record<string, string> = { product_deal: "单品优惠", coupon_offer: "优惠券", cashback_offer: "返现", freebie: "免费", shopping_news: "新闻", buying_guide: "评测/指南", recall: "召回" };
const AGE_LABEL: Record<string, string> = { "0-1d": "24 小时内", "1-3d": "1–3 天", "3-7d": "3–7 天", "7d+": "7 天以上" };
const short = (d: string) => d.slice(5);

export default function StatsAdmin({ loaderData: s }: Route.ComponentProps) {
  const [params] = useSearchParams();
  const days = Number(params.get("days")) || 30;
  const labels = s.labels.map(short);
  const cov = s.content.coverage;
  const ctr = s.traffic.window.views ? s.traffic.window.clicks / s.traffic.window.views : 0;
  const share = (part: number, whole: number) => (whole ? pct((part / whole) * 100, 0) : "—");
  return (
    <AdminPage title="数据统计" subtitle={<>访问、内容、信源与流水线一览 · 更新于 <Time at={s.generatedAt} /></>} actions={
      <div className="flex gap-1">{[7, 30, 90].map((d) => <Link key={d} to={`?days=${d}`} className={`rounded-full px-3 py-1 text-[13px] ring-1 ring-line ${d === days ? "bg-ink text-bg" : "text-ink-3"}`}>{d} 天</Link>)}</div>
    }>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="今日浏览 / 当日去重访客" value={<>{num(s.traffic.today.views)} <span className="text-ink-4">/</span> {num(s.traffic.today.visitors)}</>} hint={`近 7 天浏览 ${num(s.traffic.last7.views)} · 日访客累计 ${num(s.traffic.last7.visitors)}`} />
        <Stat label={`${days} 天浏览量`} value={num(s.traffic.window.views)} hint={`日访客累计 ${num(s.traffic.window.dailyVisitors)}`} />
        <Stat label="外链点击 / 浏览（事件比率）" value={pct(ctr * 100)} hint={`${num(s.traffic.window.clicks)} 次外链点击 / ${num(s.traffic.window.views)} 次页面浏览`} />
        <Stat label="公开条目" value={num(cov.total)} hint={`近 24 小时新增 ${num(cov.last24h)}`} />
      </div>

      <Card title="访问趋势" className="mt-4">
        <LineChart labels={labels} series={[
          { key: "views", label: "浏览量", color: C[0], values: s.traffic.daily.map((d) => d.views) },
          { key: "visitors", label: "访客", color: C[2], values: s.traffic.daily.map((d) => d.visitors) },
          { key: "clicks", label: "外链点击", color: C[1], values: s.traffic.daily.map((d) => d.clicks), dashed: true },
        ]} />
        <p className="mt-2 text-[12px] text-ink-4">数据来自浏览器上报并过滤已识别的机器人。访客按自然日用轮换哈希去重；区间“日访客累计”会重复计算跨日回访者。点击/浏览是事件比率，不等同于会话转化率。</p>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="页面表现（按浏览量）" className="lg:col-span-2">
          <DataTable rows={s.traffic.paths} rowKey={(r) => r.path} dense columns={[
            { key: "path", label: "页面", render: (r) => <span className="break-all">{r.path}</span> },
            { key: "views", label: "浏览", align: "right", render: (r) => num(r.views) },
            { key: "clicks", label: "外链点击", align: "right", render: (r) => num(r.clicks) },
            { key: "rate", label: "点击 / 浏览", align: "right", render: (r) => pct(Number(r.click_rate)) },
          ]} />
          <p className="mt-2 text-[12px] text-ink-4">仅统计已上报的外链点击；点击率按该页面点击事件 ÷ 页面浏览事件计算。</p>
        </Card>
        <Card title="来源站点"><ShareBars rows={s.traffic.referrers.map((r) => ({ label: r.host, value: r.hits }))} />{!s.traffic.referrers.length && <p className="text-[13px] text-ink-4">还没有外部来源；直接访问不计入。</p>}</Card>
        <Card title="点击去向（零售商）"><ShareBars rows={s.traffic.clickTargets.map((r) => ({ label: r.host || "(unknown)", value: r.hits }))} />{!s.traffic.clickTargets.length && <p className="text-[13px] text-ink-4">还没有外链点击。</p>}</Card>
      </div>

      <Card title="每日发布（按内容类型）" className="mt-4">
        <StackedBars labels={labels} series={[
          ["product_deal", 0], ["coupon_offer", 1], ["freebie", 2], ["cashback_offer", 3], ["shopping_news", 4], ["buying_guide", 5],
        ].map(([k, i]) => ({ key: String(k), label: KIND_LABEL[k as string]!, color: C[i as number]!, values: s.content.publishedDaily.map((d) => d[k as string] ?? 0) }))} />
      </Card>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="优惠类带购买链接" value={share(cov.offers_with_link, cov.offers)} hint={`${num(cov.offers_with_link)} / ${num(cov.offers)}`} tone={cov.offers && cov.offers_with_link / cov.offers < 0.7 ? "warn" : "ok"} />
        <Stat label="优惠类带价格" value={share(cov.offers_with_price, cov.offers)} hint={`${num(cov.offers_with_price)} / ${num(cov.offers)}`} />
        <Stat label="带图片" value={share(cov.with_image, cov.total)} hint={`${num(cov.with_image)} / ${num(cov.total)}`} />
        <Stat label="来源写明截止" value={share(cov.with_deadline, cov.total)} hint="有截止日期才会进入 Ending soon" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="内容类型"><ShareBars rows={s.content.kinds.map((r) => ({ label: KIND_LABEL[r.kind] ?? r.kind, value: r.n }))} /></Card>
        <Card title="品类分布"><ShareBars rows={s.content.categories.map((r) => ({ label: r.category, value: r.n }))} /></Card>
        <Card title="优惠条目年龄"><ShareBars rows={["0-1d", "1-3d", "3-7d", "7d+"].map((b) => ({ label: AGE_LABEL[b]!, value: s.content.ages.find((a) => a.bucket === b)?.n ?? 0 }))} /><p className="mt-3 text-[12px] text-ink-4">状态：{s.content.statuses.map((r) => `${r.status} ${num(r.n)}`).join(" · ")}</p></Card>
      </div>

      <Card title={`信源（近 ${days} 天）`} className="mt-4">
        <DataTable rows={s.sources} rowKey={(r) => r.id} dense columns={[
          { key: "name", label: "信源", render: (r) => <Link to={`/admin/sources/${r.id}`} className="text-ink hover:underline">{r.name}</Link> },
          { key: "health", label: "状态", render: (r) => <span className="inline-flex items-center gap-1.5"><Dot tone={healthTone(r.health)} />{r.enabled ? r.health : "已停用"}</span> },
          { key: "collected", label: "采集", align: "right", render: (r) => num(r.collected) },
          { key: "published", label: "发布", align: "right", render: (r) => num(r.published) },
          { key: "rate", label: "发布率", align: "right", render: (r) => share(r.published, r.collected) },
          { key: "last", label: "最近成功", render: (r) => <Time at={r.last_ok_at} /> },
        ]} />
      </Card>

      <Card title="模型调用" className="mt-4">
        <StackedBars labels={labels} series={[
          { key: "completed", label: "成功", color: C[0], values: s.pipeline.receiptsDaily.map((d) => d.completed) },
          { key: "failed", label: "失败", color: C[1], values: s.pipeline.receiptsDaily.map((d) => d.failed) },
          { key: "other", label: "进行中/未知", color: C[3], values: s.pipeline.receiptsDaily.map((d) => d.other) },
        ]} />
        {s.pipeline.receiptIssues.length > 0 && <div className="mt-3 space-y-1 text-[12.5px]">{s.pipeline.receiptIssues.map((r) => <div key={r.model} className="flex items-center gap-2"><Badge tone="bad">{num(r.failed)} 次失败</Badge><span className="num">{r.model}</span><span className="truncate text-ink-4">{r.sample}</span></div>)}</div>}
        {s.pipeline.failedJobs.length > 0 && <p className="mt-3 text-[12.5px] text-ink-3">近 7 天失败的定时任务：{s.pipeline.failedJobs.map((j) => `${j.job} ×${j.n}（最近 ${bj(j.last)}）`).join("；")}</p>}
      </Card>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="点赞" value={num(s.engagement.likes)} hint={`近 7 天 ${num(s.engagement.likes7)}`} />
        <Stat label="反馈" value={num(s.engagement.feedback)} hint={`待处理 ${num(s.engagement.feedback_new)}`} tone={s.engagement.feedback_new ? "warn" : undefined} />
      </div>
    </AdminPage>
  );
}
