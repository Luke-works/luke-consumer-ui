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
  providers: [
    { id: "groq", label: "Groq" },
    { id: "anthropic", label: "Anthropic" },
  ],
  workspaceProvider: "groq",
  workspaceModel: "openai/gpt-oss-120b",
  model: null,
  effectiveModel: "openai/gpt-oss-120b",
  ...over,
});

const MODELS: api.AiModel[] = [
  { provider: "groq", id: "openai/gpt-oss-120b", chat: true },
  { provider: "groq", id: "qwen/qwen3.8-27b", chat: true },
  { provider: "groq", id: "whisper-large-v3", chat: false },
  { provider: "anthropic", id: "claude-haiku-4-5", chat: true },
];

const renderPicker = () =>
  render(
    <MemoryRouter>
      <AiModelPicker />
    </MemoryRouter>,
  );

/** The list only exists while open — that is the point of a listbox. */
const open = async () => {
  const trigger = await screen.findByRole("combobox");
  await userEvent.click(trigger);
  return trigger;
};

describe("AiModelPicker — your model, the workspace's key", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.getAiPreference.mockResolvedValue(pref());
    m.listAiModels.mockResolvedValue({ models: MODELS });
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
    expect(await screen.findByRole("link", { name: /connect an ai provider/i })).toHaveAttribute(
      "href",
      "/account/settings#ai",
    );
  });

  it("tells a non-owner who to ask instead of linking them somewhere they can't act", async () => {
    m.getAiPreference.mockResolvedValue(pref({ connected: false, canManage: false }));
    renderPicker();
    expect(await screen.findByText(/ask the workspace owner/i)).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows what a turn runs on without being opened", async () => {
    renderPicker();
    // The closed state is what people actually read, so it must name the current choice.
    expect(await screen.findByRole("combobox")).toHaveTextContent(/Workspace default/i);
  });

  it("does not spend a provider round trip until someone opens it", async () => {
    renderPicker();
    await screen.findByRole("combobox");
    expect(m.listAiModels).not.toHaveBeenCalled();

    await open();
    await waitFor(() => expect(m.listAiModels).toHaveBeenCalledWith("t1"));
  });

  it("groups by provider, and demotes what cannot build — hiding nothing", async () => {
    // A workspace may have several providers, and each lists every modality its account can
    // reach. Flattened, a speech-to-text model sits beside a chat model as an equal choice.
    renderPicker();
    await open();
    await screen.findByRole("option", { name: "openai/gpt-oss-120b" });

    const groups = screen.getAllByRole("group");
    expect(groups.map((g) => g.getAttribute("aria-labelledby") && g.textContent)).toHaveLength(3);
    const labels = groups.map((g) => within(g).getAllByRole("option").map((o) => o.textContent));
    expect(labels[0]?.join()).toMatch(/gpt-oss-120b/);
    expect(labels[0]?.join()).toMatch(/qwen3\.8-27b/);
    // Demoted into its own group, still selectable — a wrong guess about a provider's names
    // must not make a model unreachable.
    expect(screen.getByRole("option", { name: /whisper-large-v3/ })).toBeInTheDocument();
    // …and the second provider's models are there too.
    expect(screen.getByRole("option", { name: /claude-haiku-4-5/ })).toBeInTheDocument();
  });

  it("saves the choice with the provider that offers it", async () => {
    m.chooseMyAiModel.mockResolvedValue(pref({ provider: "anthropic", model: "claude-haiku-4-5" }));
    renderPicker();
    await open();
    await userEvent.click(await screen.findByRole("option", { name: /claude-haiku-4-5/ }));

    // A model name only means something to the provider offering it.
    await waitFor(() =>
      expect(m.chooseMyAiModel).toHaveBeenCalledWith("t1", "anthropic", "claude-haiku-4-5"),
    );
  });

  it("sends null when going back to the workspace default", async () => {
    m.getAiPreference.mockResolvedValue(pref({ model: "qwen/qwen3.8-27b" }));
    m.chooseMyAiModel.mockResolvedValue(pref({ model: null }));
    renderPicker();
    await open();
    await userEvent.click(await screen.findByRole("option", { name: /Workspace default/i }));

    // null, not "": "follow the workspace" must keep tracking it, not freeze today's value.
    await waitFor(() => expect(m.chooseMyAiModel).toHaveBeenCalledWith("t1", null, null));
  });

  it("can be filtered once the list is long", async () => {
    m.listAiModels.mockResolvedValue({
      models: Array.from({ length: 20 }, (_, i) => ({
        provider: "groq" as const,
        id: `model-${i}`,
        chat: true,
      })),
    });
    renderPicker();
    await open();
    const filter = await screen.findByRole("textbox", { name: /filter/i });
    await userEvent.type(filter, "model-17");

    expect(screen.getByRole("option", { name: "model-17" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "model-3" })).not.toBeInTheDocument();
  });

  it("closes on Escape without changing anything", async () => {
    renderPicker();
    const trigger = await open();
    await screen.findByRole("option", { name: "openai/gpt-oss-120b" });

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(m.chooseMyAiModel).not.toHaveBeenCalled();
    // Focus comes back, so a keyboard user is not dropped at the top of the page.
    expect(document.activeElement).toBe(trigger);
  });

  it("is keyboard operable end to end", async () => {
    m.chooseMyAiModel.mockResolvedValue(pref());
    renderPicker();
    const trigger = await screen.findByRole("combobox");
    trigger.focus();

    await userEvent.keyboard("{ArrowDown}"); // opens
    await screen.findByRole("option", { name: "openai/gpt-oss-120b" });
    await userEvent.keyboard("{ArrowDown}{Enter}");

    // It committed something without a mouse ever being involved.
    await waitFor(() => expect(m.chooseMyAiModel).toHaveBeenCalled());
  });

  it("surfaces a refusal instead of appearing to have saved", async () => {
    m.chooseMyAiModel.mockRejectedValue(new Error("Your workspace's AI account can't use that."));
    renderPicker();
    await open();
    await userEvent.click(await screen.findByRole("option", { name: /qwen3\.8-27b/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/can't use that/i);
  });

  it("survives a save whose response omits the flags it renders on", async () => {
    // A body without `enabled` used to unmount this control the instant a save SUCCEEDED.
    m.chooseMyAiModel.mockResolvedValue({ connected: true, model: "qwen/qwen3.8-27b" } as api.AiPreference);
    renderPicker();
    await open();
    await userEvent.click(await screen.findByRole("option", { name: /qwen3\.8-27b/ }));

    await waitFor(() => expect(m.chooseMyAiModel).toHaveBeenCalled());
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("is still usable when the provider's model list cannot be read", async () => {
    m.listAiModels.mockRejectedValue(new Error("provider unreachable"));
    renderPicker();
    await open();
    // A provider blip must not break a settings control: the default stays choosable.
    expect(await screen.findByRole("option", { name: /Workspace default/i })).toBeInTheDocument();
  });
});
