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
      <label htmlFor="timeZone" className="text-muted-foreground">TZ</label>
      <select
        name="timeZone"
        id="timeZone"
        value={timeZone}
        onChange={(e) => setTimeZone(e.target.value)}
        className="input w-auto py-1 text-sm"
      >
        {TIMEZONES.map((z) => (
          <option key={z} value={z}>{z}</option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="btn btn-secondary px-2.5 py-1 text-xs"
      >
        {pending ? "Saving…" : "Update timezone"}
      </button>
    </form>
  );
}