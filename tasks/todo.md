# Database migration fix

- [x] Inspect the Prisma schema, migration chain, and current CLI failure.
- [x] Fix the migration/configuration issue with the smallest safe change.
- [x] Validate the schema and migration deployment from a clean SQLite database.
- [x] Review the final diff and document verification results.

## Review

- Added `20260817000009_scheduled_runs`, which creates the `ScheduledRun` table and
  its `(job, windowKey)` unique index declared by the Prisma schema.
- Verified `prisma migrate deploy`, `prisma migrate status`, and
  `prisma migrate diff` against a clean SQLite database.
- Repaired the ignored local `dev.db` without resetting it: removed only two stale
  migration metadata rows, marked `20260817000008_pending_charge` and
  `20260817000009_scheduled_runs` as applied, and preserved application data.
- Saved a pre-repair database backup at
  `/tmp/opencode/tutorschedule-dev-before-migration-repair.db`.
- `npm run db:generate`, `npx prisma validate`, `npm run lint`, and `npm run build`
  pass.

## Follow-up Review Fixes

- Enforced `ADMIN` sessions in the admin layout and every server action.
- Prevented reversal of credits already sent to Stripe, added net-credit totals
  to charge notices, and corrected ledger rates from quarter-hour prices to
  hourly rates.
- Rejected overlapping weekly slots and added a database uniqueness constraint
  for exact duplicates.
- Added Stripe idempotency keys and stale `PROCESSING` recovery for mid-month
  charges.
- Centralized Toronto billing-timezone boundaries and made charge notices run on
  any missed day before the 1st.
- Enforced hourly rates representable by Stripe's 15-minute billing unit and
  ignored local database/log artifacts.
- Added `20260817000010_billing_safety` for pending-charge leases and slot
  uniqueness; local and clean migration status are current.

# Remove local sign-in requirement

- [x] Inspect authentication configuration, route guards, and existing task notes.
- [x] Remove sign-in enforcement while preserving app functionality.
- [x] Run targeted checks and verify the live server behavior.
- [x] Review the final diff and document verification results.

## Review

- Removed the admin layout redirect to `/login`.
- Removed `requireAdmin()` from every admin server action so local mutations work
  without a session.
- Kept cron bearer-token checks and the standalone NextAuth routes unchanged.
- `npm run lint` passes.
- `npm run build` passes.
- Restarted the production server on port `3100`; an unauthenticated request to
  `/admin` returns `200` instead of redirecting to `/login`.

# Use CAD for Stripe billing

- [x] Inspect onboarding checkout creation and Stripe currency handling.
- [x] Fix onboarding checkout to use CAD explicitly.
- [x] Run lint/build and targeted verification.
- [x] Document the fix and verification in task notes.

## Review

- Added the shared `BILLING_CURRENCY` constant set to `cad`.
- Added the required CAD currency to setup-mode onboarding Checkout sessions.
- Updated newly-created recurring prices, one-time prices, and Stripe balance
  credits to use CAD.
- Stored the Stripe subscription currency when attaching a subscription.
- Updated admin and email currency formatting to display CAD.
- `npx prisma validate`, `npm run lint`, and `npm run build` pass.
- Restarted the production server on port `3100`; `/admin` returns `200`.

# Handle local Stripe Checkout completion

- [x] Inspect Stripe success/cancel URLs and onboarding completion flow.
- [x] Implement a local-safe post-payment experience.
- [x] Run checks and verify the generated URLs and webhook flow.
- [x] Document the design and verification.

## Review

- Private/local `BASE_URL` values no longer become customer-facing Stripe return
  URLs; they fall back to Stripe's public site.
- Added optional `CHECKOUT_SUCCESS_URL` and `CHECKOUT_CANCEL_URL` settings for
  public hosted thank-you/cancel pages, including the Checkout session ID.
- Added a deduplicated onboarding-complete email sent after the Stripe webhook
  saves the payment method and creates the subscription.
- Updated the onboarding email to tell customers that they can safely close the
  Stripe page and will receive email confirmation.
- `npx prisma validate`, `npm run lint`, and `npm run build` pass.

# Code-review fixes (billing, retry, job reporting)

## Review

- **Accepted risk (documented, unchanged):** `/admin` is intentionally
  unauthenticated and binds `0.0.0.0:3100`. Anyone reachable on the LAN can read
  family data and trigger real Stripe charges. Documented in `README.md` with a
  firewall/ref-auth note; no auth behavior changed.
- **Fix:** mid-month deduction dedupe now matches inclusive (`periodEnd: { lte:
  monthEnd }`), matching the row's stored `periodEnd === monthEnd`, so double
  clicks cannot enqueue the same month twice.
- **Fix:** a failed/cancelled mid-month charge can now be retried. The notice
  email dedupe key is unique per pending-charge attempt
  (`midmonth:<period>:<pendingId>`), so the retry's fresh notice is not blocked
  by the `already sent` guard.
- **Fix:** the `charge-notice` cron job now returns `ok: false` with per-family
  failure details when any notice fails (excluding the `already sent` dedupe),
  so the `ScheduledRun` is marked FAILED and the next run retries only
  not-yet-notified families.
- `npm run lint` and `npm run build` pass.
- Restarted the production server on port `3100`; `/admin` returns `200`.

# Refactor: deduplicate notice-building code

## Review

- Extracted `noticeAmounts`, `noticeLessonsForPeriod`, and `hasInvoiceInPeriod`
  in `lib/billing.ts`; all charge-notice callers now share them
  (`queueMidMonthCharge`, the cron route, and the standalone runner).
- Added `monthPeriodKey`/`monthPeriodLabel` to `lib/time.ts`, replacing
  hand-rolled `YYYY-MM` keys and labels in three places.
- Exported `CHARGE_NOTICE_ALREADY_SENT` from `lib/email-templates.ts`; the
  runner compares against the constant instead of a magic string.
- `queueMidMonthCharge` and `billCurrentMonthNow` now use the shared
  `hasInvoiceInPeriod` ledger check (the single source for the "already billed"
  guard).
- Behavior-preserving; the `periodEnd: { lte: monthEnd }` fix is untouched. `npm run lint`, `npm run build`, and `run-jobs --list` pass.
- Restarted the production server on port `3100`; `/admin` returns `200`.
