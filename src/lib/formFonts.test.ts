import { describe, it, expect, beforeEach } from "vitest";
import { DEFAULT_FONT, FORM_FONTS, ensureFontLoaded, fontStack, resolveFont } from "./formFonts";

describe("form font catalog", () => {
  beforeEach(() => {
    document.head.querySelectorAll("link[id^='lf-font-']").forEach((l) => l.remove());
  });

  it("has unique ids and a usable stack for every entry", () => {
    const ids = FORM_FONTS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const f of FORM_FONTS) {
      expect(f.stack.trim()).not.toBe("");
      expect(f.label.trim()).not.toBe("");
      expect(f.hint.trim()).not.toBe("");
    }
  });

  it("offers at least one font that needs NO third-party request", () => {
    // The privacy escape hatch: a form on an EU site must be able to avoid Google entirely.
    expect(FORM_FONTS.some((f) => !f.google)).toBe(true);
  });

  it("falls back to the default for anything unknown — never echoing the stored value", () => {
    // The critical property: `font` comes from a schema that a determined tenant can hand-edit, and it
    // ends up in a CSS custom property and a stylesheet URL. Only catalog entries may ever get through.
    expect(resolveFont(undefined)).toBe(DEFAULT_FONT);
    expect(resolveFont(null)).toBe(DEFAULT_FONT);
    expect(resolveFont("")).toBe(DEFAULT_FONT);
    expect(resolveFont("nope")).toBe(DEFAULT_FONT);
    expect(resolveFont("red; background: url(https://evil.example/x)")).toBe(DEFAULT_FONT);
    expect(fontStack("</style><script>alert(1)</script>")).toBe(DEFAULT_FONT.stack);
  });

  it("resolves a known id to its own stack", () => {
    expect(fontStack("mono")).toContain("monospace");
    expect(fontStack("serif")).toContain("Georgia");
    expect(fontStack("inter")).toContain("Inter");
  });

  it("loads a webfont once, and never for a system stack", () => {
    ensureFontLoaded("inter");
    ensureFontLoaded("inter");
    ensureFontLoaded("inter");
    const links = document.head.querySelectorAll("link[id='lf-font-inter']");
    expect(links).toHaveLength(1);
    expect(links[0]!.getAttribute("href")).toContain("family=Inter");
    // display=swap so text is never invisible while the font downloads.
    expect(links[0]!.getAttribute("href")).toContain("display=swap");

    ensureFontLoaded("system");
    ensureFontLoaded("serif");
    ensureFontLoaded("mono");
    expect(document.head.querySelectorAll("link[id^='lf-font-']")).toHaveLength(1);
  });

  it("builds the stylesheet URL from the catalog, not from the caller's string", () => {
    ensureFontLoaded("evil&family=Attacker");
    // Unknown id → default font's link, with the default's family. No attacker-controlled query.
    const links = [...document.head.querySelectorAll("link[id^='lf-font-']")];
    expect(links).toHaveLength(1);
    expect(links[0]!.getAttribute("href")).not.toContain("Attacker");
  });
});
