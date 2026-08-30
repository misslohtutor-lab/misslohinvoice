import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { BILLING_UNITS_PER_HOUR } from "@/lib/currency";
import { computeFamilyRange, round2 } from "@/lib/scheduling";
import { currentBusinessMonthRange, monthPeriodKey, monthPeriodLabel } from "@/lib/time";
import { sendMidMonthChargeNotice, type NoticeLesson } from "@/lib/email-templates";
import { applySkippedCreditsToStripe, noticeAmounts } from "@/lib/credits";
import { ensurePriceForStudent } from "@/lib/subscriptions";

/** Hours between sending the mid-month billing email and charging the card. */
export const MID_MONTH_NOTICE_HOURS = 24;

/** Per-student line snapshot stored on PendingCharge (mirrors StudentMonthLine). */
export interface PendingChargeLine {
  studentId: string;
  hours: number;
  rate: number;
  amount: number;
}

/** Scheduled/completed lessons in a period mapped to charge-notice rows. */
export async function noticeLessonsForPeriod(
  familyId: string,
  start: Date,
  end: Date
): Promise<NoticeLesson[]> {
  const lessons = await prisma.lesson.findMany({
    where: {
      student: { familyId },
      status: { in: ["SCHEDULED", "COMPLETED"] },
      date: { gte: start, lt: end },
    },
    include: { student: true },
    orderBy: { date: "asc" },
  });
  return lessons.map((l) => ({
    studentName: l.student.name,
    date: l.date,
    durationHours: l.durationHours,
    rate: l.student.hourlyRate,
    amount: l.durationHours * l.student.hourlyRate,
  }));
}

/**
 * Period to display on a receipt. One-off mid-month bills (no subscription)
 * have Stripe periods pinned to invoice creation, so they cover the span that
 * was actually billed: the first charged lesson → the last day of the month.
 * For subscription invoices, uses the Stripe subscription's billing period
 * which correctly reflects the covered timeframe (the invoice's own period
 * can be wrong for trial/initial invoices where start == end).
 */
export async function receiptPeriod(
  familyId: string,
  invoice: Stripe.Invoice
): Promise<{ from: Date; to: Date } | null> {
  if (typeof invoice.subscription === "string") {
    const sub = await getStripe().subscriptions.retrieve(invoice.subscription);
    if (sub.current_period_start && sub.current_period_end) {
      return {
        from: new Date(sub.current_period_start * 1000),
        to: new Date(sub.current_period_end * 1000 - 1),
      };
    }
    return null;
  }

  const pending = await prisma.pendingCharge.findFirst({
    where: { familyId, invoiceId: invoice.id },
  });
  if (!pending) return null;

  const first = await prisma.lesson.findFirst({
    where: {
      student: { familyId },
      status: { in: ["SCHEDULED", "COMPLETED"] },
      date: { gte: pending.periodStart, lt: pending.periodEnd },
    },
    orderBy: { date: "asc" },
    select: { date: true },
  });

  return {
    from: first?.date ?? pending.periodStart,
    // periodEnd is midnight on the 1st of next month; the last day of the
    // billed month is the instant just before it.
    to: new Date(pending.periodEnd.getTime() - 1),
  };
}

/** The leading Stripe invoice id already recorded for this period, if any. */
export async function hasInvoiceInPeriod(
  familyId: string,
  start: Date,
  end: Date
): Promise<string | null> {
  const row = await prisma.ledgerLine.findFirst({
    where: {
      familyId,
      // Overlap: any invoice whose billing period touches [start, end). A
      // full-month invoice ends exactly at `end`, so use strict overlap rather
      // than periodEnd < end (which an equal periodEnd would miss).
      periodStart: { lt: end },
      periodEnd: { gt: start },
      stripeInvoiceId: { not: null },
    },
  });
  return row?.stripeInvoiceId ?? null;
}

/**
 * One-time invoice for the family's scheduled lessons in the current calendar
 * month. Used for mid-month signups (via the billing-notice flow) who would
 * otherwise not be billed until the next 1st-of-month invoice.
 *
 * `opts.lines` optionally supplies the exact per-student line items to charge
 * (billing units, i.e. 15-min blocks) so the charged amount matches the notice
 * email even if the schedule changed in the 24h before the charge. When omitted
 * the current schedule is computed live.
 */
export async function billCurrentMonthNow(
  familyId: string,
  opts?: {
    lines?: Array<{ studentId: string; quantity: number }>;
    idempotencyKey?: string;
    onInvoiceCreated?: (invoiceId: string) => Promise<void>;
  }
): Promise<{ amount: number; invoiceId: string }> {
  const family = await prisma.family.findUnique({
    where: { id: familyId },
    include: { students: { where: { active: true } } },
  });
  if (!family) throw new Error("Family not found");
  if (!family.stripeCustomerId) {
    throw new Error("Family has no Stripe customer — send them the onboarding link first");
  }

  const { start: monthStart, end: monthEnd } = currentBusinessMonthRange();

  if (!opts?.lines) {
    const summary = await computeFamilyRange(familyId, monthStart, monthEnd);
    if (summary.totalAmount <= 0) {
      throw new Error("No lessons scheduled in the current month to bill");
    }
  }

  // Idempotency guard: refuse to raise a second invoice for the same month
  // (e.g. the cron fired twice).
  const alreadyBilledInvoice = await hasInvoiceInPeriod(familyId, monthStart, monthEnd);
  if (alreadyBilledInvoice) {
    throw new Error("This month has already been billed (invoice " + alreadyBilledInvoice + ")");
  }

  // Apply any unused missed-lesson credits so the invoice is discounted.
  await applySkippedCreditsToStripe(family.id, family.stripeCustomerId);

  const stripe = getStripe();
  // Create the (open) invoice first, then attach items to *that* invoice so a
  // mid-way failure can't leak items into the family's next monthly invoice.
  const invoice = await stripe.invoices.create(
    {
      customer: family.stripeCustomerId,
      auto_advance: false,
      collection_method: "charge_automatically",
    },
    opts?.idempotencyKey ? { idempotencyKey: `${opts.idempotencyKey}:invoice` } : undefined
  );
  await opts?.onInvoiceCreated?.(invoice.id);

  // A retry may find an invoice that was already finalized or paid before the
  // worker crashed. Idempotency keys make invoice/item creation safe to repeat.
  if (invoice.status === "paid") {
    return { amount: (invoice.amount_paid ?? 0) / 100, invoiceId: invoice.id };
  }

  if (invoice.status === "draft") {
    if (opts?.lines) {
      for (const [index, line] of opts.lines.entries()) {
        if (line.quantity <= 0) continue;
        const priceId = await ensurePriceForStudent(line.studentId, "one-time");
        await stripe.invoiceItems.create(
          {
            customer: family.stripeCustomerId,
            invoice: invoice.id,
            price: priceId,
            quantity: line.quantity,
          },
          opts.idempotencyKey ? { idempotencyKey: `${opts.idempotencyKey}:item:${index}` } : undefined
        );
      }
    } else {
      const summary = await computeFamilyRange(familyId, monthStart, monthEnd);
      for (const [index, line] of summary.students.entries()) {
        if (line.hours <= 0) continue;
        const priceId = await ensurePriceForStudent(line.studentId, "one-time");
        // 1 billing unit = 15 minutes
        const qty = Math.max(round2(line.hours * BILLING_UNITS_PER_HOUR), 0);
        await stripe.invoiceItems.create(
          {
            customer: family.stripeCustomerId,
            invoice: invoice.id,
            price: priceId,
            quantity: qty,
          },
          opts?.idempotencyKey ? { idempotencyKey: `${opts.idempotencyKey}:item:${index}` } : undefined
        );
      }
    }
    await stripe.invoices.finalizeInvoice(invoice.id);
  } else if (invoice.status !== "open") {
    throw new Error(`Invoice ${invoice.id} is ${invoice.status ?? "unavailable"}`);
  }

  // Finalizing an invoice with collection_method=charge_automatically already
  // attempts payment. Only call pay() explicitly when it's still open (e.g.
  // the automatic attempt failed or is pending), otherwise Stripe errors with
  // "Invoice is already paid".
  let paid = await stripe.invoices.retrieve(invoice.id);
  if (paid.status !== "paid") {
    paid = await stripe.invoices.pay(
      invoice.id,
      { off_session: true },
      opts?.idempotencyKey ? { idempotencyKey: `${opts.idempotencyKey}:pay` } : undefined
    );
  }
  return { amount: (paid.amount_paid ?? 0) / 100, invoiceId: invoice.id };
}

/**
 * Mid-month billing: compute the family's current-month bill, email them an
 * itemized notice, and schedule the card to be charged ~24h later (the cron
 * sweeps due `PendingCharge` rows). Returns the queued charge so the admin UI
 * can show the amount and charge date.
 */
export async function queueMidMonthCharge(familyId: string): Promise<{ pendingId: string; amount: number; chargeAt: Date }> {
  const family = await prisma.family.findUnique({ where: { id: familyId } });
  if (!family) throw new Error("Family not found");
  if (!family.stripeCustomerId) {
    throw new Error("Family has no card on file — send them the onboarding link first");
  }

  const { start: monthStart, end: monthEnd } = currentBusinessMonthRange();
  const now = new Date();

  // Don't re-email or re-charge the same month (button clicked twice, etc.).
  // Rows are stored with periodEnd === monthEnd (start of next month), so the
  // period match must be inclusive to find the current attempt.
  const existing = await prisma.pendingCharge.findFirst({
    where: {
      familyId,
      periodStart: { gte: monthStart },
      periodEnd: { lte: monthEnd },
      status: { in: ["PENDING", "PROCESSING", "CHARGED"] },
    },
  });
  if (existing && existing.status !== "CHARGED") {
    throw new Error(
      `A billing email was already sent for this month. The card is scheduled to be charged on ${existing.chargeAt.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}.`
    );
  }
  if (existing?.status === "CHARGED") {
    throw new Error("This month has already been billed.");
  }

  // Safety net (in case a charge happened outside this flow): refuse to email
  // another bill if the current month already has invoices on the ledger.
  const alreadyBilledInvoice = await hasInvoiceInPeriod(familyId, monthStart, monthEnd);
  if (alreadyBilledInvoice) {
    throw new Error("This month has already been billed (invoice " + alreadyBilledInvoice + ")");
  }

  const summary = await computeFamilyRange(familyId, monthStart, monthEnd);
  if (summary.totalAmount <= 0) {
    throw new Error("No lessons scheduled for the current month to bill");
  }
  const { creditAmount, netAmount } = await noticeAmounts(familyId, summary.totalAmount);

  const lines: PendingChargeLine[] = summary.students
    .filter((l) => l.hours > 0)
    .map((l) => ({ studentId: l.studentId, hours: l.hours, rate: l.rate, amount: l.amount }));

  const chargeAt = new Date(now.getTime() + MID_MONTH_NOTICE_HOURS * 60 * 60 * 1000);
  const pending = await prisma.pendingCharge.create({
    data: {
      familyId,
      periodStart: monthStart,
      periodEnd: monthEnd,
      amount: netAmount,
      lines: JSON.stringify(lines),
      emailSentAt: now,
      chargeAt,
      status: "PENDING",
    },
  });

  const lessons = await noticeLessonsForPeriod(familyId, monthStart, monthEnd);

  const res = await sendMidMonthChargeNotice(
    family,
    monthPeriodKey(monthStart.getFullYear(), monthStart.getMonth()),
    monthPeriodLabel(monthStart.getFullYear(), monthStart.getMonth()),
    netAmount,
    lessons,
    chargeAt,
    { grossTotal: summary.totalAmount, creditAmount, attempt: pending.id }
  );

  // If the email didn't go out, don't charge a card the family never heard about.
  if (!res.sent) {
    await prisma.pendingCharge.update({ where: { id: pending.id }, data: { status: "CANCELLED" } });
    throw new Error("Billing email could not be sent: " + (res.error ?? "unknown error"));
  }

  return { pendingId: pending.id, amount: netAmount, chargeAt };
}

export interface ChargeRow {
  id: string;
  family: string;
  ok: boolean;
  amount?: number;
  error?: string;
}

/**
 * Charge every queued mid-month bill whose 24h notice window has elapsed.
 * Called by a cron (once an hour). Claims each row (PENDING → PROCESSING) so
 * two overlapping invocations can't double-charge. Rows are charged from the
 * line snapshot stored at email time so the amount matches the notice.
 */
export async function chargeDuePendingCharges(): Promise<ChargeRow[]> {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 6 * 60 * 60 * 1000);
  const due = await prisma.pendingCharge.findMany({
    where: {
      OR: [
        { status: "PENDING", chargeAt: { lte: now } },
        { status: "PROCESSING", processingStartedAt: { lte: staleBefore } },
      ],
    },
    include: { family: true },
  });

  const results: ChargeRow[] = [];
  for (const row of due) {
    try {
      const claim = await prisma.pendingCharge.updateMany({
        where: {
          id: row.id,
          OR: [
            { status: "PENDING", chargeAt: { lte: now } },
            { status: "PROCESSING", processingStartedAt: { lte: staleBefore } },
          ],
        },
        data: { status: "PROCESSING", processingStartedAt: new Date(), error: null },
      });
      if (claim.count === 0) continue; // claimed by a concurrent invocation

      if (row.invoiceId) {
        const existingInvoice = await getStripe().invoices.retrieve(row.invoiceId);
        if (existingInvoice.status === "paid") {
          await prisma.pendingCharge.update({
            where: { id: row.id },
            data: { status: "CHARGED", processingStartedAt: null, error: null },
          });
          results.push({ id: row.id, family: row.family.name, ok: true, amount: (existingInvoice.amount_paid ?? 0) / 100 });
          continue;
        }
      }

      const lines: PendingChargeLine[] = JSON.parse(row.lines) as PendingChargeLine[];
      const { amount, invoiceId } = await billCurrentMonthNow(row.familyId, {
        lines: lines.map((l) => ({
          studentId: l.studentId,
          // 1 billing unit = 15 minutes
          quantity: Math.max(round2(l.hours * BILLING_UNITS_PER_HOUR), 0),
        })),
        idempotencyKey: `pending-charge:${row.id}`,
        onInvoiceCreated: async (createdInvoiceId) => {
          await prisma.pendingCharge.update({
            where: { id: row.id },
            data: { invoiceId: createdInvoiceId },
          });
        },
      });
      await prisma.pendingCharge.update({
        where: { id: row.id },
        data: { status: "CHARGED", processingStartedAt: null, invoiceId, error: null },
      });
      results.push({ id: row.id, family: row.family.name, ok: true, amount });
    } catch (err) {
      const message = String(err);
      await prisma.pendingCharge.update({
        where: { id: row.id },
        data: { status: "FAILED", processingStartedAt: null, error: message },
      });
      results.push({ id: row.id, family: row.family.name, ok: false, error: message });
    }
  }
  return results;
}