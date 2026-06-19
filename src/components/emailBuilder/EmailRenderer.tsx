// EmailRenderer — maps an EmailDoc onto react-email components with arbitrary
// Tailwind classes. The <Tailwind> wrapper inlines those classes to style=""
// attributes (no <style> tag), so the same component tree drives both:
//   • the live in-app preview (this default export), and
//   • the compiled, DOCTYPE'd, table-based HTML we publish to Postmark
//     (compileEmail, using render() from @react-email/render).
//
// {{variables}} are kept LITERAL everywhere — Postmark (Mustachio) merges them at
// send time, so they must survive both render paths untouched.
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { render } from "@react-email/render";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";
import {
  DEFAULT_THEME,
  parseEmailDoc,
  type Align,
  type EmailBlock,
  type EmailDoc,
  type FontFamily,
} from "../../lib/emailDoc";

// react-email font stacks per the bounded theme.fontFamily values.
const FONT_STACK: Record<FontFamily, string> = {
  sans: "Helvetica, Arial, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "'Courier New', Courier, monospace",
};

const ALIGN_CLASS: Record<Align, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

const HEADING_SIZE: Record<number, string> = {
  1: "text-[24px]",
  2: "text-[20px]",
  3: "text-[16px]",
};

// ── Markdown-lite → React nodes ───────────────────────────────────────────────
// Supports **bold**, *italic*, and [label](url). {{vars}} pass through untouched
// (they're just text). Intentionally tiny — no nesting beyond a single span.
const MD_RE = /(\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)]+)\))/g;

function renderMarkdownLite(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(MD_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(<Fragment key={key++}>{text.slice(last, idx)}</Fragment>);
    if (m[2] !== undefined) {
      out.push(<strong key={key++}>{m[2]}</strong>);
    } else if (m[3] !== undefined) {
      out.push(<em key={key++}>{m[3]}</em>);
    } else if (m[4] !== undefined) {
      out.push(
        <Link key={key++} href={m[5]} className="text-inherit underline">
          {m[4]}
        </Link>,
      );
    }
    last = idx + m[0].length;
  }
  if (last < text.length) out.push(<Fragment key={key++}>{text.slice(last)}</Fragment>);
  return out;
}

// ── Block → component ─────────────────────────────────────────────────────────
function renderBlock(block: EmailBlock, brand: string, i: number): ReactNode {
  const align: Align = ("align" in block && block.align) || "left";
  switch (block.type) {
    case "heading":
      return (
        <Heading
          key={i}
          as={`h${block.level ?? 1}`}
          className={`m-0 mb-[12px] font-bold text-gray-900 ${HEADING_SIZE[block.level ?? 1]} ${ALIGN_CLASS[align]}`}
        >
          {block.text}
        </Heading>
      );
    case "text":
      return (
        <Text key={i} className={`m-0 mb-[12px] text-[14px] leading-[24px] text-gray-700 ${ALIGN_CLASS[align]}`}>
          {renderMarkdownLite(block.text)}
        </Text>
      );
    case "button":
      return (
        <Section key={i} className={`mb-[16px] ${ALIGN_CLASS[align]}`}>
          <Button
            href={block.href}
            className="inline-block rounded px-[20px] py-[12px] text-[14px] font-semibold no-underline"
            style={{ backgroundColor: block.bgColor || brand, color: block.textColor || "#ffffff" }}
          >
            {block.label}
          </Button>
        </Section>
      );
    case "image": {
      const img = (
        <Img
          src={block.src}
          alt={block.alt}
          {...(block.width ? { width: block.width } : {})}
          className="inline-block h-auto max-w-full"
        />
      );
      return (
        <Section key={i} className={`mb-[16px] ${ALIGN_CLASS[align]}`}>
          {block.href ? (
            <Link href={block.href} className="inline-block">
              {img}
            </Link>
          ) : (
            img
          )}
        </Section>
      );
    }
    case "divider":
      return <Hr key={i} className="my-[20px] border-gray-200" />;
    case "spacer":
      return <Section key={i} style={{ height: block.size ?? 24, lineHeight: `${block.size ?? 24}px` }} />;
    case "footer":
      return (
        <Section key={i} className="mt-[24px]">
          <Hr className="mb-[12px] border-gray-200" />
          <Text className="m-0 text-[12px] leading-[20px] text-gray-500">{renderMarkdownLite(block.text)}</Text>
          {block.unsubscribeUrl ? (
            <Text className="m-0 mt-[6px] text-[12px] text-gray-500">
              <Link href={block.unsubscribeUrl} className="text-gray-500 underline">
                Unsubscribe
              </Link>
            </Text>
          ) : null}
        </Section>
      );
    default:
      return null;
  }
}

// ── The email document component (drives both preview and compile) ────────────
export function Email({ doc }: { doc: EmailDoc }) {
  const theme = doc.theme ?? DEFAULT_THEME;
  const brand = theme.brandColor || DEFAULT_THEME.brandColor;
  const fontFamily = FONT_STACK[theme.fontFamily] ?? FONT_STACK.sans;
  return (
    <Html>
      <Head />
      {doc.preheader ? <Preview>{doc.preheader}</Preview> : null}
      <Tailwind>
        <Body style={{ backgroundColor: theme.backgroundColor || DEFAULT_THEME.backgroundColor, fontFamily, margin: 0 }}>
          <Container
            className="mx-auto my-[40px] rounded-lg p-[32px]"
            style={{ maxWidth: theme.contentWidth, backgroundColor: theme.contentBackground || DEFAULT_THEME.contentBackground }}
          >
            {doc.blocks.map((b, i) => renderBlock(b, brand, i))}
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

/**
 * Compile an EmailDoc to inlined, table-based HTML + a plain-text alternative —
 * the artifacts we hand to Postmark at check-in/publish. Works in the browser
 * (validated). {{vars}} are preserved literally for Postmark's merge.
 */
export async function compileEmail(doc: EmailDoc): Promise<{ html: string; text: string }> {
  const [html, text] = await Promise.all([
    render(<Email doc={doc} />),
    render(<Email doc={doc} />, { plainText: true }),
  ]);
  return { html, text };
}

/**
 * Live in-app preview. Accepts an EmailDoc or its JSON string (tolerant — a
 * corrupted draft is repaired, never thrown). Compiles the doc to HTML and shows
 * it inside an isolated iframe (srcDoc) so the email's inlined, table-based
 * markup renders exactly as Postmark will deliver it, and its styles can't leak
 * into (or inherit from) the app's stylesheet.
 */
export default function EmailRenderer({
  doc,
  className = "",
  height = 640,
}: {
  doc: EmailDoc | string;
  className?: string;
  height?: number;
}) {
  const [html, setHtml] = useState<string>("");
  const json = typeof doc === "string" ? doc : JSON.stringify(doc);

  useEffect(() => {
    let active = true;
    const parsed: EmailDoc = typeof doc === "string" ? parseEmailDoc(doc) : doc;
    render(<Email doc={parsed} />)
      .then((out) => active && setHtml(out))
      .catch(() => active && setHtml(""));
    return () => {
      active = false;
    };
    // Re-render whenever the doc content changes (string form is the stable key).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [json]);

  return (
    <iframe
      title="Email preview"
      srcDoc={html}
      className={`w-full rounded-lg border border-gray-200 bg-white dark:border-gray-800 ${className}`}
      style={{ height }}
      sandbox=""
    />
  );
}
