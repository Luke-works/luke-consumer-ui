import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Email from "./Email";
import * as emailApi from "../../lib/emailApi";

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ session: { tenant: "t1", userId: "u1" } }),
}));
vi.mock("../../lib/capabilities", () => ({ canRead: () => true, EMAIL: "EMAIL" }));
vi.mock("../../components/common/PageMeta", () => ({ default: () => null }));
vi.mock("../../lib/emailApi", () => ({
  getEmailServer: vi.fn(),
  getVerification: vi.fn(),
  startVerification: vi.fn(),
  verifyCode: vi.fn(),
}));

const mocked = vi.mocked(emailApi);

const SERVER = {
  id: "s1",
  companySlug: "acme",
  senderDomain: "acme.com",
  defaultFrom: "hello@acme.com",
  messageStream: "outbound",
  status: "ACTIVE",
} as unknown as emailApi.EmailServer;

describe("Email setup (#33)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows a Retry affordance (not an endless spinner) when the load fails", async () => {
    mocked.getEmailServer.mockRejectedValue(new Error("network down"));

    render(<Email />);

    await waitFor(() => expect(screen.getByText(/couldn't load email setup/i)).toBeInTheDocument(), {
      timeout: 3000,
    });
    const retry = screen.getByRole("button", { name: /retry/i });

    // Retry succeeds → page resolves to the connected state.
    mocked.getEmailServer.mockReset();
    mocked.getEmailServer.mockResolvedValue(SERVER);
    await userEvent.click(retry);

    await waitFor(() => expect(screen.getByText(/your email is set up/i)).toBeInTheDocument());
  });

  it("disables the verify button when no attempts remain", async () => {
    mocked.getEmailServer.mockResolvedValue(null);
    mocked.getVerification.mockResolvedValue({
      id: "v1",
      status: "PENDING",
      email: "ops@acme.com",
      domain: "acme.com",
      orgName: "Acme",
      attemptsRemaining: 0,
    });

    render(<Email />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /verify & finish/i })).toBeDisabled(),
    );
    expect(screen.getByText(/no attempts left/i)).toBeInTheDocument();
  });

  it("threads an AbortSignal into the load calls", async () => {
    mocked.getEmailServer.mockResolvedValue(SERVER);
    render(<Email />);
    await waitFor(() => expect(mocked.getEmailServer).toHaveBeenCalled());
    // 2nd arg is the AbortSignal — the race fix relies on it being passed through.
    // (X-User-Id is no longer threaded from the browser — the auth gateway asserts it.)
    expect(mocked.getEmailServer.mock.calls[0][1]).toBeInstanceOf(AbortSignal);
  });
});
