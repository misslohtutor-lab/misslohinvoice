import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { businessDateParts, businessDateTime } from "../lib/time";
import { slotDurationHours } from "../lib/scheduling";

// One-time correction for lessons created before lesson generation was made
// business-timezone-aware. Those lessons interpreted each WeeklySlot's
// wall-clock "HH:MM" in the server's local timezone (e.g. UTC), so a class at
// 20:00 America/Toronto was stored as 20:00 UTC — emails then rendered it back
// as 16:00 ET. This rebuilds the stored instant from the slot's times and the
// lesson's intended business-timezone calendar date.
//
// Usage:
//   tsx scripts/fix-lesson-times.ts            # dry run (prints the diff)
//   tsx scripts/fix-lesson-times.ts --apply    # writes the corrected dates

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const APPLY = process.argv.includes("--apply");

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

async function main() {
  const lessons = await prisma.lesson.findMany({
    where: { slotId: { not: null } },
    include: { slot: true, student: { include: { family: true } } },
    orderBy: { date: "asc" },
  });

  let changed = 0;
  let unchanged = 0;
  let skipped = 0;

  for (const lesson of lessons) {
    const slot = lesson.slot;
    if (!slot) {
      skipped++;
      continue;
    }

    const { year, month, day } = businessDateParts(lesson.date);
    const [h, m] = slot.startTime.split(":").map(Number);
    const start = businessDateTime(year, month, day, h, m);
    const end = addMinutes(start, Math.round(slotDurationHours(slot.startTime, slot.endTime) * 60));

    if (start.getTime() === lesson.date.getTime() && end.getTime() === lesson.endTime.getTime()) {
      unchanged++;
      continue;
    }

    changed++;
    const oldStart = lesson.date.toISOString();
    const newStart = start.toISOString();
    console.log(
      `${lesson.student?.family?.name ?? "?"} / ${lesson.student?.name ?? "?"}: ${status(oldStart, newStart)} ` +
        `${lesson.status} ${oldStart.replace("T", " ").slice(0, 16)}Z -> ${newStart.replace("T", " ").slice(0, 16)}Z ` +
        `(slot ${slot.dayOfWeek} ${slot.startTime})`
    );

    if (APPLY) {
      await prisma.lesson.update({ where: { id: lesson.id }, data: { date: start, endTime: end } });
    }
  }

  console.log(
    `\n${lessons.length} lessons with a slot: ${changed} corrected${APPLY ? "" : " (dry run — re-run with --apply to write)"}, ` +
      `${unchanged} already correct, ${skipped} skipped.`
  );
}

function status(oldStart: string, newStart: string): string {
  return oldStart.slice(0, 10) === newStart.slice(0, 10) ? "time " : "date ";
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });