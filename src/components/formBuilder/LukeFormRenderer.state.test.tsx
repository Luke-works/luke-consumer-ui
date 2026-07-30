import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LukeFormRenderer from "./LukeFormRenderer";

// NB: drives the REAL vendored @lukeflow/form-react engine — that is the whole point, so
// these cases cannot live in LukeFormRenderer.test.tsx, which mocks the package to inspect
// the props the adapter forwards.

// One required text field — enough to prove values survive, and that submit isn't blocked by a
// bogus "required" error on a field the user already filled.
const SCHEMA = JSON.stringify({
  root: ["a"],
  entities: {
    a: { id: "a", type: "textField", attributes: { key: "fullName", label: "Full name", required: true } },
  },
});

/**
 * The embed hosts the renderer next to an Attachments tab: uploading a file bumps a count in the
 * HOST's state, which re-renders the host — and with it this renderer. The engine is rebuilt only
 * when the schema IDENTITY changes, so the adapter must not hand it a freshly-parsed object each
 * render or every host re-render silently wipes what the user typed.
 */
function Host({ onSubmit }: { onSubmit: (d: Record<string, unknown>) => void }) {
  const [count, setCount] = useState(0);
  return (
    <div>
      <button type="button" onClick={() => setCount((c) => c + 1)}>
        attachment-added
      </button>
      <span>count:{count}</span>
      {/* Inline literals on purpose: a host re-render churns these prop identities. */}
      <LukeFormRenderer schema={SCHEMA} onSubmit={onSubmit} submitting={false} allowJs={false} />
    </div>
  );
}

describe("LukeFormRenderer — engine state survives host re-renders", () => {
  it("keeps typed values when the host re-renders (embed attachments tab)", async () => {
    const onSubmit = vi.fn();
    render(<Host onSubmit={onSubmit} />);

    const input = await screen.findByLabelText(/full name/i);
    await userEvent.type(input, "Ada Lovelace");
    expect(input).toHaveValue("Ada Lovelace");

    // An attachment upload finishing = host state change = re-render of this subtree.
    await userEvent.click(screen.getByText("attachment-added"));
    expect(screen.getByText("count:1")).toBeInTheDocument();

    // The DOM can still LOOK filled while the engine behind it was rebuilt empty — so assert on
    // what actually gets submitted, which is what the server validates.
    expect(screen.getByLabelText(/full name/i)).toHaveValue("Ada Lovelace");
    await userEvent.click(screen.getByRole("button", { name: /submit/i }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ fullName: "Ada Lovelace" }));
  });

  it("still rebuilds when the schema itself changes (builder preview)", async () => {
    function Editing() {
      const [label, setLabel] = useState("Full name");
      const schema = JSON.stringify({
        root: ["a"],
        entities: { a: { id: "a", type: "textField", attributes: { key: "fullName", label } } },
      });
      return (
        <div>
          <button type="button" onClick={() => setLabel("Legal name")}>
            rename
          </button>
          <LukeFormRenderer schema={schema} allowJs={false} />
        </div>
      );
    }
    render(<Editing />);

    expect(await screen.findByLabelText(/full name/i)).toBeInTheDocument();
    await userEvent.click(screen.getByText("rename"));
    expect(await screen.findByLabelText(/legal name/i)).toBeInTheDocument();
  });
});
