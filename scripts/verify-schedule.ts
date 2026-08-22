import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { DayOfWeek } from "../app/generated/prisma/enums";
import { generateLessonsForStudent } from "../lib/scheduling";
import { computeFamilyMonth } from "../lib/scheduling";
import { nextMonthFromNow } from "../lib/billing";

const prisma = new PrismaClient();

async function main() {
  const family = await prisma.family.findUnique({
    where: { email: "family@missloh.local" },
    include: { students: true },
  });
  if (!family) throw new Error("demo family missing — run seed first");

  // Add weekly slots to each student if none exist
  const slotsConfig: Record<string, [DayOfWeek, string, string][]> = {
    [family.students[0].id]: [
      [DayOfWeek.MONDAY, "16:00", "17:00"],
      [DayOfWeek.THURSDAY, "16:00", "17:30"],
    ],
    [family.students[1].id]: [
      [DayOfWeek.WEDNESDAY, "15:30", "16:00"],
      [DayOfWeek.FRIDAY, "15:30", "16:30"],
    ],
  };
  for (const s of family.students) {
    for (const [dow, st, en] of slotsConfig[s.id] ?? []) {
      const existing = await prisma.weeklySlot.count({ where: { studentId: s.id, dayOfWeek: dow, startTime: st } });
      if (existing === 0) {
        await prisma.weeklySlot.create({ data: { studentId: s.id, dayOfWeek: dow, startTime: st, endTime: en } });
        console.log("+ slot", s.name, dow, st + "-" + en);
      }
    }
  }

  for (const s of family.students) {
    const created = await generateLessonsForStudent(s.id, 10);
    console.log("generated", created, "lessons for", s.name);
  }

  const { year, month } = nextMonthFromNow();
  const summary = await computeFamilyMonth(family.id, year, month);
  console.log("\n=== Next month billing preview ===");
  for (const l of summary.students) {
    console.log(`  ${l.studentName}: ${l.lessons} sess, ${l.hours}h @ $${l.rate}/hr = $${l.amount}`);
  }
  console.log(`  TOTAL: ${summary.totalHours}h  $${summary.totalAmount}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => { console.error(e); process.exit(1); });