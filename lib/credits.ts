import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { BILLING_CURRENCY } from "@/lib/currency";
import { round2 } from "@/lib/scheduling";

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