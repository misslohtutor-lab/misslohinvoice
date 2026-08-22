import { prisma } from "@/lib/prisma";
import { badge, formatDate, formatTime } from "@/lib/ui";
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
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Scheduled jobs</h1>
        <p className="text-sm text-zinc-500">
          Jobs run every 30 minutes via cron and only fire when they are due and not yet done, so missed runs are
          recovered automatically. Tracked in the <code className="rounded bg-zinc-100 px-1">ScheduledRun</code> table.
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        {nextRuns.map((j) => (
          <div key={j.name} className="rounded-xl border border-zinc-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium">{j.label}</span>
              <span className={`rounded px-2 py-0.5 text-xs ${badge(j.status === "ran" ? "SUCCESS" : j.status === "due" ? "due" : "next")}`}>
                {j.status === "ran" ? "done" : j.status === "due" ? "due" : "scheduled"}
              </span>
            </div>
            <p className="mt-1 text-xs text-zinc-500">{j.cadence}</p>
            <p className="mt-2 text-sm text-zinc-800">
              {j.status === "ran"
                ? "Next: " + formatDate(j.next, { month: "short", day: "numeric", year: "numeric" })
                : j.status === "due"
                  ? "Runs today"
                  : formatDate(j.next, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
            </p>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white">
        <h2 className="border-b border-zinc-200 px-4 py-3 font-semibold">Past runs</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-zinc-500">
              <th className="px-4 py-2">Job</th>
              <th className="px-4 py-2">Window</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Started</th>
              <th className="px-4 py-2">Finished</th>
              <th className="px-4 py-2">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {runs.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2 font-medium">{r.job}</td>
                <td className="px-4 py-2 text-zinc-600">{r.windowKey}</td>
                <td className="px-4 py-2">
                  <span className={`inline-block rounded px-2 py-0.5 text-xs ${badge(r.status)}`}>{r.status}</span>
                </td>
                <td className="px-4 py-2 text-zinc-600">
                  {formatDate(r.startedAt)} {formatTime(r.startedAt)}
                </td>
                <td className="px-4 py-2 text-zinc-600">
                  {r.finishedAt ? `${formatDate(r.finishedAt)} ${formatTime(r.finishedAt)}` : "—"}
                </td>
                <td className="px-4 py-2 text-zinc-600">{r.detail ?? "—"}</td>
              </tr>
            ))}
            {runs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">
                  No jobs have run yet. They will appear here after the cron fires.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
