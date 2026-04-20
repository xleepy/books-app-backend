import sanitize from "sanitize-html";

const ALLOWED_TAGS = ["b", "i", "em", "strong"];

export function sanitizeHtml(input: string): string {
  return sanitize(input, { allowedTags: ALLOWED_TAGS, allowedAttributes: {} });
}
