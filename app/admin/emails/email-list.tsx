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
      <section className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-3">Type</th>
              <th className="px-5 py-3">To</th>
              <th className="px-5 py-3">Family</th>
              <th className="px-5 py-3">Subject</th>
              <th className="px-5 py-3">Sent</th>
              <th className="px-5 py-3">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {emails.map((m) => (
              <tr
                key={m.id}
                onClick={() => setSelected(m)}
                className="cursor-pointer transition-colors hover:bg-muted"
              >
                <td className="px-5 py-3">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${badge(m.type)}`}>
                    {EMAIL_TYPES[m.type] ?? m.type}
                  </span>
                </td>
                <td className="px-5 py-3 text-muted-foreground">{m.to}</td>
                <td className="px-5 py-3 text-muted-foreground">{m.family?.name ?? "\u2014"}</td>
                <td className="px-5 py-3 text-muted-foreground">{m.subject}</td>
                <td className="px-5 py-3">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${badge(m.sent ? "SUCCESS" : "FAILED")}`}>
                    {m.sent ? "yes" : "no"}
                  </span>
                </td>
                <td className="px-5 py-3 whitespace-nowrap text-muted-foreground">
                  {formatDate(m.createdAt)} {formatTime(m.createdAt)}
                </td>
              </tr>
            ))}
            {emails.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">
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
