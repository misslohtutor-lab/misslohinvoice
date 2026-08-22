import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripe, quarterHourUnitAmount } from "@/lib/stripe";
import { BILLING_CURRENCY } from "@/lib/currency";
import { computeFamilyMonth, computeFamilyRange, round2 } from "@/lib/scheduling";
import { sendMidMonthChargeNotice, type NoticeLesson } from "@/lib/email-templates";
import { businessDateTime, currentBusinessMonthRange, monthPeriodKey, monthPeriodLabel, nextBusinessMonth } from "@/lib/time";

/** Hours between sending the mid-month billing email and charging the card. */
export const MID_MONTH_NOTICE_HOURS = 24;

const EXTERNAL_CHECKOUT_RETURN_URL = "https://stripe.com";

function isPrivateCheckoutHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  if (normalized === "localhost" || normalized === "localhost.localdomain" || normalized.endsWith(".local")) {
    return true;
  }
  if (normalized === "::1" || normalized === "0.0.0.0") return true;

  const octets = normalized.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false;
  }
  return octets[0] === 10 || octets[0] === 127 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168);
}

export function checkoutReturnUrl(kind: "success" | "cancelled"): string {
  const configured = process.env[`CHECKOUT_${kind === "success" ? "SUCCESS" : "CANCEL"}_URL`]?.trim();
  const baseUrl = process.env.BASE_URL?.trim();
  const candidate = configured || (baseUrl ? `${baseUrl}/family-guide` : null);

  if (!candidate) return EXTERNAL_CHECKOUT_RETURN_URL;

  try {
    const url = new URL(candidate);
    if (isPrivateCheckoutHost(url.hostname)) return EXTERNAL_CHECKOUT_RETURN_URL;
    const separator = url.search ? "&" : "?";
    return `${url.toString()}${separator}onboarding=${kind}&session_id={CHECKOUT_SESSION_ID}`;
  } catch {
    return EXTERNAL_CHECKOUT_RETURN_URL;
  }
}

/** Per-student line snapshot stored on PendingCharge (mirrors StudentMonthLine). */
export interface PendingChargeLine {
  studentId: string;
  hours: number;
  rate: number;
  amount: number;
}

export async function getUnappliedCreditAmount(familyId: string): Promise<number> {
  const rows = await prisma.adjustment.findMany({
    where: { familyId, appliedToInvoice: null },
    select: { amount: true, remainingAmount: true },
  });
  return round2(
    rows
      .map((row) => row.remainingAmount ?? row.amount)
      .filter((amount) => amount < 0)
      .reduce((total, amount) => total + amount, 0)
  );
}

export function netChargeAmount(grossAmount: number, creditAmount: number): number {
  return Math.max(round2(grossAmount + creditAmount), 0);
}

/** Gross total, un-applied credit, and net amount for a charge notice. */
export async function noticeAmounts(familyId: string, grossTotal: number) {
  const creditAmount = await getUnappliedCreditAmount(familyId);
  return { grossTotal, creditAmount, netAmount: netChargeAmount(grossTotal, creditAmount) };
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
 * Returns null for subscription invoices, which should use Stripe's own period.
 */
export async function receiptPeriod(
  familyId: string,
  invoice: Stripe.Invoice
): Promise<{ from: Date; to: Date } | null> {
  if (typeof invoice.subscription === "string") return null;

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

/** Unix timestamp for midnight on the 1st in the business timezone. */
export function firstOfMonth(year: number, month: number): number {
  return Math.floor(businessDateTime(year, month, 1).getTime() / 1000);
}

/** Next calendar month from today in the business timezone. */
export function nextMonthFromNow(): { year: number; month: number } {
  return nextBusinessMonth();
}

/**
 * Ensure a recurring monthly Stripe Price exists for a student (unit amount =
 * hourly rate). Stored on Student.stripePriceId.
 */
export async function ensurePriceForStudent(studentId: string): Promise<string> {
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) throw new Error("Student not found");
  if (student.stripePriceId) return student.stripePriceId;

  const stripe = getStripe();
  // Billing unit = 15 minutes. unit_amount = hourly rate / 4 (i.e. per 15-min block).
  const price = await stripe.prices.create({
    currency: BILLING_CURRENCY,
    unit_amount: quarterHourUnitAmount(student.hourlyRate),
    product_data: { name: student.name },
    nickname: `${student.name} @ ${student.hourlyRate}/hr (per 15min)`,
    recurring: { interval: "month" },
    metadata: { studentId: student.id },
  });

  await prisma.student.update({
    where: { id: student.id },
    data: { stripePriceId: price.id },
  });
  return price.id;
}

/**
 * Ensure a one-time Stripe Price exists for a student (unit amount = hourly
 * rate, non-recurring). Used to bill the remainder of the current month for
 * families that sign up after the 1st. Stored on Student.stripeOneTimePriceId.
 */
export async function ensureOneTimePriceForStudent(studentId: string): Promise<string> {
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) throw new Error("Student not found");
  if (student.stripeOneTimePriceId) return student.stripeOneTimePriceId;

  const stripe = getStripe();
  const price = await stripe.prices.create({
    currency: BILLING_CURRENCY,
    unit_amount: quarterHourUnitAmount(student.hourlyRate),
    product_data: { name: `${student.name} (one-time)` },
    nickname: `${student.name} @ ${student.hourlyRate}/hr — current month`,
    metadata: { studentId: student.id },
  });

  await prisma.student.update({
    where: { id: student.id },
    data: { stripeOneTimePriceId: price.id },
  });
  return price.id;
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
    lines?: Array<{ studentId: string; quantity: number; rate: number }>;
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
        const priceId = await ensureOneTimePriceForStudent(line.studentId);
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
        const priceId = await ensureOneTimePriceForStudent(line.studentId);
        // 1 billing unit = 15 minutes
        const qty = Math.max(round2(line.hours * 4), 0);
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

/**
 * Charge every queued mid-month bill whose 24h notice window has elapsed.
 * Called by a cron (once an hour). Claims each row (PENDING → PROCESSING) so
 * two overlapping invocations can't double-charge. Rows are charged from the
 * line snapshot stored at email time so the amount matches the notice.
 */
export async function chargeDuePendingCharges() {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const due = await prisma.pendingCharge.findMany({
    where: {
      OR: [
        { status: "PENDING", chargeAt: { lte: now } },
        { status: "PROCESSING", processingStartedAt: { lte: staleBefore } },
      ],
    },
    include: { family: true },
  });

  const results: Array<{ id: string; family: string; ok: boolean; amount?: number; error?: string }> = [];
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
            data: {
              status: "CHARGED",
              processingStartedAt: null,
              error: null,
            },
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
          quantity: Math.max(round2(l.hours * 4), 0),
          rate: l.rate,
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

/**
 * Create a hosted Checkout (mode=setup) that collects the family's card for $0
 * — nothing is charged and the checkout page displays no amounts. After the
 * family completes it, the webhook creates the monthly subscription (with a
 * trial that expires on the 1st of next month) so recurring billing starts then.
 */
export async function createOnboardingCheckout(familyId: string): Promise<string> {
  const family = await prisma.family.findUnique({
    where: { id: familyId },
    include: { students: true },
  });
  if (!family) throw new Error("Family not found");

  const stripe = getStripe();
  let customerId = family.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: family.email,
      name: family.name,
      metadata: { familyId: family.id },
    });
    customerId = customer.id;
    await prisma.family.update({ where: { id: family.id }, data: { stripeCustomerId: customer.id } });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "setup",
    customer: customerId,
    currency: BILLING_CURRENCY,
    custom_text: {
      submit: {
        message:
          "No charge today — this only stores your card securely. You're billed for the actual lessons scheduled each month, on the 1st.",
      },
    },
    success_url: checkoutReturnUrl("success"),
    cancel_url: checkoutReturnUrl("cancelled"),
  });

  return session.url!;
}

/**
 * After a $0 setup-mode checkout completes, create the family's monthly
 * subscription. It carries a free trial until the 1st of next month, so the
 * first card charge happens on that month's normal billing date. The default
 * payment method saved during checkout is attached so Stripe can collect.
 *
 * Idempotent: if the family already has a subscription (e.g. a webhook
 * retry after the first attempt partially succeeded) this returns it untouched.
 */
export async function createSubscriptionAfterSetup(
  familyId: string,
  customerId: string,
  paymentMethod?: string | null
) {
  const family = await prisma.family.findUnique({
    where: { id: familyId },
    include: { students: { where: { active: true } } },
  });
  if (!family) throw new Error("Family not found");

  if (family.subscriptionId) {
    // Already set up (webhook retry) — nothing to create.
    return await stripeSubscription(family.subscriptionId);
  }

  const { year, month } = nextMonthFromNow();
  const summary = await computeFamilyMonth(family.id, year, month);
  const items: Array<{ price: string; quantity: number }> = [];
  for (const line of summary.students) {
    const priceId = await ensurePriceForStudent(line.studentId);
    // 1 billing unit = 15 minutes
    items.push({ price: priceId, quantity: Math.max(round2(line.hours * 4), 0) });
  }
  if (items.length === 0) {
    throw new Error("No active students — add a student before setting up billing");
  }

  const stripe = getStripe();
  const sub = await stripe.subscriptions.create(
    {
      customer: customerId,
      items,
      default_payment_method: paymentMethod ?? undefined,
      collection_method: "charge_automatically",
      // Trial through the end of the current month: first invoice on the 1st.
      trial_end: firstOfMonth(year, month),
      metadata: { familyId: family.id },
    },
    { idempotencyKey: `onboarding:${customerId}` }
  );
  await attachSubscriptionToFamily(family.id, sub.id);
  return sub;
}

async function stripeSubscription(id: string) {
  return getStripe().subscriptions.retrieve(id);
}

/**
 * After checkout completes we receive a `subscription` id. Persist it on the
 * Family so the cron can update its quantities each month.
 */
export async function attachSubscriptionToFamily(familyId: string, subscriptionId: string) {
  const stripe = getStripe();
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const priceItems = (sub.items.data ?? []).map((i) => i.price!.id);

  const existing = await prisma.subscription.upsert({
    where: { familyId },
    update: {
      stripeSubscriptionId: subscriptionId,
      status: sub.status,
      currency: sub.currency,
      periodStart: sub.current_period_start ? new Date(sub.current_period_start * 1000) : null,
      periodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null,
    },
    create: {
      familyId,
      stripeSubscriptionId: subscriptionId,
      status: sub.status,
      currency: sub.currency,
    },
  });

  await prisma.family.update({
    where: { id: familyId },
    data: { subscriptionId, subscriptionStatus: sub.status },
  });
  return { sub, existing, priceItems };
}

/**
 * Update a family's subscription line-item quantities to match the hours
 * scheduled for the *next* calendar month. Stripe will invoice these quantities
 * at the next month's first-of-month rollover (prepaid).
 *
 * Returns the per-student itemized amounts that were set, for the notice email.
 */
export async function syncNextMonthQuantities(familyId: string) {
  const family = await prisma.family.findUnique({
    where: { id: familyId },
    include: { students: { where: { active: true } } },
  });
  if (!family) throw new Error("Family not found");
  if (!family.subscriptionId) {
    throw new Error("Family has no subscription yet — send them the onboarding link first");
  }

  const stripe = getStripe();
  const sub = await stripe.subscriptions.retrieve(family.subscriptionId);
  const { year, month } = nextMonthFromNow();
  const summary = await computeFamilyMonth(familyId, year, month);

  const updates: Array<{ id?: string; price?: string; quantity: number }> = [];
  const itemsToUpdate = new Map<string, number>(); // priceId -> hours
  const studentPriceIds = new Map<string, string>();
  for (const line of summary.students) {
    const student = family.students.find((s) => s.id === line.studentId);
    if (!student) continue;
    const priceId = student.stripePriceId ?? (await ensurePriceForStudent(student.id));
    studentPriceIds.set(student.id, priceId);
    // 1 billing unit = 15 minutes
    itemsToUpdate.set(priceId, round2(line.hours * 4));
  }

  const existingPriceIds = new Set<string>();
  for (const item of sub.items.data ?? []) {
    const priceId = item.price!.id;
    existingPriceIds.add(priceId);
    const qty = itemsToUpdate.get(priceId) ?? 0;
    if (item.quantity === qty) continue;
    updates.push({ id: item.id, quantity: qty });
  }

  for (const [, priceId] of studentPriceIds) {
    if (!existingPriceIds.has(priceId)) {
      updates.push({ price: priceId, quantity: itemsToUpdate.get(priceId) ?? 0 });
    }
  }

  if (updates.length > 0) {
    await stripe.subscriptions.update(sub.id, {
      items: updates,
      proration_behavior: "none",
      // default_pr_invoice: true,
    });
  }

  // Apply skipped-lesson credits as the customer's Stripe balance so the next
  // invoice is discounted by that amount.
  await applySkippedCreditsToStripe(family.id, family.stripeCustomerId);

  return { summary, year, month };
}

/**
 * Push a family's un-applied skipped-lesson credits to Stripe as a negative
 * customer balance. Stripe automatically deducts it from the next invoice.
 *
 * `credits` for a family are stored as negative Adjustments (e.g. -$25), so the
 * summed amount is negative; Stripe's customer balance uses cents where a
 * negative value = credit.
 */
export async function applySkippedCreditsToStripe(familyId: string, customerId?: string | null) {
  if (!customerId) return;

  const rows = await prisma.adjustment.findMany({
    where: { familyId, appliedToInvoice: null, stripeBalanceTransactionId: null },
    orderBy: { createdAt: "asc" },
  });
  const creditRows = rows
    .map((row) => ({ row, amount: row.remainingAmount ?? row.amount }))
    .filter(({ amount }) => amount < 0);
  if (creditRows.length === 0) return 0;

  const stripe = getStripe();
  let creditsCents = 0;
  for (const { row, amount } of creditRows) {
    const amountCents = Math.round(amount * 100);
    const transaction = await stripe.customers.createBalanceTransaction(
      customerId,
      {
        amount: amountCents,
        currency: BILLING_CURRENCY,
        description: row.reason,
        metadata: { adjustmentId: row.id },
      },
      { idempotencyKey: `adjustment:${row.id}` }
    );
    await prisma.adjustment.update({
      where: { id: row.id },
      data: { stripeBalanceTransactionId: transaction.id, remainingAmount: amount },
    });
    creditsCents += amountCents;
  }
  return creditsCents;
}
