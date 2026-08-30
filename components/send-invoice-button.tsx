"use client";

import { useActionState } from "react";
import { sendInvoiceNow, type InvoiceResult } from "@/lib/admin-actions";
import { money } from "@/lib/ui";

export function SendInvoiceButton({ familyId }: { familyId: string }) {
  const [state, action, pending] = useActionState(
    (_prev: InvoiceResult | null, fd: FormData) => sendInvoiceNow(fd),
    null
  );

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="familyId" value={familyId} />
      <button
        disabled={pending}
        title="Send an invoice for this month's lessons now. The customer pays via a Stripe payment link — no card on file required."
        className="rounded-lg bg-violet-700 px-3 py-2 text-sm font-medium text-white hover:bg-violet-600 disabled:opacity-50"
      >
        {pending ? "Sending invoice…" : "Send invoice now"}
      </button>
      {state?.ok && (
        <div className="text-xs text-emerald-700">
          <p>Invoice sent for {money(state.amount)}.</p>
          <a href={state.invoiceUrl} target="_blank" rel="noopener noreferrer" className="underline">
            Open invoice →
          </a>
        </div>
      )}
      {state?.ok === false && <p className="text-xs text-red-600">{state.error}</p>}
    </form>
  );
}
