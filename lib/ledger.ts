import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { BILLING_UNITS_PER_HOUR } from "@/lib/currency";
import { round2 } from "@/lib/scheduling";

/**
 * Stripe API 2026-07-29.dahlia moved price details off `invoice line.price`
 * (which is now unset in webhook payloads) into `line.pricing.price_details`.
 * The SDK's bundled types predate that, so extend the line shape locally.
 */
type InvoiceLine = Stripe.InvoiceLineItem & {
  pricing?: {
    price_details?: { price?: string | null } | null;
    unit_amount_decimal?: string | null;
  } | null;
};

const priceStudentCache = new Map<string, string | null>();

/**
 * Find the student a Stripe price belongs to. Current prices are cached on the
 * student; historical prices (from before a rate change) are resolved through
 * the price's `studentId` metadata.
 */
async function resolveStudentId(familyId: string, priceId: string): Promise<string | null> {
  if (priceStudentCache.has(priceId)) return priceStudentCache.get(priceId) ?? null;

  const local = await prisma.student.findFirst({
    where: { familyId, OR: [{ stripePriceId: priceId }, { stripeOneTimePriceId: priceId }] },
    select: { id: true },
  });
  if (local) {
    priceStudentCache.set(priceId, local.id);
    return local.id;
  }

  let studentId: string | null = null;
  try {
    const price = await getStripe().prices.retrieve(priceId);
    const metaId = price.metadata?.studentId;
    if (metaId) {
      const student = await prisma.student.findUnique({ where: { id: metaId }, select: { id: true } });
      studentId = student?.id ?? null;
    }
  } catch (err) {
    console.error(`[ledger] could not resolve price ${priceId}:`, err);
  }
  priceStudentCache.set(priceId, studentId);
  return studentId;
}

/**
 * The period an invoice actually pays for. Subscription lines carry the billed
 * month (e.g. Nov 1 → Dec 1) even though the invoice's own `period_start` /
 * `period_end` describe the cycle that just ended. Immediate/mid-month invoices
 * are raised off-cycle, so use the locally recorded period for those.
 */
async function billedPeriod(
  familyId: string,
  invoice: Stripe.Invoice
): Promise<{ start: Date; end: Date }> {
  const lines = (invoice.lines.data ?? []) as InvoiceLine[];
  const periods = lines
    .filter((line) => !line.proration && line.period && line.period.end > line.period.start)
    .map((line) => line.period);
  if (periods.length > 0) {
    return {
      start: new Date(Math.min(...periods.map((p) => p.start)) * 1000),
      end: new Date(Math.max(...periods.map((p) => p.end)) * 1000),
    };
  }

  const immediate = await prisma.immediateInvoice.findFirst({
    where: { stripeInvoiceId: invoice.id },
    select: { periodStart: true, periodEnd: true },
  });
  if (immediate) return { start: immediate.periodStart, end: immediate.periodEnd };

  const pending = await prisma.pendingCharge.findFirst({
    where: { familyId, invoiceId: invoice.id },
    select: { periodStart: true, periodEnd: true },
  });
  if (pending) return { start: pending.periodStart, end: pending.periodEnd };

  const start = invoice.period_start ? new Date(invoice.period_start * 1000) : new Date();
  const end =
    invoice.period_end && invoice.period_end > invoice.period_start
      ? new Date(invoice.period_end * 1000)
      : new Date(start.getTime() + 1);
  return { start, end };
}

/**
 * Record what a paid invoice billed, one row per student, for the admin billing
 * history. Idempotent: replaying a webhook or running the backfill updates the
 * existing row instead of duplicating it.
 */
export async function recordInvoiceLines(familyId: string, invoice: Stripe.Invoice) {
  const lines = (invoice.lines.data ?? []) as InvoiceLine[];

  // Aggregate per student: a rate change leaves a 0-quantity line for the old
  // price on the same invoice, and Stripe can split a student across lines.
  const perStudent = new Map<string, { hours: number; amount: number; rate: number }>();

  for (const line of lines) {
    const quantity = line.quantity ?? 0;
    const amount = (line.amount ?? 0) / 100;
    // Skip 0-hour leftovers and free/trial lines — only real charges belong in
    // the billing history.
    if (quantity <= 0 || amount === 0) continue;

    const priceId = line.pricing?.price_details?.price ?? line.price?.id ?? null;
    const studentId =
      line.price?.metadata?.studentId ??
      (priceId ? await resolveStudentId(familyId, priceId) : null);
    if (!studentId) {
      console.warn(`[ledger] invoice ${invoice.id}: no student for price ${priceId ?? "(none)"}`);
      continue;
    }

    // Stripe prices are per 15-minute block; ledger rates are hourly.
    const unitAmountCents =
      line.pricing?.unit_amount_decimal != null
        ? Number(line.pricing.unit_amount_decimal)
        : line.price?.unit_amount;
    const rate =
      unitAmountCents != null
        ? round2((unitAmountCents * BILLING_UNITS_PER_HOUR) / 100)
        : 0;
    const hours = round2(quantity / BILLING_UNITS_PER_HOUR);

    const current = perStudent.get(studentId);
    if (current) {
      current.hours = round2(current.hours + hours);
      current.amount = round2(current.amount + amount);
      if (!current.rate) current.rate = rate;
    } else {
      perStudent.set(studentId, { hours, amount, rate });
    }
  }

  if (perStudent.size === 0) return;

  const { start, end } = await billedPeriod(familyId, invoice);
  for (const [studentId, row] of perStudent) {
    await prisma.ledgerLine.upsert({
      where: { stripeInvoiceId_studentId: { stripeInvoiceId: invoice.id, studentId } },
      update: {
        periodStart: start,
        periodEnd: end,
        hours: row.hours,
        rate: row.rate,
        amount: row.amount,
      },
      create: {
        familyId,
        studentId,
        periodStart: start,
        periodEnd: end,
        hours: row.hours,
        rate: row.rate,
        amount: row.amount,
        stripeInvoiceId: invoice.id,
      },
    });
  }
}
