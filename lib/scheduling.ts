import { prisma } from "@/lib/prisma";
import { DayOfWeek, LessonStatus } from "@/generated/prisma/enums";
import { businessDateParts, businessMonthRange, businessDateTime } from "@/lib/time";

const DAY_MAP: Record<DayOfWeek, number> = {
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
  SUNDAY: 0,
};

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function parseTimeHHMM(hhmm: string): { h: number; m: number } {
  const [h, m] = hhmm.split(":").map(Number);
  return { h, m };
}

export function slotDurationHours(start: string, end: string): number {
  const s = parseTimeHHMM(start);
  const e = parseTimeHHMM(end);
  return parseFloat(((e.h * 60 + e.m - (s.h * 60 + s.m)) / 60).toFixed(2));
}

/** Business-timezone calendar key (`YYYY-MM-DD`) for a lesson instant. */
function businessDateKey(date: Date): string {
  const { year, month, day } = businessDateParts(date);
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * The business-timezone date of the next `targetDow` on or after `from`.
 * Scheduling happens in the business timezone so a slot's wall-clock times
 * ("HH:MM") map to correct absolute instants regardless of the server's
 * local timezone.
 */
function nextWeekdayFrom(from: Date, targetDow: number): Date {
  const { year, month, day } = businessDateParts(from);
  const todayDow = new Date(Date.UTC(year, month, day)).getUTCDay();
  let diff = targetDow - todayDow;
  if (diff < 0) diff += 7;
  return businessDateTime(year, month, day + diff);
}

/**
 * Generate Lesson records for a student's active weekly slots from today
 * up to `weeksAhead`. Idempotent: existing lessons for the same slot on the
 * same date are not recreated.
 */
export async function generateLessonsForStudent(studentId: string, weeksAhead: number) {
  const slots = await prisma.weeklySlot.findMany({
    where: { studentId, active: true },
  });

  const from = new Date();
  const horizon = new Date(from.getTime() + weeksAhead * 7 * 24 * 60 * 60 * 1000);

  let created = 0;
  for (const slot of slots) {
    const dow = DAY_MAP[slot.dayOfWeek];
    const first = nextWeekdayFrom(from, dow);
    if (first.getTime() > horizon.getTime()) continue;

    const existing = await prisma.lesson.findMany({
      where: {
        slotId: slot.id,
        date: { gte: from },
      },
      select: { date: true },
    });
    const existingDates = new Set(existing.map((l) => businessDateKey(l.date)));

    const durationMin = Math.round(slotDurationHours(slot.startTime, slot.endTime) * 60);
    const s = parseTimeHHMM(slot.startTime);
    const { year: y0, month: m0, day: d0 } = businessDateParts(first);

    for (let week = 0; ; week++) {
      const dayOffset = week * 7;
      // businessDateTime interprets the slot's wall-clock time in the business
      // timezone and normalizes month/year overflow, giving the correct
      // absolute instant even across month boundaries and DST transitions.
      const start = businessDateTime(y0, m0, d0 + dayOffset, s.h, s.m);
      if (start.getTime() > horizon.getTime()) break;
      if (existingDates.has(businessDateKey(start))) continue;
      const end = addMinutes(start, durationMin);

      if (end.getTime() <= new Date().getTime()) continue;

      await prisma.lesson.create({
        data: {
          studentId,
          slotId: slot.id,
          date: start,
          endTime: end,
          durationHours: slotDurationHours(slot.startTime, slot.endTime),
          status: LessonStatus.SCHEDULED,
        },
      });
      created++;
    }
  }
  return created;
}

/** Generate lessons for every active student in the system. */
export async function generateAllLessons(weeksAhead: number): Promise<number> {
  const students = await prisma.student.findMany({ where: { active: true } });
  let total = 0;
  for (const s of students) {
    total += await generateLessonsForStudent(s.id, weeksAhead);
  }
  return total;
}

export interface StudentMonthLine {
  studentId: string;
  studentName: string;
  hours: number;
  rate: number;
  amount: number;
  lessons: number;
}

export interface MonthSummary {
  year: number;
  month: number; // 0-indexed
  weeksAhead: number;
  students: StudentMonthLine[];
  totalHours: number;
  totalAmount: number;
}

/**
 * Compute the expected billable lessons for a family in a given calendar month,
 * based on currently-scheduled lessons. Includes only non-cancelled lessons.
 */
export async function computeFamilyMonth(
  familyId: string,
  year: number,
  month: number // 0-indexed, e.g. 8 = September
): Promise<MonthSummary> {
  const family = await prisma.family.findUnique({
    where: { id: familyId },
    include: { students: { where: { active: true } } },
  });
  if (!family) throw new Error("Family not found");

  const { start: monthStart, end: monthEnd } = businessMonthRange(year, month);

  const lines: StudentMonthLine[] = [];
  for (const student of family.students) {
    const lessons = await prisma.lesson.findMany({
      where: {
        studentId: student.id,
        date: { gte: monthStart, lt: monthEnd },
        status: { in: [LessonStatus.SCHEDULED, LessonStatus.COMPLETED] },
      },
      select: { durationHours: true },
    });
    const hours = lessons.reduce((acc, l) => acc + l.durationHours, 0);
    const amount = hours * student.hourlyRate;
    lines.push({
      studentId: student.id,
      studentName: student.name,
      hours: round2(hours),
      rate: student.hourlyRate,
      amount: round2(amount),
      lessons: lessons.length,
    });
  }

  return {
    year,
    month,
    weeksAhead: 0,
    students: lines,
    totalHours: round2(lines.reduce((a, l) => a + l.hours, 0)),
    totalAmount: round2(lines.reduce((a, l) => a + l.amount, 0)),
  };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Compute billable lessons for a family between two dates (inclusive of the
 * lower bound, exclusive of the upper). Used to bill the remainder of the
 * current month for families that sign up after the 1st.
 */
export async function computeFamilyRange(
  familyId: string,
  start: Date,
  end: Date
): Promise<MonthSummary> {
  const family = await prisma.family.findUnique({
    where: { id: familyId },
    include: { students: { where: { active: true } } },
  });
  if (!family) throw new Error("Family not found");

  const lines: StudentMonthLine[] = [];
  for (const student of family.students) {
    const lessons = await prisma.lesson.findMany({
      where: {
        studentId: student.id,
        date: { gte: start, lt: end },
        status: { in: [LessonStatus.SCHEDULED, LessonStatus.COMPLETED] },
      },
      select: { durationHours: true },
    });
    const hours = lessons.reduce((acc, l) => acc + l.durationHours, 0);
    const amount = hours * student.hourlyRate;
    lines.push({
      studentId: student.id,
      studentName: student.name,
      hours: round2(hours),
      rate: student.hourlyRate,
      amount: round2(amount),
      lessons: lessons.length,
    });
  }

  return {
    year: businessDateParts(start).year,
    month: businessDateParts(start).month,
    weeksAhead: 0,
    students: lines,
    totalHours: round2(lines.reduce((a, l) => a + l.hours, 0)),
    totalAmount: round2(lines.reduce((a, l) => a + l.amount, 0)),
  };
}
