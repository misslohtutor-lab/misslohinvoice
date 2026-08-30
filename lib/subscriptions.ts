import { prisma } from "@/lib/prisma";
import { getStripe, quarterHourUnitAmount } from "@/lib/stripe";
import { BILLING_CURRENCY, BILLING_UNITS_PER_HOUR } from "@/lib/currency";
import { computeFamilyMonth, computeFamilyRange, round2 } from "@/lib/scheduling";
import { businessDateTime, businessMonthRange, currentBusinessMonthRange, nextBusinessMonth } from "@/lib/time";
import { checkoutReturnUrl } from "@/lib/checkout";
import { applySkippedCreditsToStripe, noticeAmounts } from "@/lib/credits";

export type PriceKind = "recurring" | "one-time";

/**
 * Ensure a Stripe Price exists for a student (unit amount = hourly rate).
 * Recurring prices are billed monthly via the subscription; one-time prices
 * bill the remainder of the current month for mid-month signups. Stored on
 * Student.stripePriceId / Student.stripeOneTimePriceId.
 */
export async function ensurePriceForStudent(studentId: string, kind: PriceKind): Promise<string> {
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) throw new Error("Student not found");

  const existing = kind === "recurring" ? student.stripePriceId : student.stripeOneTimePriceId;
  if (existing) return existing;

  const stripe = getStripe();
  const recurring = kind === "recurring";
  // Billing unit = 15 minutes. unit_amount = hourly rate / 4 (per 15-min block).
  const price = await stripe.prices.create({
    currency: BILLING_CURRENCY,
    unit_amount: quarterHourUnitAmount(student.hourlyRate),
    product_data: { name: recurring ? student.name : `${student.name} (one-time)` },
    nickname: recurring
      ? `${student.name} @ ${student.hourlyRate}/hr (per 15min)`
      : `${student.name} @ ${student.hourlyRate}/hr — current month`,
    recurring: recurring ? { interval: "month" } : undefined,
    metadata: { studentId: student.id },
  });

  await prisma.student.update({
    where: { id: student.id },
    data: recurring ? { stripePriceId: price.id } : { stripeOneTimePriceId: price.id },
  });
  return price.id;
}

/** Unix timestamp for midnight on the 1st in the business timezone. */
function firstOfMonth(year: number, month: number): number {
  return Math.floor(businessDateTime(year, month, 1).getTime() / 1000);
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
 *
 * Returns `null` — rather than throwing — when there is nothing to bill for
 * the next billing month yet (no students, or no scheduled lessons). This is a
 * valid state: a family can complete onboarding before a schedule exists. The
 * caller defers and the nightly sweep (ensureSubscriptionsForCardSavedFamilies)
 * retries once lessons are scheduled.
 */
export async function createSubscriptionAfterSetup(
  familyId: string,
  customerId: string,
  paymentMethod?: string | null,
  opts?: { targetMonth?: { year: number; month: number } }
) {
  const family = await prisma.family.findUnique({
    where: { id: familyId },
    include: { students: { where: { active: true } } },
  });
  if (!family) throw new Error("Family not found");

  if (family.subscriptionId) {
    // Already set up (webhook retry) — nothing to create.
    return await getStripe().subscriptions.retrieve(family.subscriptionId);
  }

  // Bill `targetMonth` when provided (e.g. an immediate invoice already prepaid
  // next month, so the subscription must not bill it again); otherwise default
  // to the next business month.
  const { year, month } = opts?.targetMonth ?? nextBusinessMonth();
  const summary = await computeFamilyMonth(family.id, year, month);
  const items: Array<{ price: string; quantity: number }> = [];
  for (const line of summary.students) {
    // Only add billable hours; a qty-0 item cannot be a subscription line item.
    const hours = round2(line.hours * BILLING_UNITS_PER_HOUR);
    if (hours <= 0) continue;
    const priceId = await ensurePriceForStudent(line.studentId, "recurring");
    // 1 billing unit = 15 minutes
    items.push({ price: priceId, quantity: hours });
  }
  if (items.length === 0) {
    return null;
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
  const { year, month } = nextBusinessMonth();
  const summary = await computeFamilyMonth(familyId, year, month);

  const updates: Array<{ id?: string; price?: string; quantity: number }> = [];
  const itemsToUpdate = new Map<string, number>(); // priceId -> hours
  const studentPriceIds = new Map<string, string>();
  for (const line of summary.students) {
    const student = family.students.find((s) => s.id === line.studentId);
    if (!student) continue;
    const priceId = student.stripePriceId ?? (await ensurePriceForStudent(student.id, "recurring"));
    studentPriceIds.set(student.id, priceId);
    // 1 billing unit = 15 minutes
    itemsToUpdate.set(priceId, round2(line.hours * BILLING_UNITS_PER_HOUR));
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
 * Nightly self-heal: give families that saved a card during onboarding but
 * never got a subscription (because there was nothing to bill yet) a chance to
 * become subscribed now that a schedule exists. Runs before the charge-notice
 * and billing crons so those families are picked up on the next 1st.
 *
 * Returns a report so callers can log progress.
 */
export async function ensureSubscriptionsForCardSavedFamilies(): Promise<{
  created: string[];
  deferred: string[];
  failed: Array<{ familyId: string; error: string }>;
}> {
  const candidates = await prisma.family.findMany({
    where: {
      subscriptionId: null,
      cardLast4: { not: null },
      subscriptionStatus: null,
    },
    select: { id: true, stripeCustomerId: true },
  });

  const created: string[] = [];
  const deferred: string[] = [];
  const failed: Array<{ familyId: string; error: string }> = [];

  for (const family of candidates) {
    if (!family.stripeCustomerId) continue;
    try {
      const sub = await createSubscriptionAfterSetup(family.id, family.stripeCustomerId);
      if (sub) created.push(family.id);
      else deferred.push(family.id);
    } catch (err) {
      failed.push({ familyId: family.id, error: String(err) });
    }
  }

  return { created, deferred, failed };
}

/**
 * Send an immediate invoice for the family's scheduled lessons in the current
 * month. Unlike the onboarding flow, this does not require a card on file — the
 * customer pays via a Stripe invoice payment link. After payment, the webhook
 * creates a subscription so future months are billed automatically.
 *
 * The invoice is marked with metadata `{ type: "immediate_invoice" }` so the
 * webhook can distinguish it from mid-month bills and auto-subscribe on payment.
 */
export async function sendImmediateInvoice(familyId: string): Promise<{
  invoiceId: string;
  invoiceUrl: string;
  amount: number;
}> {
  const family = await prisma.family.findUnique({
    where: { id: familyId },
    include: { students: { where: { active: true } } },
  });
  if (!family) throw new Error("Family not found");

  const stripe = getStripe();

  // Ensure a Stripe Customer exists.
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

  // Try current month first (mid-month billing), then next month (prepaid).
  const { start: curStart, end: curEnd } = currentBusinessMonthRange();
  let summary = await computeFamilyRange(familyId, curStart, curEnd);
  let monthStart = curStart;
  let monthEnd = curEnd;
  let prepaidMonth: string | null = null;

  if (summary.totalAmount <= 0) {
    const { year, month } = nextBusinessMonth();
    const next = businessMonthRange(year, month);
    summary = await computeFamilyRange(familyId, next.start, next.end);
    monthStart = next.start;
    monthEnd = next.end;
    prepaidMonth = `${year}-${String(month + 1).padStart(2, "0")}`; // e.g. "2026-09"
  }

  if (summary.totalAmount <= 0) {
    throw new Error("No billable lessons in the current or next billing month");
  }

  // Idempotency guard: don't raise a second invoice for the same period. Uses
  // the ImmediateInvoice marker, which is written at send time (before Stripe
  // reports payment), so a repeat click can't double-bill.
  const existingInvoice = await immediateInvoiceInPeriod(familyId, monthStart, monthEnd);
  if (existingInvoice) {
    throw new Error("This month has already been invoiced (invoice " + existingInvoice + ")");
  }

  // Apply any unapplied missed-lesson credits so the invoice is discounted.
  await applySkippedCreditsToStripe(family.id, customerId);

  const { netAmount } = await noticeAmounts(familyId, summary.totalAmount);

  // Create a send-invoice invoice (customer pays via link, not auto-charged).
  // `prepaidMonth` tells the webhook that the next month was billed up front,
  // so the auto-subscription must not bill that month again.
  const invoice = await stripe.invoices.create({
    customer: customerId,
    collection_method: "send_invoice",
    days_until_due: 7,
    metadata: {
      familyId: family.id,
      type: "immediate_invoice",
      ...(prepaidMonth ? { prepaidMonth } : {}),
    },
  });

  // Add a line item per student.
  for (const line of summary.students) {
    if (line.hours <= 0) continue;
    const priceId = await ensurePriceForStudent(line.studentId, "one-time");
    const qty = Math.max(round2(line.hours * BILLING_UNITS_PER_HOUR), 0);
    await stripe.invoiceItems.create({
      customer: customerId,
      invoice: invoice.id,
      price: priceId,
      quantity: qty,
    });
  }

  // Finalize and send the invoice email.
  const finalized = await stripe.invoices.finalizeInvoice(invoice.id);
  await stripe.invoices.sendInvoice(invoice.id);

  // Record the sent invoice so the guard above catches repeats. Written last so
  // a failed send doesn't block a retry.
  await prisma.immediateInvoice.create({
    data: {
      familyId: family.id,
      stripeInvoiceId: invoice.id,
      periodStart: monthStart,
      periodEnd: monthEnd,
      amount: netAmount,
    },
  });

  return {
    invoiceId: invoice.id,
    invoiceUrl: finalized.hosted_invoice_url ?? `https://invoice.stripe.com/${invoice.id}`,
    amount: netAmount,
  };
}

/** Any immediate invoice already covering [start, end), by Stripe invoice id. */
export async function immediateInvoiceInPeriod(
  familyId: string,
  start: Date,
  end: Date
): Promise<string | null> {
  const existing = await prisma.immediateInvoice.findFirst({
    where: {
      familyId,
      // Overlap: a full-month period ends exactly at `end`, so use strict
      // overlap rather than periodEnd < end (which an equal periodEnd would miss).
      periodStart: { lt: end },
      periodEnd: { gt: start },
    },
  });
  return existing?.stripeInvoiceId ?? null;
}
