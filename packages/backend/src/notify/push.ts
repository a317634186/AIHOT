// Browser push (Web Push, VAPID). The key pair is generated once and kept in settings; the public
// half is sent to browsers, the private half never leaves the server.
import webpush from "web-push";
import { config } from "../config.ts";
import { sql } from "../db.ts";

interface Vapid { publicKey: string; privateKey: string }
let vapid: Vapid | null = null;

export async function pushKeys(): Promise<Vapid> {
  if (vapid) return vapid;
  const [row] = await sql<{ value: Vapid }[]>`SELECT value FROM settings WHERE key = 'push.vapid'`;
  if (row?.value?.publicKey && row.value.privateKey) return (vapid = row.value);
  const generated = webpush.generateVAPIDKeys();
  await sql`INSERT INTO settings(key, value) VALUES ('push.vapid', ${sql.json(generated as never)}) ON CONFLICT (key) DO NOTHING`;
  const [again] = await sql<{ value: Vapid }[]>`SELECT value FROM settings WHERE key = 'push.vapid'`;
  return (vapid = again!.value);
}

export interface PushSubscriptionInput { endpoint: string; keys: { p256dh: string; auth: string } }

export function validSubscription(raw: unknown): PushSubscriptionInput | null {
  const s = raw as PushSubscriptionInput | null;
  if (!s || typeof s.endpoint !== "string" || !/^https:\/\//.test(s.endpoint) || s.endpoint.length > 1000) return null;
  if (!s.keys || typeof s.keys.p256dh !== "string" || typeof s.keys.auth !== "string") return null;
  return { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } };
}

/** Sends one notification; returns false when the subscription is gone (404/410) so the caller can drop it. */
export async function sendPush(sub: PushSubscriptionInput, payload: { title: string; body: string; url: string }): Promise<boolean> {
  const keys = await pushKeys();
  webpush.setVapidDetails(config.siteUrl, keys.publicKey, keys.privateKey);
  try {
    await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 86400 });
    return true;
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return false;
    throw error;
  }
}
