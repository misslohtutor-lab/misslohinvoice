"use client";

import { useActionState } from "react";
import { sendMidMonthBillingEmail, type BillingEmailResult } from "@/lib/admin-actions";
import { money } from "@/lib/ui";

export function BillingEmailButton({ familyId }: { familyId: string }) {
  const [state, action, pending] = useActionState(
    (_prev: BillingEmailResult | null, fd: FormData) => sendMidMonthBillingEmail(fd),
    null
  );

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="familyId" value={familyId} />
      <button
        disabled={pending}
        title="Send this month's billing email now; the card is charged 24 hours later."
        className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send this month's billing email"}
      </button>
      {state?.ok && (
        <p className="text-xs text-emerald-700">
          Billing email sent for {money(state.amount)} — card will be charged {state.chargeLabel}.
        </p>
      )}
      {state?.ok === false && <p className="text-xs text-red-600">{state.error}</p>}
    </form>
  );
}
