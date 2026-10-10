"use client";

import { useState } from "react";
import { useActionState } from "react";
import { sendInvoiceNow, previewImmediateInvoice, type InvoiceResult, type InvoicePreview } from "@/lib/admin-actions";
import { money } from "@/lib/ui";
import { XIcon } from "./icons";

export function SendInvoiceButton({ familyId }: { familyId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<InvoicePreview | null>(null);
  const [state, action, pending] = useActionState(
    (_prev: InvoiceResult | null, fd: FormData) => sendInvoiceNow(fd),
    null
  );

  async function handleOpen() {
    setOpen(true);
    setLoading(true);
    setPreview(null);
    try {
      const result = await previewImmediateInvoice(familyId);
      setPreview(result);
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setOpen(false);
    setPreview(null);
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        title="Preview the invoice email for this month's lessons, then confirm to send. The customer pays via a Stripe payment link — no card on file required."
        className="btn btn-primary"
      >
        Send invoice now
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="mt-8 w-full max-w-2xl rounded-2xl border border-border bg-surface p-6 shadow-pop">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold">Invoice email preview</h2>
                <p className="text-xs text-muted-foreground">
                  Confirm the details below — nothing is created or sent until you confirm.
                </p>
              </div>
              <button type="button" onClick={handleClose} className="btn btn-ghost -mr-2 -mt-1 p-2" aria-label="Close">
                <XIcon width={18} height={18} />
              </button>
            </div>

            {loading && <p className="py-8 text-center text-sm text-muted-foreground">Building preview…</p>}

            {!loading && preview?.ok === false && (
              <div className="space-y-3">
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{preview.error}</p>
                <button
                  type="button"
                  onClick={handleClose}
                  className="btn btn-secondary"
                >
                  Close
                </button>
              </div>
            )}

            {!loading && preview?.ok && (
              <>
                <div className="rounded-t-xl border border-border bg-muted px-4 py-3 font-mono text-xs text-muted-foreground">
                  <p>
                    <span className="text-muted-foreground">From:</span> Miss Loh Tutoring School
                  </p>
                  <p>
                    <span className="text-muted-foreground">To:</span> {preview.to}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Subject:</span> Your invoice for {preview.periodLabel}
                  </p>
                </div>

                <div className="rounded-b-xl border border-t-0 border-border px-4 py-4 text-sm text-foreground">
                  <p>Hi {preview.familyName},</p>
                  <p className="mt-3">
                    Here is your invoice for lessons in <strong>{preview.periodLabel}</strong>
                    {preview.prepaid ? " (billed up front)" : ""}. Amount is due immediately.
                  </p>
                  <div className="mt-3 rounded-md border-l-4 border-amber-400 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <strong>Payment method:</strong> We no longer accept payment thru eTransfer. Please pay by
                    credit card using the <strong>Pay Invoice</strong> button.
                  </div>
                  <table className="mt-3 w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="py-1 pr-4">Student</th>
                        <th className="py-1 pr-4">Lessons</th>
                        <th className="py-1 pr-4">Hours</th>
                        <th className="py-1 pr-4">Rate</th>
                        <th className="py-1 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.lines.map((l) => (
                        <tr key={l.studentName} className="border-b border-border/60">
                          <td className="py-2 pr-4 font-medium">{l.studentName}</td>
                          <td className="py-2 pr-4 text-muted-foreground">{l.lessons}</td>
                          <td className="py-2 pr-4 text-muted-foreground">{l.hours}h</td>
                          <td className="py-2 pr-4 text-muted-foreground">{money(l.rate)}/hr</td>
                          <td className="py-2 text-right">{money(l.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td className="pt-2 pr-4 font-semibold">Total</td>
                        <td></td>
                        <td className="pt-2 pr-4 text-muted-foreground">{preview.totalHours}h</td>
                        <td></td>
                        <td className="pt-2 text-right font-semibold">{money(preview.grossTotal)}</td>
                      </tr>
                      {preview.creditAmount !== 0 && (
                        <tr className="text-emerald-700">
                          <td className="pt-1 pr-4">Credits (missed lessons)</td>
                          <td></td>
                          <td></td>
                          <td></td>
                          <td className="pt-1 text-right">{money(Math.abs(preview.creditAmount))}</td>
                        </tr>
                      )}
                      <tr>
                        <td className="pt-1 pr-4 font-semibold">Amount due</td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td className="pt-1 text-right font-semibold">{money(preview.netAmount)}</td>
                      </tr>
                    </tfoot>
                  </table>
                  <p className="mt-4 text-xs font-semibold text-muted-foreground">Lessons</p>
                  <table className="mt-1 w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="py-1 pr-4">Student</th>
                        <th className="py-1 pr-4">Date</th>
                        <th className="py-1 text-right">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.lines.map((l) => {
                        return l.lessonSlots.map((s, i) => (
                          <tr
                            key={`${l.studentName}-${i}`}
                            className="border-b border-border/60"
                          >
                            <td className="py-1 pr-4 font-medium">
                              {i === 0 ? l.studentName : ""}
                            </td>
                            <td className="py-1 pr-4 text-muted-foreground">{s.date}</td>
                            <td className="py-1 text-right text-muted-foreground">{s.time}</td>
                          </tr>
                        ));
                      })}
                    </tbody>
                  </table>
                  <p className="mt-3 text-xs text-muted-foreground">
                    The email includes a <strong>Pay Invoice</strong> button and a backup payment link. Once
                    paid, the family is automatically subscribed so future months bill on the 1st.
                  </p>
                </div>

                <form action={action} className="mt-4 flex items-center gap-3">
                  <input type="hidden" name="familyId" value={familyId} />
                  {state?.ok && (
                    <div className="text-xs text-emerald-700">
                      <p>Invoice sent for {money(state.amount)}.</p>
                      <a href={state.invoiceUrl} target="_blank" rel="noopener noreferrer" className="underline">
                        Open invoice →
                      </a>
                    </div>
                  )}
                  {state?.ok === false && <p className="text-xs text-red-600">{state.error}</p>}
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleClose}
                      className="btn btn-secondary"
                    >
                      Cancel
                    </button>
                    {state?.ok ? (
                    <button
                      type="button"
                      onClick={handleClose}
                      className="btn btn-primary"
                    >
                      Close
                    </button>
                    ) : (
                    <button
                      disabled={pending}
                      className="btn btn-primary"
                    >
                      {pending ? "Sending…" : "Confirm & send invoice"}
                    </button>
                    )}
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}