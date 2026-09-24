import { describe, it, expect, vi, beforeEach } from "vitest";
import { StrictMode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import AiProviderSection from "./AiProviderSection";
import * as api from "../../lib/aiProviderApi";
import { ApiError } from "../../lib/authApi";

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ session: { tenant: "t1", userId: "u1" } }),
}));
vi.mock("../../components/common/PageMeta", () => ({ default: () => null }));
vi.mock("../../lib/aiProviderApi", () => ({
  getAiProvider: vi.fn(),
  connectAiProvider: vi.fn(),
  verifyAiProvider: vi.fn(),
  listAiModels: vi.fn(),
  chooseAiModel: vi.fn(),
  disconnectAiProvider: vi.fn(),
}));

const m = vi.mocked(api);

const PROVIDERS: api.AiProviderOption[] = [
  { id: "groq", label: "Groq", defaultModel: "openai/gpt-oss-120b", keyPrefix: "gsk_", consoleUrl: "https://console.groq.com/keys" },
  { id: "anthropic", label: "Anthropic", defaultModel: "claude-haiku-4-5-20251001", keyPrefix: "sk-ant-", consoleUrl: "https://console.anthropic.com/settings/keys" },
];

const view = (over: Partial<api.AiProviderView> = {}): api.AiProviderView => ({
  enabled: true,
  connected: false,
  canManage: true,
  providers: PROVIDERS,
  ...over,
});

const connected = (over: Partial<api.AiProviderView> = {}): api.AiProviderView =>
  view({
    connected: true,
    status: "CONNECTED",
    provider: "groq",
    providerLabel: "Groq",
    keyLast4: "abcd",
    effectiveModel: "openai/gpt-oss-120b",
    verifiedAt: "2026-09-20T10:00:00Z",
    ...over,
  });

function renderPage() {
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

describe("AiProviderSection — bring your own key", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.getAiProvider.mockResolvedValue(view());
  });

  it("says so plainly when the environment has no agent fleet", async () => {
    m.getAiProvider.mockResolvedValue(view({ enabled: false }));
    renderPage();
    expect(await screen.findByText(/aren't available on this Lukeflow environment/i)).toBeInTheDocument();
    // No key field to tease someone with when nothing could work anyway.
    expect(screen.queryByLabelText(/API key/i)).not.toBeInTheDocument();
  });

  it("offers the connect form when nothing is connected", async () => {
    renderPage();
    expect(await screen.findByText(/No provider connected/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/API key/i)).toBeInTheDocument();
    // The provider's own console is one click away — people rarely have a key already.
    expect(screen.getByRole("link", { name: /create one/i })).toHaveAttribute(
      "href",
      "https://console.groq.com/keys",
    );
    // The placeholder shows what this provider's keys look like, so a wrong-provider paste is
    // obvious before it is submitted. It only renders if the server sends keyPrefix, which
    // GET /api/ai/provider did not do at first — so the hint silently never appeared.
    expect(screen.getByLabelText(/API key/i)).toHaveAttribute("placeholder", "gsk_…");
  });

  it("cannot submit an empty key", async () => {
    renderPage();
    await screen.findByLabelText(/API key/i);
    expect(screen.getByRole("button", { name: /^connect$/i })).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/API key/i), "gsk_abc");
    expect(screen.getByRole("button", { name: /^connect$/i })).toBeEnabled();
  });

  it("sends the chosen provider and key, then clears the field", async () => {
    m.connectAiProvider.mockResolvedValue(connected());
    renderPage();
    await screen.findByLabelText(/API key/i);

    await userEvent.selectOptions(screen.getByLabelText(/Provider/i), "anthropic");
    await userEvent.type(screen.getByLabelText(/API key/i), "sk-ant-secret");
    await userEvent.click(screen.getByRole("button", { name: /^connect$/i }));

    await waitFor(() =>
      expect(m.connectAiProvider).toHaveBeenCalledWith("t1", {
        provider: "anthropic",
        apiKey: "sk-ant-secret",
        model: undefined,
      }),
    );
    // The key must not linger in the DOM after it is stored.
    await waitFor(() => expect(screen.getByLabelText(/API key/i)).toHaveValue(""));
  });

  it("shows the provider's own refusal message rather than a generic error", async () => {
    m.connectAiProvider.mockRejectedValue(
      new ApiError(400, "Groq rejected this key. Check you copied it in full."),
    );
    renderPage();
    await screen.findByLabelText(/API key/i);
    await userEvent.type(screen.getByLabelText(/API key/i), "gsk_wrong");
    await userEvent.click(screen.getByRole("button", { name: /^connect$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/Groq rejected this key/i);
  });

  it("never renders the key once connected — only its last four", async () => {
    m.getAiProvider.mockResolvedValue(connected());
    const { container } = renderPage();
    await screen.findByText(/Key ending abcd/i);
    expect(container.textContent).not.toMatch(/gsk_/);
    expect(screen.getByText(/The assistant is ready/i)).toBeInTheDocument();
  });

  it("tells the owner what to do when the provider refused the key", async () => {
    m.getAiProvider.mockResolvedValue(
      connected({ status: "INVALID", lastError: "Groq rejected this key." }),
    );
    renderPage();
    expect(await screen.findByText(/Groq rejected this key/i)).toBeInTheDocument();
    // Replacing the key is the fix, so the form stays available and says so.
    expect(screen.getByRole("button", { name: /replace key/i })).toBeInTheDocument();
  });

  it("reads the model list from the workspace's own account, and only when asked", async () => {
    m.getAiProvider.mockResolvedValue(connected());
    m.listAiModels.mockResolvedValue({ models: ["llama-3.3-70b-versatile", "openai/gpt-oss-120b"] });
    renderPage();

    const select = await screen.findByLabelText(/^Model$/i);
    // Not fetched on load: it costs a live call to the provider on every page view.
    expect(m.listAiModels).not.toHaveBeenCalled();

    select.focus();
    await waitFor(() => expect(m.listAiModels).toHaveBeenCalledWith("t1"));
    await screen.findByRole("option", { name: "llama-3.3-70b-versatile" });
  });

  it("saves a model change, and treats the blank choice as the provider default", async () => {
    m.getAiProvider.mockResolvedValue(connected({ model: "llama-3.3-70b-versatile" }));
    m.listAiModels.mockResolvedValue({ models: ["llama-3.3-70b-versatile"] });
    m.chooseAiModel.mockResolvedValue(connected({ model: null }));
    renderPage();

    const select = await screen.findByLabelText(/^Model$/i);
    await userEvent.selectOptions(select, "");
    // null, not "": the default must track the catalog, not freeze today's value.
    await waitFor(() => expect(m.chooseAiModel).toHaveBeenCalledWith("t1", null));
  });

  it("a member who is not the owner can see the status but cannot change it", async () => {
    m.getAiProvider.mockResolvedValue(connected({ canManage: false }));
    renderPage();
    await screen.findByText(/Key ending abcd/i);
    expect(screen.getByText(/Only the workspace owner can change the AI provider/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/API key/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /disconnect/i })).not.toBeInTheDocument();
  });

  it("disconnects and says the assistant is now off", async () => {
    m.getAiProvider.mockResolvedValue(connected());
    m.disconnectAiProvider.mockResolvedValue(view({ status: "DISCONNECTED" }));
    renderPage();
    await screen.findByText(/Key ending abcd/i);

    await userEvent.click(screen.getByRole("button", { name: /disconnect/i }));
    await waitFor(() => expect(m.disconnectAiProvider).toHaveBeenCalledWith("t1"));
    expect(await screen.findByRole("status")).toHaveTextContent(/assistant is off/i);
  });

  it("re-checking a key reports what the provider said", async () => {
    m.getAiProvider.mockResolvedValue(connected());
    m.verifyAiProvider.mockResolvedValue(connected());
    renderPage();
    await screen.findByText(/Key ending abcd/i);

    await userEvent.click(screen.getByRole("button", { name: /check again/i }));
    expect(await screen.findByRole("status")).toHaveTextContent(/still works/i);
  });
});
