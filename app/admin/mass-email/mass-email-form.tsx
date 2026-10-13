"use client";

import { useState } from "react";
import { useActionState } from "react";
import { sendMassEmailAction, type MassEmailResult } from "@/lib/admin-actions";

interface FamilyOption {
  id: string;
  name: string;
  email: string;
}

export default function MassEmailForm({ families }: { families: FamilyOption[] }) {
  const [mode, setMode] = useState<"all" | "selected">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [state, action, pending] = useActionState<MassEmailResult | null, FormData>(
    sendMassEmailAction,
    null
  );

  const recipients = mode === "all" ? families.length : selected.size;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const tabClass = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
      active ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-muted"
    }`;

  return (
    <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
      <form action={action} className="card space-y-5 p-5">
        <input type="hidden" name="mode" value={mode} />

        <div>
          <span className="label">Recipients</span>
          <div className="mt-1 flex gap-1">
            <button type="button" onClick={() => setMode("all")} className={tabClass(mode === "all")}>
              All families ({families.length})
            </button>
            <button
              type="button"
              onClick={() => setMode("selected")}
              className={tabClass(mode === "selected")}
            >
              Selected ({selected.size})
            </button>
          </div>
        </div>

        {mode === "selected" && (
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="flex items-center justify-between border-b border-border px-3 py-2 text-xs">
              <span className="text-muted-foreground">
                {selected.size} of {families.length} selected
              </span>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setSelected(new Set(families.map((f) => f.id)))}
                  className="text-primary hover:underline"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={() => setSelected(new Set())}
                  className="text-muted-foreground hover:underline"
                >
                  Clear
                </button>
              </div>
            </div>
            <ul className="max-h-64 divide-y divide-border overflow-auto">
              {families.map((f) => (
                <li key={f.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted">
                    <input
                      type="checkbox"
                      name="familyIds"
                      value={f.id}
                      checked={selected.has(f.id)}
                      onChange={() => toggle(f.id)}
                      className="h-4 w-4"
                    />
                    <span className="text-sm font-medium">{f.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{f.email}</span>
                  </label>
                </li>
              ))}
              {families.length === 0 && (
                <li className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No families yet.
                </li>
              )}
            </ul>
          </div>
        )}

        <div>
          <label className="label" htmlFor="subject">
            Subject
          </label>
          <input
            id="subject"
            name="subject"
            required
            className="input"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Schedule update for November"
          />
        </div>

        <div>
          <label className="label" htmlFor="body">
            Message
          </label>
          <textarea
            id="body"
            name="body"
            required
            rows={12}
            className="input"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={"Hi everyone,\n\nA quick update about the upcoming schedule..."}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Plain text. Leave a blank line to start a new paragraph.
          </p>
        </div>

        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Will send to <strong>{recipients}</strong> {recipients === 1 ? "family" : "families"}.
          </p>
          <button
            disabled={pending || recipients === 0 || !subject.trim() || !body.trim()}
            className="btn btn-primary"
          >
            {pending ? "Sending…" : "Send email"}
          </button>
        </div>

        {state?.ok === false && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
        )}
        {state?.ok && (
          <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            <p>
              Sent to {state.sent} of {state.total} families
              {state.failed ? ` — ${state.failed} failed` : ""}.
            </p>
            {state.errors.length > 0 && (
              <ul className="mt-1 list-disc pl-4 text-xs">
                {state.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </form>

      <aside className="card h-fit p-5">
        <h2 className="text-sm font-semibold">Preview</h2>
        <div className="mt-3 overflow-hidden rounded-xl border border-border">
          <div className="border-b border-border px-4 py-3">
            <p className="text-xs text-muted-foreground">Subject</p>
            <p className="font-medium">{subject || "—"}</p>
          </div>
          <div className="px-4 py-3 text-sm">
            {body ? (
              body
                .split(/\n{2,}/)
                .map((p, i) => (
                  <p key={i} className="mb-3 whitespace-pre-line last:mb-0">
                    {p}
                  </p>
                ))
            ) : (
              <p className="text-muted-foreground">Your message will appear here.</p>
            )}
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Each recipient is recorded in the{" "}
          <a href="/admin/emails" className="text-primary hover:underline">
            email log
          </a>
          .
        </p>
      </aside>
    </div>
  );
}
