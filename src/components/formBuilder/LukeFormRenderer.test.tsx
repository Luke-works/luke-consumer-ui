import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

// Capture what the wrapper forwards to the underlying @lukeflow/form-react renderer.
let captured: Record<string, unknown> = {};
vi.mock("@lukeflow/form-react", () => ({
  FormRenderer: (props: Record<string, unknown>) => {
    captured = props;
    return null;
  },
}));

import LukeFormRenderer from "./LukeFormRenderer";

const SCHEMA = JSON.stringify({ root: [], entities: {} });

describe("LukeFormRenderer — author-JS is safe by default", () => {
  beforeEach(() => {
    captured = {};
  });

  it("defaults allowJs to FALSE, so a read-only / unspecified surface never runs author JS", () => {
    // e.g. FormResponses / InstanceDetail render a submission read-only WITHOUT passing allowJs —
    // author JS must not execute in a staff/reviewer's browser (cross-trust XSS guard).
    render(<LukeFormRenderer schema={SCHEMA} readOnly />);
    expect(captured.allowJs).toBe(false);
  });

  it("forwards allowJs=true only when a fill/preview surface explicitly opts in", () => {
    render(<LukeFormRenderer schema={SCHEMA} allowJs />);
    expect(captured.allowJs).toBe(true);
  });

  it("honors an explicit allowJs={false}", () => {
    render(<LukeFormRenderer schema={SCHEMA} allowJs={false} />);
    expect(captured.allowJs).toBe(false);
  });

  it("forwards a sandboxed jsEvaluator to the underlying renderer", () => {
    const sandbox = () => ({ value: 1, show: true, valid: true, ok: true });
    render(<LukeFormRenderer schema={SCHEMA} allowJs jsEvaluator={sandbox as never} />);
    expect(captured.jsEvaluator).toBe(sandbox);
  });
});
