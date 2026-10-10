"use client";

import { useActionState } from "react";
import { sendOnboardingLink } from "@/lib/admin-actions";

type OnboardState = { ok: boolean; checkoutUrl?: string; emailSent?: boolean; emailError?: string; error?: string } | null;

export function OnboardingButton({ familyId }: { familyId: string }) {
  const [state, action, pending] = useActionState(
    (_prev: OnboardState, fd: FormData) => sendOnboardingLink(fd),
    null
  );

  return (
    <form action={action}>
      <input type="hidden" name="familyId" value={familyId} />
      <button disabled={pending} className="btn btn-success">
        {pending ? "Creating…" : "Send onboarding link"}
      </button>
      {state?.ok && state.emailSent && (
        <p className="mt-2 text-xs text-emerald-700">Onboarding email sent to the family.</p>
      )}
      {state?.ok && !state.emailSent && state.emailError && (
        <p className="mt-2 text-xs text-amber-700">Email not sent: {state.emailError}</p>
      )}
      {state?.ok && state.checkoutUrl && (
        <a href={state.checkoutUrl} target="_blank" rel="noopener noreferrer"
           className="btn btn-secondary">
          Open checkout →
        </a>
      )}
      {state && !state.ok && state.error && <p className="mt-2 text-xs text-red-600">{state.error}</p>}
    </form>
  );
}