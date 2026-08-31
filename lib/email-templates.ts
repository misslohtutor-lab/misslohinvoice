import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { sendEmail, sendEmailAndRecord, layout, esc, type EmailType } from "@/lib/email";
import { money } from "@/lib/ui";
import { formatBusinessDate, formatBusinessTime } from "@/lib/time";
import { BILLING_UNITS_PER_HOUR } from "@/lib/currency";
import type { Family } from "@/generated/prisma/client";

function cad(cents: number): string {
  return money(cents / 100);
}

async function reserve(family: Family, type: EmailType, subject: string, dedupeKey: string) {
  const message = await prisma.message.upsert({
    where: { dedupeKey },
    update: {},
    create: { familyId: family.id, to: family.email, type, subject, sent: false, dedupeKey },
  });
  return message.sent ? null : message;
}

/** Returned when a notice email is blocked by the per-period dedupe, not a failure. */
export const CHARGE_NOTICE_ALREADY_SENT = "Charge notice already sent";

async function finish(messageId: string, sent: boolean, html?: string) {
  await prisma.message.update({ where: { id: messageId }, data: { sent, html: html ?? undefined } });
}

/** Send an itemized receipt after a successful monthly charge. */
export async function sendReceipt(
  family: Family,
  invoice: Stripe.Invoice,
  period?: { from: Date; to: Date }
) {
  const message = await reserve(family, "RECEIPT", "Monthly receipt", `receipt:${invoice.id}`);
  if (!message) return { sent: false, error: "Receipt already sent" };

  const lines = (invoice.lines.data ?? [])
    .map((l) => {
      const price = l.price;
      const qty = l.quantity ?? 0;
      const hours = qty / BILLING_UNITS_PER_HOUR; // billing unit = 15 min
      return `<tr><td>${esc(price?.nickname ?? "Lesson")}</td><td>${hours}h</td><td style="text-align:right">${cad(l.amount ?? 0)}</td></tr>`;
    })
    .join("");

  // One-off mid-month bills carry Stripe periods pinned to invoice creation, so
  // the caller overrides them with the covered period (first charged lesson →
  // last day of the month). Subscription invoices use Stripe's own period.
  const from = period?.from ?? (invoice.period_start ? new Date(invoice.period_start * 1000) : null);
  const to = period?.to ?? (invoice.period_end ? new Date(invoice.period_end * 1000) : null);

  const html = layout("Your receipt", `
    <p>Thank you! Your monthly charge of <strong>${cad(invoice.amount_paid)}</strong> was received for the period
    <strong>${from ? formatBusinessDate(from) : "—"}</strong> – <strong>${to ? formatBusinessDate(to) : "—"}</strong>.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <thead><tr style="border-bottom:1px solid #ddd;text-align:left">
        <th style="padding:6px">Item</th><th style="padding:6px">Hours</th><th style="padding:6px;text-align:right">Amount</th>
      </tr></thead>
      <tbody>${lines}</tbody>
    </table>
    <p style="color:#888;font-size:13px">Payments are automatic each month. For any schedule changes, contact the school.</p>
  `);
  const res = await sendEmail({ to: family.email, subject: `Your receipt — ${cad(invoice.amount_paid)}`, html });
  await finish(message.id, res.sent, html);
  return res;
}

/** Alert a family that a card charge failed (Stripe auto-retries). */
export async function sendPaymentFailure(family: Family, invoice: Stripe.Invoice) {
  const message = await reserve(family, "PAYMENT_FAILED", "Payment failed", `payment-failed:${invoice.id}`);
  if (!message) return { sent: false, error: "Payment failure notice already sent" };

  const html = layout("Action needed: payment failed", `
    <p>We attempted to charge your card for <strong>${cad(invoice.total)}</strong> but the payment was declined.</p>
    <p>Stripe will automatically retry the charge. Please contact us to update your payment method
    so your tutoring continues without interruption.</p>
  `);
  const res = await sendEmail({ to: family.email, subject: "Your payment was declined", html });
  await finish(message.id, res.sent, html);
  return res;
}

export interface NoticeLesson {
  studentName: string;
  date: Date;
  durationHours: number;
  rate: number;
  amount: number;
}

const ZOOM_LINK = process.env.ZOOM_LINK ?? "";

/** Itemized charge notice with a per-lesson overview. */
export async function sendChargeNotice(
  family: Family,
  periodKey: string,
  periodLabel: string,
  total: number,
  lessons: NoticeLesson[] = [],
  opts: { chargeOn?: string; note?: string; grossTotal?: number; creditAmount?: number } = {}
) {
  const message = await reserve(family, "CHARGE_NOTICE", "Upcoming charge notice", `charge-notice:${family.id}:${periodKey}`);
  if (!message) return { sent: false, error: CHARGE_NOTICE_ALREADY_SENT };

  const charged = opts.chargeOn ?? "the 1st";
  const lessonRows = lessons
    .map(
      (l) =>
        `<tr><td>${esc(l.studentName)}</td><td>${formatBusinessDate(l.date, { weekday: "short", month: "short", day: "numeric" }, family.timeZone)}</td><td>${formatBusinessTime(l.date, { timeZoneName: "short" }, family.timeZone)}</td><td>${money(l.rate)}/hr</td><td>${l.durationHours}h</td><td style="text-align:right">${money(l.amount)}</td></tr>`
    )
    .join("");
  const html = layout("Your card will be charged", `
    <p>Hi ${esc(family.name)},</p>
    <p>Your card will be charged <strong>${money(total)}</strong> on <strong>${charged}</strong> for lessons scheduled in
    <strong>${esc(periodLabel)}</strong>.</p>
    ${lessonRows ? `
      <p>Your scheduled lessons in ${esc(periodLabel)}:</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <thead><tr style="border-bottom:1px solid #ddd;text-align:left">
          <th style="padding:6px">Student</th><th style="padding:6px">Date</th><th style="padding:6px">Time</th><th style="padding:6px">Rate</th><th style="padding:6px">Hours</th><th style="padding:6px;text-align:right">Amount</th>
        </tr></thead>
        <tbody>${lessonRows}</tbody>
        <tfoot><tr style="border-top:1px solid #ddd">
          <td colspan="5" style="padding:6px;font-weight:600">Scheduled lessons</td>
          <td style="padding:6px;text-align:right;font-weight:600">${money(opts.grossTotal ?? total)}</td>
        </tr>
        ${opts.creditAmount
          ? `<tr style="color:#087f5b"><td colspan="5" style="padding:6px">Credits</td><td style="padding:6px;text-align:right">${money(Math.abs(opts.creditAmount))}</td></tr>
             <tr><td colspan="5" style="padding:6px;font-weight:600">Total due</td><td style="padding:6px;text-align:right;font-weight:600">${money(total)}</td></tr>`
          : `<tr><td colspan="5" style="padding:6px;font-weight:600">Total due</td><td style="padding:6px;text-align:right;font-weight:600">${money(total)}</td></tr>`}
        </tfoot>
      </table>` : ""}
    <div style="background:#f8f8f8;border-left:3px solid #e5e5e5;border-radius:6px;padding:12px 16px">
      <p style="margin:0 0 6px;font-weight:600">Notes</p>
      <p style="margin:0;color:#555;font-size:13px;line-height:1.6">
        ${opts.note ??
        `If you need to change next month&apos;s schedule, contact us before the charge.<br>
        We require 24 hours&apos; notice for any schedule change or cancellation.<br>
        Lessons are held on Zoom:
        <a href="${esc(ZOOM_LINK)}" style="color:#1a73e8">${esc(ZOOM_LINK)}</a>`}
      </p>
    </div>
  `);
  const res = await sendEmail({ to: family.email, subject: `Your card will be charged ${money(total)} on ${charged}`, html });
  await finish(message.id, res.sent, html);
  return res;
}

/**
 * Mid-month billing notice triggered on-demand from the admin UI. Same itemized
 * layout as the monthly charge notice, but names the exact charge date (24h
 * after the email is sent).
 */
export async function sendMidMonthChargeNotice(
  family: Family,
  periodKey: string,
  periodLabel: string,
  total: number,
  lessons: NoticeLesson[],
  chargeAt: Date,
  opts: { grossTotal?: number; creditAmount?: number; attempt?: string } = {}
) {
  const chargeOn = `${formatBusinessDate(chargeAt, { weekday: "long", month: "long", day: "numeric" }, family.timeZone)}, ${formatBusinessTime(chargeAt, { timeZoneName: "short" }, family.timeZone)}`;
  const note = `Your card will be charged 24 hours after this notice.<br>
    If you need to change or cancel any of the lessons listed above, let us know before then.<br>
    We require 24 hours&apos; notice for schedule changes or cancellations.<br>
    Lessons are held on Zoom:
    <a href="${esc(ZOOM_LINK)}" style="color:#1a73e8">${esc(ZOOM_LINK)}</a>`;
  // A unique per-attempt suffix lets a failed or cancelled charge be retried:
  // each retry creates a fresh pending row and needs its own notice email.
  const key = opts.attempt ? `midmonth:${periodKey}:${opts.attempt}` : `midmonth:${periodKey}`;
  return sendChargeNotice(family, key, periodLabel, total, lessons, {
    chargeOn,
    note,
    ...opts,
  });
}

/** Reminder that a lesson is coming up. */
export async function sendLessonReminder(family: Family, lessonId: string, studentName: string, start: Date, end: Date) {
  const message = await reserve(family, "LESSON_REMINDER", "Lesson reminder", `lesson-reminder:${lessonId}`);
  if (!message) return { sent: false, error: "Lesson reminder already sent" };

  const when = formatBusinessDate(start, { weekday: "long", month: "long", day: "numeric" }, family.timeZone);
  const time = `${formatBusinessTime(start, { timeZoneName: "short" }, family.timeZone)} – ${formatBusinessTime(end, { timeZoneName: "short" }, family.timeZone)}`;
  const zoom = ZOOM_LINK
    ? `<p>Join the lesson on Zoom:</p>
       <p><a href="${esc(ZOOM_LINK)}" style="display:inline-block;background:#1a73e8;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Join Zoom lesson</a></p>
       <p style="color:#888;font-size:13px">If the button doesn't work, paste this link into your browser:<br>${esc(ZOOM_LINK)}</p>`
    : "";
  const html = layout("Upcoming lesson", `
    <p>This is a reminder of your upcoming lesson:</p>
    <p style="font-size:18px"><strong>${esc(studentName)}</strong></p>
    <p><strong>${when}</strong> at <strong>${time}</strong></p>
    ${zoom}
  `);
  const res = await sendEmail({ to: family.email, subject: `Upcoming lesson: ${studentName} ${when}`, html });
  await finish(message.id, res.sent, html);
  return res;
}

/** Onboarding: invite a family to set up their card via Stripe Checkout. */
export async function sendOnboarding(family: Family, checkoutUrl: string, guideUrl?: string | null) {
  const guide = guideUrl
    ? `<p>New to Miss Loh Tutoring School? Read our <a href="${esc(guideUrl)}">family guide</a> to learn how billing and scheduling work.</p>`
    : "";
  const html = layout("Set up your payment", `
    <p>Hi ${esc(family.name)},</p>
    <p>To start your tutoring billing, please set up your payment method. This takes a minute and stores your card securely with
    Stripe — we never see your card details.</p>
    <p>There is <strong>no charge today</strong> — this only saves your card for future billing. Your card is charged on the 1st of
    each month for the actual lessons scheduled that month, and if you sign up mid-month you'll get an email notice before your
    first charge.</p>
    ${guide}
    <p>After setup, you can close the Stripe page. We&apos;ll email you a confirmation when your payment method has been saved.</p>
    <p><a href="${checkoutUrl}" style="display:inline-block;background:#111;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Set up payment</a></p>
    <p style="color:#888;font-size:13px">If the button doesn't work, paste this link into your browser:<br>${checkoutUrl}</p>
  `);
  return sendEmailAndRecord({
    to: family.email,
    subject: "Set up your payment",
    html,
    type: "ONBOARDING_INVITE",
    familyId: family.id,
  });
}

/** Confirm that Stripe saved the family's payment method after onboarding. */
export async function sendOnboardingConfirmation(family: Family) {
  const message = await reserve(family, "ONBOARDING_COMPLETE", "Payment setup complete", `onboarding-complete:${family.id}`);
  if (!message) return { sent: false, error: "Onboarding confirmation already sent" };

  const html = layout("Payment setup complete", `
    <p>Hi ${esc(family.name)},</p>
    <p>Your payment method was saved successfully. No charge was made today.</p>
    <p>Your card will be charged automatically on the 1st of each month for the lessons scheduled that month. We&apos;ll send an itemized notice before each charge.</p>
    <p>You can close the Stripe checkout page safely. If you need to change your schedule, please contact the school before the next billing notice.</p>
  `);
  const res = await sendEmail({ to: family.email, subject: "Your payment setup is complete", html });
  await finish(message.id, res.sent, html);
  return res;
}
