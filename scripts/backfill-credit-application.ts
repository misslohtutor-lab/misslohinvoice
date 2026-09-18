import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import Stripe from "stripe";
import "dotenv/config";
import { markSkippedCreditsApplied } from "../lib/credits";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

/**
 * Backfill: credits were only marked applied on invoice.paid, but Stripe
 * consumes the customer balance at invoice finalization. Immediate invoices
 * that are finalized-but-unpaid therefore left their credits looking unapplied,
 * so they got re-counted on the next month's bill. Replay finalization for all
 * recorded immediate invoices (with or without a Stripe invoice id) to mark the
 * credits each one consumed.
 */
async function main() {
  const invoices = await prisma.immediateInvoice.findMany({
    where: { status: "OPEN" },
    select: { familyId: true, stripeInvoiceId: true },
  });
  let fixed = 0;
  for (const inv of invoices) {
    if (!inv.stripeInvoiceId) continue;
    let stripeInvoice: Stripe.Invoice;
    try {
      stripeInvoice = await stripe.invoices.retrieve(inv.stripeInvoiceId);
    } catch (err) {
      console.error(`[backfill] could not retrieve ${inv.stripeInvoiceId}:`, String(err));
      continue;
    }
    if (stripeInvoice.status !== "paid") {
      await markSkippedCreditsApplied(inv.familyId, stripeInvoice);
      fixed++;
    }
  }
  console.log(`[backfill] replayed ${fixed} open immediate invoices`);
}
main().finally(() => prisma.$disconnect());