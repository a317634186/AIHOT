// Anonymous page-view and outbound-click counting for the admin statistics page.
// One row per day and path; distinct visitors per day through a salted, non-reversible hash.
import { createHash } from "node:crypto";
import { credential } from "../config.ts";
import { sql } from "../db.ts";
import { SHOPPING } from "@aihot/industry/shopping";

const BOT = /bot|crawl|spider|slurp|fetch|headless|lighthouse|pagespeed|monitor|preview|curl|wget|python-requests|httpclient|go-http|java\/|okhttp|facebookexternalhit|embedly|quora link|pinterest|vkshare|w3c_validator|whatsapp|telegrambot/i;
const PATH = /^\/[\w\-./%]{0,200}$/;

export interface Hit { kind: "view" | "click"; path: string; referrer?: string | null; destination?: string | null }

/** The day a hit belongs to, in the site's time zone. */
export const trafficDay = (now = Date.now()) => new Date(now).toLocaleDateString("sv-SE", { timeZone: SHOPPING.timeZone });

function visitorHash(ip: string, userAgent: string, day: string): string {
  const salt = credential("auth", "SESSION_SECRET") ?? "";
  return createHash("sha256").update(`${salt}|${day}|${ip}|${userAgent}`).digest("hex").slice(0, 32);
}

/** Normalises what a browser sent; null means the hit is not counted (bots, malformed, admin). */
export function normaliseHit(raw: unknown, userAgent: string): Hit | null {
  if (!userAgent || BOT.test(userAgent)) return null;
  const r = (raw ?? {}) as Record<string, unknown>;
  const kind = r.t === "click" ? "click" : r.t === "view" ? "view" : null;
  if (!kind) return null;
  let path = typeof r.p === "string" ? r.p : "";
  try { path = new URL(path, "https://x.invalid").pathname; } catch { return null; }
  if (!PATH.test(path) || path.startsWith("/admin") || path.startsWith("/api/")) return null;
  // Item pages are counted both individually and as one group, so the top list stays readable.
  let referrer: string | null = null;
  if (typeof r.r === "string" && r.r) { try { const u = new URL(r.r); if (/^https?:$/.test(u.protocol)) referrer = u.hostname.replace(/^www\./, "").slice(0, 120); } catch {} }
  let destination: string | null = null;
  if (kind === "click" && typeof r.h === "string") { try { destination = new URL(r.h).hostname.replace(/^www\./, "").slice(0, 120); } catch {} }
  return { kind, path, referrer, destination };
}

export async function recordHit(hit: Hit, ip: string, userAgent: string, now = Date.now(), siteHost = ""): Promise<void> {
  const day = trafficDay(now);
  const path = hit.kind === "click" ? `${hit.path}→${hit.destination ?? "?"}` : hit.path;
  await sql`INSERT INTO traffic_hits(day,kind,path,hits) VALUES(${day},${hit.kind},${path},1) ON CONFLICT (day,kind,path) DO UPDATE SET hits=traffic_hits.hits+1`;
  if (hit.kind === "view") {
    await sql`INSERT INTO traffic_visitors(day,visitor) VALUES(${day},${visitorHash(ip, userAgent, day)}) ON CONFLICT DO NOTHING`;
    const host = hit.referrer && hit.referrer !== siteHost ? hit.referrer : null;
    if (host) await sql`INSERT INTO traffic_referrers(day,host,hits) VALUES(${day},${host},1) ON CONFLICT (day,host) DO UPDATE SET hits=traffic_referrers.hits+1`;
  }
}

/** Per-address throttle: a browser never needs more than this; anything beyond is a script. */
const recent = new Map<string, { until: number; n: number }>();
export function throttled(ip: string, now = Date.now(), limit = 120): boolean {
  const slot = recent.get(ip);
  if (!slot || slot.until < now) { recent.set(ip, { until: now + 60_000, n: 1 }); if (recent.size > 20_000) recent.clear(); return false; }
  slot.n += 1;
  return slot.n > limit;
}

export async function pruneTraffic(now = new Date()) {
  const visitors = await sql`DELETE FROM traffic_visitors WHERE day < ${new Date(now.getTime() - 100 * 86400_000)}`;
  const hits = await sql`DELETE FROM traffic_hits WHERE day < ${new Date(now.getTime() - 400 * 86400_000)}`;
  const referrers = await sql`DELETE FROM traffic_referrers WHERE day < ${new Date(now.getTime() - 400 * 86400_000)}`;
  return { visitors: visitors.count, hits: hits.count, referrers: referrers.count };
}
