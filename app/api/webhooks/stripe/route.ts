import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { attachSubscriptionToFamily, createSubscriptionAfterSetup } from "@/lib/subscriptions";
import { receiptPeriod } from "@/lib/midmonth";
import { BILLING_UNITS_PER_HOUR } from "@/lib/currency";
import { sendReceipt, sendPaymentFailure, sendOnboardingConfirmation } from "@/lib/email-templates";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || secret === "whsec_xxx") {
    return NextResponse.json({ error: "Webhook secret not configured." }, { status: 500 });
  }

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, req.headers.get("stripe-signature") ?? "", secret);
  } catch (err) {
    console.error("[stripe webhook] signature error:", err);
    return NextResponse.json({ error: "Signature verification failed." }, { status: 400 });
  }

  const storedEvent = await prisma.stripeEvent.upsert({
    where: { id: event.id },
    update: {},
    create: { id: event.id, type: event.type },
  });
  if (storedEvent.processedAt) {
    return NextResponse.json({ received: true, duplicate: true }, { status: 200 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = String(session.customer);
        const family = await prisma.family.findUnique({ where: { stripeCustomerId: customerId } });
        if (family) {
          if (session.mode === "setup") {
            // $0 onboarding: card was saved. Saving a card is confirmed by email
            // even if the subscription can't be created yet (e.g. no active
            // students) — the family must not be left hanging after checkout.
            const setupError = await withEmptyOnError(() => handleSetupOnboarding(family.id, session));
            await sendOnboardingConfirmation(family);
            if (setupError) {
              console.error("[stripe webhook] onboarding setup incomplete:", setupError);
            }
          } else if (typeof session.subscription === "string") {
            // Backwards-compatible path for any older subscription-mode sessions.
            await attachSubscriptionToFamily(family.id, session.subscription);
            await updateCard(family.id, session.subscription);
          }
        }
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const family = await prisma.family.findUnique({ where: { stripeCustomerId: String(invoice.customer) } });
        if (family) {
          // Subscription invoices stay in sync (card, status, period); every
          // paid invoice — including one-off mid-month bills with no
          // subscription — records ledger lines, consumes credits, and emails a receipt.
          if (typeof invoice.subscription === "string") {
            await updateCard(family.id, invoice.subscription);
            await syncStatus(family.id, invoice.subscription);
          }
          await recordInvoiceLines(family.id, invoice);
          await markSkippedCreditsApplied(family.id, invoice);
          await sendReceipt(family, invoice, (await receiptPeriod(family.id, invoice)) ?? undefined);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const family = await prisma.family.findUnique({ where: { stripeCustomerId: String(invoice.customer) } });
        if (family) {
          // Only subscription invoices change the family's subscription state;
          // a failed one-off mid-month bill must not clobber it.
          if (typeof invoice.subscription === "string") {
            await syncStatus(family.id, invoice.subscription);
            await prisma.family.update({ where: { id: family.id }, data: { subscriptionStatus: "past_due" } });
          }
          await sendPaymentFailure(family, invoice);
        }
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const family = await prisma.family.findUnique({ where: { stripeCustomerId: String(sub.customer) } });
        if (family) await syncStatus(family.id, sub.id);
        break;
      }
    }
    await prisma.stripeEvent.update({
      where: { id: event.id },
      data: { processedAt: new Date() },
    });
  } catch (err) {
    console.error("[stripe webhook] handler error:", err);
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }

  return NextResponse.json({ received: true }, { status: 200 });
}

/**
 * After a $0 setup-mode onboarding checkout, save the card as the customer's
 * default payment method and create the monthly subscription (trial until the
 * 1st), so the family's first recurring charge lands on a normal billing day.
 */
async function handleSetupOnboarding(familyId: string, session: Stripe.Checkout.Session) {
  const stripe = getStripe();
  const customerId = String(session.customer);

  let paymentMethod: string | null = null;
  if (typeof session.setup_intent === "string") {
    const si = await stripe.setupIntents.retrieve(session.setup_intent);
    if (si.payment_method) paymentMethod = String(si.payment_method);
  }

  if (paymentMethod) {
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethod },
    });
    const method = await stripe.paymentMethods.retrieve(paymentMethod);
    if (method.card?.last4) {
      await prisma.family.update({ where: { id: familyId }, data: { cardLast4: method.card.last4 } });
    }
  }

  await createSubscriptionAfterSetup(familyId, customerId, paymentMethod);
}

async function updateCard(familyId: string, subscriptionId: string) {
  const stripe = getStripe();
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  let last4: string | undefined;
  const pm = sub.default_payment_method;
  if (typeof pm === "string") {
    const method = await stripe.paymentMethods.retrieve(pm);
    if (method.card) last4 = method.card.last4;
  } else if (pm?.card) {
    last4 = pm.card.last4;
  }
  if (last4) {
    await prisma.family.update({ where: { id: familyId }, data: { cardLast4: last4 } });
  }
}

async function syncStatus(familyId: string, subscriptionId: string) {
  const stripe = getStripe();
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  await prisma.family.update({ where: { id: familyId }, data: { subscriptionStatus: sub.status } });
  await prisma.subscription.updateMany({
    where: { familyId },
    data: {
      status: sub.status,
      periodStart: sub.current_period_start ? new Date(sub.current_period_start * 1000) : null,
      periodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null,
    },
  });
}

async function recordInvoiceLines(familyId: string, invoice: Stripe.Invoice) {
  const perLine = invoice.lines.data ?? [];
  for (const line of perLine) {
    const price = line.price;
    const studentId = price?.metadata?.studentId;
    if (!studentId) continue;
    // Stripe prices are per 15-minute block; ledger rates are hourly.
    const rate = price?.unit_amount != null ? (price.unit_amount * BILLING_UNITS_PER_HOUR) / 100 : 0;
    const quantity = line.quantity ?? 0;
    const hours = quantity / BILLING_UNITS_PER_HOUR; // billing unit = 15 min
    const amount = (line.amount ?? 0) / 100;
    await prisma.ledgerLine.upsert({
      where: {
        stripeInvoiceId_studentId: { stripeInvoiceId: invoice.id, studentId },
      },
      update: {},
      create: {
          familyId,
          studentId,
          periodStart: invoice.period_start ? new Date(invoice.period_start * 1000) : new Date(),
          periodEnd: invoice.period_end ? new Date(invoice.period_end * 1000) : new Date(),
          hours,
          rate,
          amount,
          stripeInvoiceId: invoice.id,
      },
    });
  }
}

/** Consume only the portion of local credits that Stripe applied to this invoice. */
async function markSkippedCreditsApplied(familyId: string, invoice: Stripe.Invoice) {
  if (invoice.ending_balance == null) return;

  let remainingCents = Math.max(0, invoice.ending_balance - invoice.starting_balance);
  if (remainingCents === 0) return;

  const rows = await prisma.adjustment.findMany({
    where: { familyId, appliedToInvoice: null, stripeBalanceTransactionId: { not: null } },
    orderBy: { createdAt: "asc" },
  });

  for (const row of rows) {
    if (remainingCents <= 0) break;
    const creditCents = Math.abs(Math.round((row.remainingAmount ?? row.amount) * 100));
    if (creditCents === 0) continue;
    const appliedCents = Math.min(creditCents, remainingCents);
    const stillOpenCents = creditCents - appliedCents;
    await prisma.adjustment.update({
      where: { id: row.id },
      data: {
        remainingAmount: -stillOpenCents / 100,
        appliedToInvoice: stillOpenCents === 0 ? invoice.id : null,
      },
    });
    remainingCents -= appliedCents;
  }
}

/**
 * Run a webhook sub-step and return any error instead of throwing, so callers
 * can continue with the rest of the event handling (e.g. still send the
 * onboarding confirmation even if the subscription can't be created yet).
 */
async function withEmptyOnError(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (err) {
    return String(err);
  }
}
