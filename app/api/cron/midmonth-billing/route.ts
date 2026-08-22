import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron";
import { chargeDuePendingCharges } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sweeps queued mid-month bills whose 24h notice window has elapsed and charges
 * the card (Stripe invoice). Idempotent: rows are claimed PENDING → PROCESSING,
 * so frequent invocation never double-charges.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await chargeDuePendingCharges();
  const failed = results.filter((r) => !r.ok);
  const charged = results.filter((r) => r.ok);
  return NextResponse.json({
    ok: failed.length === 0,
    charged: charged.map((r) => ({ id: r.id, amount: r.amount ?? 0 })),
    failed: failed.map((r) => ({ id: r.id })),
  });
}