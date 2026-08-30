"use client";

import { useRef, useEffect } from "react";

export default function EmailPreviewDialog({
  open,
  onClose,
  subject,
  to,
  html,
}: {
  open: boolean;
  onClose: () => void;
  subject: string;
  to: string;
  html: string | null;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="backdrop:bg-black/40 rounded-xl border border-zinc-200 bg-white p-0 shadow-xl max-w-3xl w-full"
    >
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
        <div>
          <h2 className="font-semibold">{subject}</h2>
          <p className="text-xs text-zinc-500">To: {to}</p>
        </div>
        <button
          onClick={() => dialogRef.current?.close()}
          className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18" /><path d="m6 6 12 12" />
          </svg>
        </button>
      </div>
      <div className="max-h-[70vh] overflow-auto">
        {html ? (
          <iframe
            srcDoc={html}
            className="w-full border-0"
            style={{ minHeight: "400px" }}
            title="Email preview"
          />
        ) : (
          <div className="px-4 py-8 text-center text-zinc-400">
            No content available (sent before HTML storage was added).
          </div>
        )}
      </div>
    </dialog>
  );
}
