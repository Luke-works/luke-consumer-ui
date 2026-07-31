import { describe, it, expect } from "vitest";
import {
  canSaveSites,
  canonicalOrigin,
  invalidRowIndexes,
  isValidOrigin,
  parseEmbedSites,
  serializeEmbedSites,
  type EmbedSiteRow,
} from "./embedSites";

const row = (origin: string, name = ""): EmbedSiteRow => ({ origin, name });

describe("embedSites", () => {
  describe("parse", () => {
    it("pairs each origin with its stored label, in the server's order", () => {
      expect(parseEmbedSites("https://acme.com,https://shop.acme.com", { "https://acme.com": "Acme" }))
        .toEqual([
          { origin: "https://acme.com", name: "Acme" },
          { origin: "https://shop.acme.com", name: "" },
        ]);
    });

    it("reads an empty or absent allowlist as no rows", () => {
      expect(parseEmbedSites("", {})).toEqual([]);
      expect(parseEmbedSites(null, null)).toEqual([]);
      expect(parseEmbedSites("   ", undefined)).toEqual([]);
    });

    it("tolerates whitespace/newline separation, not just commas", () => {
      // The engine accepts either, and older forms were saved from a newline textarea.
      expect(parseEmbedSites("https://a.com\nhttps://b.com", {}).map((r) => r.origin))
        .toEqual(["https://a.com", "https://b.com"]);
    });
  });

  describe("serialize", () => {
    it("canonicalizes the origin so its label keys correctly", () => {
      // A label keyed by "HTTPS://Acme.com/" would be dropped server-side as an unknown origin.
      const { allowedEmbedOrigins, embedOriginNames } = serializeEmbedSites([row("HTTPS://Acme.com/", "Acme")]);
      expect(allowedEmbedOrigins).toBe("https://acme.com");
      expect(embedOriginNames).toEqual({ "https://acme.com": "Acme" });
    });

    it("drops blank rows and collapses duplicates to the first", () => {
      const { allowedEmbedOrigins, embedOriginNames } = serializeEmbedSites([
        row("https://a.com", "First"),
        row("  ", "ignored"),
        row("https://a.com", "Second"),
      ]);
      expect(allowedEmbedOrigins).toBe("https://a.com");
      expect(embedOriginNames).toEqual({ "https://a.com": "First" });
    });

    it("omits an empty name rather than storing a blank label", () => {
      expect(serializeEmbedSites([row("https://a.com", "   ")]).embedOriginNames).toEqual({});
    });

    it("KEEPS a malformed origin instead of silently dropping it", () => {
      // Filtering here would narrow the allowlist to whatever parsed, so a typo would look saved
      // while the site it was meant to permit stayed blocked. Better to let the save be refused.
      expect(serializeEmbedSites([row("acme.com", "No scheme")]).allowedEmbedOrigins).toBe("acme.com");
    });

    it("round-trips through parse", () => {
      const rows = [row("https://acme.com", "Acme"), row("https://*.acme.com", "Any subdomain")];
      const wire = serializeEmbedSites(rows);
      expect(parseEmbedSites(wire.allowedEmbedOrigins, wire.embedOriginNames)).toEqual(rows);
    });
  });

  describe("validation", () => {
    it.each([
      ["https://acme.com", true],
      ["http://localhost:3000", true],
      ["https://*.acme.com", true],
      ["https://acme.com/", true], // trailing slash is canonicalized away
      ["acme.com", false], // no scheme
      ["https://acme.com/path", false], // frame-ancestors is host-source based
      ["ftp://acme.com", false],
      ["https://*.*.acme.com", false], // one wildcard label only
      ["*", false],
    ])("%s → %s", (value, expected) => {
      expect(isValidOrigin(value)).toBe(expected);
    });

    it("flags the offending row by index, ignoring blanks", () => {
      expect(invalidRowIndexes([row("https://a.com"), row(""), row("nope")])).toEqual([2]);
    });

    it("allows saving an all-blank list — that is how a form is made public again", () => {
      expect(canSaveSites([row(""), row("")])).toBe(true);
      expect(canSaveSites([])).toBe(true);
    });

    it("blocks saving when any typed origin is malformed", () => {
      // The engine fails this closed with a 400; naming the row here is friendlier than that.
      expect(canSaveSites([row("https://a.com"), row("acme.com")])).toBe(false);
    });
  });

  it("canonicalOrigin lower-cases and strips trailing slashes", () => {
    expect(canonicalOrigin("  HTTPS://Acme.COM//  ")).toBe("https://acme.com");
  });
});
