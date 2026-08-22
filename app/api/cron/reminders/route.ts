import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron";
import { prisma } from "@/lib/prisma";
import { sendLessonReminder } from "@/lib/email-templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const horizon = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  const lessons = await prisma.lesson.findMany({
    where: { status: "SCHEDULED", date: { gte: now, lte: horizon } },
    include: { student: { include: { family: true } } },
  });

  const sent = [];
  for (const lesson of lessons) {
    const family = lesson.student.family;
    if (!family.email) continue;
    const res = await sendLessonReminder(family, lesson.id, lesson.student.name, lesson.date, lesson.endTime);
    if (res.sent) sent.push(lesson.id);
  }
  return NextResponse.json({ ok: true, sent: sent.length });
}
