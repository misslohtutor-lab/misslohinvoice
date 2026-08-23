/** Fallback whenever a checkout return URL can't be derived from a public site. */
const EXTERNAL_CHECKOUT_RETURN_URL = "https://stripe.com";

function isPrivateCheckoutHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  if (normalized === "localhost" || normalized === "localhost.localdomain" || normalized.endsWith(".local")) {
    return true;
  }
  if (normalized === "::1" || normalized === "0.0.0.0") return true;

  const octets = normalized.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false;
  }
  return octets[0] === 10 || octets[0] === 127 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168);
}

/** Public URL for the family-guide page, or null when no public site is configured. */
export function guideUrl(): string | null {
  const baseUrl = process.env.BASE_URL?.trim();
  if (!baseUrl) return null;
  try {
    const url = new URL(baseUrl);
    if (isPrivateCheckoutHost(url.hostname)) return null;
    return `${url.toString().replace(/\/+$/, "")}/family-guide`;
  } catch {
    return null;
  }
}

export function checkoutReturnUrl(kind: "success" | "cancelled"): string {
  const configured = process.env[`CHECKOUT_${kind === "success" ? "SUCCESS" : "CANCEL"}_URL`]?.trim();
  const baseUrl = process.env.BASE_URL?.trim();
  const candidate = configured || (baseUrl ? `${baseUrl}/family-guide` : null);

  if (!candidate) return EXTERNAL_CHECKOUT_RETURN_URL;

  try {
    const url = new URL(candidate);
    if (isPrivateCheckoutHost(url.hostname)) return EXTERNAL_CHECKOUT_RETURN_URL;
    const separator = url.search ? "&" : "?";
    return `${url.toString()}${separator}onboarding=${kind}&session_id={CHECKOUT_SESSION_ID}`;
  } catch {
    return EXTERNAL_CHECKOUT_RETURN_URL;
  }
}