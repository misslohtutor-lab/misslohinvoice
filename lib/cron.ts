import { NextRequest } from "next/server";

/** Authorize a cron request via either the Authorization header or a ?secret= query param. */
export function isAuthorizedCron(req: NextRequest): boolean {
  const wanted = process.env.CRON_SECRET;
  if (!wanted || wanted === "change-me") return false;
  const header = req.headers.get("authorization");
  if (header === `Bearer ${wanted}`) return true;
  const url = new URL(req.url);
  return url.searchParams.get("secret") === wanted;
}
