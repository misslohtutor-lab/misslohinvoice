"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateLesson } from "@/lib/admin-actions";
import { QUARTER_HOUR_TIMES } from "@/lib/ui";

/**
 * Move an individual lesson to a different date and/or start time from the
 * per-student lesson list. The duration is preserved server-side, and failures
 * surface inline instead of crashing the page.
 */
export function EditLessonButton({
  lessonId,
  dateStr,
  startStr,
}: {
  lessonId: string;
  dateStr: string;
  startStr: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen((v) => !v);
        }}
        className="text-xs font-medium text-zinc-600 underline underline-offset-2 hover:text-zinc-900"
      >
        Edit
      </button>
      {open && (
        <form
          action={async (formData) => {
            setPending(true);
            setError(null);
            try {
              const result = await updateLesson(formData);
              if (result.ok) {
                setOpen(false);
                router.refresh();
              } else {
                setError(result.error);
              }
            } finally {
              setPending(false);
            }
          }}
          className="absolute right-0 z-10 mt-2 w-56 rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-lg"
        >
          <input type="hidden" name="id" value={lessonId} />
          <label className="mb-1 block text-xs font-medium text-zinc-500">Date</label>
          <input
            type="date"
            name="date"
            required
            defaultValue={dateStr}
            className="mb-3 w-full rounded border border-zinc-300 px-2 py-1 text-sm"
          />
          <label className="mb-1 block text-xs font-medium text-zinc-500">Start time</label>
          <select
            name="startTime"
            defaultValue={startStr}
            className="mb-3 w-full rounded border border-zinc-300 px-2 py-1 text-sm"
          >
            {QUARTER_HOUR_TIMES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-zinc-900 px-3 py-1 text-xs text-white disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs text-zinc-500 hover:text-zinc-800"
            >
              Cancel
            </button>
          </div>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </form>
      )}
    </div>
  );
}
