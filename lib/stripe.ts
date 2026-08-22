import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key === "sk_test_xxx") {
    throw new Error("STRIPE_SECRET_KEY is not configured. Set a Stripe test key in .env");
  }
  if (!_stripe) {
    _stripe = new Stripe(key);
  }
  return _stripe;
}

export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/**
 * Stripe lesson prices are denominated in 15-minute units. A rate must
 * therefore divide into four whole cents per unit or Stripe cannot represent
 * the exact hourly amount.
 */
export function quarterHourUnitAmount(hourlyRate: number): number {
  const cents = dollarsToCents(hourlyRate);
  if (!Number.isFinite(hourlyRate) || hourlyRate <= 0 || cents % 4 !== 0) {
    throw new Error("Hourly rates must be positive and divisible by $0.04");
  }
  return cents / 4;
}
