import { prisma } from "@/lib/prisma";
import { badge, formatDate, formatTime } from "@/lib/ui";
import { PageHeader } from "@/components/ui";
import { businessDateParts, businessDateTime, monthPeriodKey } from "@/lib/time";

export const revalidate = 0;

const NOTICE_DAYS = Number(process.env.NOTICE_DAYS_BEFORE ?? "3");

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function monthKey(d: Date): string {
  const { year, month } = businessDateParts(d);
  return monthPeriodKey(year, month);
}

function dayKey(d: Date): string {
  const { year, month, day } = businessDateParts(d);
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

function startOfDay(d: Date): Date {
  const { year, month, day } = businessDateParts(d);
  return businessDateTime(year, month, day);
}

interface NextRun {
  name: string;
  label: string;
  cadence: string;
  status: "due" | "ran" | "next";
  next: Date;
}

export default async function JobsPage() {
  const runs = await prisma.scheduledRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 100,
  });
  const ran = (job: string, key: string) =>
    runs.some((r) => r.job === job && r.windowKey === key && r.status === "SUCCESS");

  const now = new Date();
  const today = startOfDay(now);

  // ---- Billing: once per month, runs when due and un-run ----
  const billingKey = monthKey(now);
  const billingRan = ran("billing", billingKey);
  const billingNext = billingRan
    ? new Date(now.getFullYear(), now.getMonth() + 1, 1)
    : today;

  // ---- Charge notice: NOTICE_DAYS before the upcoming 1st ----
  const targetMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const daysUntil = Math.round((targetMonth.getTime() - today.getTime()) / 86400000);
  let noticeNext: Date;
  let noticeKey: string;
  if (daysUntil >= 1 && daysUntil <= NOTICE_DAYS) {
    // Inside the notice window (incl. catch-up): due now for the upcoming month.
    noticeNext = today;
    noticeKey = monthKey(targetMonth);
  } else {
    // Notice for the month after next.
    const following = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 1);
    noticeNext = new Date(following.getFullYear(), following.getMonth(), 1 - NOTICE_DAYS);
    noticeKey = monthKey(following);
  }
  const noticeRan = ran("charge-notice", noticeKey);

  // ---- Reminders: daily ----
  const remindersKey = dayKey(now);
  const remindersRan = ran("reminders", remindersKey);
  const remindersNext = remindersRan
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    : today;

  const nextRuns: NextRun[] = [
    {
      name: "billing",
      label: "Sync quantities & bill",
      cadence: "1st of the month",
      status: billingRan ? "ran" : "due",
      next: billingNext,
    },
    {
      name: "charge-notice",
      label: "Charge notice emails",
      cadence: `${NOTICE_DAYS} days before the 1st`,
      status: noticeRan ? "ran" : noticeNext.getTime() === today.getTime() ? "due" : "next",
      next: noticeNext,
    },
    {
      name: "reminders",
      label: "Lesson reminder emails",
      cadence: "daily",
      status: remindersRan ? "ran" : "due",
      next: remindersNext,
    },
  ];

  return (
    <>
      <PageHeader
        title="Scheduled jobs"
        description={
          <>
            Jobs run every 30 minutes via cron and only fire when they are due and not yet done, so missed runs
            are recovered automatically. Tracked in the{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">ScheduledRun</code> table.
          </>
        }
      />

      <section className="grid gap-4 sm:grid-cols-3">
        {nextRuns.map((j) => (
          <div key={j.name} className="card p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{j.label}</span>
              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${badge(j.status === "ran" ? "SUCCESS" : j.status === "due" ? "due" : "next")}`}>
                {j.status === "ran" ? "done" : j.status === "due" ? "due" : "scheduled"}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{j.cadence}</p>
            <p className="mt-3 text-sm font-medium text-foreground">
              {j.status === "ran"
                ? "Next: " + formatDate(j.next, { month: "short", day: "numeric", year: "numeric" })
                : j.status === "due"
                  ? "Runs today"
                  : formatDate(j.next, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
            </p>
          </div>
        ))}
      </section>

      <section className="card overflow-hidden">
        <h2 className="border-b border-border px-5 py-4 font-semibold">Past runs</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-3">Job</th>
              <th className="px-5 py-3">Window</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Started</th>
              <th className="px-5 py-3">Finished</th>
              <th className="px-5 py-3">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {runs.map((r) => (
              <tr key={r.id} className="transition-colors hover:bg-muted">
                <td className="px-5 py-3 font-medium">{r.job}</td>
                <td className="px-5 py-3 text-muted-foreground">{r.windowKey}</td>
                <td className="px-5 py-3">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${badge(r.status)}`}>
                    {r.status}
                  </span>
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-muted-foreground">
                  {formatDate(r.startedAt)} {formatTime(r.startedAt)}
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-muted-foreground">
                  {r.finishedAt ? `${formatDate(r.finishedAt)} ${formatTime(r.finishedAt)}` : "—"}
                </td>
                <td className="px-5 py-3 text-muted-foreground">{r.detail ?? "—"}</td>
              </tr>
            ))}
            {runs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">
                  No jobs have run yet. They will appear here after the cron fires.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}
