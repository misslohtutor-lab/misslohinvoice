import { BILLING_CURRENCY } from "@/lib/currency";
import { BUSINESS_TIME_ZONE } from "@/lib/time";

export function money(n: number): string {
  return n.toLocaleString("en-CA", { style: "currency", currency: BILLING_CURRENCY });
}

/** All times in 15-minute increments ("HH:MM", 24h) — classes start/end on the quarter hour. */
export const QUARTER_HOUR_TIMES: string[] = (() => {
  const pad = (n: number) => String(n).padStart(2, "0");
  const out: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 15, 30, 45]) {
      out.push(`${pad(h)}:${pad(m)}`);
    }
  }
  return out;
})();

/** "HH:MM" -> minutes-since-midnight; null if not a valid HH:MM on a quarter hour. */
export function timeToMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = /^(\d{2}):(\d{2})$/.exec(t);
  if (!m) return null;
  const [h, min] = [Number(m[1]), Number(m[2])];
  if (h > 23 || min > 59) return null;
  if (min % 15 !== 0) return null;
  return h * 60 + min;
}

export function formatDate(d: Date | string | undefined | null, opts?: Intl.DateTimeFormatOptions): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { timeZone: BUSINESS_TIME_ZONE, month: "short", day: "numeric", ...opts });
}

export function formatTime(d: Date | string | undefined | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: BUSINESS_TIME_ZONE });
}

export function badge(status: string | undefined | null) {
  const map: Record<string, string> = {
    active: "bg-emerald-100 text-emerald-700",
    trialing: "bg-sky-100 text-sky-700",
    past_due: "bg-amber-100 text-amber-700",
    incomplete: "bg-amber-100 text-amber-700",
    canceled: "bg-zinc-200 text-zinc-600",
    unpaid: "bg-red-100 text-red-700",
    SUCCESS: "bg-emerald-100 text-emerald-700",
    FAILED: "bg-red-100 text-red-700",
    PENDING: "bg-amber-100 text-amber-700",
    PROCESSING: "bg-sky-100 text-sky-700",
    CHARGED: "bg-emerald-100 text-emerald-700",
    due: "bg-amber-100 text-amber-700",
    next: "bg-zinc-200 text-zinc-600",
    COMPLETED: "bg-sky-100 text-sky-700",
    SCHEDULED: "bg-zinc-100 text-zinc-600",
    CANCELLED: "bg-red-100 text-red-700",
  };
  return map[status ?? ""] ?? "bg-zinc-100 text-zinc-600";
}
