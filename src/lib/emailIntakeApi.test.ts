import { describe, it, expect } from "vitest";
import { describeMatch, parseAttachments, parseHeaders } from "./emailIntakeApi";

// The attachment/header columns are TEXT holding JSON written by the engine. Every one of these
// cases is something a render must survive, because the alternative is a blank inbox pane.
describe("inbound content parsing is total", () => {
  it("reads well-formed attachment metadata", () => {
    const raw = JSON.stringify([{ name: "invoice.pdf", contentType: "application/pdf", contentLength: 1024 }]);
    expect(parseAttachments(raw)).toEqual([
      { name: "invoice.pdf", contentType: "application/pdf", contentLength: 1024 },
    ]);
  });

  it("returns empty for null, blank, malformed JSON, or a non-array", () => {
    expect(parseAttachments(null)).toEqual([]);
    expect(parseAttachments("")).toEqual([]);
    expect(parseAttachments("{not json")).toEqual([]);
    expect(parseAttachments('{"an":"object"}')).toEqual([]);
    expect(parseHeaders(null)).toEqual([]);
    expect(parseHeaders("nope")).toEqual([]);
  });

  it("normalises headers from Postmark's Name/Value casing", () => {
    const raw = JSON.stringify([
      { Name: "Message-ID", Value: "<a@b>" },
      { name: "In-Reply-To", value: "<c@d>" },
      { Value: "no name — dropped" },
    ]);
    expect(parseHeaders(raw)).toEqual([
      { name: "Message-ID", value: "<a@b>" },
      { name: "In-Reply-To", value: "<c@d>" },
    ]);
  });
});

describe("describeMatch reads as a sentence", () => {
  it("renders each field/operator pair", () => {
    expect(describeMatch({ matchField: "SUBJECT", matchOperator: "CONTAINS", matchValue: "invoice" }))
      .toBe("Subject contains “invoice”");
    expect(describeMatch({ matchField: "FROM", matchOperator: "STARTS_WITH", matchValue: "billing@" }))
      .toBe("From starts with “billing@”");
    expect(describeMatch({ matchField: "ANY", matchOperator: "REGEX", matchValue: "^\\[T-\\d+\\]" }))
      .toBe("Anything matches “^\\[T-\\d+\\]”");
  });
});
