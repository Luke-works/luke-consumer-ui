import { describe, it, expect } from "vitest";
import { CONSENT_DEFAULT_TEXT, CONSENT_MAX_LENGTH, readConsent } from "./formSchema";
import { linkifyConsent } from "../components/formBuilder/FormConsentGate";

const withConsent = (consent: unknown) =>
  JSON.stringify({ root: [], entities: {}, settings: { consent } });

describe("readConsent — the form's consent requirement", () => {
  it("is off for a form that never configured it", () => {
    expect(readConsent(JSON.stringify({ root: [], entities: {} }))).toEqual({ enabled: false, text: "" });
    expect(readConsent(null).enabled).toBe(false);
    expect(readConsent("not json").enabled).toBe(false);
  });

  it("is off when explicitly disabled, even with wording left behind", () => {
    // Switching the requirement off must not keep demanding agreement just because the text survived.
    const c = readConsent(withConsent({ enabled: false, text: "Old wording" }));
    expect(c.enabled).toBe(false);
  });

  it("reports the author's wording when enabled", () => {
    expect(readConsent(withConsent({ enabled: true, text: "  I agree.  " }))).toEqual({
      enabled: true,
      text: "I agree.",
    });
  });

  it("substitutes the standard statement when enabled with blank wording", () => {
    // Matches ConsentTerms.DEFAULT_TEXT server-side. If these drift, a filler would agree to one
    // statement while a different one is recorded — the exact failure this feature exists to prevent.
    expect(readConsent(withConsent({ enabled: true, text: "   " }))).toEqual({
      enabled: true,
      text: CONSENT_DEFAULT_TEXT,
    });
    expect(readConsent(withConsent({ enabled: true })).text).toBe(CONSENT_DEFAULT_TEXT);
  });

  it("bounds an absurdly long statement to what the server stores", () => {
    const huge = "A".repeat(CONSENT_MAX_LENGTH + 400);
    expect(readConsent(withConsent({ enabled: true, text: huge })).text).toHaveLength(CONSENT_MAX_LENGTH);
  });

  it("ignores a non-object or non-string consent setting instead of throwing", () => {
    expect(readConsent(withConsent("nope")).enabled).toBe(false);
    expect(readConsent(withConsent({ enabled: true, text: 42 })).text).toBe(CONSENT_DEFAULT_TEXT);
  });
});

describe("linkifyConsent — reachable terms without rendering tenant HTML", () => {
  it("leaves plain wording as a single text piece", () => {
    expect(linkifyConsent("I agree to the terms.")).toEqual([{ text: "I agree to the terms." }]);
  });

  it("turns an http(s) URL into a link and keeps the surrounding prose", () => {
    const parts = linkifyConsent("See https://acme.example/terms for details.");
    expect(parts).toEqual([
      { text: "See " },
      { text: "https://acme.example/terms", href: "https://acme.example/terms" },
      { text: " for details." },
    ]);
  });

  it("leaves a trailing full stop out of the URL", () => {
    const parts = linkifyConsent("Terms: https://acme.example/terms.");
    expect(parts[1]).toEqual({ text: "https://acme.example/terms", href: "https://acme.example/terms" });
    expect(parts[2]).toEqual({ text: "." });
  });

  it("never linkifies a dangerous scheme", () => {
    // The statement is rendered as TEXT, so the only markup possible is an anchor we build — and we
    // build one only for http/https. A javascript: or data: URL stays inert prose.
    for (const bad of ["javascript:alert(1)", "data:text/html,<script>x</script>", "file:///etc/passwd"]) {
      expect(linkifyConsent(`Click ${bad} now`).every((p) => p.href === undefined)).toBe(true);
    }
  });

  it("does not treat an injected tag as markup", () => {
    const parts = linkifyConsent('I agree <img src=x onerror="alert(1)">');
    expect(parts.every((p) => p.href === undefined)).toBe(true);
    // The angle brackets survive as literal characters — React escapes them on render.
    expect(parts.map((p) => p.text).join("")).toContain("<img");
  });

  it("handles several URLs in one statement", () => {
    const parts = linkifyConsent("Terms https://a.example and privacy https://b.example apply");
    expect(parts.filter((p) => p.href)).toHaveLength(2);
  });
});
