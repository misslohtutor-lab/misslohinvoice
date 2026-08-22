# Miss Loh Tutoring School

Automatic recurring billing for Miss Loh Tutoring School. Each family stores a card; on the 1st of the month the card is charged for the **exact hours scheduled** that month (per-kid line items roll into one family invoice). No manual chasing — Stripe auto-retries failed charges.

## Stack
Next.js 16 (App Router) · TypeScript · Tailwind · Prisma 7 + Neon Postgres · Stripe · Auth.js (magic link) · Gmail SMTP · Vercel Cron

## Concepts
- **Family** = a billing account. One card, one Stripe customer + subscription, one contact email. Contains 1+ students (kids).
- **Student** = a kid with a **per-hour rate**. Their schedule is a set of repeating **weekly slots**.
- **Lesson** records are auto-generated from weekly slots (with durations) for N weeks ahead.
- **Billing** = Stripe subscription with one recurring line item per kid, `quantity` = that kid's scheduled hours for the upcoming month (in 15-minute units), denominated in CAD. Quantities are synced before the 1st, so the monthly invoice equals the scheduled total. Prepaid on the 1st; Stripe handles failures/retries.
- **Credit card onboarding**: hosted Stripe Checkout (mode=setup) collects the card; card data never touches this server.

## Setup (development)
```bash
cp .env.example .env
# fill in: DATABASE_URL (Neon Postgres), AUTH_SECRET, ALLOWED_EMAILS, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SMTP_USER, SMTP_PASS, BASE_URL, CRON_SECRET
npm install
npx prisma migrate deploy     # apply Prisma schema
npm run db:seed               # a demo family
npm run dev
```
- **Auth:** sign-in uses email magic links. Admin routes require the `ADMIN` role; set `ALLOWED_EMAILS` to restrict sign-in to staff.
- Stripe Checkout never redirects customers to a private `BASE_URL`. Set `CHECKOUT_SUCCESS_URL` and `CHECKOUT_CANCEL_URL` to public thank-you/cancel pages; otherwise customers stay on Stripe's public site and receive the definitive setup confirmation by email.
- `scripts/verify-schedule.ts` prints a demo family's next-month billing breakdown.

## Stripe webhooks
In the Stripe dashboard, add a webhook endpoint pointing at
`https://tutorschedule.vercel.app/api/webhooks/stripe` and set
`STRIPE_WEBHOOK_SECRET` in the Vercel project to the signing secret (`whsec_...`).

## Scheduled jobs (Vercel Cron)

Jobs run as Vercel Cron endpoints (see `vercel.json`):

| Job | When (UTC) | Action |
|---|---|---|
| `charge-notice` | daily 09:00 (idempotent ~3 days before the 1st) | emails each family an itemized "your card will be charged $X on the 1st" |
| `billing` | 1st of month 08:00 | syncs each subscription's line-item quantities to the upcoming month's scheduled hours |
| `reminders` | daily 08:00 | emails lesson reminders for the next 48h |
| `midmonth-billing` | daily 10:00 | sweeps queued mid-month charges whose 24h notice window has elapsed |

Endpoints require `Authorization: Bearer <CRON_SECRET>` (or `?secret=`, as wired in `vercel.json`). Set `CRON_SECRET` in the Vercel project environment.

## Email triggers
- **Charge notice** (3 days before billing) — itemized upcoming lessons in CAD
- **Receipt** (`invoice.paid`) — itemized, per student
- **Payment failed** (`invoice.payment_failed`)
- **Lesson reminder**

## Managing billing
In `/admin`:
- **Families** → create family, then "Send onboarding link" (Stripe Checkout) to collect the card.
- **Students** → set per-hour rate and weekly slots; "Generate upcoming lessons".
- **Billing** → next-month preview, "Sync next month's hours & bill", and a subscriptions/charges grid. Export via Stripe dashboard as needed.

## Notes
- Billing unit is 15 minutes (Stripe quantities must be integers): monthly hours → `hours × 4` units.
- Mid-month signups: the onboarding checkout runs on a free trial until the 1st; use **"Send this month's billing email"** on the family page to send an itemized notice and charge the current month's lessons 24h later (one-time Stripe invoice).
- Marking a lesson **Missed** (illness/no-show) auto-credits the next bill; restoring it removes the credit. Crediting for mid-month cancellations/changes happens via an `Adjustment` (schema `Adjustment`) — not yet exposed in the admin UI.
- Schedule is **admin-managed**; staff review upcoming lessons pre-billing in `/admin`.
