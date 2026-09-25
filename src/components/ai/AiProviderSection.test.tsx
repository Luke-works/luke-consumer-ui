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
    expect(within(rows[0]).getByText(/key ending abcd/i)).toBeInTheDocument();
    // Exact: "Provider default (…)" in the model select would otherwise match too.
    expect(within(rows[0]).getByText("Default", { exact: true })).toBeInTheDocument();
    expect(within(rows[1]).getByText(/key ending wxyz/i)).toBeInTheDocument();
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
    await screen.findByText(/key ending abcd/i);
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
    expect(await screen.findByText(/key ending abcd/i)).toBeInTheDocument();
    expect(screen.getByText(/key ending wxyz/i)).toBeInTheDocument();
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

    // Rows start collapsed — a workspace with four providers is a list to scan, not four
    // stacked forms — so the detail has to be asked for.
    await userEvent.click(await screen.findByRole("button", { name: /Groq/ }));
    const trigger = await screen.findByRole("combobox", { name: /Workspace model for Groq/i });
    // A round trip per connected provider on page load, for a control most people never touch.
    expect(m.listAiModels).not.toHaveBeenCalled();

    await userEvent.click(trigger);
    await waitFor(() => expect(m.listAiModels).toHaveBeenCalledWith("t1"));
    await userEvent.click(await screen.findByRole("option", { name: "llama-3.3-70b-versatile" }));

    await waitFor(() =>
      expect(m.chooseAiModel).toHaveBeenCalledWith("t1", "groq", "llama-3.3-70b-versatile"),
    );
  });

  it("opens a failing provider by default so its explanation is not hidden behind a click", async () => {
    m.getAiProvider.mockResolvedValue(
      view({
        connected: true,
        connections: [groq({ status: "INVALID", lastError: "Groq rejected this key." })],
      }),
    );
    renderSection();
    // The one row that needs reading is the one already open.
    expect(await screen.findByText(/Groq rejected this key/i)).toBeInTheDocument();
  });

  it("collapses a healthy provider's detail until asked for", async () => {
    m.getAiProvider.mockResolvedValue(view({ connected: true, connections: [groq()] }));
    renderSection();
    const row = await screen.findByRole("button", { name: /Groq/ });

    expect(row).toHaveAttribute("aria-expanded", "false");
    // The summary still carries what matters at a glance.
    expect(screen.getByText(/Working/)).toBeInTheDocument();
    expect(screen.getByText(/key ending abcd/i)).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /Workspace model/i })).not.toBeInTheDocument();

    await userEvent.click(row);
    expect(row).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("combobox", { name: /Workspace model/i })).toBeInTheDocument();
  });

  it("keeps the pasted key when connecting fails", async () => {
    // `act` swallows the error to display it, so awaiting it says nothing about the outcome.
    // Clearing unconditionally threw away the key someone had just pasted and collapsed the form
    // as though it had worked — the failure showing above an empty form.
    m.getAiProvider.mockResolvedValue(view({ connected: true, connections: [groq()] }));
    m.connectAiProvider.mockRejectedValue(new ApiError(400, "Anthropic rejected this key."));
    renderSection();

    await userEvent.click(await screen.findByRole("button", { name: /add another provider/i }));
    await userEvent.selectOptions(screen.getByLabelText(/Provider/i), "anthropic");
    await userEvent.type(screen.getByLabelText(/API key/i), "sk-ant-typo");
    await userEvent.click(screen.getByRole("button", { name: /^connect$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/Anthropic rejected this key/i);
    // Still there to correct, rather than retyped from scratch.
    expect(screen.getByLabelText(/API key/i)).toHaveValue("sk-ant-typo");
  });

  it("re-reads the model list after the set of providers changes", async () => {
    // It was a one-shot cache nothing reset, so a provider added after the first fetch had an
    // empty model dropdown for the life of the page.
    m.getAiProvider.mockResolvedValue(view({ connected: true, connections: [groq()] }));
    m.listAiModels.mockResolvedValue({ models: [{ provider: "groq", id: "openai/gpt-oss-120b", chat: true }] });
    m.connectAiProvider.mockResolvedValue(view({ connected: true, connections: [groq(), anthropic()] }));
    renderSection();

    await userEvent.click(await screen.findByRole("button", { name: /Groq/ }));
    await userEvent.click(await screen.findByRole("combobox", { name: /Workspace model for Groq/i }));
    await waitFor(() => expect(m.listAiModels).toHaveBeenCalledTimes(1));
    await userEvent.keyboard("{Escape}");

    await userEvent.click(screen.getByRole("button", { name: /add another provider/i }));
    await userEvent.selectOptions(screen.getByLabelText(/Provider/i), "anthropic");
    await userEvent.type(screen.getByLabelText(/API key/i), "sk-ant-second");
    await userEvent.click(screen.getByRole("button", { name: /^connect$/i }));
    await waitFor(() => expect(m.connectAiProvider).toHaveBeenCalled());

    // The new provider's dropdown asks again rather than showing nothing.
    await userEvent.click(await screen.findByRole("button", { name: /Anthropic/ }));
    await userEvent.click(await screen.findByRole("combobox", { name: /Workspace model for Anthropic/i }));
    await waitFor(() => expect(m.listAiModels).toHaveBeenCalledTimes(2));
  });

  it("does not star a provider that cannot serve a turn", async () => {
    // A failing row that kept the star also hid the "Make default" button that would move the
    // default off it.
    m.getAiProvider.mockResolvedValue(
      view({ connected: true, connections: [groq({ status: "INVALID", lastError: "nope" }), anthropic()] }),
    );
    renderSection();
    const rows = await screen.findAllByRole("listitem");
    expect(within(rows[0]).queryByText("Default", { exact: true })).not.toBeInTheDocument();
  });

  it("a member who is not the owner sees the status but changes nothing", async () => {
    m.getAiProvider.mockResolvedValue(
      view({ connected: true, canManage: false, connections: [groq(), anthropic()] }),
    );
    renderSection();

    // Status is exactly what a member needs: whether the assistant will work.
    expect(await screen.findByText(/key ending abcd/i)).toBeInTheDocument();
    expect(screen.getByText(/Only the workspace owner can change AI providers/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /remove/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/API key/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Workspace model/i)).not.toBeInTheDocument();
  });
});

describe("AiProviderSection — one write at a time", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.getAiProvider.mockResolvedValue(view({ connected: true, connections: [groq(), anthropic()] }));
    m.listAiModels.mockResolvedValue({
      models: [
        { provider: "groq", id: "openai/gpt-oss-120b", chat: true },
        { provider: "groq", id: "llama-3.3-70b-versatile", chat: true },
        { provider: "anthropic", id: "claude-haiku-4-5", chat: true },
      ],
    });
  });

  it("refuses a second write while one is still in flight", async () => {
    // The model Listbox deliberately no longer honours `busy` — disabling a focused control
    // drops focus to <body>. That left it as the one un-guarded way into act(), and act()
    // applies whichever response lands LAST, so an older server snapshot could overwrite a newer
    // change on screen while the server had actually kept it.
    let release: (v: api.AiProviderView) => void = () => {};
    m.chooseAiModel.mockImplementation(
      () => new Promise<api.AiProviderView>((res) => { release = res; }),
    );

    renderSection();
    const rows = await screen.findAllByRole("button", { name: /Groq/ });
    await userEvent.click(rows[0]!); // expand the Groq row

    const picker = (await screen.findAllByRole("combobox"))[0]!;
    await userEvent.click(picker);
    await userEvent.click(await screen.findByRole("option", { name: /llama-3.3-70b-versatile/ }));
    await waitFor(() => expect(m.chooseAiModel).toHaveBeenCalledTimes(1));

    // Second pick while the first is unresolved.
    await userEvent.click(picker);
    const again = screen.queryAllByRole("option");
    if (again.length) await userEvent.click(again[0]!);

    expect(m.chooseAiModel).toHaveBeenCalledTimes(1);
    release(view({ connected: true, connections: [groq(), anthropic()] }));
  });

  it("discards a model list that arrives after the providers changed under it", async () => {
    // loadModels bails on any non-null cache, so a fetch in flight across a connect that writes
    // its PRE-connect list back afterwards leaves the new provider's dropdown empty for the life
    // of the page — the exact bug `apply`'s comment claims to have fixed.
    let deliver: (v: { models: api.AiModel[] }) => void = () => {};
    m.listAiModels.mockImplementation(
      () => new Promise<{ models: api.AiModel[] }>((res) => { deliver = res; }),
    );
    m.verifyAiProvider.mockResolvedValue(
      view({ connected: true, connections: [groq(), anthropic()] }),
    );

    renderSection();
    const rows = await screen.findAllByRole("button", { name: /Groq/ });
    await userEvent.click(rows[0]!);
    await userEvent.click((await screen.findAllByRole("combobox"))[0]!); // starts the fetch

    // Providers change while that fetch is outstanding.
    // Both connected rows render a Check; take the expanded Groq one.
    await userEvent.click((await screen.findAllByRole("button", { name: /^Check$/ }))[0]!);
    await waitFor(() => expect(m.verifyAiProvider).toHaveBeenCalled());

    // The stale response lands last and must NOT be written into the cleared cache.
    deliver({ models: [{ provider: "groq", id: "stale-only-model", chat: true }] });

    await userEvent.click((await screen.findAllByRole("combobox"))[0]!);
    await waitFor(() =>
      expect(screen.queryByRole("option", { name: /stale-only-model/ })).not.toBeInTheDocument(),
    );
  });
});
