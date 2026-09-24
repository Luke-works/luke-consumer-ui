import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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
  providers: [{ id: "groq", label: "Groq" }],
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
    m.listAiModels.mockResolvedValue({ models: [{ provider: "groq", id: "llama-3.3-70b-versatile", chat: true }, { provider: "groq", id: "openai/gpt-oss-120b", chat: true }] });
  });

  it("stays out of the way when this deployment has no AI at all", async () => {
    m.getAiPreference.mockResolvedValue(pref({ enabled: false }));
    const { container } = renderPicker();
    await waitFor(() => expect(m.getAiPreference).toHaveBeenCalled());
    // The panel it sits in is for building forms, not administering AI.
    expect(container).toBeEmptyDOMElement();
  });

  it("offers the one useful action when no provider is connected", async () => {
    m.getAiPreference.mockResolvedValue(pref({ connected: false, canManage: true }));
    renderPicker();
    const link = await screen.findByRole("link", { name: /connect an ai provider/i });
    // Settings, not a page of its own — the nav slot went back to the product.
    expect(link).toHaveAttribute("href", "/account/settings#ai");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("tells a non-owner who to ask instead of linking them somewhere they can't act", async () => {
    m.getAiPreference.mockResolvedValue(pref({ connected: false, canManage: false }));
    renderPicker();
    expect(await screen.findByText(/ask the workspace owner/i)).toBeInTheDocument();
    // Only the owner can connect one, so only the owner is sent to the page that does it.
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("survives a save whose response omits the flags it renders on", async () => {
    // The response is merged, not swapped in: a body without `enabled` used to unmount this
    // control the instant a save SUCCEEDED.
    m.chooseMyAiModel.mockResolvedValue({ connected: true, model: "llama-3.3-70b-versatile" } as api.AiPreference);
    renderPicker();
    const select = await screen.findByRole("combobox");
    select.focus();
    await screen.findByRole("option", { name: "llama-3.3-70b-versatile" });

    await userEvent.selectOptions(select, "llama-3.3-70b-versatile");
    await waitFor(() => expect(m.chooseMyAiModel).toHaveBeenCalled());
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("does not drop keyboard focus while saving", async () => {
    // Disabling a focused element blurs it to <body>, so a keyboard user lost their place on
    // every save.
    m.chooseMyAiModel.mockResolvedValue(pref({ model: "llama-3.3-70b-versatile" }));
    renderPicker();
    const select = await screen.findByRole("combobox");
    select.focus();
    await screen.findByRole("option", { name: "llama-3.3-70b-versatile" });

    await userEvent.selectOptions(select, "llama-3.3-70b-versatile");
    expect(document.activeElement).toBe(select);
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

  it("separates models that can build from ones that cannot — without hiding any", async () => {
    // Verbatim from a real Groq account: chat models listed beside speech-to-text and a
    // prompt-injection classifier. Offered as equal choices they are a trap — pick Whisper and
    // every turn fails with a provider error nobody can act on.
    m.listAiModels.mockResolvedValue({
      models: [
        { provider: "groq", id: "openai/gpt-oss-120b", chat: true },
        { provider: "groq", id: "qwen/qwen3.8-27b", chat: true },
        { provider: "groq", id: "whisper-large-v3", chat: false },
        { provider: "groq", id: "meta-llama/llama-prompt-guard-2-86m", chat: false },
      ],
    });
    renderPicker();
    const select = await screen.findByRole("combobox");
    select.focus();
    await screen.findByRole("option", { name: "openai/gpt-oss-120b" });

    const groups = within(select).getAllByRole("group");
    expect(groups.map((g) => g.getAttribute("label"))).toEqual([
      "Groq",
      "Groq — may not work for building",
    ]);
    expect(within(groups[0]).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "openai/gpt-oss-120b",
      "qwen/qwen3.8-27b",
    ]);
    // Demoted, never removed: the capability is partly a guess about names the provider owns,
    // and a wrong guess must leave the model one click away rather than unreachable.
    expect(within(groups[1]).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "whisper-large-v3",
      "meta-llama/llama-prompt-guard-2-86m",
    ]);
  });

  it("offers no empty group when every model can build", async () => {
    m.listAiModels.mockResolvedValue({ models: [{ provider: "groq", id: "openai/gpt-oss-120b", chat: true }] });
    renderPicker();
    const select = await screen.findByRole("combobox");
    select.focus();
    await screen.findByRole("option", { name: "openai/gpt-oss-120b" });
    expect(within(select).getAllByRole("group")).toHaveLength(1);
  });

  it("saves the choice against the person, not the browser", async () => {
    m.chooseMyAiModel.mockResolvedValue(pref({ model: "llama-3.3-70b-versatile", effectiveModel: "llama-3.3-70b-versatile" }));
    renderPicker();
    const select = await screen.findByRole("combobox");
    select.focus();
    await screen.findByRole("option", { name: "llama-3.3-70b-versatile" });

    await userEvent.selectOptions(select, "llama-3.3-70b-versatile");
    await waitFor(() => expect(m.chooseMyAiModel).toHaveBeenCalledWith("t1", "groq", "llama-3.3-70b-versatile"));
  });

  it("sends null when going back to the workspace default", async () => {
    m.getAiPreference.mockResolvedValue(pref({ model: "llama-3.3-70b-versatile" }));
    m.chooseMyAiModel.mockResolvedValue(pref({ model: null }));
    renderPicker();
    const select = await screen.findByRole("combobox");

    await userEvent.selectOptions(select, "");
    // null, not "": "follow the workspace" must keep tracking it, not freeze today's value.
    await waitFor(() => expect(m.chooseMyAiModel).toHaveBeenCalledWith("t1", null, null));
  });

  it("keeps a saved choice selectable before the live list arrives", async () => {
    // Otherwise the control appears to silently reset to the default while loading.
    let resolveModels: (v: { models: string[] }) => void = () => {};
    m.listAiModels.mockReturnValue(new Promise((r) => (resolveModels = r)));
    m.getAiPreference.mockResolvedValue(pref({ model: "some-pinned-model" }));

    renderPicker();
    const select = await screen.findByRole("combobox");
    expect(select).toHaveValue("some-pinned-model");
    resolveModels({ models: [{ provider: "groq", id: "some-pinned-model", chat: true }] });
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
