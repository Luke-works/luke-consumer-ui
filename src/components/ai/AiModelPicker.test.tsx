import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import AiModelPicker from "./AiModelPicker";
import * as api from "../../lib/aiProviderApi";

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ session: { tenant: "t1", userId: "u1" } }),
}));
vi.mock("../../lib/aiProviderApi", () => ({
  getAiPreference: vi.fn(),
  chooseMyAiModel: vi.fn(),
  listAiModels: vi.fn(),
}));

const m = vi.mocked(api);

const pref = (over: Partial<api.AiPreference> = {}): api.AiPreference => ({
  enabled: true,
  connected: true,
  provider: "groq",
  workspaceModel: "openai/gpt-oss-120b",
  model: null,
  effectiveModel: "openai/gpt-oss-120b",
  ...over,
});

const renderPicker = () =>
  render(
    <MemoryRouter>
      <AiModelPicker />
    </MemoryRouter>,
  );

describe("AiModelPicker — your model, the workspace's key", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.getAiPreference.mockResolvedValue(pref());
    m.listAiModels.mockResolvedValue({ models: ["llama-3.3-70b-versatile", "openai/gpt-oss-120b"] });
  });

  it("stays out of the way when this deployment has no AI at all", async () => {
    m.getAiPreference.mockResolvedValue(pref({ enabled: false }));
    const { container } = renderPicker();
    await waitFor(() => expect(m.getAiPreference).toHaveBeenCalled());
    // The panel it sits in is for building forms, not administering AI.
    expect(container).toBeEmptyDOMElement();
  });

  it("offers the one useful action when no provider is connected", async () => {
    m.getAiPreference.mockResolvedValue(pref({ connected: false }));
    renderPicker();
    const link = await screen.findByRole("link", { name: /connect an ai provider/i });
    // Settings, not a page of its own — the nav slot went back to the product.
    expect(link).toHaveAttribute("href", "/account/settings#ai");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("defaults to following the workspace, and names what that means", async () => {
    renderPicker();
    const select = await screen.findByRole("combobox");
    expect(select).toHaveValue("");
    expect(screen.getByRole("option", { name: /workspace default \(openai\/gpt-oss-120b\)/i })).toBeInTheDocument();
  });

  it("does not spend a provider round trip until someone opens it", async () => {
    renderPicker();
    await screen.findByRole("combobox");
    // The list is read live from the provider; fetching it on every panel mount would cost a
    // call per page view for a control most people never touch.
    expect(m.listAiModels).not.toHaveBeenCalled();

    screen.getByRole("combobox").focus();
    await waitFor(() => expect(m.listAiModels).toHaveBeenCalledWith("t1"));
    await screen.findByRole("option", { name: "llama-3.3-70b-versatile" });
  });

  it("saves the choice against the person, not the browser", async () => {
    m.chooseMyAiModel.mockResolvedValue(pref({ model: "llama-3.3-70b-versatile", effectiveModel: "llama-3.3-70b-versatile" }));
    renderPicker();
    const select = await screen.findByRole("combobox");
    select.focus();
    await screen.findByRole("option", { name: "llama-3.3-70b-versatile" });

    await userEvent.selectOptions(select, "llama-3.3-70b-versatile");
    await waitFor(() => expect(m.chooseMyAiModel).toHaveBeenCalledWith("t1", "llama-3.3-70b-versatile"));
  });

  it("sends null when going back to the workspace default", async () => {
    m.getAiPreference.mockResolvedValue(pref({ model: "llama-3.3-70b-versatile" }));
    m.chooseMyAiModel.mockResolvedValue(pref({ model: null }));
    renderPicker();
    const select = await screen.findByRole("combobox");

    await userEvent.selectOptions(select, "");
    // null, not "": "follow the workspace" must keep tracking it, not freeze today's value.
    await waitFor(() => expect(m.chooseMyAiModel).toHaveBeenCalledWith("t1", null));
  });

  it("keeps a saved choice selectable before the live list arrives", async () => {
    // Otherwise the control appears to silently reset to the default while loading.
    let resolveModels: (v: { models: string[] }) => void = () => {};
    m.listAiModels.mockReturnValue(new Promise((r) => (resolveModels = r)));
    m.getAiPreference.mockResolvedValue(pref({ model: "some-pinned-model" }));

    renderPicker();
    const select = await screen.findByRole("combobox");
    expect(select).toHaveValue("some-pinned-model");
    resolveModels({ models: ["some-pinned-model"] });
  });

  it("surfaces a refusal instead of appearing to have saved", async () => {
    m.chooseMyAiModel.mockRejectedValue(new Error("Your workspace's AI account can't use that."));
    renderPicker();
    const select = await screen.findByRole("combobox");
    select.focus();
    await screen.findByRole("option", { name: "llama-3.3-70b-versatile" });

    await userEvent.selectOptions(select, "llama-3.3-70b-versatile");
    expect(await screen.findByRole("alert")).toHaveTextContent(/can't use that/i);
  });

  it("is still usable when the provider's model list cannot be read", async () => {
    m.listAiModels.mockRejectedValue(new Error("provider unreachable"));
    renderPicker();
    const select = await screen.findByRole("combobox");
    select.focus();
    // A provider blip must not break a settings control: the default stays choosable.
    await waitFor(() => expect(m.listAiModels).toHaveBeenCalled());
    expect(select).toBeEnabled();
    expect(screen.getByRole("option", { name: /workspace default/i })).toBeInTheDocument();
  });
});
