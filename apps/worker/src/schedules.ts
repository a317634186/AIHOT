import { crawlAndSynthesizePlatformCampaigns } from "@aihot/backend/shopping/platform-campaigns";
import { refreshMissingShoppingRecommendations } from "@aihot/backend/shopping/recommendations";
import { refreshMissingShoppingSeoDescriptions } from "@aihot/backend/shopping/seo-descriptions";
import { refreshMissingShoppingHubSeoTitles } from "@aihot/backend/shopping/hub-seo-titles";
import { generateNextBestTopic } from "@aihot/backend/best/generate";
import { discoverShopping } from "@aihot/backend/shopping/discovery";
import { runDealHunter, runDealHunterIfDue } from "@aihot/backend/dealhunter/index";
// Cron-style schedules (Asia/Shanghai). Each run is recorded in job_runs; missed slots run once.
import { SHOPPING } from "@aihot/industry/shopping";
import { recheckShopping, resolveMissingShoppingLinks, maintainShoppingIntegrity } from "@aihot/backend/shopping/offers";
import { researchShoppingComparisons } from "@aihot/backend/shopping/comparisons";
import { moderateCommunityBatch } from "@aihot/backend/community/moderation";
import { checkCommunityRetailerBatch } from "@aihot/backend/community/retailer-checks";
import { checkPriceWatches } from "@aihot/backend/shopping/watch";
import { pruneCommunitySecurity } from "@aihot/backend/community/auth";
import type { PgBoss } from "pg-boss";
import { FEATURES } from "@aihot/industry/features";
import { credential } from "@aihot/backend/config";
import { ensureQueue, recordRun } from "@aihot/backend/jobs/queue";
import { sweepUnprocessed } from "@aihot/backend/jobs/content";
import { translatePending } from "@aihot/backend/editorial/translate";
import { adaptIntervals, scheduleDueSources } from "@aihot/backend/sources/collect";
import { scheduleMpReconcile } from "@aihot/backend/sources/mp";
import { refreshSourceIcons } from "@aihot/backend/sources/icons";
import { computeHotRanking, snapshotHeat } from "@aihot/backend/events/hot";
import { refreshStoryStatuses } from "@aihot/backend/events/digest";
import { linkRelatedStories } from "@aihot/backend/events/group";
import { catchUpReports, composeDaily, composeMonthly, composeWeekly } from "@aihot/backend/reports/compose";
import { addDays, beijingDate, isoWeekLabel } from "@aihot/contracts/time";
import { runLeaderboardRound } from "@aihot/backend/leaderboard/method/run";
import { refreshLeaderboard } from "@aihot/backend/leaderboard/fetch/refresh";
import { monitorTick } from "@aihot/backend/monitor/scan";
import { dailyRetention } from "@aihot/backend/operations/retention";
import { submitIndexNow } from "@aihot/backend/operations/indexnow";
import { checkAlerts, sendDigest } from "@aihot/backend/operations/alerts";
import { autoReleaseUnknownReceipts } from "@aihot/backend/admin/runs";
import { forwardPendingFeedback } from "@aihot/backend/operations/feedback";
import { backupConfigured, runBackup } from "@aihot/backend/operations/backup";
import { sourceHealthWeekly } from "@aihot/backend/operations/reports";
import { markStalePendingReceipts } from "@aihot/backend/providers/receipts";
import { markStaleDeliveries } from "@aihot/backend/notify/deliver";

interface Scheduled {
  name: string;
  cron: string;
  run: () => Promise<unknown>;
  missed?: "skip" | "once";
}

const collecting = process.env.COLLECT_ENABLED !== "false";

export const SCHEDULES: Scheduled[] = [
  ...(SHOPPING.enabled && process.env.MODEL_CALLS_ENABLED !== 'false' ? [{name:'shopping.recommendations',cron:'17 * * * *',run:()=>refreshMissingShoppingRecommendations(20)}] : []),
  ...(SHOPPING.enabled && process.env.MODEL_CALLS_ENABLED !== 'false' ? [{name:'shopping.seo-descriptions',cron:'4,24,44 * * * *',run:()=>refreshMissingShoppingSeoDescriptions(60)}] : []),
  ...(SHOPPING.enabled && process.env.MODEL_CALLS_ENABLED !== 'false' ? [{name:'shopping.hub-seo-titles',cron:'23 */6 * * *',missed:'once' as const,run:()=>refreshMissingShoppingHubSeoTitles(8)}] : []),
  ...(SHOPPING.enabled && process.env.MODEL_CALLS_ENABLED !== 'false' ? [{name:'shopping.resolve-missing-links',cron:'8,38 * * * *',run:()=>resolveMissingShoppingLinks(8)}] : []),
  ...(SHOPPING.enabled && process.env.MODEL_CALLS_ENABLED !== 'false' ? [{name:'shopping.price-comparisons',cron:'0 */6 * * *',run:()=>researchShoppingComparisons(3)}] : []),
  ...(SHOPPING.enabled && process.env.MODEL_CALLS_ENABLED !== 'false' ? [{name:"shopping.platform-campaigns",cron:"15 */4 * * *",missed:"once" as const,run:()=>crawlAndSynthesizePlatformCampaigns()}] : []),
  ...(SHOPPING.enabled && process.env.MODEL_CALLS_ENABLED !== 'false' ? [{name:'shopping.best-topic-guides',cron:'27 6 * * *',missed:'once' as const,run:()=>generateNextBestTopic()}] : []),
  ...(SHOPPING.enabled ? [{name:'shopping.deal-hunter',cron:'0 * * * *',run:runDealHunterIfDue}] : []),
  ...(process.env.MODEL_CALLS_ENABLED !== 'false' ? [{name:'community.moderate',cron:'*/5 * * * *',run:()=>moderateCommunityBatch(10)}] : []),
  ...(collecting ? [{name:'community.retailer-checks',cron:'18,48 * * * *',run:()=>checkCommunityRetailerBatch(8)}] : []),
  ...(SHOPPING.enabled && collecting && process.env.SHOPPING_SEARCH_ENABLED === "true" ? [{name:"shopping.discover",cron:"10 */3 * * *",run:()=>discoverShopping()},{name:"shopping.review-discover",cron:"35 */6 * * *",run:()=>discoverShopping(undefined,'reviews')}] : []),
  { name: "content.sweep", cron: "1,11,21,31,41,51 * * * *", run: sweepUnprocessed },
  // Full-text translations of newly selected items (model calls; off with MODEL_CALLS_ENABLED=false).
  ...(SHOPPING.enabled ? [{ name: "shopping.price-watch", cron: "12,42 * * * *", run: () => checkPriceWatches() }] : []),
  ...(SHOPPING.enabled ? [{ name: "shopping.recheck", cron: "22,52 * * * *", run: recheckShopping }] : [{ name: "content.translate", cron: "*/5 * * * *", run: () => translatePending() }]),
  ...(SHOPPING.enabled && collecting ? [{ name: "shopping.integrity", cron: "13,43 * * * *", run: () => maintainShoppingIntegrity(5) }] : []),
  { name: "hot.rank", cron: "3,13,23,33,43,53 * * * *", run: () => computeHotRanking() },
  { name: "hot.snapshot", cron: "2 * * * *", run: () => snapshotHeat() },
  { name: "stories.status", cron: "7 * * * *", run: refreshStoryStatuses },
  { name: "stories.links", cron: "12 * * * *", run: linkRelatedStories },
  { name: "reports.daily", cron: `0 ${Number(process.env.BRIEFING_HOUR || SHOPPING.briefingHour)} * * *`, missed: "once", run: () => composeDaily(beijingDate(Date.now())) },
  { name: "reports.weekly", cron: "0 10 * * 1", missed: "once", run: () => composeWeekly(isoWeekLabel(addDays(beijingDate(Date.now()), -7))) },
  {
    name: "reports.monthly",
    cron: "30 10 1 * *",
    missed: "once",
    run: () => {
      const [y, m] = beijingDate(Date.now()).split("-").map(Number) as [number, number];
      return composeMonthly(m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`);
    },
  },
  { name: "reports.catch-up", cron: "15 * * * *", run: () => catchUpReports() },
  { name: "ops.retention", cron: "30 3 * * *", missed: "once", run: () => dailyRetention() },
  { name: "community.security-cleanup", cron: "35 3 * * *", missed: "once", run: () => pruneCommunitySecurity() },
  { name: "sources.icons", cron: "40 4 * * *", missed: "once", run: () => refreshSourceIcons() },
  // IndexNow for new indexable pages (off unless INDEXNOW_SUBMIT_ENABLED).
  { name: "seo.indexnow", cron: "*/15 * * * *", run: () => submitIndexNow() },
  // Work a stopped process left half way becomes visible, and unknown paid requests get their one
  // automatic release, before the alerts look.
  {
    name: "ops.recover",
    cron: "6,26,46 * * * *",
    run: async () => ({ receipts: await markStalePendingReceipts(), released: await autoReleaseUnknownReceipts(), deliveries: await markStaleDeliveries() }),
  },
  { name: "ops.alerts", cron: "9,29,49 * * * *", run: () => checkAlerts() },
  // One message with the follow-ups that do not touch readers (nothing when there are none).
  { name: "ops.digest", cron: "0 9 * * *", missed: "once", run: () => sendDigest() },
  // Feedback that did not reach the internal Feishu chat when it was sent (off with FEISHU_INTERNAL_ENABLED).
  { name: "feedback.forward", cron: "14,34,54 * * * *", run: () => forwardPendingFeedback() },
  ...(backupConfigured() ? [{ name: "ops.backup", cron: "10 4 * * *", missed: "once" as const, run: () => runBackup() }] : []),
  { name: "reports.source-health", cron: "0 9 * * 1", missed: "once", run: () => sourceHealthWeekly() },
  // Four upstream checks a day; a new run is published only when the evidence changed. With collection
  // off only the computation runs, over the snapshots already stored.
  ...(FEATURES.leaderboard
    ? [{ name: "leaderboard.round", cron: "5 2,8,14,20 * * *", missed: "once" as const, run: () => (collecting ? refreshLeaderboard() : runLeaderboardRound()) }]
    : []),
  ...(collecting
    ? [
        { name: "sources.schedule", cron: "* * * * *", run: () => scheduleDueSources() },
        { name: "sources.adapt-intervals", cron: "20 4 * * *", run: adaptIntervals },
        // WeChat official accounts (paid), each once per its interval.
        { name: "sources.mp-reconcile", cron: "*/15 * * * *", run: () => scheduleMpReconcile() },
      ]
    : []),
  // Codex reset monitor: checked every minute, scanned every 5 (every 3 while hot). It reads X through
  // SocialData, so without that key there is nothing to run.
  ...(collecting && FEATURES.codexResetMonitor && credential("collectors", "SOCIALDATA_API_KEY")
    ? [
        { name: "monitor.tick", cron: "* * * * *", run: () => monitorTick() },
        { name: "monitor.lookback", cron: "40 4 * * *", run: () => monitorTick({ lookbackHours: 48 }) },
      ]
    : []),
];

export async function registerSchedules(boss: PgBoss) {
  await ensureQueue("deal-hunter.run", { policy: "short", retryLimit: 0, expireInSeconds: 21600 });
  await boss.work<{ manual?: boolean }>("deal-hunter.run", { localConcurrency: 1, pollingIntervalSeconds: 10 }, async ([job]) => job ? runDealHunter({ manual: job.data.manual }) : undefined);
  for (const s of SCHEDULES) {
    const queue = `cron.${s.name}`;
    await ensureQueue(queue, { policy: "singleton", retryLimit: 1, expireInSeconds: 3600 });
    await boss.schedule(queue, s.cron, {}, { tz: SHOPPING.timeZone, missed: s.missed ?? "skip" });
    // Schedules fire at minute boundaries; a 15 s pickup keeps them on time with a third of the polling.
    await boss.work(queue, { pollingIntervalSeconds: 15 }, async () => recordRun(s.name, s.run));
  }
  // A schedule removed from the table (a module switched off) must not keep firing from an earlier run.
  const names = new Set(SCHEDULES.map((s) => `cron.${s.name}`));
  for (const existing of await boss.getSchedules()) {
    if (existing.name.startsWith("cron.") && !names.has(existing.name)) await boss.unschedule(existing.name);
  }
}
