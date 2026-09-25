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

/**
 * A model id is meaningless without the provider that offers it.
 *
 * The workspace may have several connected, and the server resolves a request with no provider
 * to the workspace's PREFERRED one — so sending the model alone does not mean "keep my current
 * provider", it means "move me to whichever provider is the default".
 */
describe("AiModelPicker — the provider travels with the model", () => {
  beforeEach(() => vi.clearAllMocks());

  const pref = (over: Partial<api.AiPreference> = {}): api.AiPreference =>
    ({
      enabled: true,
      connected: true,
      provider: "anthropic",
      providers: [
        { id: "groq", label: "Groq" },
        { id: "anthropic", label: "Anthropic" },
      ],
      workspaceProvider: "groq",
      workspaceModel: "openai/gpt-oss-120b",
      model: "claude-3-5-sonnet-20241022",
      effectiveModel: "claude-3-5-sonnet-20241022",
      ...over,
    }) as api.AiPreference;

  it("re-confirming your pinned model keeps YOUR provider, not the workspace's default", async () => {
    // The provider retired the id, so the live list comes back without it — which is exactly
    // when the synthesised "Current choice" row is the only way to select it. Looking the model
    // up in that list to find its provider therefore always misses.
    m.getAiPreference.mockResolvedValue(pref());
    m.listAiModels.mockResolvedValue({
      models: [{ provider: "groq", id: "openai/gpt-oss-120b", chat: true }],
    });
    m.chooseMyAiModel.mockResolvedValue(pref());

    render(
      <MemoryRouter>
        <AiModelPicker />
      </MemoryRouter>,
    );
    await userEvent.click(await screen.findByRole("combobox", { name: "Model" }));
    await userEvent.click(await screen.findByRole("option", { name: /claude-3-5-sonnet/ }));

    // Not (…, null, …): a null provider re-points the preference at the workspace default, so
    // every later turn asks Groq for a Claude model.
    await waitFor(() =>
      expect(m.chooseMyAiModel).toHaveBeenCalledWith("t1", "anthropic", "claude-3-5-sonnet-20241022"),
    );
  });

  it("still sends the offering provider when the model IS in the list", async () => {
    // Provider is its own control now, so the model list is scoped to the provider in force.
    // On Anthropic, its models must still carry Anthropic rather than falling back to anything.
    m.getAiPreference.mockResolvedValue(pref({ model: null, provider: "anthropic" }));
    m.listAiModels.mockResolvedValue({
      models: [{ provider: "anthropic", id: "claude-haiku-4-5", chat: true }],
    });
    m.chooseMyAiModel.mockResolvedValue(pref());

    render(
      <MemoryRouter>
        <AiModelPicker />
      </MemoryRouter>,
    );
    await userEvent.click(await screen.findByRole("combobox", { name: "Model" }));
    await userEvent.click(await screen.findByRole("option", { name: /claude-haiku-4-5/ }));

    await waitFor(() =>
      expect(m.chooseMyAiModel).toHaveBeenCalledWith("t1", "anthropic", "claude-haiku-4-5"),
    );
  });

  it("sends null for both when going back to the workspace default", async () => {
    m.getAiPreference.mockResolvedValue(pref());
    m.listAiModels.mockResolvedValue({ models: [] });
    m.chooseMyAiModel.mockResolvedValue(pref({ model: null }));

    render(
      <MemoryRouter>
        <AiModelPicker />
      </MemoryRouter>,
    );
    await userEvent.click(await screen.findByRole("combobox", { name: "Model" }));
    await userEvent.click(await screen.findByRole("option", { name: /Workspace default/i }));

    // The fallback must not leak into "follow the workspace" — that has to keep tracking it.
    await waitFor(() => expect(m.chooseMyAiModel).toHaveBeenCalledWith("t1", null, null));
  });
});
