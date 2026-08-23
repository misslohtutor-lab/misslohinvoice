export const BILLING_CURRENCY = "cad" as const;

/**
 * Stripe invoice quantities and prices are also denominated in 15-minute
 * blocks, so a billable hour maps to this many billing units.
 */
export const BILLING_UNITS_PER_HOUR = 4 as const;