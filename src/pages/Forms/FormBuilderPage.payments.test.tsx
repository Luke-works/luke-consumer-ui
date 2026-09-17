import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import FormBuilderPage from "./FormBuilderPage";
import * as formsApi from "../../lib/formsApi";
import * as paymentsApi from "../../lib/paymentsApi";

const builderProps = vi.hoisted(() => ({ last: {} as Record<string, unknown> }));
vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ session: { tenant: "t1", userId: "u1", capabilities: { FORMS: "read-write" } } }),
}));
vi.mock("@lukeflow/form-builder", () => ({
  FormBuilder: React.forwardRef((props: Record<string, unknown>) => {
    builderProps.last = props;
    return null;
  }),
}));
vi.mock("../../components/common/PageMeta", () => ({ default: () => null }));
vi.mock("./AiAssistPanel", () => ({ default: () => null }));
vi.mock("./FormTestPanel", () => ({ default: () => null }));
vi.mock("./FormEmbedPanel", () => ({ default: () => null }));
vi.mock("../../components/formBuilder/LukeFormRenderer", () => ({ default: () => null }));
vi.mock("../../lib/formsApi", () => ({
  getForm: vi.fn(),
  checkout: vi.fn().mockResolvedValue({}),
  release: vi.fn().mockResolvedValue({}),
  checkIn: vi.fn(),
  publishVersion: vi.fn(),
  discardDraft: vi.fn(),
  saveDraft: vi.fn().mockResolvedValue({}),
  updateMeta: vi.fn().mockResolvedValue({}),
  getAudit: vi.fn().mockResolvedValue([]),
  latestVersion: () => 1,
}));
vi.mock("../../lib/paymentsApi", () => ({ getPaymentsStatus: vi.fn() }));

const forms = vi.mocked(formsApi);
const payments = vi.mocked(paymentsApi);

const PAID = {
  root: ["pay"],
  entities: { pay: { id: "pay", type: "payment", attributes: { key: "pay", label: "Fee", amountMode: "fixed", amountMinor: 500, currency: "USD" } } },
};
const PLAIN = { root: ["a"], entities: { a: { id: "a", type: "textField", attributes: { key: "a", label: "A" } } } };

function form(schema: object): formsApi.StoredForm {
  return {
    id: "f1", code: "C1", name: "Tickets", schema: JSON.stringify(schema),
    status: "draft", publishedVersion: undefined, latestVersion: 1, latestVersionSignedOff: true,
    showBranding: true, brandingLocked: true,
  } as unknown as formsApi.StoredForm;
}

const status = (over: Partial<paymentsApi.PaymentsStatus> = {}): paymentsApi.PaymentsStatus => ({
  enabled: true, livemode: false, planAllows: true, canManage: true, ready: true, account: null, ...over,
});

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/forms/f1"]}>
      <Routes>
        <Route path="/forms/:id" element={<FormBuilderPage />} />
        <Route path="/forms/payments" element={<p>Payments page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  builderProps.last = {};
  forms.checkout.mockResolvedValue({} as formsApi.StoredForm);
  forms.saveDraft.mockResolvedValue({} as never);
});

describe("builder ↔ payments", () => {
  it("offers the Payment field only where the workspace can take payments", async () => {
    forms.getForm.mockResolvedValue(form(PLAIN));
    payments.getPaymentsStatus.mockResolvedValue(status());
    renderPage();
    await waitFor(() => expect(builderProps.last.hiddenFields).toEqual([]));
  });

  it("hides it on a plan without payments, where payments are off, and when status can't load", async () => {
    for (const setup of [
      () => payments.getPaymentsStatus.mockResolvedValue(status({ planAllows: false })),
      () => payments.getPaymentsStatus.mockResolvedValue(status({ enabled: false })),
      () => payments.getPaymentsStatus.mockRejectedValue(new Error("offline")),
    ]) {
      forms.getForm.mockResolvedValue(form(PLAIN));
      setup();
      const { unmount } = render(
        <MemoryRouter initialEntries={["/forms/f1"]}>
          <Routes><Route path="/forms/:id" element={<FormBuilderPage />} /></Routes>
        </MemoryRouter>,
      );
      await waitFor(() => expect(payments.getPaymentsStatus).toHaveBeenCalled());
      await waitFor(() => expect(builderProps.last.hiddenFields).toEqual(["payment"]));
      unmount();
      vi.clearAllMocks();
    }
  });

  it("warns that a payment form can't go live until Stripe is set up, and links there", async () => {
    forms.getForm.mockResolvedValue(form(PAID));
    payments.getPaymentsStatus.mockResolvedValue(status({ ready: false }));
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText(/Connect a Stripe account that can accept payments before publishing it/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Set up payments" }));
    expect(await screen.findByText("Payments page")).toBeTruthy();
  });

  it("says a plan upgrade is needed when that's the blocker", async () => {
    forms.getForm.mockResolvedValue(form(PAID));
    payments.getPaymentsStatus.mockResolvedValue(status({ ready: false, planAllows: false }));
    renderPage();
    expect(await screen.findByText(/needs a paid plan/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "See plans" })).toBeTruthy();
  });

  it("no warning for a ready workspace or a form without a payment", async () => {
    forms.getForm.mockResolvedValue(form(PAID));
    payments.getPaymentsStatus.mockResolvedValue(status({ ready: true }));
    renderPage();
    await waitFor(() => expect(builderProps.last.hiddenFields).toEqual([]));
    expect(screen.queryByText(/takes a payment/)).toBeNull();
  });

  it("shows why a publish was refused", async () => {
    forms.getForm.mockResolvedValue(form(PAID));
    payments.getPaymentsStatus.mockResolvedValue(status({ ready: true }));
    forms.publishVersion.mockRejectedValue(new Error("This form takes a payment. Connect a Stripe account that can accept payments (Forms → Payments) first."));
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByRole("button", { name: /^publish$/i })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: /^publish$/i }));
    expect((await screen.findByRole("alert")).textContent).toContain("Connect a Stripe account");
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
