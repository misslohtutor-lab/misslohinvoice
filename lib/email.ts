import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";

type EmailType =
  | "CHARGE_NOTICE"
  | "RECEIPT"
  | "LESSON_REMINDER"
  | "PAYMENT_FAILED"
  | "ONBOARDING_COMPLETE"
  | "ONBOARDING_INVITE"
  | "MAGIC_LINK"
  | "IMMEDIATE_INVOICE";

export interface EmailRecipient {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailRecord extends EmailRecipient {
  type: EmailType;
  familyId?: string | null;
  dedupeKey?: string | null;
}

/** Escape user-supplied text for safe interpolation into an HTML email body. */
export function esc(value: string | undefined | null): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Send an email via Gmail SMTP. Logs/returns an error instead of throwing when
 * the credentials aren't configured, so the app still works during development.
 */
export async function sendEmail(message: EmailRecipient): Promise<{ sent: boolean; error?: string }> {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    console.warn("[email] SMTP not configured — skipping send to", message.to);
    return { sent: false, error: "SMTP not configured (SMTP_HOST/SMTP_USER/SMTP_PASS)" };
  }
  try {
    const transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT ?? "465"),
      secure: (process.env.SMTP_SECURE ?? "true") !== "false",
      tls: {
        // Gmail uses a public CA; only relax this for custom/internal hosts.
        rejectUnauthorized: (process.env.SMTP_REJECT_UNAUTHORIZED ?? "true") !== "false",
      },
      auth: { user, pass },
    });
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || `Miss Loh Tutoring School <${user}>`,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    return { sent: true };
  } catch (err) {
    console.error("[email] send failed:", err);
    return { sent: false, error: String(err) };
  }
}

/** Wrap an email body in a minimal branded layout. */
export function layout(title: string, body: string): string {
  return `<!doctype html>
<html><body style="font-family:sans-serif;background:#f5f5f5;margin:0;padding:24px">
<div style="max-width:560px;margin:auto;background:#fff;border:1px solid #e5e5e5;border-radius:12px;overflow:hidden">
<div style="background:#111;color:#fff;padding:16px 24px;font-weight:600">Miss Loh Tutoring School</div>
<div style="padding:24px">
<h2 style="margin-top:0">${title}</h2>
${body}
</div>
</div></body></html>`;
}

/**
 * Send an email and record the attempt in the Message table. Unlike the
 * deduped templates, every call sends and logs a fresh row — used for
 * onboarding invites and magic links, which may legitimately be re-sent.
 */
export async function sendEmailAndRecord(record: EmailRecord): Promise<{ sent: boolean; error?: string }> {
  let id: string | undefined;
  try {
    const created = await prisma.message.create({
      data: {
        familyId: record.familyId ?? null,
        to: record.to,
        type: record.type,
        subject: record.subject,
        html: record.html,
        sent: false,
        dedupeKey: record.dedupeKey ?? null,
      },
    });
    id = created.id;
  } catch (err) {
    // Logging a send must never block the email itself.
    console.error("[email] could not record outgoing email:", err);
  }
  const res = await sendEmail(record);
  if (id) await prisma.message.update({ where: { id }, data: { sent: res.sent } });
  return res;
}

export type { EmailType };
