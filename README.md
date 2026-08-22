# Miss Loh Tutoring School

Automatic recurring billing for Miss Loh Tutoring School. Each family stores a card; on the 1st of the month the card is charged for the **exact hours scheduled** that month (per-kid line items roll into one family invoice). No manual chasing — Stripe auto-retries failed charges.

## Stack
Next.js 16 (App Router) · TypeScript · Tailwind · Prisma 7 + SQLite · Stripe · Auth.js (magic link) · Gmail SMTP · Vercel Cron

## Concepts
- **Family** = a billing account. One card, one Stripe customer + subscription, one contact email. Contains 1+ students (kids).
- **Student** = a kid with a **per-hour rate**. Their schedule is a set of repeating **weekly slots**.
- **Lesson** records are auto-generated from weekly slots (with durations) for N weeks ahead.
- **Billing** = Stripe subscription with one recurring line item per kid, `quantity` = that kid's scheduled hours for the upcoming month (in 15-minute units), denominated in CAD. Quantities are synced before the 1st, so the monthly invoice equals the scheduled total. Prepaid on the 1st; Stripe handles failures/retries.
- **Credit card onboarding**: hosted Stripe Checkout (mode=setup) collects the card; card data never touches this server.

## Setup
```bash
cp .env.example .env
# fill in: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SMTP_USER, SMTP_PASS, BASE_URL, CRON_SECRET
npm install
npm run db:migrate     # apply Prisma schema
npm run db:seed        # a demo family
npm run dev
```
- The app is **staff-only and unauthenticated** (it runs locally on a trusted machine): open `/admin` directly, no sign-in.
- **Security note:** the server binds `0.0.0.0` (see `scripts/miss-loh.service`), so anyone who can reach port 3100 on the LAN can view family data (names, emails, phones, card last-4) and trigger billing actions that raise real Stripe charges. This is intentional for the current trusted-network deployment. If the machine is reachable from an untrusted network, restrict the port in the firewall or re-add authentication.
- Stripe Checkout never redirects customers to a private `BASE_URL`. Set `CHECKOUT_SUCCESS_URL` and `CHECKOUT_CANCEL_URL` to public thank-you/cancel pages when available; otherwise customers are left on Stripe's public site and receive the definitive setup confirmation by email.
- `scripts/verify-schedule.ts` prints a demo family's next-month billing breakdown.

## Local Stripe webhooks
```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
# put the printed whsec_... value into STRIPE_WEBHOOK_SECRET
```

## Scheduled jobs

The same three jobs run either as Vercel cron endpoints (`vercel.json`) or — since the app now runs locally — as a standalone runner that calls the billing/email functions directly (no web server needed).

| Job | When | Action |
|---|---|---|
| `charge-notice` | notice day (default 3 days before the 1st) | emails each family an itemized "your card will be charged $X on the 1st" |
| `billing` | 1st of month | syncs each subscription's line-item quantities to the upcoming month's scheduled hours |
| `reminders` | daily | emails lesson reminders for the next 48h |

**Always-on server:** a systemd service `miss-loh.service` runs the app in **production mode** (`next start`) — it auto-starts at boot and restarts on crash (`systemctl status miss-loh`; logs via `journalctl -u miss-loh`). Deploy the unit with `sudo cp scripts/miss-loh.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl restart miss-loh`. After code changes: `npm run build && sudo systemctl restart miss-loh`.

**Local scheduling:** the crontab lines in `scripts/crontab.example` (`crontab -e`) run `scripts/run-jobs.sh` every 30 minutes. Each job is recorded in the `ScheduledRun` table (one row per job + window), so a job only executes once per month/day — and if the machine was off when a job was due, the first invocation after boot runs it automatically. Logs: `logs/jobs.log`, `logs/app.log`. Manually: `npm run jobs` (all due jobs), `npm run jobs -- billing`, `npm run jobs -- --list`.

HTTP endpoints (Vercel path) require `Authorization: Bearer <CRON_SECRET>` (or `?secret=`).

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
