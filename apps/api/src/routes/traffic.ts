// Anonymous traffic beacon: the browser reports a page view or an outbound click, nothing else.
// Bots, malformed hits and admin paths are dropped before any write; one address is throttled.
import type { FastifyInstance } from "fastify";
import { normaliseHit, recordHit, throttled } from "@aihot/backend/site/traffic";
import { config } from "@aihot/backend/config";

export function registerTraffic(app: FastifyInstance) {
  // sendBeacon posts text/plain to avoid a preflight; parse it ourselves.
  if (!app.hasContentTypeParser("text/plain")) app.addContentTypeParser("text/plain", { parseAs: "string", bodyLimit: 4096 }, (_req, body, done) => done(null, body));
  app.post("/api/site/hit", { bodyLimit: 4096 }, async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const ip = String(req.headers["cf-connecting-ip"] ?? req.headers["x-real-ip"] ?? req.ip ?? "");
    if (throttled(ip)) return reply.code(204).send();
    let raw: unknown = req.body;
    if (typeof raw === "string") { try { raw = JSON.parse(raw); } catch { return reply.code(204).send(); } }
    const hit = normaliseHit(raw, String(req.headers["user-agent"] ?? ""));
    if (!hit) return reply.code(204).send();
    try { await recordHit(hit, ip, String(req.headers["user-agent"] ?? ""), Date.now(), new URL(config.siteUrl).hostname.replace(/^www\./, "")); }
    catch (error) { req.log.warn({ err: String(error) }, "traffic hit not recorded"); }
    return reply.code(204).send();
  });
}
