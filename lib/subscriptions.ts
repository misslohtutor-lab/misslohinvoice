import { prisma } from "@/lib/prisma";
import { getStripe, quarterHourUnitAmount } from "@/lib/stripe";
import { BILLING_CURRENCY, BILLING_UNITS_PER_HOUR } from "@/lib/currency";
import { computeFamilyMonth, round2 } from "@/lib/scheduling";
import { businessDateTime, nextBusinessMonth } from "@/lib/time";
import { checkoutReturnUrl } from "@/lib/checkout";
import { applySkippedCreditsToStripe } from "@/lib/credits";

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
    return await getStripe().subscriptions.retrieve(family.subscriptionId);
  }

  const { year, month } = nextBusinessMonth();
  const summary = await computeFamilyMonth(family.id, year, month);
  const items: Array<{ price: string; quantity: number }> = [];
  for (const line of summary.students) {
    const priceId = await ensurePriceForStudent(line.studentId, "recurring");
    // 1 billing unit = 15 minutes
    items.push({ price: priceId, quantity: Math.max(round2(line.hours * BILLING_UNITS_PER_HOUR), 0) });
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