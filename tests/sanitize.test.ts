import { describe, test, expect } from "vitest";
import { sanitizeHtml } from "../src/lib/sanitize";

describe("sanitizeHtml", () => {
  test("strips script tags", () => {
    expect(sanitizeHtml("<script>alert('xss')</script>hello")).toBe("hello");
  });

  test("strips event handler attributes", () => {
    expect(sanitizeHtml('<b onclick="alert(1)">bold</b>')).toBe("<b>bold</b>");
  });

  test("strips javascript: href", () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">link</a>')).toBe("link");
  });

  test("strips img tags", () => {
    expect(sanitizeHtml('<img src="x" onerror="alert(1)" />')).toBe("");
  });

  test("strips style attributes", () => {
    expect(sanitizeHtml('<b style="color:red">bold</b>')).toBe("<b>bold</b>");
  });

  test("allows <b> tag", () => {
    expect(sanitizeHtml("<b>bold</b>")).toBe("<b>bold</b>");
  });

  test("allows <i> tag", () => {
    expect(sanitizeHtml("<i>italic</i>")).toBe("<i>italic</i>");
  });

  test("allows <em> tag", () => {
    expect(sanitizeHtml("<em>emphasis</em>")).toBe("<em>emphasis</em>");
  });

  test("allows <strong> tag", () => {
    expect(sanitizeHtml("<strong>strong</strong>")).toBe("<strong>strong</strong>");
  });

  test("preserves plain text", () => {
    expect(sanitizeHtml("This is a plain text review.")).toBe("This is a plain text review.");
  });

  test("handles empty string", () => {
    expect(sanitizeHtml("")).toBe("");
  });

  test("handles unicode content", () => {
    const input = "Great 书! Loved it 😊";
    expect(sanitizeHtml(input)).toBe(input);
  });

  test("strips nested script in allowed tag", () => {
    expect(sanitizeHtml("<b><script>alert(1)</script>text</b>")).toBe("<b>text</b>");
  });
});
