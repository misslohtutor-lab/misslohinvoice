import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron";
import { generateAllLessons } from "@/lib/scheduling";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WEEKS_AHEAD = 16;

/**
 * Top up every active student's lesson list so a rolling `WEEKS_AHEAD` window
 * stays populated. Idempotent: lessons that already exist for a slot/date are
 * skipped, so this can safely run daily.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const created = await generateAllLessons(WEEKS_AHEAD);
    if (created > 0) console.log(`[cron:generate-lessons] created ${created} lessons`);
    return NextResponse.json({ ok: true, created, weeksAhead: WEEKS_AHEAD });
  } catch (err) {
    console.error("[cron:generate-lessons] failed:", err);
    return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
}
