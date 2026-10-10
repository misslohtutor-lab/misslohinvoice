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

const BADGE_TONES: Record<string, "success" | "warning" | "danger" | "info" | "neutral"> = {
  active: "success",
  trialing: "info",
  past_due: "warning",
  incomplete: "warning",
  canceled: "neutral",
  unpaid: "danger",
  SUCCESS: "success",
  FAILED: "danger",
  PENDING: "warning",
  PROCESSING: "info",
  CHARGED: "success",
  due: "warning",
  next: "neutral",
  COMPLETED: "info",
  SCHEDULED: "neutral",
  CANCELLED: "danger",
};

const TONE_CLASSES: Record<string, string> = {
  success: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20",
  warning: "bg-amber-50 text-amber-700 ring-1 ring-amber-600/20",
  danger: "bg-red-50 text-red-700 ring-1 ring-red-600/20",
  info: "bg-sky-50 text-sky-700 ring-1 ring-sky-600/20",
  neutral: "bg-slate-100 text-slate-600 ring-1 ring-slate-500/20",
};

export function badge(status: string | undefined | null) {
  return TONE_CLASSES[BADGE_TONES[status ?? ""] ?? "neutral"];
}
