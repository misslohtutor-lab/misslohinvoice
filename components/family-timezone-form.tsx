"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateFamilyTimezone } from "@/lib/admin-actions";

const TIMEZONES = Intl.supportedValuesOf("timeZone");

export function FamilyTimezoneForm({ familyId, initialTimeZone }: { familyId: string; initialTimeZone: string }) {
  const router = useRouter();
  const [timeZone, setTimeZone] = useState(initialTimeZone);
  const [pending, setPending] = useState(false);

  return (
    <form
      action={async (formData) => {
        setPending(true);
        try {
          await updateFamilyTimezone(formData);
          setTimeZone(String(formData.get("timeZone")));
          router.refresh();
        } finally {
          setPending(false);
        }
      }}
      className="mt-1 inline-flex items-center gap-2"
    >
      <input type="hidden" name="familyId" value={familyId} />
      <label htmlFor="timeZone" className="text-zinc-400">TZ</label>
      <select
        name="timeZone"
        id="timeZone"
        value={timeZone}
        onChange={(e) => setTimeZone(e.target.value)}
        className="rounded border border-zinc-300 px-2 py-1 text-sm"
      >
        {TIMEZONES.map((z) => (
          <option key={z} value={z}>{z}</option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Update timezone"}
      </button>
    </form>
  );
}