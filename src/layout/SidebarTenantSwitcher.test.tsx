import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SidebarTenantSwitcher from "./SidebarTenantSwitcher";

// Controllable auth state + spies, swapped per test.
const switchTenant = vi.fn().mockResolvedValue(undefined);
const navigate = vi.fn();
let session: Record<string, unknown> | null;

vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ session, switchTenant }) }));
vi.mock("../context/SidebarContext", () => ({ useSidebar: () => ({ isExpanded: true, isHovered: false, isMobileOpen: false }) }));
vi.mock("react-router", () => ({ useNavigate: () => navigate }));

beforeEach(() => {
  switchTenant.mockClear();
  navigate.mockClear();
});

describe("SidebarTenantSwitcher", () => {
  it("shows the tenant NAME (not the id) and no switcher for a single-org user", () => {
    session = { tenant: "TEN-ABC-01JAN26", tenants: ["TEN-ABC-01JAN26"], tenantNames: { "TEN-ABC-01JAN26": "Acme Corp" } };
    render(<SidebarTenantSwitcher />);
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.queryByText("TEN-ABC-01JAN26")).not.toBeInTheDocument();
    // Single org → static label, no toggle button and no menu.
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("falls back to the tenant id when names aren't supplied (older backend)", () => {
    session = { tenant: "TEN-ABC-01JAN26", tenants: ["TEN-ABC-01JAN26"] };
    render(<SidebarTenantSwitcher />);
    expect(screen.getByText("TEN-ABC-01JAN26")).toBeInTheDocument();
  });

  it("renders nothing for an unprovisioned user (no tenant)", () => {
    session = { tenant: null, tenants: [] };
    const { container } = render(<SidebarTenantSwitcher />);
    expect(container).toBeEmptyDOMElement();
  });

  it("switches the active tenant and returns home when a different org is picked", async () => {
    session = {
      tenant: "TEN-ABC-01JAN26",
      tenants: ["TEN-ABC-01JAN26", "TEN-XYZ-02FEB26"],
      tenantNames: { "TEN-ABC-01JAN26": "Acme Corp", "TEN-XYZ-02FEB26": "Globex" },
    };
    render(<SidebarTenantSwitcher />);
    // Multi-org → a toggle opens the menu.
    await userEvent.click(screen.getByRole("button", { name: /acme corp/i }));
    const globex = await screen.findByRole("button", { name: /globex/i });
    await userEvent.click(globex);
    await waitFor(() => expect(switchTenant).toHaveBeenCalledWith("TEN-XYZ-02FEB26"));
    expect(navigate).toHaveBeenCalledWith("/");
  });

  it("does not switch when the current org is re-selected", async () => {
    session = {
      tenant: "TEN-ABC-01JAN26",
      tenants: ["TEN-ABC-01JAN26", "TEN-XYZ-02FEB26"],
      tenantNames: { "TEN-ABC-01JAN26": "Acme Corp", "TEN-XYZ-02FEB26": "Globex" },
    };
    render(<SidebarTenantSwitcher />);
    await userEvent.click(screen.getByRole("button", { name: /acme corp/i }));
    // The current org appears in the menu with a check; clicking it is a no-op.
    const items = await screen.findAllByRole("button", { name: /acme corp/i });
    await userEvent.click(items[items.length - 1]);
    expect(switchTenant).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
