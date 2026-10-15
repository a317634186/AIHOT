// Price-drop watches: create (e-mail needs a confirmation click; push is consent by itself), confirm,
// stop, and the half-hourly check that tells watchers when the offer's price fell below what they
// saw. Notifications link to the Savlume page, never straight to a retailer.
import { createHash, randomBytes } from "node:crypto";
import { config } from "../config.ts";
import { sql } from "../db.ts";
import { emailConfigured, sendEmail } from "../notify/email.ts";
import { sendPush, validSubscription, type PushSubscriptionInput } from "../notify/push.ts";
import { shoppingItems } from "../publication/shopping.ts";
import { plainTitle } from "@aihot/contracts/shopping";
import { SITE } from "@aihot/industry/site";

const usd = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n / 100);
/** A drop counts when it is at least this share below the price the watcher saw. */
const MIN_DROP = 0.03;

export class WatchRejected extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

async function currentPrice(articleId: string): Promise<{ title: string; price: number | null; live: boolean }> {
  const item = (await shoppingItems({ id: articleId })).items[0];
  if (!item) return { title: "", price: null, live: false };
  const d = item.offer;
  return { title: plainTitle(item.title), price: d.checkoutPriceCents ?? d.listedPriceCents, live: !["Expired", "Out of Stock"].includes(d.status) && item.timing?.state !== "ended" };
}

export function watchOptions() { return { email: emailConfigured(), push: true }; }

/** Creates a watch. E-mail: a confirmation mail goes out and nothing is sent until the link is clicked. Push: active at once. */
export async function createWatch(input: { articleId: string; channel: "email" | "push"; email?: string; subscription?: unknown }, visitorIp: string) {
  const { title, price, live } = await currentPrice(input.articleId);
  if (!title || !live) throw new WatchRejected("This offer is not available to watch.", 404);
  if (price === null) throw new WatchRejected("This offer has no recorded price to watch.", 409);
  const token = randomBytes(24).toString("base64url");
  if (input.channel === "email") {
    if (!emailConfigured()) throw new WatchRejected("E-mail alerts are not available yet.", 503);
    const email = String(input.email ?? "").trim().toLowerCase();
    if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i.test(email)) throw new WatchRejected("Enter a valid e-mail address.");
    const [row] = await sql<{ token: string; confirmed_at: string | null }[]>`
      INSERT INTO price_watches(article_id, channel, address, token, baseline_cents)
      VALUES (${input.articleId}, 'email', ${email}, ${token}, ${price})
      ON CONFLICT (article_id, channel, address) DO UPDATE SET baseline_cents = LEAST(price_watches.baseline_cents, EXCLUDED.baseline_cents)
      RETURNING token, confirmed_at`;
    if (!row!.confirmed_at) {
      const link = `${config.siteUrl}/api/site/watch/confirm?token=${encodeURIComponent(row!.token)}`;
      await sendEmail(email, `Confirm your price alert: ${title}`,
        `You asked ${SITE.name} to tell you when "${title}" drops below ${usd(price)}.\n\nConfirm here: ${link}\n\nIf this was not you, ignore this message and nothing will be sent.`,
        `<p>You asked ${SITE.name} to tell you when <strong>${escapeHtml(title)}</strong> drops below ${usd(price)}.</p><p><a href="${link}">Confirm this price alert</a></p><p>If this was not you, ignore this message and nothing will be sent.</p>`);
    }
    return { channel: "email" as const, confirmed: !!row!.confirmed_at, baselineCents: price };
  }
  const sub = validSubscription(input.subscription);
  if (!sub) throw new WatchRejected("Browser push is not available on this device.");
  await sql`INSERT INTO price_watches(article_id, channel, address, push_keys, token, baseline_cents, confirmed_at)
    VALUES (${input.articleId}, 'push', ${sub.endpoint}, ${sql.json(sub.keys as never)}, ${token}, ${price}, now())
    ON CONFLICT (article_id, channel, address) DO UPDATE SET push_keys = EXCLUDED.push_keys, baseline_cents = LEAST(price_watches.baseline_cents, EXCLUDED.baseline_cents), confirmed_at = now(), failures = 0`;
  void visitorIp;
  return { channel: "push" as const, confirmed: true, baselineCents: price };
}

export async function confirmWatch(token: string): Promise<{ articleId: string } | null> {
  const [row] = await sql<{ article_id: string }[]>`UPDATE price_watches SET confirmed_at = coalesce(confirmed_at, now()) WHERE token = ${token} RETURNING article_id`;
  return row ? { articleId: row.article_id } : null;
}

export async function stopWatch(token: string): Promise<boolean> {
  const rows = await sql`DELETE FROM price_watches WHERE token = ${token}`;
  return rows.count > 0;
}

/** Removes every push watch for a browser subscription (the user turned alerts off on the page). */
export async function stopPushWatches(endpoint: string, articleId?: string): Promise<number> {
  const rows = articleId
    ? await sql`DELETE FROM price_watches WHERE channel = 'push' AND address = ${endpoint} AND article_id = ${articleId}`
    : await sql`DELETE FROM price_watches WHERE channel = 'push' AND address = ${endpoint}`;
  return rows.count;
}

/** The half-hourly check: one notification per watch per new low, never for a price that only rose. */
export async function checkPriceWatches(now = Date.now()) {
  const watches = await sql<{ id: number; article_id: string; channel: "email" | "push"; address: string; push_keys: PushSubscriptionInput["keys"] | null; token: string; baseline_cents: number; last_notified_cents: number | null }[]>`
    SELECT id, article_id, channel, address, push_keys, token, baseline_cents, last_notified_cents FROM price_watches WHERE confirmed_at IS NOT NULL AND failures < 5 ORDER BY article_id`;
  let sent = 0, dropped = 0;
  const cache = new Map<string, Awaited<ReturnType<typeof currentPrice>>>();
  for (const w of watches) {
    let current = cache.get(w.article_id);
    if (!current) { current = await currentPrice(w.article_id); cache.set(w.article_id, current); }
    if (!current.live || current.price === null) continue;
    const reference = w.last_notified_cents ?? w.baseline_cents;
    if (current.price > reference * (1 - MIN_DROP)) continue;
    const url = `${config.siteUrl}/items/${w.article_id}`;
    const title = `Price drop: ${current.title}`;
    const body = `Now ${usd(current.price)}, down from ${usd(reference)} when you set the alert.`;
    try {
      if (w.channel === "email") {
        const stop = `${config.siteUrl}/api/site/watch/stop?token=${encodeURIComponent(w.token)}`;
        await sendEmail(w.address, title, `${body}\n\nSee the offer: ${url}\n\nStop this alert: ${stop}`,
          `<p>${escapeHtml(body)}</p><p><a href="${url}">See the offer on ${SITE.name}</a></p><p style="color:#777;font-size:12px"><a href="${stop}">Stop this alert</a></p>`);
      } else {
        const ok = await sendPush({ endpoint: w.address, keys: w.push_keys! }, { title, body, url });
        if (!ok) { await sql`DELETE FROM price_watches WHERE id = ${w.id}`; dropped++; continue; }
      }
      await sql`UPDATE price_watches SET last_notified_cents = ${current.price}, last_notified_at = ${new Date(now)}, failures = 0 WHERE id = ${w.id}`;
      sent++;
    } catch {
      await sql`UPDATE price_watches SET failures = failures + 1 WHERE id = ${w.id}`;
    }
  }
  return { watches: watches.length, sent, dropped };
}

function escapeHtml(s: string) { return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!); }
export const watchTokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
