import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron";
import { prisma } from "@/lib/prisma";
import { syncNextMonthQuantities } from "@/lib/billing";
import { businessDateParts } from "@/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isBillingDay(): boolean {
  return businessDateParts().day === 1;
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isBillingDay()) {
    return NextResponse.json({ ok: true, skipped: true, reason: "not the 1st" });
  }

  const families = await prisma.family.findMany({
    where: { subscriptionId: { not: null }, subscriptionStatus: { not: "canceled" } },
  });

  const synced = [];
  const failed = [];
  for (const family of families) {
    try {
      const { summary } = await syncNextMonthQuantities(family.id);
      synced.push({ family: family.name, amount: summary.totalAmount });
    } catch (err) {
      failed.push({ family: family.name, error: String(err) });
    }
  }
  return NextResponse.json({ ok: true, synced, failed });
}
