"use client";

import { useActionState } from "react";
import { generateLessonsAction } from "@/lib/admin-actions";

type GenerateState = { ok: boolean; created?: number; total?: number; error?: string } | null;

export function GenerateLessonsButton({
  studentId,
  weeksAhead = 10,
  variant = "link",
  label,
}: {
  studentId?: string;
  weeksAhead?: number;
  variant?: "link" | "button";
  label?: string;
}) {
  const [state, action, pending] = useActionState(
    (_prev: GenerateState, fd: FormData) => generateLessonsAction(fd),
    null
  );

  const text = label ?? "Generate upcoming lessons";
  const cls =
    variant === "button"
      ? "btn btn-primary"
      : "text-xs font-medium text-primary underline-offset-2 hover:underline disabled:opacity-50";

  return (
    <form action={action}>
      <input type="hidden" name="weeksAhead" value={String(weeksAhead)} />
      {studentId && <input type="hidden" name="studentId" value={studentId} />}
      <button type="submit" disabled={pending} className={cls}>
        {pending ? "Generating…" : text}
      </button>
      {state?.ok && (
        <span className="ml-2 text-xs text-emerald-700">
          +{state.created} created · {state.total ?? 0} scheduled
        </span>
      )}
      {state?.ok === false && <span className="ml-2 text-xs text-red-600">{state.error}</span>}
    </form>
  );
}