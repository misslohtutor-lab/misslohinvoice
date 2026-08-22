"use client";

export function ConfirmButton({
  label,
  confirmText,
  className,
}: {
  label: string;
  confirmText: string;
  className?: string;
}) {
  function onClick(e: React.MouseEvent<HTMLButtonElement>) {
    if (!window.confirm(confirmText)) {
      e.preventDefault();
      return;
    }
    // Let the button submit the enclosing <form>.
  }
  return (
    <button
      type="submit"
      onClick={onClick}
      className={className ?? "text-xs font-medium text-red-600 underline underline-offset-2 hover:text-red-800"}
    >
      {label}
    </button>
  );
}