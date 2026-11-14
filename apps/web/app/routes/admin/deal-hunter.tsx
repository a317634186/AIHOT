import { useState } from "react";
import type { Route } from "./+types/deal-hunter";
import { adminGet } from "../../lib/admin.server";
import { useAdminAction } from "../../features/admin/action";
import { AdminPage, Badge, Button, Card, DataTable, Input, Stat, Time } from "../../features/admin/ui";

type Candidate = { id: number; title: string; product_url: string; original_source_url: string; source_name: string; discovered_at: string; stage: string; evidence: Record<string, any>; score: number | null; score_breakdown: Record<string, number>; score_reasons: string[]; rejection_reason: string | null; validation: Record<string, boolean>; submission_status: string; submission_error: string | null; article_id: string | null; unified_status: string };
type Overview = { config: { enabled: boolean; dailyLimit: number; scoreThreshold: number; timezone: string }; quota: { reserved: number; submitted: number }; runs: Array<Record<string, any>>; stats: Record<string, any>; candidates: Candidate[]; rejectionReasons: Array<{ rejection_reason: string; count: number }>; sourceDistribution: Array<{ source_name: string; count: number; average_score: number | null }>; todayRuns: { count: number; completed: number; failed: number } };

export async function loader({ request }: Route.LoaderArgs) {
  return adminGet<Overview>(request, "/api/admin/deal-hunter");
}

export const meta: Route.MetaFunction = () => [{ title: "AI Deal Hunter · Savlume Admin" }];

export default function DealHunterAdmin({ loaderData }: Route.ComponentProps) {
  const { run, pending } = useAdminAction();
  const [enabled, setEnabled] = useState(loaderData.config.enabled);
  const [scoreThreshold, setScoreThreshold] = useState(loaderData.config.scoreThreshold);
  const data = loaderData;
  const stats = data.stats ?? {};
  const save = () => run("PATCH", "/api/admin/deal-hunter/config", { enabled, dailyLimit: 0, scoreThreshold, timezone: data.config.timezone }, { label: "deal-hunter-config", success: "AI Deal Hunter 配置已保存" });

  return <AdminPage title="AI Deal Hunter" subtitle={`主动发现、核验并评分；当前不设每日发现或提交数量上限。每日额度时区：${data.config.timezone}`} actions={<Button tone="primary" busy={pending === "deal-hunter-run"} onClick={() => run("POST", "/api/admin/deal-hunter/run", {}, { label: "deal-hunter-run", success: "AI Deal Hunter 已排入后台运行队列" })}>立即运行</Button>}>
    <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
      <Stat label="今日运行 / 成功" value={`${data.todayRuns.count} / ${data.todayRuns.completed}`} hint={`失败 ${data.todayRuns.failed}`} />
      <Stat label="今日已提交" value={`${data.quota.submitted} · 无数量上限`} />
      <Stat label="近 30 天发现" value={stats.discovered ?? 0} />
      <Stat label="已研究" value={stats.researched ?? 0} />
      <Stat label="价格核验通过" value={stats.price_verified ?? 0} />
      <Stat label="评分 80+" value={stats.score_80_plus ?? 0} />
      <Stat label="平均评分" value={stats.average_score ?? "—"} />
    </div>
    <div className="grid gap-5 xl:grid-cols-[1fr_2fr]">
      <Card title="运行控制">
        <div className="space-y-4">
          <label className="flex items-center justify-between text-[13px]">自动运行<input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /></label>
          <label className="block text-[13px]">最低评分门槛<Input className="mt-1" type="number" min={70} max={100} value={scoreThreshold} onChange={(event) => setScoreThreshold(Number(event.target.value))} /></label>
          <Button tone="primary" busy={pending === "deal-hunter-config"} onClick={save}>保存设置</Button>
          <p className="text-[12px] text-ink-3">当前不限制发现和提交数量；只有通过真实性核验且达到评分门槛的商品才能提交。现有导入接口会按每批最多 50 条分批接收。</p>
        </div>
      </Card>
      <Card title="最近运行" pad={false}>
        <DataTable dense rows={data.runs} rowKey={(row) => row.id} empty="尚无运行记录" columns={[
          { key: "id", label: "任务", render: (row) => `#${row.id}` },
          { key: "status", label: "状态", render: (row) => <Badge tone={row.status === "completed" ? "ok" : row.status === "failed" ? "bad" : "muted"}>{row.status}</Badge> },
          { key: "time", label: "开始", render: (row) => <Time at={row.started_at} /> },
          { key: "counts", label: "发现 / 研究 / 合格 / 提交", render: (row) => `${row.found_count} / ${row.researched_count} / ${row.qualified_count} / ${row.submitted_count}` },
          { key: "model", label: "模型调用 / Token", render: (row) => `${row.model_calls} / ${Object.values(row.token_usage ?? {}).reduce((sum: number, value: any) => sum + Number(value || 0), 0)}` },
          { key: "error", label: "错误 / 发现诊断", render: (row) => row.error ?? (row.detail?.discovery ? `商品页 ${row.detail.discovery.productPages} · 无价格结构 ${row.detail.discovery.pagesWithoutProducts} · 被 robots/网络阻断 ${row.detail.discovery.blockedSources + row.detail.discovery.failedFetches}` : "—") },
        ]} />
      </Card>
    </div>
    <div className="mt-5 grid gap-5 xl:grid-cols-2">
      <Card title="发现来源表现" pad={false}><DataTable dense rows={data.sourceDistribution} rowKey={(row) => row.source_name} empty="暂无来源数据" columns={[
        { key: "source", label: "来源", render: (row) => row.source_name },
        { key: "count", label: "候选数", render: (row) => row.count },
        { key: "score", label: "平均评分", render: (row) => row.average_score ?? "—" },
      ]} /></Card>
      <Card title="淘汰与观察原因" pad={false}><DataTable dense rows={data.rejectionReasons} rowKey={(row) => row.rejection_reason} empty="暂无淘汰记录" columns={[
        { key: "reason", label: "原因", render: (row) => row.rejection_reason },
        { key: "count", label: "数量", render: (row) => row.count },
      ]} /></Card>
    </div>
    <Card className="mt-5" title="候选商品与筛选依据" pad={false}>
      <DataTable dense rows={data.candidates} rowKey={(row) => row.id} empty="尚未发现候选商品" columns={[
        { key: "product", label: "商品 / 来源", render: (row) => <div className="flex min-w-[260px] items-center gap-2"><img src={row.evidence?.image ?? undefined} alt="" className="size-12 rounded bg-white object-contain" loading="lazy" /><div><a className="font-medium text-accent" href={row.product_url} target="_blank" rel="nofollow sponsored noopener">{row.title}</a><div className="text-[11px] text-ink-3">{row.source_name} · <Time at={row.discovered_at} /></div></div></div> },
        { key: "price", label: "当前价格", render: (row) => row.evidence?.price ? `$${Number(row.evidence.price).toFixed(2)}` : "未知" },
        { key: "score", label: "评分", render: (row) => row.score ?? "—" },
        { key: "basis", label: "评分依据", render: (row) => row.score_reasons?.join(" · ") || row.rejection_reason || "研究待处理" },
        { key: "stage", label: "阶段", render: (row) => `${row.stage} · ${row.submission_status}` },
        { key: "unified", label: "Savlume 筛选", render: (row) => row.unified_status },
        { key: "evidence", label: "核验", render: (row) => row.validation?.currentUsdPrice ? "商品页 USD 价格" : "价格未核实" },
      ]} />
    </Card>
  </AdminPage>;
}
