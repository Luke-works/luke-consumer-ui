import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import TruncationNotice from "./TruncationNotice";

describe("TruncationNotice (#26)", () => {
  it("renders nothing when the full set was returned", () => {
    const { container } = render(<TruncationNotice shown={40} total={40} noun="submissions" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("warns when more rows exist server-side than were loaded", () => {
    render(<TruncationNotice shown={200} total={1234} noun="submissions" />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(/showing the most recent 200 of 1234 submissions/i);
    expect(status).toHaveTextContent(/refine by form or status/i);
  });
});
