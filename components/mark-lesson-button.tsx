"use client";

import { useActionState } from "react";
import { markLesson, type MarkLessonResult } from "@/lib/admin-actions";

/**
 * Skip / Miss / Miss-half / Restore status button for a lesson. Uses
 * useActionState so a failure (e.g. a missed-lesson credit already sent to
 * Stripe that can't be reversed) shows an inline message instead of crashing
 * the page, and the button is disabled while the request is in flight.
 */
export function MarkLessonButton({
  lessonId,
  status,
  label,
  confirmText,
}: {
  lessonId: string;
  status: string;
  label: string;
  confirmText: string;
}) {
  const [state, action, pending] = useActionState(
    (_prev: MarkLessonResult | null, fd: FormData) => markLesson(fd),
    null
  );

  function onClick(e: React.MouseEvent<HTMLButtonElement>) {
    if (!window.confirm(confirmText)) {
      e.preventDefault();
      return;
    }
    // Let the button submit the enclosing form.
  }

  return (
    <form action={action}>
      <input type="hidden" name="id" value={lessonId} />
      <input type="hidden" name="status" value={status} />
      <button
        type="submit"
        disabled={pending}
        onClick={onClick}
        className="text-xs font-medium text-red-600 underline underline-offset-2 hover:text-red-800 disabled:opacity-50"
      >
        {pending ? "Working…" : label}
      </button>
      {state?.ok === false && <span className="ml-2 text-xs text-red-600">{state.error}</span>}
    </form>
  );
}