/**
 * Local background job runner.
 *
 * Runs the same work as the Vercel cron endpoints (/api/cron/billing,
 * /api/cron/charge-notice, /api/cron/reminders) but executes the library
 * functions directly, so it works even when the Next.js server is down (it only
 * needs the SQLite DB, Stripe keys and SMTP config).
 *
 * Schedule this with cron(8), e.g. once every 30 minutes (see
 * scripts/crontab.example for the exact line).
 *
 * Each job is tracked in the ScheduledRun table (one row per job + window).
 * A SUCCESS row means that job already ran for its window, so repeated
 * invocations skip it. This gives both dedupe (billing can never run twice for
 * the same month) and recovery: if the machine was off when a job was due, the
 * first invocation after boot runs it because there is no SUCCESS row.
 *
 * Usage:
 *   tsx scripts/run-jobs.ts            run every job that is due
 *   tsx scripts/run-jobs.ts billing    run only the billing job
 *   tsx scripts/run-jobs.ts --list     print what would run without running it
 *   tsx scripts/run-jobs.ts --force    ignore the "due" check (still dedupes)
 */
import "dotenv/config";
import { prisma } from "../lib/prisma";
import { chargeDuePendingCharges, noticeAmounts, noticeLessonsForPeriod, nextMonthFromNow, syncNextMonthQuantities } from "../lib/billing";
import { sendChargeNotice, sendLessonReminder, CHARGE_NOTICE_ALREADY_SENT } from "../lib/email-templates";
import { businessDateParts, businessMonthRange, daysUntilNextBusinessMonth, monthPeriodKey, monthPeriodLabel } from "../lib/time";

type JobName = "billing" | "charge-notice" | "reminders" | "midmonth-billing";

const NOTICE_DAYS = Number(process.env.NOTICE_DAYS_BEFORE ?? "3");

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function nowKey(): string {
  const d = businessDateParts();
  return `${d.year}-${pad(d.month + 1)}-${pad(d.day)}`;
}

function monthKey(): string {
  const d = businessDateParts();
  return `${d.year}-${pad(d.month + 1)}`;
}

function targetMonthKey(): string {
  const { year, month } = nextMonthFromNow();
  return monthPeriodKey(year, month);
}

/** Days until the 1st of the month that starts NOTICE_DAYS from now. */
function daysUntilNextFirst(): number {
  return daysUntilNextBusinessMonth();
}

function activeFamilies() {
  return prisma.family.findMany({
    where: { subscriptionId: { not: null }, subscriptionStatus: { not: "canceled" } },
  });
}

interface JobResult {
  ok: boolean;
  detail?: string;
}

interface Job {
  name: JobName;
  windowKey: string;
  isDue: () => boolean;
  run: () => Promise<JobResult>;
  /** Untracked jobs run on every invocation (no ScheduledRun dedupe). */
  tracked?: boolean;
}

const jobs: Job[] = [
  {
    name: "billing",
    windowKey: monthKey(),
    isDue: () => true, // due as soon as it hasn't run yet this month
    run: async () => {
      const families = await activeFamilies();
      const failed: string[] = [];
      let synced = 0;
      for (const family of families) {
        try {
          const { summary } = await syncNextMonthQuantities(family.id);
          if (summary.totalAmount > 0) synced++;
        } catch (err) {
          failed.push(`${family.name}: ${String(err)}`);
        }
      }
      return {
        ok: failed.length === 0,
        detail:
          `synced ${synced}/${families.length} families` +
          (failed.length ? `; failed: ${failed.join(" | ")}` : ""),
      };
    },
  },
  {
    name: "charge-notice",
    windowKey: targetMonthKey(),
    isDue: () => {
      const days = daysUntilNextFirst();
      return days >= 1 && days <= NOTICE_DAYS;
    },
    run: async () => {
      const families = await activeFamilies();
      const { year, month } = nextMonthFromNow();
      const periodKey = monthPeriodKey(year, month);
      const periodLabel = monthPeriodLabel(year, month);
      const { start: billingStart, end: billingEnd } = businessMonthRange(year, month);

      let sent = 0;
      const failed: string[] = [];
      for (const family of families) {
        try {
          // Sync before notifying so Stripe has the same quantities the notice shows.
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
          if (res.sent) {
            sent++;
          } else if (res.error !== CHARGE_NOTICE_ALREADY_SENT) {
            // "already sent" is a once-per-month dedupe, not a failure.
            failed.push(`${family.name}: ${res.error}`);
          }
        } catch (err) {
          failed.push(`${family.name}: ${String(err)}`);
        }
      }
      // Report failures so the ScheduledRun row is marked FAILED and the next
      // invocation retries (only families that didn't get their notice will re-send).
      return {
        ok: failed.length === 0,
        detail:
          `sent ${sent}/${families.length} notices` +
          (failed.length ? `; failed: ${failed.join(" | ")}` : ""),
      };
    },
  },
  {
    name: "reminders",
    windowKey: nowKey(),
    isDue: () => true, // due as soon as it hasn't run today
    run: async () => {
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
        const res = await sendLessonReminder(
          family,
          lesson.id,
          lesson.student.name,
          lesson.date,
          lesson.endTime
        );
        if (res.sent) sent.push(lesson.id);
      }
      return { ok: true, detail: `sent ${sent.length}/${lessons.length} reminders` };
    },
  },
  {
    // Mid-month signups: charge any queued bill whose 24h notice window has
    // elapsed. Untracked — runs on every invocation (rows are claimed
    // PENDING → PROCESSING, so it's idempotent and self-skipping).
    name: "midmonth-billing",
    windowKey: nowKey(),
    isDue: () => true,
    tracked: false,
    run: async () => {
      const results = await chargeDuePendingCharges();
      const failed = results.filter((r) => !r.ok);
      return {
        ok: failed.length === 0,
        detail:
          `charged ${results.length - failed.length}/${results.length}` +
          (failed.length
            ? `; failed: ${failed.map((f) => `${f.family}: ${f.error}`).join(" | ")}`
            : ""),
      };
    },
  },
];

async function executeJob(job: Job, force: boolean): Promise<boolean> {
  const tracked = job.tracked !== false;
  const key = job.windowKey;

  if (tracked) {
    const existing = await prisma.scheduledRun.findUnique({
      where: { job_windowKey: { job: job.name, windowKey: key } },
    });
    if (existing?.status === "SUCCESS") {
      console.log(`[${job.name}] ${key}: already ran (${existing.finishedAt?.toISOString()}) — skip`);
      return true;
    }

    if (!force && !job.isDue()) {
      console.log(`[${job.name}] ${key}: not due today — skip`);
      return true;
    }
  }

  const startedAt = new Date();
  console.log(`[${job.name}] ${key}: running…`);
  let result: JobResult;
  try {
    result = await job.run();
  } catch (err) {
    result = { ok: false, detail: String(err) };
  }

  if (tracked) {
    await prisma.scheduledRun.upsert({
      where: { job_windowKey: { job: job.name, windowKey: key } },
      update: { status: result.ok ? "SUCCESS" : "FAILED", detail: result.detail ?? null, finishedAt: new Date() },
      create: {
        job: job.name,
        windowKey: key,
        status: result.ok ? "SUCCESS" : "FAILED",
        detail: result.detail ?? null,
        startedAt,
        finishedAt: new Date(),
      },
    });
  }

  console.log(`[${job.name}] ${key}: ${result.ok ? "SUCCESS" : "FAILED"} — ${result.detail ?? ""}`);
  return result.ok;
}

async function main() {
  const args = process.argv.slice(2);
  const listOnly = args.includes("--list");
  const force = args.includes("--force");
  const requested = args.filter((a) => !a.startsWith("--"));

  const selected = jobs.filter((j) => requested.length === 0 || requested.includes(j.name));
  if (selected.length === 0) {
    console.error("Unknown job(s): " + requested.join(", "));
    console.error("Available: " + jobs.map((j) => j.name).join(", "));
    process.exit(2);
  }

  let failed = 0;
  for (const job of selected) {
    if (listOnly) {
      if (job.tracked === false) {
        console.log(`[${job.name}] untracked — runs on every invocation`);
        continue;
      }
      const existing = await prisma.scheduledRun.findUnique({
        where: { job_windowKey: { job: job.name, windowKey: job.windowKey } },
      });
      const status = existing?.status === "SUCCESS" ? "done" : job.isDue() ? "due" : "not-due";
      console.log(`[${job.name}] window=${job.windowKey} status=${status}`);
      continue;
    }
    if (!(await executeJob(job, force))) failed++;
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().finally(() => prisma.$disconnect());
