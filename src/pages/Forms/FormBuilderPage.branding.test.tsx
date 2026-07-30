import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import FormBuilderPage from "./FormBuilderPage";
import * as formsApi from "../../lib/formsApi";

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ session: { tenant: "t1", userId: "u1", capabilities: { FORMS: "read-write" } } }),
}));
vi.mock("@lukeflow/form-builder", () => ({ FormBuilder: React.forwardRef(() => null) }));
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
  saveDraft: vi.fn(),
  updateMeta: vi.fn().mockResolvedValue({}),
  getAudit: vi.fn().mockResolvedValue([]),
  latestVersion: () => 1,
}));

const mocked = vi.mocked(formsApi);

const CLEAN = { root: ["a"], entities: { a: { type: "textField", attributes: { key: "a1", label: "A" } } } };

function form(over: Partial<formsApi.StoredForm> = {}): formsApi.StoredForm {
  return {
    id: "f1", code: "C1", name: "Contact", schema: JSON.stringify(CLEAN),
    status: "published", publishedVersion: 1, latestVersion: 1, latestVersionSignedOff: false,
    showBranding: true, brandingLocked: true,
    ...over,
  } as formsApi.StoredForm;
}

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/forms/f1"]}>
      <Routes><Route path="/forms/:id" element={<FormBuilderPage />} /></Routes>
    </MemoryRouter>,
  );
}

/** Check out (so settings are editable) and open the Form settings modal (lands on General). */
async function openSettings(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: /^checkout$/i }));
  await user.click(screen.getByRole("button", { name: /form settings/i })); // the gear
  await screen.findByRole("heading", { name: /form settings/i });
}

/** The badge option lives on the Appearance tab, alongside the font. */
async function gotoAppearance(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("tab", { name: /appearance/i }));
  await screen.findByRole("checkbox", { name: /developed at lukeflow/i });
}

const badgeToggle = () => screen.getByRole("checkbox", { name: /developed at lukeflow/i });

beforeEach(() => {
  vi.clearAllMocks();
  mocked.checkout.mockResolvedValue({} as formsApi.StoredForm);
  mocked.updateMeta.mockResolvedValue({});
});

describe("Form settings — the “Developed at Lukeflow” option", () => {
  it("is locked ON with a paid-plan hint for a free tenant", async () => {
    const user = userEvent.setup();
    mocked.getForm.mockResolvedValue(form({ showBranding: true, brandingLocked: true }));
    renderPage();
    await openSettings(user);
    await gotoAppearance(user);

    expect(badgeToggle()).toBeChecked();
    expect(badgeToggle()).toBeDisabled();
    expect(screen.getByText(/^Paid plan$/)).toBeInTheDocument();
    expect(screen.getByText(/available on paid plans/i)).toBeInTheDocument();
    // The real badge is previewed so the author sees exactly what a filler will see.
    expect(screen.getByRole("link", { name: /developed at lukeflow/i })).toBeInTheDocument();
  });

  it("is editable for a paying tenant and saves the change as form metadata", async () => {
    const user = userEvent.setup();
    mocked.getForm.mockResolvedValue(form({ showBranding: true, brandingLocked: false }));
    renderPage();
    await openSettings(user);
    await gotoAppearance(user);

    expect(badgeToggle()).toBeEnabled();
    expect(screen.queryByText(/^Paid plan$/)).not.toBeInTheDocument();

    await user.click(badgeToggle());
    expect(badgeToggle()).not.toBeChecked();
    // Preview disappears with the option, so the modal always reflects the live outcome.
    expect(screen.queryByRole("link", { name: /developed at lukeflow/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(mocked.updateMeta).toHaveBeenCalled());
    expect(mocked.updateMeta).toHaveBeenCalledWith("t1", "f1", expect.objectContaining({ showBranding: false }));
  });

  it("omits showBranding from the PATCH when it didn't change, so a free plan can still rename", async () => {
    const user = userEvent.setup();
    mocked.getForm.mockResolvedValue(form({ showBranding: true, brandingLocked: true }));
    renderPage();
    await openSettings(user);

    const name = screen.getByDisplayValue("Contact");
    await user.clear(name);
    await user.type(name, "Renamed");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(mocked.updateMeta).toHaveBeenCalled());
    const patch = mocked.updateMeta.mock.calls[0][2];
    expect(patch).toMatchObject({ name: "Renamed" });
    expect(patch).not.toHaveProperty("showBranding");
  });

  it("surfaces a rejected hide and snaps the checkbox back", async () => {
    const user = userEvent.setup();
    mocked.getForm.mockResolvedValue(form({ showBranding: true, brandingLocked: false }));
    // The plan lapsed between load and save — the server refuses (402).
    mocked.updateMeta.mockRejectedValue(new Error("Hiding the badge is available on paid plans."));
    renderPage();
    await openSettings(user);
    await gotoAppearance(user);

    await user.click(badgeToggle());
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(await screen.findByText(/available on paid plans/i)).toBeInTheDocument();
    // Modal stays open with the server's truth restored, rather than showing a lie.
    expect(screen.getByRole("heading", { name: /form settings/i })).toBeInTheDocument();
    await waitFor(() => expect(badgeToggle()).toBeChecked());
  });

  it("is read-only until the form is checked out", async () => {
    const user = userEvent.setup();
    mocked.getForm.mockResolvedValue(form({ showBranding: true, brandingLocked: false }));
    renderPage();
    // Open settings WITHOUT checking out.
    await user.click(await screen.findByRole("button", { name: /form settings/i }));
    await screen.findByRole("heading", { name: /form settings/i });
    await gotoAppearance(user);
    expect(badgeToggle()).toBeDisabled();
  });
});
