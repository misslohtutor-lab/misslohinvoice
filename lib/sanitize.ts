// Allowlist HTML sanitizer for admin-composed email bodies. Pure (no DOM) so it
// runs on both the server action and the client preview.

const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "strike",
  "del",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "blockquote",
  "a",
  "div",
  "span",
  "hr",
]);

const VOID_TAGS = new Set(["br", "hr"]);

/**
 * Strip everything but a small set of formatting tags. All attributes are
 * dropped except a validated `href` on links, so pasted markup, inline styles,
 * event handlers, and scripts can't reach families or the preview iframe.
 */
export function sanitizeEmailHtml(input: string | null | undefined): string {
  if (!input) return "";
  let html = String(input);

  // Remove dangerous elements together with their contents.
  html = html.replace(/<(script|style|iframe|object|embed|head|title|svg|math)[\s\S]*?<\/\1\s*>/gi, "");
  html = html.replace(/<(script|style|iframe|object|embed|link|meta|base)[^>]*>/gi, "");
  html = html.replace(/<!--[\s\S]*?-->/g, "");

  html = html.replace(/<\/?([a-zA-Z0-9]+)([^<>]*)>/g, (match, rawName, rawAttrs) => {
    const name = String(rawName).toLowerCase();
    if (!ALLOWED_TAGS.has(name)) return "";

    if (match.startsWith("</")) return `</${name}>`;
    if (VOID_TAGS.has(name)) return `<${name}>`;

    let attrs = "";
    if (name === "a") {
      const match2 = /href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(rawAttrs);
      const href = (match2?.[1] ?? match2?.[2] ?? match2?.[3] ?? "").trim();
      if (/^(https?:|mailto:|\/)/i.test(href)) {
        attrs = ` href="${href.replace(/"/g, "&quot;")}" target="_blank" rel="noopener noreferrer"`;
      }
    }
    return `<${name}${attrs}>`;
  });

  return html.trim();
}

/** Rough plain-text rendering of sanitized HTML (for fallbacks and validation). */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-4]|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
