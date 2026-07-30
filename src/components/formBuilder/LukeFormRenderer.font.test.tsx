import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import LukeFormRenderer from "./LukeFormRenderer";
import { DEFAULT_FONT, fontStack } from "../../lib/formFonts";

/**
 * The font wiring, at the ONE place that serves every surface. If `--lf-font` lands on the rendered form
 * here, it lands on the builder preview, the in-app fill, the public embed, the outbound respond page and
 * the PDF harness — they all go through this adapter.
 */
const schema = (settings?: Record<string, unknown>) =>
  JSON.stringify({
    root: ["a"],
    entities: { a: { id: "a", type: "textField", attributes: { key: "name", label: "Name" } } },
    ...(settings ? { settings } : {}),
  });

/** The renderer puts the resolved theme tokens on the <form> element's inline style. */
const formStyle = (container: HTMLElement) => container.querySelector("form")!.getAttribute("style") ?? "";

describe("LukeFormRenderer — the form's font", () => {
  it("applies a chosen font as the --lf-font token", () => {
    const { container } = render(<LukeFormRenderer schema={schema({ font: "mono" })} />);
    expect(formStyle(container)).toContain("--lf-font");
    expect(formStyle(container)).toContain("monospace");
  });

  it("falls back to the Lukeflow default when no font is set", () => {
    const { container } = render(<LukeFormRenderer schema={schema()} />);
    expect(formStyle(container)).toContain("Anek Telugu");
    expect(fontStack(undefined)).toBe(DEFAULT_FONT.stack);
  });

  it("ignores a hand-edited font value rather than injecting it into the style", () => {
    const evil = "x; background-image: url(https://evil.example/pixel)";
    const { container } = render(<LukeFormRenderer schema={schema({ font: evil })} />);
    const style = formStyle(container);
    expect(style).not.toContain("evil.example");
    expect(style).toContain("Anek Telugu"); // the default won
  });

  it("still renders when the schema is unparseable", () => {
    const { container } = render(<LukeFormRenderer schema={"{{{not json"} />);
    // Degrades to an empty form with the default font, not a crash.
    expect(container.querySelector("form")).toBeTruthy();
    expect(formStyle(container)).toContain("--lf-font");
  });
});
