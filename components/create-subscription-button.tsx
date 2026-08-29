"use client";

import { useActionState } from "react";
import { createSubscription, type CreateSubscriptionResult } from "@/lib/admin-actions";

export function CreateSubscriptionButton({ familyId }: { familyId: string }) {
  const [state, action, pending] = useActionState(
    (_prev: CreateSubscriptionResult | null, fd: FormData) => createSubscription(fd),
    null
  );

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="familyId" value={familyId} />
      <button
        disabled={pending}
        title="Create the monthly Stripe subscription now that the family has a schedule."
        className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
      >
        {pending ? "Creating subscription…" : "Create subscription"}
      </button>
      {state?.ok && (
        <p className="text-xs text-emerald-700">
          Subscription created ({state.subscriptionId}) — the family will be billed on the 1st.
        </p>
      )}
      {state?.ok === false && state.deferred && <p className="text-xs text-amber-700">{state.error}</p>}
      {state?.ok === false && !state.deferred && <p className="text-xs text-red-600">{state.error}</p>}
    </form>
  );
}