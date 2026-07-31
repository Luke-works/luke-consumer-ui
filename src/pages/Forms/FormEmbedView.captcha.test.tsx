import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FormEmbedView from "./FormEmbedView";
import * as embedApi from "../../lib/publicEmbedApi";
import { resetTurnstileLoaderForTests, type TurnstileRenderOptions } from "../../lib/turnstile";

vi.mock("@lukeflow/form-embed", () => ({
  connectEmbedFrame: () => ({ destroy: () => {}, ready: () => {}, error: () => {}, submitted: () => {} }),
}));
vi.mock("../../lib/minionsApi", () => ({ createPublicMinionClient: () => null }));
vi.mock("../../lib/publicEmbedApi", () => ({ getEmbedForm: vi.fn(), submitEmbed: vi.fn() }));
vi.mock("../../lib/publicDocumentsApi", () => ({
  uploadEmbedDocument: vi.fn(),
  listEmbedDocuments: vi.fn(),
  deleteEmbedDocument: vi.fn(),
  linkEmbedDocuments: vi.fn(),
}));

const embed = vi.mocked(embedApi);

const SCHEMA = JSON.stringify({
  root: ["a"],
  entities: { a: { id: "a", type: "textField", attributes: { key: "fullName", label: "Full name" } } },
});

const SITEKEY = "1x00000000000000000000AA"; // Cloudflare's published always-passes test sitekey

/**
 * A stand-in for Cloudflare's widget. jsdom will never load their script, and an e2e/unit suite that
 * depended on reaching challenges.cloudflare.com would be slow and flaky — so we install the same API
 * surface the component uses and drive the callbacks by hand.
 */
function installTurnstile(opts: { autoSolve?: boolean; token?: string } = {}) {
  const { autoSolve = true, token = "XXXX.DUMMY.TOKEN.XXXX" } = opts;
  const state = {
    rendered: 0,
    resets: 0,
    removes: 0,
    options: null as TurnstileRenderOptions | null,
  };
  window.turnstile = {
    render: (_el: HTMLElement, options: TurnstileRenderOptions) => {
      state.rendered += 1;
      state.options = options;
      if (autoSolve) options.callback(token);
      return "widget-1";
    },
    reset: () => {
      state.resets += 1;
      if (autoSolve) state.options?.callback(token);
    },
    remove: () => {
      state.removes += 1;
    },
  };
  return state;
}

const form = (over: Partial<embedApi.EmbedForm> = {}): embedApi.EmbedForm => ({
  code: "F1", title: "Intake", version: 1, schema: SCHEMA,
  captchaEnabled: true, captchaSitekey: SITEKEY,
  ...over,
});

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText(/full name/i), "Ada");
  await user.click(screen.getByRole("button", { name: /submit/i }));
}

/** The 5th argument of submitEmbed is the captcha token. */
const sentToken = (call = 0) => embed.submitEmbed.mock.calls[call]?.[4];

describe("Turnstile on the public embed surface", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTurnstileLoaderForTests();
    embed.submitEmbed.mockResolvedValue({ ok: true, instanceId: "i1" });
  });

  afterEach(() => {
    delete window.turnstile;
    document.querySelectorAll("script[src*='challenges.cloudflare.com']").forEach((s) => s.remove());
  });

  it("mounts the widget with the sitekey the SERVER supplied, not a hardcoded one", async () => {
    // The sitekey travels in the render payload so a key rotation never needs this bundle rebuilt.
    const ts = installTurnstile();
    embed.getEmbedForm.mockResolvedValue(form({ captchaSitekey: "3xSERVER_SUPPLIED" }));
    render(<FormEmbedView token="tok" />);
    await screen.findByLabelText(/full name/i);

    await waitFor(() => expect(ts.rendered).toBe(1));
    expect(ts.options?.sitekey).toBe("3xSERVER_SUPPLIED");
    // Invisible unless Cloudflare actually wants a check — completion rates matter on a public form.
    expect(ts.options?.appearance).toBe("interaction-only");
  });

  it("mounts the widget directly above the Submit button, inside the form", async () => {
    // Placement is a product decision, not incidental: when Cloudflare DOES show a challenge it has
    // to appear where the filler is already looking. At the top of the page it sat above the tabs,
    // so on a long form it was off-screen by the time they reached Submit.
    installTurnstile();
    embed.getEmbedForm.mockResolvedValue(form());
    const { container } = render(<FormEmbedView token="tok" />);
    await screen.findByLabelText(/full name/i);

    const gate = await screen.findByTestId("turnstile-gate");
    const submit = container.querySelector("button.lf-submit");
    // Assert the button EXISTS first: without this, a missing button would make both sides `null`
    // and the adjacency check below would pass on a page that renders neither in the right place.
    expect(submit).not.toBeNull();
    expect(gate.nextElementSibling).toBe(submit);
    expect(gate.closest("form")).not.toBeNull();
  });

  it("is absent entirely when the server says the captcha is off", async () => {
    const ts = installTurnstile();
    embed.getEmbedForm.mockResolvedValue(form({ captchaEnabled: false, captchaSitekey: null }));
    render(<FormEmbedView token="tok" />);
    await screen.findByLabelText(/full name/i);

    expect(screen.queryByTestId("turnstile-gate")).not.toBeInTheDocument();
    expect(ts.rendered).toBe(0);
  });

  it("is absent for an engine that predates the field, rather than guessing", async () => {
    const ts = installTurnstile();
    embed.getEmbedForm.mockResolvedValue({ code: "F1", title: "Intake", version: 1, schema: SCHEMA });
    render(<FormEmbedView token="tok" />);
    await screen.findByLabelText(/full name/i);
    expect(ts.rendered).toBe(0);
  });

  it("sends the solved token with the submission", async () => {
    const user = userEvent.setup();
    installTurnstile({ token: "solved-token" });
    embed.getEmbedForm.mockResolvedValue(form());
    render(<FormEmbedView token="tok" />);
    await fillAndSubmit(user);

    await waitFor(() => expect(embed.submitEmbed).toHaveBeenCalled());
    expect(sentToken()).toBe("solved-token");
  });

  it("blocks submit while no token exists, and says so", async () => {
    // autoSolve off = the challenge has not completed yet.
    const user = userEvent.setup();
    installTurnstile({ autoSolve: false });
    embed.getEmbedForm.mockResolvedValue(form());
    render(<FormEmbedView token="tok" />);
    await fillAndSubmit(user);

    expect(await screen.findByText(/security check to finish/i)).toBeInTheDocument();
    expect(embed.submitEmbed).not.toHaveBeenCalled();
  });

  it("resets the widget after a failed submit so the retry gets a FRESH token", async () => {
    // Turnstile tokens are single-use. Without a reset, the retry re-sends a token Cloudflare has
    // already burned and the filler is stuck failing for a reason they cannot see.
    const user = userEvent.setup();
    const ts = installTurnstile({ token: "first-token" });
    embed.getEmbedForm.mockResolvedValue(form());
    embed.submitEmbed.mockRejectedValueOnce(new Error("Could not verify that you're human."));
    render(<FormEmbedView token="tok" />);
    await fillAndSubmit(user);

    expect(await screen.findByText(/could not verify/i)).toBeInTheDocument();
    await waitFor(() => expect(ts.resets).toBe(1));
  });

  it("clears an expired token so a long-open form never submits a stale one", async () => {
    const user = userEvent.setup();
    const ts = installTurnstile();
    embed.getEmbedForm.mockResolvedValue(form());
    render(<FormEmbedView token="tok" />);
    await screen.findByLabelText(/full name/i);
    await waitFor(() => expect(ts.options).not.toBeNull());

    // Cloudflare fires this when the token ages out while the form sits open.
    ts.options!["expired-callback"]!();

    await fillAndSubmit(user);
    expect(await screen.findByText(/security check to finish/i)).toBeInTheDocument();
    expect(embed.submitEmbed).not.toHaveBeenCalled();
  });

  it("surfaces a widget error in the page's existing error slot", async () => {
    const ts = installTurnstile({ autoSolve: false });
    embed.getEmbedForm.mockResolvedValue(form());
    render(<FormEmbedView token="tok" />);
    await screen.findByLabelText(/full name/i);
    await waitFor(() => expect(ts.options).not.toBeNull());

    ts.options!["error-callback"]!("network-error");

    expect(await screen.findByText(/security check could not be completed/i)).toBeInTheDocument();
  });

  it("tells the filler when the Cloudflare script cannot be loaded at all", async () => {
    // No window.turnstile and no network in jsdom: the loader's script tag never fires `load`, so we
    // fire its error path to prove a filler is told rather than left with a form that can't submit.
    embed.getEmbedForm.mockResolvedValue(form());
    render(<FormEmbedView token="tok" />);
    await screen.findByLabelText(/full name/i);

    const script = await waitFor(() => {
      const s = document.querySelector<HTMLScriptElement>("script[src*='challenges.cloudflare.com']");
      expect(s).not.toBeNull();
      return s!;
    });
    script.dispatchEvent(new Event("error"));

    expect(await screen.findByText(/security check could not be loaded/i)).toBeInTheDocument();
  });

  it("loads Cloudflare's script only once even across re-renders", async () => {
    const user = userEvent.setup();
    installTurnstile({ autoSolve: false });
    embed.getEmbedForm.mockResolvedValue(form());
    render(<FormEmbedView token="tok" />);
    const input = await screen.findByLabelText(/full name/i);
    await user.type(input, "Ada");

    expect(document.querySelectorAll("script[src*='challenges.cloudflare.com']").length)
      .toBeLessThanOrEqual(1);
  });

  it("does not re-create the widget as the filler types", async () => {
    // The gate lives INSIDE the renderer now, and the renderer re-renders on every keystroke. If the
    // widget were re-rendered along with it, Cloudflare would restart the challenge mid-fill and the
    // solved token would keep being thrown away — the form would become unsubmittable.
    const user = userEvent.setup();
    const ts = installTurnstile({ token: "stable-token" });
    embed.getEmbedForm.mockResolvedValue(form());
    render(<FormEmbedView token="tok" />);
    const input = await screen.findByLabelText(/full name/i);
    await waitFor(() => expect(ts.rendered).toBe(1));

    await user.type(input, "Ada Lovelace");

    expect(ts.rendered).toBe(1);
    expect(ts.resets).toBe(0);
    // ...and the token survived, so the submission still carries it.
    await user.click(screen.getByRole("button", { name: /submit/i }));
    await waitFor(() => expect(embed.submitEmbed).toHaveBeenCalled());
    expect(sentToken()).toBe("stable-token");
  });
});
