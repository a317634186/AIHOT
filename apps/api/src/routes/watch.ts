// Public price-watch endpoints: options (which channels work), create, confirm (e-mail link),
// stop (link in every mail or the page's own button). Throttled per address like feedback.
import type { FastifyInstance } from "fastify";
import { config } from "@aihot/backend/config";
import { pushKeys } from "@aihot/backend/notify/push";
import { confirmWatch, createWatch, stopPushWatches, stopWatch, WatchRejected, watchOptions } from "@aihot/backend/shopping/watch";
import { throttled } from "@aihot/backend/site/traffic";
import { sendProblem } from "../http/respond.ts";

export function registerWatch(app: FastifyInstance) {
  app.get("/api/site/watch/options", async (_req, reply) => {
    reply.header("Cache-Control", "no-store");
    const keys = await pushKeys();
    return { ...watchOptions(), vapidPublicKey: keys.publicKey };
  });
  app.post("/api/site/watch", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const ip = String(req.headers["x-real-ip"] ?? req.ip ?? "");
    if (throttled(ip + ":watch", Date.now(), 20)) return sendProblem(req, reply, { status: 429, code: "rate_limited", detail: "Too many requests; try again in a minute.", retryAfter: 60 });
    const b = (req.body ?? {}) as Record<string, unknown>;
    try {
      const result = await createWatch({ articleId: String(b.articleId ?? ""), channel: b.channel === "email" ? "email" : "push", email: typeof b.email === "string" ? b.email : undefined, subscription: b.subscription }, ip);
      return reply.code(201).send(result);
    } catch (error) {
      if (error instanceof WatchRejected) return sendProblem(req, reply, { status: error.status, code: "watch_rejected", detail: error.message });
      req.log.error({ err: error }, "price watch failed");
      return sendProblem(req, reply, { status: 503, code: "temporarily_unavailable", detail: "Could not save the alert; please try again.", retryAfter: 30 });
    }
  });
  app.post("/api/site/watch/stop", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (typeof b.endpoint !== "string") return reply.code(400).send({ error: "endpoint required" });
    return { removed: await stopPushWatches(b.endpoint, typeof b.articleId === "string" ? b.articleId : undefined) };
  });
  for (const action of ["confirm", "stop"] as const) app.get(`/api/site/watch/${action}`, async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const token = String((req.query as Record<string, string>).token ?? "");
    if (!/^[\w-]{20,64}$/.test(token)) return reply.code(400).type("text/plain").send("Invalid link");
    if (action === "confirm") {
      const result = await confirmWatch(token);
      if (!result) return reply.code(404).type("text/plain").send("This alert link is no longer valid.");
      return reply.redirect(`${config.siteUrl}/items/${result.articleId}?alert=confirmed`, 303);
    }
    await stopWatch(token);
    return reply.redirect(`${config.siteUrl}/?alert=stopped`, 303);
  });
}
