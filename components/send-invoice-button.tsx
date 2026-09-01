"use client";

import { useState } from "react";
import { useActionState } from "react";
import { sendInvoiceNow, previewImmediateInvoice, type InvoiceResult, type InvoicePreview } from "@/lib/admin-actions";
import { money } from "@/lib/ui";

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
        className="rounded-lg bg-violet-700 px-3 py-2 text-sm font-medium text-white hover:bg-violet-600"
      >
        Send invoice now
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
          <div className="mt-8 w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold">Invoice email preview</h2>
                <p className="text-xs text-zinc-500">
                  Confirm the details below — nothing is created or sent until you confirm.
                </p>
              </div>
              <button type="button" onClick={handleClose} className="text-zinc-400 hover:text-zinc-700">
                ✕
              </button>
            </div>

            {loading && <p className="py-8 text-center text-sm text-zinc-500">Building preview…</p>}

            {!loading && preview?.ok === false && (
              <div className="space-y-3">
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{preview.error}</p>
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100"
                >
                  Close
                </button>
              </div>
            )}

            {!loading && preview?.ok && (
              <>
                <div className="rounded-t-xl border border-zinc-200 bg-zinc-50 px-4 py-3 font-mono text-xs text-zinc-600">
                  <p>
                    <span className="text-zinc-400">From:</span> Miss Loh Tutoring School
                  </p>
                  <p>
                    <span className="text-zinc-400">To:</span> {preview.to}
                  </p>
                  <p>
                    <span className="text-zinc-400">Subject:</span> Your invoice for {preview.periodLabel}
                  </p>
                </div>

                <div className="rounded-b-xl border border-t-0 border-zinc-200 px-4 py-4 text-sm text-zinc-800">
                  <p>Hi {preview.familyName},</p>
                  <p className="mt-3">
                    Here is your invoice for lessons in <strong>{preview.periodLabel}</strong>
                    {preview.prepaid ? " (billed up front)" : ""}. Amount is due immediately.
                  </p>
                  <table className="mt-3 w-full text-sm">
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
                      {preview.lines.map((l) => (
                        <tr key={l.studentName} className="border-b border-zinc-50">
                          <td className="py-2 pr-4 font-medium">{l.studentName}</td>
                          <td className="py-2 pr-4 text-zinc-600">{l.lessons}</td>
                          <td className="py-2 pr-4 text-zinc-600">{l.hours}h</td>
                          <td className="py-2 pr-4 text-zinc-600">{money(l.rate)}/hr</td>
                          <td className="py-2 text-right">{money(l.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td className="pt-2 pr-4 font-semibold">Total</td>
                        <td></td>
                        <td className="pt-2 pr-4 text-zinc-600">{preview.totalHours}h</td>
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
                  <p className="mt-4 text-xs font-semibold text-zinc-500">Lessons</p>
                  <table className="mt-1 w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 text-left text-zinc-500">
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
                            className="border-b border-zinc-50"
                          >
                            <td className="py-1 pr-4 font-medium">
                              {i === 0 ? l.studentName : ""}
                            </td>
                            <td className="py-1 pr-4 text-zinc-600">{s.date}</td>
                            <td className="py-1 text-right text-zinc-600">{s.time}</td>
                          </tr>
                        ));
                      })}
                    </tbody>
                  </table>
                  <p className="mt-3 text-xs text-zinc-500">
                    Stripe emails this with a <strong>Pay invoice</strong> button. Once paid, the family is
                    automatically subscribed so future months bill on the 1st.
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
                      className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100"
                    >
                      Cancel
                    </button>
                    {state?.ok ? (
                    <button
                      type="button"
                      onClick={handleClose}
                      className="rounded-lg bg-violet-700 px-3 py-2 text-sm font-medium text-white hover:bg-violet-600"
                    >
                      Close
                    </button>
                    ) : (
                    <button
                      disabled={pending}
                      className="rounded-lg bg-violet-700 px-3 py-2 text-sm font-medium text-white hover:bg-violet-600 disabled:opacity-50"
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