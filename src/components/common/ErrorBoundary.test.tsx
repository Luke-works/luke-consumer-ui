import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import ErrorBoundary from "./ErrorBoundary";

vi.mock("../../lib/reportError", () => ({ reportError: vi.fn() }));
import { reportError } from "../../lib/reportError";

function Boom({ explode }: { explode: boolean }): React.ReactElement {
  if (explode) throw new Error("kaboom");
  return <div>safe content</div>;
}

describe("ErrorBoundary (#22)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders a recoverable fallback and reports the error instead of crashing", () => {
    // React logs the caught error to console.error; silence it for a clean run.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom explode />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(reportError).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("renders a custom fallback when provided", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary fallback={(e) => <div>custom: {e.message}</div>}>
        <Boom explode />
      </ErrorBoundary>,
    );
    expect(screen.getByText("custom: kaboom")).toBeInTheDocument();
    spy.mockRestore();
  });

  it("resets when resetKeys change so a recovered route re-renders", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    function Harness() {
      const [key, setKey] = useState("a");
      return (
        <>
          <button onClick={() => setKey("b")}>navigate</button>
          <ErrorBoundary resetKeys={[key]}>
            <Boom explode={key === "a"} />
          </ErrorBoundary>
        </>
      );
    }

    render(<Harness />);
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    await userEvent.click(screen.getByText("navigate")); // changes resetKeys → boundary clears
    expect(screen.getByText("safe content")).toBeInTheDocument();
    spy.mockRestore();
  });
});
