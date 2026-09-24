import { describe, it, expect, vi, beforeEach } from "vitest";
import { StrictMode } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import AiProviderSection from "./AiProviderSection";
import * as api from "../../lib/aiProviderApi";
import { ApiError } from "../../lib/authApi";

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ session: { tenant: "t1", userId: "u1" } }),
}));
vi.mock("../../lib/aiProviderApi", () => ({
  getAiProvider: vi.fn(),
  connectAiProvider: vi.fn(),
  verifyAiProvider: vi.fn(),
  listAiModels: vi.fn(),
  chooseAiModel: vi.fn(),
  setDefaultAiProvider: vi.fn(),
  disconnectAiProvider: vi.fn(),
}));

const m = vi.mocked(api);

const PROVIDERS: api.AiProviderOption[] = [
  { id: "groq", label: "Groq", defaultModel: "openai/gpt-oss-120b", keyPrefix: "gsk_", consoleUrl: "https://console.groq.com/keys" },
  { id: "anthropic", label: "Anthropic", defaultModel: "claude-haiku-4-5-20251001", keyPrefix: "sk-ant-", consoleUrl: "https://console.anthropic.com/settings/keys" },
];

const groq = (over: Partial<api.AiConnection> = {}): api.AiConnection => ({
  provider: "groq",
  label: "Groq",
  status: "CONNECTED",
  preferred: true,
  model: null,
  effectiveModel: "openai/gpt-oss-120b",
  keyLast4: "abcd",
  verifiedAt: "2026-09-23T10:00:00Z",
  ...over,
});

const anthropic = (over: Partial<api.AiConnection> = {}): api.AiConnection => ({
  provider: "anthropic",
  label: "Anthropic",
  status: "CONNECTED",
  preferred: false,
  model: null,
  effectiveModel: "claude-haiku-4-5-20251001",
  keyLast4: "wxyz",
  ...over,
});

const view = (over: Partial<api.AiProviderView> = {}): api.AiProviderView => ({
  enabled: true,
  connected: false,
  canManage: true,
  connections: [],
  providers: PROVIDERS,
  ...over,
});

function renderSection() {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={["/account/settings"]}>
        <Routes>
          <Route path="/account/settings" element={<AiProviderSection />} />
        </Routes>
      </MemoryRouter>
    </StrictMode>,
  );
}

describe("AiProviderSection — several providers, each with its own key", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.getAiProvider.mockResolvedValue(view());
  });

  it("says so plainly when the environment has no agent fleet", async () => {
    m.getAiProvider.mockResolvedValue(view({ enabled: false }));
    renderSection();
    expect(await screen.findByText(/aren't available on this Lukeflow environment/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/API key/i)).not.toBeInTheDocument();
  });

  it("offers the connect form when nothing is connected", async () => {
    renderSection();
    expect(await screen.findByText(/No AI provider connected yet/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/API key/i)).toHaveAttribute("placeholder", "gsk_…");
    expect(screen.getByRole("link", { name: /create one/i })).toHaveAttribute(
      "href",
      "https://console.groq.com/keys",
    );
  });

  /* ── the status of each connected service ─────────────────────────────── */

  it("shows every connected provider with its own state", async () => {
    m.getAiProvider.mockResolvedValue(
      view({ connected: true, connections: [groq(), anthropic()] }),
    );
    renderSection();

    const rows = await screen.findAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText(/Groq/)).toBeInTheDocument();
    expect(within(rows[0]).getByText(/Key ending abcd/i)).toBeInTheDocument();
    // Exact: "Provider default (…)" in the model select would otherwise match too.
    expect(within(rows[0]).getByText("Default", { exact: true })).toBeInTheDocument();
    expect(within(rows[1]).getByText(/Key ending wxyz/i)).toBeInTheDocument();
    // Only one carries the default; the other offers to take it.
    expect(within(rows[1]).queryByText("Default", { exact: true })).not.toBeInTheDocument();
    expect(within(rows[1]).getByRole("button", { name: /make default/i })).toBeInTheDocument();
  });

  it("reports a failing provider without condemning the healthy one", async () => {
    // They fail independently: a revoked Anthropic key says nothing about a working Groq one.
    m.getAiProvider.mockResolvedValue(
      view({
        connected: true,
        connections: [groq(), anthropic({ status: "INVALID", lastError: "Anthropic rejected this key." })],
      }),
    );
    renderSection();

    const rows = await screen.findAllByRole("listitem");
    expect(within(rows[0]).getByText(/^Working/)).toBeInTheDocument();
    expect(within(rows[1]).getByText(/^Not working/)).toBeInTheDocument();
    // The provider's own words — they know why they refused and we do not.
    expect(within(rows[1]).getByText(/Anthropic rejected this key/i)).toBeInTheDocument();
  });

  it("never renders a key — only its last four", async () => {
    m.getAiProvider.mockResolvedValue(view({ connected: true, connections: [groq(), anthropic()] }));
    const { container } = renderSection();
    await screen.findByText(/Key ending abcd/i);
    expect(container.textContent).not.toMatch(/gsk_|sk-ant-/);
  });

  /* ── adding one must never disturb another ────────────────────────────── */

  it("adds a provider beside the others rather than replacing them", async () => {
    m.getAiProvider.mockResolvedValue(view({ connected: true, connections: [groq()] }));
    m.connectAiProvider.mockResolvedValue(view({ connected: true, connections: [groq(), anthropic()] }));
    renderSection();

    await userEvent.click(await screen.findByRole("button", { name: /add another provider/i }));
    await userEvent.selectOptions(screen.getByLabelText(/Provider/i), "anthropic");
    await userEvent.type(screen.getByLabelText(/API key/i), "sk-ant-second");
    await userEvent.click(screen.getByRole("button", { name: /^connect$/i }));

    await waitFor(() =>
      expect(m.connectAiProvider).toHaveBeenCalledWith("t1", {
        provider: "anthropic",
        apiKey: "sk-ant-second",
      }),
    );
    // Both are listed afterwards — this used to destroy the first key outright.
    expect(await screen.findByText(/Key ending abcd/i)).toBeInTheDocument();
    expect(screen.getByText(/Key ending wxyz/i)).toBeInTheDocument();
  });

  it("warns that re-picking a connected provider replaces that one key", async () => {
    m.getAiProvider.mockResolvedValue(
      view({ connected: true, connections: [groq()], providers: [{ ...PROVIDERS[0], connected: true }, PROVIDERS[1]] }),
    );
    renderSection();
    await userEvent.click(await screen.findByRole("button", { name: /add another provider/i }));

    expect(screen.getByText(/replaces the key already stored for this provider/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /replace key/i })).toBeInTheDocument();
  });

  it("shows the provider's own refusal rather than a generic error", async () => {
    m.connectAiProvider.mockRejectedValue(new ApiError(400, "Groq rejected this key."));
    renderSection();
    await userEvent.type(await screen.findByLabelText(/API key/i), "gsk_wrong");
    await userEvent.click(screen.getByRole("button", { name: /^connect$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Groq rejected this key/i);
  });

  /* ── managing one of several ──────────────────────────────────────────── */

  it("removes one provider and says the others are untouched", async () => {
    m.getAiProvider.mockResolvedValue(view({ connected: true, connections: [groq(), anthropic()] }));
    m.disconnectAiProvider.mockResolvedValue(view({ connected: true, connections: [anthropic({ preferred: true })] }));
    renderSection();

    const rows = await screen.findAllByRole("listitem");
    await userEvent.click(within(rows[0]).getByRole("button", { name: /remove/i }));

    await waitFor(() => expect(m.disconnectAiProvider).toHaveBeenCalledWith("t1", "groq"));
    expect(await screen.findByRole("status")).toHaveTextContent(/others are untouched/i);
  });

  it("hands the default to another provider on request", async () => {
    m.getAiProvider.mockResolvedValue(view({ connected: true, connections: [groq(), anthropic()] }));
    m.setDefaultAiProvider.mockResolvedValue(
      view({ connected: true, connections: [groq({ preferred: false }), anthropic({ preferred: true })] }),
    );
    renderSection();

    const rows = await screen.findAllByRole("listitem");
    await userEvent.click(within(rows[1]).getByRole("button", { name: /make default/i }));
    await waitFor(() => expect(m.setDefaultAiProvider).toHaveBeenCalledWith("t1", "anthropic"));
  });

  it("re-checks one provider without touching the rest", async () => {
    m.getAiProvider.mockResolvedValue(view({ connected: true, connections: [groq(), anthropic()] }));
    m.verifyAiProvider.mockResolvedValue(view({ connected: true, connections: [groq(), anthropic()] }));
    renderSection();

    const rows = await screen.findAllByRole("listitem");
    await userEvent.click(within(rows[1]).getByRole("button", { name: /check/i }));
    await waitFor(() => expect(m.verifyAiProvider).toHaveBeenCalledWith("t1", "anthropic"));
  });

  it("sets a workspace model per provider, reading the list only when asked", async () => {
    m.getAiProvider.mockResolvedValue(view({ connected: true, connections: [groq()] }));
    m.listAiModels.mockResolvedValue({
      models: [
        { provider: "groq", id: "llama-3.3-70b-versatile", chat: true },
        { provider: "groq", id: "whisper-large-v3", chat: false },
      ],
    });
    m.chooseAiModel.mockResolvedValue(view({ connected: true, connections: [groq({ model: "llama-3.3-70b-versatile" })] }));
    renderSection();

    const select = await screen.findByLabelText(/Workspace model/i);
    // A round trip per connected provider on page load, for a control most people never touch.
    expect(m.listAiModels).not.toHaveBeenCalled();

    select.focus();
    await waitFor(() => expect(m.listAiModels).toHaveBeenCalledWith("t1"));
    await screen.findByRole("option", { name: "llama-3.3-70b-versatile" });

    await userEvent.selectOptions(select, "llama-3.3-70b-versatile");
    await waitFor(() =>
      expect(m.chooseAiModel).toHaveBeenCalledWith("t1", "groq", "llama-3.3-70b-versatile"),
    );
  });

  it("a member who is not the owner sees the status but changes nothing", async () => {
    m.getAiProvider.mockResolvedValue(
      view({ connected: true, canManage: false, connections: [groq(), anthropic()] }),
    );
    renderSection();

    // Status is exactly what a member needs: whether the assistant will work.
    expect(await screen.findByText(/Key ending abcd/i)).toBeInTheDocument();
    expect(screen.getByText(/Only the workspace owner can change AI providers/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /remove/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/API key/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Workspace model/i)).not.toBeInTheDocument();
  });
});
