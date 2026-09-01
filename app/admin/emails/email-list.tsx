"use client";

import { useState } from "react";
import { badge, formatDate, formatTime } from "@/lib/ui";
import EmailPreviewDialog from "@/components/email-preview-dialog";

const EMAIL_TYPES: Record<string, string> = {
  CHARGE_NOTICE: "Charge notice",
  RECEIPT: "Receipt",
  LESSON_REMINDER: "Reminder",
  PAYMENT_FAILED: "Payment failed",
  ONBOARDING_COMPLETE: "Onboarding done",
  ONBOARDING_INVITE: "Onboarding invite",
  MAGIC_LINK: "Magic link",
  IMMEDIATE_INVOICE: "Invoice",
};

interface Email {
  id: string;
  to: string;
  type: string;
  subject: string;
  html: string | null;
  sent: boolean;
  createdAt: Date;
  family: { name: string } | null;
}

export default function EmailList({ emails }: { emails: Email[] }) {
  const [selected, setSelected] = useState<Email | null>(null);

  return (
    <>
      <section className="rounded-xl border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-zinc-500">
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">To</th>
              <th className="px-4 py-2">Family</th>
              <th className="px-4 py-2">Subject</th>
              <th className="px-4 py-2">Sent</th>
              <th className="px-4 py-2">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {emails.map((m) => (
              <tr
                key={m.id}
                onClick={() => setSelected(m)}
                className="cursor-pointer hover:bg-zinc-50"
              >
                <td className="px-4 py-2">
                  <span className={`inline-block rounded px-2 py-0.5 text-xs ${badge(m.type)}`}>
                    {EMAIL_TYPES[m.type] ?? m.type}
                  </span>
                </td>
                <td className="px-4 py-2 text-zinc-600">{m.to}</td>
                <td className="px-4 py-2 text-zinc-600">{m.family?.name ?? "\u2014"}</td>
                <td className="px-4 py-2 text-zinc-600">{m.subject}</td>
                <td className="px-4 py-2">
                  <span className={`inline-block rounded px-2 py-0.5 text-xs ${badge(m.sent ? "SUCCESS" : "FAILED")}`}>
                    {m.sent ? "yes" : "no"}
                  </span>
                </td>
                <td className="px-4 py-2 text-zinc-600">
                  {formatDate(m.createdAt)} {formatTime(m.createdAt)}
                </td>
              </tr>
            ))}
            {emails.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">
                  No emails sent yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <EmailPreviewDialog
        open={selected !== null}
        onClose={() => setSelected(null)}
        subject={selected?.subject ?? ""}
        to={selected?.to ? `${selected.to} (${selected.family?.name ?? ""})` : ""}
        html={selected?.html ?? null}
      />
    </>
  );
}
