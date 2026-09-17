import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { StrictMode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import PaymentsSettings from "./PaymentsSettings";
import * as api from "../../lib/paymentsApi";
import { ApiError } from "../../lib/authApi";

const switchTenant = vi.hoisted(() => vi.fn());
vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ session: { tenant: "t1", userId: "u1" }, switchTenant }),
}));
vi.mock("../../components/common/PageMeta", () => ({ default: () => null }));
vi.mock("../../lib/paymentsApi", () => ({
  getPaymentsStatus: vi.fn(),
  startStripeConnect: vi.fn(),
  completeStripeConnect: vi.fn(),
  refreshPaymentsAccount: vi.fn(),
  disconnectStripe: vi.fn(),
}));

const m = vi.mocked(api);

const ACCOUNT: api.ConnectedAccount = {
  accountId: "acct_123", status: "CONNECTED", livemode: false, chargesEnabled: true, detailsSubmitted: true,
  displayName: "Ada's Tickets", defaultCurrency: "USD", country: "US", connectedAt: "2026-09-16T10:00", modeMismatch: false,
};

const status = (over: Partial<api.PaymentsStatus> = {}): api.PaymentsStatus => ({
  enabled: true, livemode: false, planAllows: true, canManage: true, ready: false, account: null, ...over,
});

let lastLocation = "";
function LocationProbe() {
  const loc = useLocation();
  lastLocation = loc.pathname + loc.search;
  return null;
}

// StrictMode on purpose: the app runs under it, and it runs effects twice — which is exactly what
// the one-time OAuth completion has to survive.
function renderAt(url: string) {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={[url]}>
        <LocationProbe />
        <Routes>
          <Route path="/forms/payments" element={<PaymentsSettings />} />
          <Route path="/plans" element={<p>Plans page</p>} />
        </Routes>
      </MemoryRouter>
    </StrictMode>,
  );
}

describe("Forms → Payments", () => {
  const assign = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, assign, href: "http://localhost/" } });
  });
  afterEach(() => vi.restoreAllMocks());

  it("an owner with nothing connected can start connecting Stripe", async () => {
    m.getPaymentsStatus.mockResolvedValue(status());
    m.startStripeConnect.mockResolvedValue({ url: "https://connect.stripe.com/oauth/authorize?state=abc" });
    const user = userEvent.setup();
    renderAt("/forms/payments");
    expect(await screen.findByText("No account connected.")).toBeTruthy();
    expect(screen.getByText(/test card 4242 4242 4242 4242/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Connect Stripe" }));
    expect(m.startStripeConnect).toHaveBeenCalledWith("t1");
    expect(assign).toHaveBeenCalledWith("https://connect.stripe.com/oauth/authorize?state=abc");
  });

  it("switches to the workspace that started the connection when the page came back in another", async () => {
    switchTenant.mockResolvedValue(undefined);
    m.completeStripeConnect.mockResolvedValue(status({ ready: true, account: ACCOUNT, tenantId: "t2" }));
    m.getPaymentsStatus.mockResolvedValue(status({ ready: true, account: ACCOUNT }));
    renderAt("/forms/payments?code=ac_1&state=st_1");
    expect(await screen.findByText("Stripe is connected. Your forms can take payments.")).toBeTruthy();
    await waitFor(() => expect(switchTenant).toHaveBeenCalledWith("t2"));
    expect(switchTenant).toHaveBeenCalledTimes(1);
    // The other workspace's account is never shown under this workspace's buttons.
    expect(screen.queryByText("Ada's Tickets")).toBeNull();
    expect(screen.queryByRole("button", { name: "Disconnect" })).toBeNull();
  });

  it("if switching fails, it says so and shows this workspace's own status", async () => {
    switchTenant.mockRejectedValue(new Error("stale session"));
    m.completeStripeConnect.mockResolvedValue(status({ ready: true, account: ACCOUNT, tenantId: "t2" }));
    m.getPaymentsStatus.mockResolvedValue(status());
    renderAt("/forms/payments?code=ac_1&state=st_1");
    expect(await screen.findByText(/couldn't switch to that workspace/)).toBeTruthy();
    expect(await screen.findByText("No account connected.")).toBeTruthy();
    expect(m.getPaymentsStatus).toHaveBeenCalledWith("t1");
    expect(screen.queryByText("Ada's Tickets")).toBeNull();
  });

  it("an unfinished disconnect can be retried", async () => {
    m.getPaymentsStatus.mockResolvedValue(status({ account: { ...ACCOUNT, status: "DISCONNECTING" } }));
    renderAt("/forms/payments");
    expect(await screen.findByText(/Disconnecting didn't finish/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Disconnect" })).toBeTruthy();
  });

  it("doesn't switch when the connection was started in this workspace", async () => {
    m.completeStripeConnect.mockResolvedValue(status({ ready: true, account: ACCOUNT, tenantId: "t1" }));
    renderAt("/forms/payments?code=ac_1&state=st_1");
    expect(await screen.findByText("Stripe is connected. Your forms can take payments.")).toBeTruthy();
    expect(switchTenant).not.toHaveBeenCalled();
  });

  it("completes Stripe's return exactly once and clears the code from the address bar", async () => {
    m.completeStripeConnect.mockResolvedValue(status({ ready: true, account: ACCOUNT }));
    renderAt("/forms/payments?code=ac_1&state=st_1&scope=read_write");
    expect(await screen.findByText("Stripe is connected. Your forms can take payments.")).toBeTruthy();
    expect(m.completeStripeConnect).toHaveBeenCalledTimes(1);
    expect(m.completeStripeConnect).toHaveBeenCalledWith("t1", "ac_1", "st_1");
    expect(screen.getByText(/Ready to take payments · settles in USD/)).toBeTruthy();
    await waitFor(() => expect(lastLocation).toBe("/forms/payments"));
  });

  it("shows the server's reason when completing fails, and still loads the status", async () => {
    m.completeStripeConnect.mockRejectedValue(new ApiError(400, "This connection link has expired or wasn't started here. Please connect again."));
    m.getPaymentsStatus.mockResolvedValue(status());
    renderAt("/forms/payments?code=ac_1&state=old");
    expect(await screen.findByText(/connection link has expired/)).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Connect Stripe" })).toBeTruthy();
  });

  it("explains a cancelled connection", async () => {
    m.getPaymentsStatus.mockResolvedValue(status());
    renderAt("/forms/payments?error=access_denied&error_description=The+user+denied");
    expect(await screen.findByText("Connecting Stripe was cancelled.")).toBeTruthy();
    expect(m.completeStripeConnect).not.toHaveBeenCalled();
  });

  it("a connected account that can't charge yet says what to do", async () => {
    m.getPaymentsStatus.mockResolvedValue(status({ account: { ...ACCOUNT, chargesEnabled: false } }));
    m.refreshPaymentsAccount.mockResolvedValue(status({ ready: true, account: ACCOUNT }));
    const user = userEvent.setup();
    renderAt("/forms/payments");
    expect(await screen.findByText(/Stripe needs more details/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Check again" }));
    expect(await screen.findByText(/Ready to take payments/)).toBeTruthy();
  });

  it("disconnecting asks first", async () => {
    m.getPaymentsStatus.mockResolvedValue(status({ ready: true, account: ACCOUNT }));
    m.disconnectStripe.mockResolvedValue(status({ account: { ...ACCOUNT, status: "DISCONNECTED", chargesEnabled: false } }));
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const user = userEvent.setup();
    renderAt("/forms/payments");
    await user.click(await screen.findByRole("button", { name: "Disconnect" }));
    expect(m.disconnectStripe).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(await screen.findByText("Stripe was disconnected.")).toBeTruthy();
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/Disconnected\. Connect an account/)).toBeTruthy();
  });

  it("members see the status but can't manage it", async () => {
    m.getPaymentsStatus.mockResolvedValue(status({ canManage: false }));
    renderAt("/forms/payments");
    expect(await screen.findByText("Ask a workspace owner to connect Stripe.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Connect Stripe" })).toBeNull();
  });

  it("points a free workspace at the plans", async () => {
    m.getPaymentsStatus.mockResolvedValue(status({ planAllows: false }));
    renderAt("/forms/payments");
    expect(await screen.findByText(/included on the Pro plan and above/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "See plans" }).getAttribute("href")).toBe("/plans");
  });

  it("says when the environment has no payments at all", async () => {
    m.getPaymentsStatus.mockResolvedValue(status({ enabled: false }));
    renderAt("/forms/payments");
    expect(await screen.findByText(/aren't available on this Lukeflow environment/)).toBeTruthy();
  });

  it("warns about a test/live mismatch", async () => {
    m.getPaymentsStatus.mockResolvedValue(status({ livemode: true, account: { ...ACCOUNT, livemode: false, modeMismatch: true } }));
    renderAt("/forms/payments");
    expect(await screen.findByText(/connected in test mode, but this environment uses live mode/)).toBeTruthy();
  });
});
