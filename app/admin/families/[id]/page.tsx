import { prisma } from "@/lib/prisma";
import { addStudent, addWeeklySlot, deleteStudent, deleteWeeklySlot, deleteFamily, markLesson, updateFamilyEmail } from "@/lib/admin-actions";
import { computeFamilyMonth } from "@/lib/scheduling";
import { businessMonthRange, currentBusinessMonthRange, nextBusinessMonth } from "@/lib/time";
import { money, formatDate, formatTime, badge, QUARTER_HOUR_TIMES } from "@/lib/ui";
import { OnboardingButton } from "@/components/onboarding-button";
import { CreateSubscriptionButton } from "@/components/create-subscription-button";
import { BillingEmailButton } from "@/components/billing-email-button";
import { SendInvoiceButton } from "@/components/send-invoice-button";
import { GenerateLessonsButton } from "@/components/generate-lessons-button";
import { ConfirmButton } from "@/components/confirm-button";
import { DayOfWeek } from "@/generated/prisma/enums";

const DAYS = Object.values(DayOfWeek);

export default async function FamilyDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const current = currentBusinessMonthRange();
  const curYear = current.year;
  const curMonth = current.month;
  // Show lessons from roughly the last year back through the end of the month after next,
  // so past lessons can also be marked as missed/skipped.
  const listStart = businessMonthRange(curYear - 1, curMonth).start;
  const listEnd = businessMonthRange(curYear, curMonth + 3).start;
  const listLabel = `${listStart.toLocaleString("en-US", { month: "short", year: "numeric" })} → ${new Date(curYear, curMonth + 2, 1).toLocaleString("en-US", { month: "short", year: "numeric" })}`;

  const family = await prisma.family.findUnique({
    where: { id },
    include: {
      students: {
        include: {
          weeklySlots: { where: { active: true }, orderBy: { dayOfWeek: "asc" } },
          lessons: {
            where: {
              status: { not: "CANCELLED" },
              date: { gte: listStart, lt: listEnd },
            },
            orderBy: { date: "asc" },
          },
        },
      },
      adjustments: { orderBy: { createdAt: "desc" }, take: 25 },
      ledgerLines: { orderBy: { createdAt: "desc" }, take: 25 },
      pendingCharges: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
  if (!family) return <p>Family not found</p>;

  const { year, month } = nextBusinessMonth();
  const { start: billingStart, end: billingEnd } = businessMonthRange(year, month);
  const billingMonthScheduled = await prisma.lesson.findMany({
    where: {
      student: { familyId: id },
      status: { in: ["SCHEDULED", "COMPLETED"] },
      date: { gte: billingStart, lt: billingEnd },
    },
    include: { student: true },
    orderBy: { date: "asc" },
  });
  const nextMonth = await computeFamilyMonth(id, year, month);
  const credits = family.adjustments
    .filter((a) => a.appliedToInvoice === null)
    .reduce((acc, a) => acc + (a.remainingAmount ?? a.amount), 0);
  const netTotal = nextMonth.totalAmount + credits;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{family.name}</h1>
          <div className="text-sm text-zinc-500">
            <form action={updateFamilyEmail} className="inline-flex items-center gap-2">
              <input type="hidden" name="familyId" value={family.id} />
              <input name="email" type="email" required defaultValue={family.email} className="rounded border border-zinc-300 px-2 py-1 text-sm" />
              <button className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100">Update email</button>
            </form>
            · phone {family.phone ?? "—"}
          </div>
          <p className="mt-1 text-sm">
            Subscription: <span className="font-medium">{family.subscriptionStatus ?? "none"}</span>
            <span className="text-zinc-400"> · card {family.cardLast4 ? `···· ${family.cardLast4}` : "not saved"}</span>
            {family.cardLast4 && !family.subscriptionId && (
              <span className="ml-2 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">
                card saved — subscription pending
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {family.cardLast4 && !family.subscriptionId && <CreateSubscriptionButton familyId={family.id} />}
          {!family.subscriptionId && <SendInvoiceButton familyId={family.id} />}
          <OnboardingButton familyId={family.id} />
          <form action={deleteFamily}>
            <input type="hidden" name="id" value={family.id} />
            <ConfirmButton
              label="Delete family"
              confirmText={`Delete ${family.name} and all of their students, lessons, and billing history? This cannot be undone.`}
            />
          </form>
        </div>
      </div>

      {/* Next month billing preview */}
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Billing preview — {new Date(year, month).toLocaleString("en-US", { month: "long", year: "numeric" })}</h2>
          <div className="flex items-center gap-2">
            <BillingEmailButton familyId={family.id} />
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-zinc-500">
              <th className="py-1 pr-4">Student</th>
              <th className="py-1 pr-4">Lessons</th>
              <th className="py-1 pr-4">Hours</th>
              <th className="py-1 pr-4">Rate</th>
              <th className="py-1 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {nextMonth.students.map((l) => (
              <tr key={l.studentId} className="border-b border-zinc-50">
                <td className="py-2 pr-4 font-medium">{l.studentName}</td>
                <td className="py-2 pr-4 text-zinc-600">{l.lessons}</td>
                <td className="py-2 pr-4 text-zinc-600">{l.hours}h</td>
                <td className="py-2 pr-4 text-zinc-600">{money(l.rate)}/hr</td>
                <td className="py-2 text-right font-medium">{money(l.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="pt-2 pr-4 font-semibold">Total</td>
              <td></td>
              <td className="pt-2 pr-4 text-zinc-600">{nextMonth.totalHours}h</td>
              <td></td>
              <td className="pt-2 text-right font-semibold">{money(nextMonth.totalAmount)}</td>
            </tr>
            {credits !== 0 && (
              <tr className="text-emerald-700">
                <td className="pt-1 pr-4">Credits (missed lessons)</td>
                <td></td><td></td><td></td>
                <td className="pt-1 text-right">{money(Math.abs(credits))}</td>
              </tr>
            )}
            {credits !== 0 && (
              <tr>
                <td className="pt-1 pr-4 font-semibold">Net due</td>
                <td></td><td></td><td></td>
                <td className="pt-1 text-right font-semibold">{money(netTotal)}</td>
              </tr>
            )}
          </tfoot>
        </table>

        <div className="mt-4 border-t border-zinc-100 pt-3">
          <h3 className="mb-1 text-xs font-medium uppercase text-zinc-400">
            Scheduled lessons for this bill ({new Date(year, month).toLocaleString("en-US", { month: "long", year: "numeric" })})
          </h3>
          {billingMonthScheduled.length === 0 ? (
            <p className="text-sm text-zinc-400">No scheduled lessons for the billing month.</p>
          ) : (
            <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              {billingMonthScheduled.map((l) => (
                <li key={l.id} className="flex items-center justify-between text-zinc-700">
                  <span>
                    <span className="font-medium">{l.student.name}</span> · {formatDate(l.date, { weekday: "short", month: "short", day: "numeric" })} {formatTime(l.date)}
                  </span>
                  <span className="text-zinc-500">{l.durationHours}h · {money(l.durationHours * l.student.hourlyRate)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Mid-month billing (on-demand email → charge 24h later) */}
      {family.pendingCharges.length > 0 && (
        <section className="rounded-xl border border-zinc-200 bg-white p-4">
          <h2 className="mb-2 font-semibold">Mid-month billing</h2>
          <ul className="space-y-1 text-sm">
            {family.pendingCharges.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-4 text-zinc-700">
                <span>
                  <span className={`mr-2 inline-block rounded px-2 py-0.5 text-xs ${badge(p.status)}`}>{p.status}</span>
                  <span className="font-medium">{money(p.amount)}</span>
                  <span className="text-zinc-500">
                    {" "}· emailed {formatDate(p.emailSentAt, { month: "short", day: "numeric" })} · charge {formatDate(p.chargeAt, { weekday: "short", month: "short", day: "numeric" })} {formatTime(p.chargeAt)}
                  </span>
                  {p.invoiceId && <span className="text-zinc-500"> · {p.invoiceId}</span>}
                </span>
                {p.error && <span className="max-w-[50%] truncate text-xs text-red-600" title={p.error}>{p.error}</span>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-zinc-400">
            &ldquo;Send this month&apos;s billing email&rdquo; emails the family an itemized notice and schedules the charge ~24 hours later. A failed charge can be retried with the same button.
          </p>
        </section>
      )}

      {/* Students */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Students</h2>
          <details className="relative">
            <summary className="cursor-pointer rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white">Add student</summary>
            <form action={addStudent} className="absolute right-0 z-10 mt-2 w-64 rounded-xl border border-zinc-200 bg-white p-4 shadow-lg">
              <input type="hidden" name="familyId" value={family.id} />
              <label className="mb-1 block text-sm">Name</label>
              <input name="name" required className="mb-3 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm" />
              <label className="mb-1 block text-sm">Hourly rate ($)</label>
                   <input name="hourlyRate" type="number" step="0.04" min="0.04" required className="mb-3 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm" />
              <label className="mb-1 block text-sm">Subject (optional)</label>
              <input name="subject" className="mb-3 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm" />
              <button className="w-full rounded-lg bg-zinc-900 py-2 text-sm text-white">Add</button>
            </form>
          </details>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {family.students.map((s) => (
            <div key={s.id} className="rounded-xl border border-zinc-200 bg-white p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="font-semibold">{s.name}</div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-zinc-500">{money(s.hourlyRate)}/hr{s.subject ? ` · ${s.subject}` : ""}</span>
                  <form action={deleteStudent}>
                    <input type="hidden" name="id" value={s.id} />
                    <ConfirmButton label="Delete" confirmText={`Delete ${s.name} and all of their lessons? This cannot be undone.`} />
                  </form>
                </div>
              </div>

              <h3 className="mb-1 text-xs font-medium uppercase text-zinc-400">Weekly schedule</h3>
              <ul className="mb-3 space-y-1 text-sm">
                {s.weeklySlots.map((sl) => (
                  <li key={sl.id} className="flex items-center justify-between gap-2 text-zinc-700">
                    <span>{sl.dayOfWeek} · {sl.startTime}–{sl.endTime}</span>
                    <form action={deleteWeeklySlot}>
                      <input type="hidden" name="id" value={sl.id} />
                      <ConfirmButton
                        label="Delete"
                        confirmText={`Delete the ${sl.dayOfWeek} ${sl.startTime}–${sl.endTime} slot? Its upcoming scheduled lessons will also be removed from the schedule and billing.`}
                      />
                    </form>
                  </li>
                ))}
                {s.weeklySlots.length === 0 && <li className="text-zinc-400">No weekly slots.</li>}
              </ul>

              <form action={addWeeklySlot} className="grid grid-cols-[1fr_auto] gap-2">
                <input type="hidden" name="studentId" value={s.id} />
                <div className="flex gap-1">
                  <select name="dayOfWeek" className="rounded border border-zinc-300 px-2 py-1 text-xs">
                    {DAYS.map((d) => <option key={d} value={d}>{d.slice(0, 3)}</option>)}
                  </select>
                  <select name="startTime" className="rounded border border-zinc-300 px-2 py-1 text-xs">
                    {QUARTER_HOUR_TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <span className="self-center text-zinc-400 text-xs">–</span>
                  <select name="endTime" className="rounded border border-zinc-300 px-2 py-1 text-xs">
                    {QUARTER_HOUR_TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <button className="rounded-lg bg-zinc-900 px-3 py-1 text-xs text-white">+ slot</button>
              </form>

              <div className="mt-2">
                <GenerateLessonsButton studentId={s.id} weeksAhead={10} />
              </div>

              <div className="mt-3 border-t border-zinc-100 pt-2">
                <h4 className="mb-1 text-xs font-medium uppercase text-zinc-400">
                  Lessons ({listLabel})
                </h4>
                {s.lessons.length === 0 ? (
                  <p className="text-sm text-zinc-400">No lessons in this window. Add a weekly slot and generate lessons.</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {s.lessons.map((l) => (
                      <li key={l.id} className="flex items-center justify-between gap-2 text-zinc-700">
                        <span>
                          {formatDate(l.date, { weekday: "short", month: "short", day: "numeric" })} · {formatTime(l.date)} · {l.durationHours}h
                          {l.status === "MISSED" && <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">missed</span>}
                          {l.status === "SKIPPED" && <span className="ml-1 rounded bg-zinc-200 px-1.5 py-0.5 text-xs text-zinc-600">skipped</span>}
                        </span>
                        {l.status === "SCHEDULED" ? (
                          <span className="flex items-center gap-2">
                            <form action={markLesson}>
                              <input type="hidden" name="id" value={l.id} />
                              <input type="hidden" name="status" value="SKIPPED" />
                              <ConfirmButton
                                label="Skip"
                                confirmText={`Skip the ${formatDate(l.date)} lesson (remove from calendar)? No credit is given.`}
                              />
                            </form>
                            <form action={markLesson}>
                              <input type="hidden" name="id" value={l.id} />
                              <input type="hidden" name="status" value="MISSED" />
                              <ConfirmButton
                                label="Miss"
                                confirmText={`Mark the ${formatDate(l.date)} lesson as missed (illness)? The family gets credit for the next bill.`}
                              />
                            </form>
                          </span>
                        ) : l.status === "MISSED" || l.status === "SKIPPED" ? (
                          <form action={markLesson}>
                            <input type="hidden" name="id" value={l.id} />
                            <input type="hidden" name="status" value="SCHEDULED" />
                            <ConfirmButton label="Restore" confirmText="Restore this lesson to the schedule?" />
                          </form>
                        ) : (
                          <span className="text-xs text-zinc-400">{l.status}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ))}
          {family.students.length === 0 && (
            <p className="text-zinc-400">No students yet — add one above.</p>
          )}
        </div>
      </section>

      {/* Ledger */}
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="mb-3 font-semibold">Billing history</h2>
        {family.ledgerLines.length === 0 ? (
          <p className="text-sm text-zinc-400">No charges yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-zinc-500">
                <th className="py-1 pr-4">Period</th>
                <th className="py-1 pr-4">Lessons</th>
                <th className="py-1 pr-4">Hours</th>
                <th className="py-1 pr-4">Rate</th>
                <th className="py-1 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {family.ledgerLines.map((l) => (
                <tr key={l.id} className="border-b border-zinc-50">
                  <td className="py-2 pr-4 text-zinc-600">{formatDate(l.periodStart)} – {formatDate(l.periodEnd)}</td>
                  <td className="py-2 pr-4">—</td>
                  <td className="py-2 pr-4">{l.hours}h</td>
                  <td className="py-2 pr-4">{money(l.rate)}/hr</td>
                  <td className="py-2 text-right font-medium">{money(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {family.adjustments.length > 0 && (
          <div className="mt-4 border-t border-zinc-100 pt-3">
            <h3 className="mb-1 text-xs font-medium uppercase text-zinc-400">
              Missed-lesson credits · total {money(Math.abs(credits))}
            </h3>
            <ul className="space-y-1 text-sm">
              {family.adjustments.map((a) => (
                <li key={a.id} className="flex justify-between text-zinc-600">
                  <span>{a.reason}</span>
                  <span className={a.amount < 0 ? "text-emerald-700" : "text-zinc-700"}>{money(a.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
