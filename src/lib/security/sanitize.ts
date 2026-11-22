/**
 * Normalises user-entered text. Text is only ever rendered as React text nodes
 * or onto a canvas (never as HTML), so this is defence-in-depth:
 * strip control / bidi-override characters, collapse whitespace, drop angle-bracket tags.
 */
export function sanitizeText(input: string): string {
  return input
    .normalize("NFC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[\u202A-\u202E\u2066-\u2069]/g, "")
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Escape for safe interpolation into JSON-LD <script> blocks */
export function escapeJsonForHtml(json: string) {
  return json.replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}
