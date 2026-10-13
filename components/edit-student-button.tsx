"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateStudent } from "@/lib/admin-actions";

/**
 * Edit a student's name, subject, and hourly rate in place. A rate change
 * applies to future billing; already-invoiced months keep their old rate.
 * Failures surface inline instead of crashing the page.
 */
export function EditStudentButton({
  studentId,
  name,
  hourlyRate,
  subject,
}: {
  studentId: string;
  name: string;
  hourlyRate: number;
  subject: string | null;
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
        className="text-xs font-medium text-primary underline-offset-2 hover:underline"
      >
        Edit
      </button>
      {open && (
        <form
          action={async (formData) => {
            setPending(true);
            setError(null);
            try {
              const result = await updateStudent(formData);
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
          className="card absolute right-0 z-10 mt-2 w-64 space-y-2 p-4 text-left shadow-pop"
        >
          <input type="hidden" name="id" value={studentId} />
          <div>
            <label className="label">Name</label>
            <input name="name" required defaultValue={name} className="input py-1 text-sm" />
          </div>
          <div>
            <label className="label">Hourly rate ($)</label>
            <input
              name="hourlyRate"
              type="number"
              step="0.04"
              min="0.04"
              required
              defaultValue={hourlyRate}
              className="input py-1 text-sm"
            />
          </div>
          <div>
            <label className="label">Subject (optional)</label>
            <input name="subject" defaultValue={subject ?? ""} className="input py-1 text-sm" />
          </div>
          <p className="text-xs text-muted-foreground">
            A new rate applies to future bills. Already-invoiced months keep their old rate.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <button type="submit" disabled={pending} className="btn btn-primary px-3 py-1 text-xs">
              {pending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="btn btn-ghost px-2 py-1 text-xs"
            >
              Cancel
            </button>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </form>
      )}
    </div>
  );
}