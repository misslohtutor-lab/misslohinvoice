import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron";
import { prisma } from "@/lib/prisma";
import { noticeAmounts, noticeLessonsForPeriod, nextMonthFromNow, syncNextMonthQuantities } from "@/lib/billing";
import { sendChargeNotice } from "@/lib/email-templates";
import { businessMonthRange, daysUntilNextBusinessMonth, monthPeriodKey, monthPeriodLabel } from "@/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isNoticeDay(): boolean {
  const daysUntilFirst = daysUntilNextBusinessMonth();
  const target = Number(process.env.NOTICE_DAYS_BEFORE ?? "3");
  // If the service missed the exact notice day, send it on the next run while
  // there is still time before the billing boundary.
  return daysUntilFirst >= 1 && daysUntilFirst <= target;
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isNoticeDay()) {
    return NextResponse.json({ ok: true, skipped: true, reason: "not a notice day" });
  }

  const families = await prisma.family.findMany({
    where: { subscriptionId: { not: null }, subscriptionStatus: { not: "canceled" } },
  });
  const { year, month } = nextMonthFromNow();
  const periodKey = monthPeriodKey(year, month);
  const periodLabel = monthPeriodLabel(year, month);
  const { start: billingStart, end: billingEnd } = businessMonthRange(year, month);

  let sent = 0;
  const failed: Array<{ family: string; error: string }> = [];
  for (const family of families) {
    try {
      // Sync before notifying so Stripe has the same quantities the notice displays.
      const { summary } = await syncNextMonthQuantities(family.id);
      if (summary.totalAmount <= 0) continue;
      const { creditAmount, netAmount } = await noticeAmounts(family.id, summary.totalAmount);
      const lessons = await noticeLessonsForPeriod(family.id, billingStart, billingEnd);

      const res = await sendChargeNotice(
        family,
        periodKey,
        periodLabel,
        netAmount,
        lessons,
        { grossTotal: summary.totalAmount, creditAmount }
      );
      if (res.sent) sent++;
    } catch (err) {
      console.error(`[cron:charge-notice] failed for family ${family.id}:`, err);
      failed.push({ family: family.id, error: "failed" });
    }
  }
  return NextResponse.json({ ok: true, sent, failedCount: failed.length, families: families.length });
}
