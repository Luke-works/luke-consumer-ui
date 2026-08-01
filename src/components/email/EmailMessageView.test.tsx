import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EmailMessageView, { formatSender, htmlToText, readableBody } from "./EmailMessageView";
import type { InboundEmail } from "../../lib/emailIntakeApi";

const base: InboundEmail = {
  id: "m1",
  tenantId: "t1",
  boxId: "b1",
  boxAddress: "support@acme.com",
  mailboxHash: "support",
  fromName: "Jo Bloggs",
  toFull: "support@acme.com",
  ccAddresses: null,
  replyTo: null,
  textBody: "I was charged twice.",
  htmlBody: "<p>I was charged twice.</p>",
  strippedTextReply: null,
  messageIdHeader: "<a@b>",
  inReplyTo: null,
  attachments: null,
  headers: null,
  attachmentCount: 0,
};

describe("EmailMessageView", () => {
  it("shows the sender, recipient and body", () => {
    render(<EmailMessageView email={base} from="jo@example.com" />);
    expect(screen.getByText("Jo Bloggs <jo@example.com>")).toBeInTheDocument();
    expect(screen.getByText("support@acme.com")).toBeInTheDocument();
    expect(screen.getByText("I was charged twice.")).toBeInTheDocument();
  });

  it("never renders the sender's HTML into the page", async () => {
    // The body is written by an unauthenticated stranger. Rendering it — even sanitised — puts
    // remote images, arbitrary CSS and one sanitiser bug next to an authenticated session.
    const hostile: InboundEmail = {
      ...base,
      textBody: null,
      strippedTextReply: null,
      htmlBody: '<p>hello</p><img src="https://tracker.example/x.gif"><script>window.__pwned=1</script>',
    };
    const { container } = render(<EmailMessageView email={hostile} />);

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
    // The readable words still survive, so suppressing the markup is not the same as losing it.
    expect(screen.getByText(/hello/)).toBeInTheDocument();
  });

  it("lists attachments as metadata and says the bytes are not kept", () => {
    const withFiles: InboundEmail = {
      ...base,
      attachmentCount: 1,
      attachments: JSON.stringify([{ name: "invoice.pdf", contentType: "application/pdf", contentLength: 2048 }]),
    };
    render(<EmailMessageView email={withFiles} />);
    expect(screen.getByText("invoice.pdf")).toBeInTheDocument();
    expect(screen.getByText(/application\/pdf · 2\.0 KB/)).toBeInTheDocument();
    expect(screen.getByText(/contents are not stored/i)).toBeInTheDocument();
  });

  it("keeps original headers behind a toggle", async () => {
    const withHeaders: InboundEmail = {
      ...base,
      headers: JSON.stringify([{ Name: "X-Spam-Status", Value: "No" }]),
    };
    render(<EmailMessageView email={withHeaders} />);

    expect(screen.queryByText("X-Spam-Status")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /show original headers/i }));
    expect(screen.getByText("X-Spam-Status")).toBeInTheDocument();
  });

  it("says so plainly when there is nothing readable", () => {
    render(<EmailMessageView email={{ ...base, textBody: null, htmlBody: null, strippedTextReply: null }} />);
    expect(screen.getByText(/no readable text/i)).toBeInTheDocument();
  });
});

describe("readableBody prefers the most useful text", () => {
  it("uses the stripped reply over the full quoted thread", () => {
    expect(readableBody({
      strippedTextReply: "Just this bit",
      textBody: "Just this bit\n\n> On Monday, someone wrote:\n> a very long quoted thread",
      htmlBody: null,
    })).toBe("Just this bit");
  });

  it("falls back to the text body, then to text recovered from HTML", () => {
    expect(readableBody({ strippedTextReply: null, textBody: "plain", htmlBody: "<p>html</p>" })).toBe("plain");
    expect(readableBody({ strippedTextReply: null, textBody: null, htmlBody: "<p>html</p>" })).toBe("html");
    expect(readableBody({ strippedTextReply: "   ", textBody: "  ", htmlBody: null })).toBe("");
  });
});

describe("htmlToText", () => {
  it("drops script and style CONTENT, not just their tags", () => {
    // Stripping tags alone would leave the script body as visible "text".
    expect(htmlToText("<style>.a{color:red}</style><p>Hi</p><script>alert(1)</script>")).toBe("Hi");
  });

  it("turns block boundaries into line breaks and decodes entities", () => {
    expect(htmlToText("<p>One</p><p>Two</p>")).toBe("One\nTwo");
    expect(htmlToText("a<br>b")).toBe("a\nb");
    expect(htmlToText("&lt;tag&gt; &amp; &quot;quotes&quot;")).toBe('<tag> & "quotes"');
  });

  it("decodes each entity exactly once, so nothing is double-unescaped", () => {
    // A sender who writes "&amp;lt;" means the reader to SEE "&lt;". Decoding &amp; first and
    // then &lt; would turn it into "<" — the shape CodeQL flags as js/double-escaping.
    expect(htmlToText("&amp;lt;")).toBe("&lt;");
    expect(htmlToText("&amp;amp;")).toBe("&amp;");
    expect(htmlToText("a &amp;gt; b")).toBe("a &gt; b");
    // Ordinary single-level entities still decode.
    expect(htmlToText("&lt;b&gt; &amp; &quot;q&quot; &#39;a&#39;")).toBe("<b> & \"q\" 'a'");
    // An entity we do not know is left alone rather than mangled.
    expect(htmlToText("&copy; 2026")).toBe("&copy; 2026");
  });

  it("collapses runaway whitespace and handles empty input", () => {
    expect(htmlToText("")).toBe("");
    expect(htmlToText("<div>a</div><div></div><div></div><div>b</div>")).toBe("a\n\nb");
  });
});

describe("formatSender", () => {
  it("combines what it has and degrades to whichever half exists", () => {
    expect(formatSender("jo@example.com", "Jo")).toBe("Jo <jo@example.com>");
    expect(formatSender("jo@example.com", null)).toBe("jo@example.com");
    expect(formatSender(null, "Jo")).toBe("Jo");
    expect(formatSender(null, null)).toBeNull();
    expect(formatSender("  ", "  ")).toBeNull();
  });
});
