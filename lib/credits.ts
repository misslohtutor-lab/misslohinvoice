import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { BILLING_CURRENCY } from "@/lib/currency";
import { round2 } from "@/lib/scheduling";

/**
 * Consume only the portion of local credits that Stripe applied to an invoice.
 *
 * Credits are handed to Stripe as the customer's balance when an invoice is
 * about to be created (see applySkippedCreditsToStripe), and Stripe deducts
 * that balance when the invoice is finalized — before it is paid. If we only
 * marked credits applied on payment, a credit consumed by an open, unpaid
 * invoice would still look unapplied locally and get re-counted on the next
 * month's invoice. So this runs at finalization too, which is idempotent (rows
 * already fully applied to an invoice are skipped next time).
 */
export async function markSkippedCreditsApplied(
  familyId: string,
  invoice: { id: string; starting_balance?: number | null; ending_balance?: number | null }
) {
  if (invoice.ending_balance == null) return;

  const startingBalance = invoice.starting_balance ?? 0;
  let remainingCents = Math.max(0, invoice.ending_balance - startingBalance);
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