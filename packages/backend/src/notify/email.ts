// Transactional e-mail through SMTP (SMTP_URL, MAIL_FROM). Without them the e-mail channel is off and
// the site offers browser push only; nothing is queued for later.
import nodemailer from "nodemailer";
import { config, credential } from "../config.ts";

let transport: ReturnType<typeof nodemailer.createTransport> | null = null;

export function emailConfigured(): boolean {
  return !!credential("integrations", "SMTP_URL") && !!credential("integrations", "MAIL_FROM");
}

export async function sendEmail(to: string, subject: string, text: string, html?: string): Promise<void> {
  const url = credential("integrations", "SMTP_URL");
  const from = credential("integrations", "MAIL_FROM");
  if (!url || !from) throw new Error("SMTP_URL and MAIL_FROM are not configured");
  transport ??= nodemailer.createTransport(url);
  await transport.sendMail({ from, to, subject, text, html, headers: { "List-Unsubscribe": `<${config.siteUrl}/privacy>` } });
}
