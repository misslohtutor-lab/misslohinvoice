import { prisma } from "@/lib/prisma";
import { addStudent, addWeeklySlot, deleteStudent, deleteWeeklySlot, deleteFamily, updateFamilyEmail } from "@/lib/admin-actions";
import { computeFamilyMonth } from "@/lib/scheduling";
import { businessMonthRange, currentBusinessMonthRange, nextBusinessMonth, businessDateInput, businessTimeInput } from "@/lib/time";
import { money, formatDate, formatTime, badge, QUARTER_HOUR_TIMES } from "@/lib/ui";
import { OnboardingButton } from "@/components/onboarding-button";
import { CreateSubscriptionButton } from "@/components/create-subscription-button";
import { BillingEmailButton } from "@/components/billing-email-button";
import { SendInvoiceButton } from "@/components/send-invoice-button";
import { GenerateLessonsButton } from "@/components/generate-lessons-button";
import { FamilyTimezoneForm } from "@/components/family-timezone-form";
import { ConfirmButton } from "@/components/confirm-button";
import { MarkLessonButton } from "@/components/mark-lesson-button";
import { EditLessonButton } from "@/components/edit-lesson-button";
import { EditStudentButton } from "@/components/edit-student-button";
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
  if (!family) return <p className="text-muted-foreground">Family not found</p>;

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
  // Credits not yet marked applied to an invoiced month are the ones that will
  // offset the next bill (mirrors getUnappliedCreditAmount).
  const credits = family.adjustments
    .filter((a) => a.appliedToInvoice === null)
    .reduce((acc, a) => acc + (a.remainingAmount ?? a.amount), 0);
  const netTotal = nextMonth.totalAmount + credits;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{family.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${badge(family.subscriptionStatus ?? (family.subscriptionId ? "active" : "none"))}`}>
                {family.subscriptionStatus ?? (family.subscriptionId ? "active" : "no subscription")}
              </span>
              <span className="text-muted-foreground">
                card {family.cardLast4 ? `•••• ${family.cardLast4}` : "not saved"}
              </span>
              {family.cardLast4 && !family.subscriptionId && (
                <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-600/20">
                  card saved — subscription pending
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            <form action={updateFamilyEmail} className="inline-flex items-center gap-2">
              <input type="hidden" name="familyId" value={family.id} />
              <input name="email" type="email" required defaultValue={family.email} className="input w-auto py-1 text-sm" />
              <button className="btn btn-secondary px-2.5 py-1 text-xs">Update email</button>
            </form>
            <span>· phone {family.phone ?? "—"}</span>
            <FamilyTimezoneForm familyId={family.id} initialTimeZone={family.timeZone} />
          </div>
        </div>

        <div className="flex flex-wrap items-start gap-2 lg:flex-col lg:items-end">
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
      <section className="card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">
            Billing preview — {new Date(year, month).toLocaleString("en-US", { month: "long", year: "numeric" })}
          </h2>
          <BillingEmailButton familyId={family.id} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-4">Student</th>
                <th className="py-2 pr-4">Lessons</th>
                <th className="py-2 pr-4">Hours</th>
                <th className="py-2 pr-4">Rate</th>
                <th className="py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {nextMonth.students.map((l) => (
                <tr key={l.studentId} className="border-b border-border/60">
                  <td className="py-2 pr-4 font-medium">{l.studentName}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{l.lessons}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{l.hours}h</td>
                  <td className="py-2 pr-4 text-muted-foreground">{money(l.rate)}/hr</td>
                  <td className="py-2 text-right font-medium tabular-nums">{money(l.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="pt-3 pr-4 font-semibold">Total</td>
                <td></td>
                <td className="pt-3 pr-4 text-muted-foreground">{nextMonth.totalHours}h</td>
                <td></td>
                <td className="pt-3 text-right font-semibold tabular-nums">{money(nextMonth.totalAmount)}</td>
              </tr>
              {credits !== 0 && (
                <tr className="text-emerald-700">
                  <td className="pt-1 pr-4">Credits (missed lessons)</td>
                  <td></td><td></td><td></td>
                  <td className="pt-1 text-right tabular-nums">{money(Math.abs(credits))}</td>
                </tr>
              )}
              {credits !== 0 && (
                <tr>
                  <td className="pt-1 pr-4 font-semibold">Net due</td>
                  <td></td><td></td><td></td>
                  <td className="pt-1 text-right font-semibold tabular-nums">{money(netTotal)}</td>
                </tr>
              )}
            </tfoot>
          </table>
        </div>

        <div className="mt-4 border-t border-border pt-4">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Scheduled lessons for this bill ({new Date(year, month).toLocaleString("en-US", { month: "long", year: "numeric" })})
          </h3>
          {billingMonthScheduled.length === 0 ? (
            <p className="text-sm text-muted-foreground">No scheduled lessons for the billing month.</p>
          ) : (
            <ul className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
              {billingMonthScheduled.map((l) => (
                <li key={l.id} className="flex items-center justify-between text-foreground">
                  <span>
                    <span className="font-medium">{l.student.name}</span>
                    <span className="text-muted-foreground"> · {formatDate(l.date, { weekday: "short", month: "short", day: "numeric" })} {formatTime(l.date)}</span>
                  </span>
                  <span className="text-muted-foreground">{l.durationHours}h · {money(l.durationHours * l.student.hourlyRate)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Mid-month billing (on-demand email → charge 24h later) */}
      {family.pendingCharges.length > 0 && (
        <section className="card p-5">
          <h2 className="mb-3 font-semibold">Mid-month billing</h2>
          <ul className="space-y-2 text-sm">
            {family.pendingCharges.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 text-foreground">
                <span className="flex items-center gap-2">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${badge(p.status)}`}>{p.status}</span>
                  <span className="font-medium">{money(p.amount)}</span>
                  <span className="text-muted-foreground">
                    · emailed {formatDate(p.emailSentAt, { month: "short", day: "numeric" })} · charge {formatDate(p.chargeAt, { weekday: "short", month: "short", day: "numeric" })} {formatTime(p.chargeAt)}
                  </span>
                  {p.invoiceId && <span className="text-muted-foreground">· {p.invoiceId}</span>}
                </span>
                {p.error && <span className="max-w-[50%] truncate text-xs text-red-600" title={p.error}>{p.error}</span>}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            &ldquo;Send this month&apos;s billing email&rdquo; emails the family an itemized notice and schedules the charge ~24 hours later. A failed charge can be retried with the same button.
          </p>
        </section>
      )}

      {/* Students */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Students</h2>
          <details className="relative">
            <summary className="btn btn-primary cursor-pointer list-none [&::-webkit-details-marker]:hidden">Add student</summary>
            <form action={addStudent} className="card absolute right-0 z-10 mt-2 w-72 space-y-3 p-4 shadow-pop">
              <input type="hidden" name="familyId" value={family.id} />
              <div>
                <label className="label">Name</label>
                <input name="name" required className="input" />
              </div>
              <div>
                <label className="label">Hourly rate ($)</label>
                <input name="hourlyRate" type="number" step="0.04" min="0.04" required className="input" />
              </div>
              <div>
                <label className="label">Subject (optional)</label>
                <input name="subject" className="input" />
              </div>
              <button className="btn btn-primary w-full">Add student</button>
            </form>
          </details>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {family.students.map((s) => (
            <div key={s.id} className="card p-5">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{s.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {money(s.hourlyRate)}/hr{s.subject ? ` · ${s.subject}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <EditStudentButton
                    studentId={s.id}
                    name={s.name}
                    hourlyRate={s.hourlyRate}
                    subject={s.subject}
                  />
                  <form action={deleteStudent}>
                    <input type="hidden" name="id" value={s.id} />
                    <ConfirmButton label="Delete" confirmText={`Delete ${s.name} and all of their lessons? This cannot be undone.`} />
                  </form>
                </div>
              </div>

              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Weekly schedule</h3>
              <ul className="mb-3 space-y-1 text-sm">
                {s.weeklySlots.map((sl) => (
                  <li key={sl.id} className="flex items-center justify-between gap-2 text-foreground">
                    <span className="rounded-lg bg-muted px-2 py-1 text-xs font-medium">
                      {sl.dayOfWeek} · {sl.startTime}–{sl.endTime}
                    </span>
                    <form action={deleteWeeklySlot}>
                      <input type="hidden" name="id" value={sl.id} />
                      <ConfirmButton
                        label="Delete"
                        confirmText={`Delete the ${sl.dayOfWeek} ${sl.startTime}–${sl.endTime} slot? Its upcoming scheduled lessons will also be removed from the schedule and billing.`}
                      />
                    </form>
                  </li>
                ))}
                {s.weeklySlots.length === 0 && <li className="text-muted-foreground">No weekly slots.</li>}
              </ul>

              <form action={addWeeklySlot} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="studentId" value={s.id} />
                <div className="flex flex-wrap items-center gap-1">
                  <select name="dayOfWeek" className="input w-auto py-1 text-xs">
                    {DAYS.map((d) => <option key={d} value={d}>{d.slice(0, 3)}</option>)}
                  </select>
                  <select name="startTime" className="input w-auto py-1 text-xs">
                    {QUARTER_HOUR_TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <span className="self-center text-xs text-muted-foreground">–</span>
                  <select name="endTime" className="input w-auto py-1 text-xs">
                    {QUARTER_HOUR_TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <button className="btn btn-secondary px-3 py-1 text-xs">+ slot</button>
              </form>

              <div className="mt-3">
                <GenerateLessonsButton studentId={s.id} weeksAhead={10} />
              </div>

              <div className="mt-4 border-t border-border pt-3">
                <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Lessons ({listLabel})
                </h4>
                {s.lessons.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No lessons in this window. Add a weekly slot and generate lessons.</p>
                ) : (
                  <ul className="space-y-1.5 text-sm">
                    {s.lessons.map((l) => (
                      <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 text-foreground">
                        <span>
                          {formatDate(l.date, { weekday: "short", month: "short", day: "numeric" })} · {formatTime(l.date)} · {l.durationHours}h
                          {l.status === "MISSED" && <span className="ml-1.5 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-600/20">missed</span>}
                          {l.status === "MISSED_HALF" && <span className="ml-1.5 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-600/20">missed (half)</span>}
                          {l.status === "SKIPPED" && <span className="ml-1.5 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">skipped</span>}
                        </span>
                        <span className="flex flex-wrap items-center gap-3">
                          {l.status === "SCHEDULED" ? (
                            <>
                              <MarkLessonButton
                                lessonId={l.id}
                                status="SKIPPED"
                                label="Skip"
                                confirmText={`Skip the ${formatDate(l.date)} lesson (remove from calendar)? No credit is given.`}
                              />
                              <MarkLessonButton
                                lessonId={l.id}
                                status="MISSED"
                                label="Miss"
                                confirmText={`Mark the ${formatDate(l.date)} lesson as missed (illness)? The family gets credit for the next bill.`}
                              />
                              <MarkLessonButton
                                lessonId={l.id}
                                status="MISSED_HALF"
                                label="Miss half"
                                confirmText={`Mark the ${formatDate(l.date)} lesson as half missed (student attended part)? The family gets half credit for the next bill.`}
                              />
                            </>
                          ) : l.status === "MISSED" || l.status === "MISSED_HALF" || l.status === "SKIPPED" ? (
                            <MarkLessonButton
                              lessonId={l.id}
                              status="SCHEDULED"
                              label="Restore"
                              confirmText="Restore this lesson to the schedule?"
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">{l.status}</span>
                          )}
                          <EditLessonButton
                            lessonId={l.id}
                            dateStr={businessDateInput(l.date)}
                            startStr={businessTimeInput(l.date)}
                          />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ))}
          {family.students.length === 0 && (
            <p className="text-muted-foreground">No students yet — add one above.</p>
          )}
        </div>
      </section>

      {/* Ledger */}
      <section className="card p-5">
        <h2 className="mb-4 font-semibold">Billing history</h2>
        {family.ledgerLines.length === 0 ? (
          <p className="text-sm text-muted-foreground">No charges yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-4">Period</th>
                  <th className="py-2 pr-4">Lessons</th>
                  <th className="py-2 pr-4">Hours</th>
                  <th className="py-2 pr-4">Rate</th>
                  <th className="py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {family.ledgerLines.map((l) => (
                  <tr key={l.id} className="border-b border-border/60">
                    <td className="py-2 pr-4 text-muted-foreground">{formatDate(l.periodStart)} – {formatDate(l.periodEnd)}</td>
                    <td className="py-2 pr-4">—</td>
                    <td className="py-2 pr-4">{l.hours}h</td>
                    <td className="py-2 pr-4">{money(l.rate)}/hr</td>
                    <td className="py-2 text-right font-medium tabular-nums">{money(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {family.adjustments.length > 0 && (
          <div className="mt-4 border-t border-border pt-4">
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Missed-lesson credits · available {money(Math.abs(credits))}
            </h3>
            <ul className="space-y-1.5 text-sm">
              {family.adjustments.map((a) => {
                const sentStripe = a.stripeBalanceTransactionId !== null;
                const applied = a.appliedToInvoice !== null;
                return (
                  <li key={a.id} className="flex items-center justify-between gap-2 text-muted-foreground">
                    <span className="flex items-center gap-2">
                      {a.reason}
                      {applied && <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">applied to invoice</span>}
                      {!applied && sentStripe && <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">applied via Stripe</span>}
                    </span>
                    <span className={`font-medium tabular-nums ${a.amount < 0 ? "text-emerald-700" : "text-foreground"}`}>{money(a.amount)}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
