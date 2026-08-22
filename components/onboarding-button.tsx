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
      <button disabled={pending} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50">
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
           className="ml-3 inline-block rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-700">
          Open checkout →
        </a>
      )}
      {state && !state.ok && state.error && <p className="mt-2 text-xs text-red-600">{state.error}</p>}
    </form>
  );
}