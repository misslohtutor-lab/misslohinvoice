import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron";
import { prisma } from "@/lib/prisma";
import { ensureSubscriptionsForCardSavedFamilies, syncNextMonthQuantities } from "@/lib/subscriptions";
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

  // Self-heal: pick up card-saved families whose subscription was deferred
  // because they had no scheduled lessons when they onboarded.
  const sweep = await ensureSubscriptionsForCardSavedFamilies();
  for (const id of sweep.created) console.log(`[cron:billing] created subscription for ${id}`);
  for (const { familyId, error } of sweep.failed) {
    console.error(`[cron:billing] failed to subscribe ${familyId}:`, error);
  }

  if (!isBillingDay()) {
    return NextResponse.json({ ok: true, skipped: true, reason: "not the 1st", sweep });
  }

  const families = await prisma.family.findMany({
    where: { subscriptionId: { not: null }, subscriptionStatus: { not: "canceled" } },
  });

  const synced = [];
  const failed = [];
  for (const family of families) {
    try {
      const { summary } = await syncNextMonthQuantities(family.id);
      synced.push({ family: family.id, amount: summary.totalAmount });
    } catch (err) {
      console.error(`[cron:billing] failed for family ${family.id}:`, err);
      failed.push({ family: family.id, error: "failed" });
    }
  }
  return NextResponse.json({ ok: true, synced, failedCount: failed.length, sweep });
}
