#!/usr/bin/env bash
# Run the local background jobs (billing, charge notice, lesson reminders).
# Safe to call every 30 minutes from cron(8): jobs self-skip unless due and
# un-run, so this doubles as recovery for runs missed while the machine was off.
set -euo pipefail
cd "$(dirname "$0")/.."
exec npx tsx scripts/run-jobs.ts "$@"
