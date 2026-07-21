import { useCallback, useEffect, useState, type ReactNode } from "react";
import PageMeta from "../../components/common/PageMeta";
import Button from "../../components/ui/button/Button";
import Input from "../../components/form/input/InputField";
import Label from "../../components/form/Label";
import {
  ArrowRightIcon,
  CheckCircleIcon,
  EnvelopeIcon,
  LockIcon,
  MailIcon,
} from "../../icons";
import { useAuth } from "../../context/AuthContext";
import { canRead, EMAIL } from "../../lib/capabilities";
import { ApiError } from "../../lib/authApi";
import * as emailApi from "../../lib/emailApi";
import type { EmailServer, Verification } from "../../lib/emailApi";
import * as boxesApi from "../../lib/emailBoxesApi";
import type { EmailBox, EmailBoxDirection } from "../../lib/emailBoxesApi";

type Phase = "loading" | "form" | "code" | "done" | "error";

// Soft pre-check before server validation: require a dotted domain with a 2+ letter
// TLD, so obviously-invalid addresses (e.g. a@b.c) are caught client-side (#38).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;
const LOAD_ATTEMPTS = 3; // initial try + 2 retries for transient load failures

function messageOf(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "Something went wrong. Please try again.";
}

/** Resolves after `ms`, or immediately if the signal aborts (so retries don't outlive a switch). */
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
  });
}

export default function Email() {
  const { session } = useAuth();
  const tenant = session?.tenant ?? "";
  const allowed = canRead(session, EMAIL);

  const [phase, setPhase] = useState<Phase>("loading");
  const [server, setServer] = useState<EmailServer | null>(null);
  const [pending, setPending] = useState<Verification | null>(null);

  const [orgName, setOrgName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Resolve the current state on entry: provisioned → done; a live OTP → resume
  // code entry; otherwise start fresh at the form. `signal` cancels stale work on
  // a tenant/user switch so a slow earlier response can't render the wrong tenant.
  const load = useCallback(async (signal?: AbortSignal) => {
    if (!tenant || !allowed) {
      setPhase("form");
      return;
    }
    setPhase("loading");
    setError(null);
    for (let attempt = 1; attempt <= LOAD_ATTEMPTS; attempt++) {
      try {
        const srv = await emailApi.getEmailServer(tenant, signal);
        if (signal?.aborted) return; // superseded by a newer load — drop the result
        if (srv) {
          setServer(srv);
          setPhase("done");
          return;
        }
        const v = await emailApi.getVerification(tenant, signal);
        if (signal?.aborted) return;
        if (v && v.status === "PENDING") {
          setPending(v);
          if (v.email) setEmail(v.email);
          if (v.orgName) setOrgName(v.orgName);
          setPhase("code");
          return;
        }
        setPhase("form");
        return;
      } catch (e) {
        if (signal?.aborted) return; // aborted by the cleanup — not a real failure
        if (attempt < LOAD_ATTEMPTS) {
          await delay(300 * attempt, signal); // bounded linear backoff
          if (signal?.aborted) return;
          continue;
        }
        // Out of retries: surface the error with a Retry affordance instead of
        // wedging on the spinner or silently dropping into the empty form.
        setError(messageOf(e));
        setPhase("error");
        return;
      }
    }
  }, [tenant, allowed]);

  useEffect(() => {
    const ac = new AbortController();
    void load(ac.signal);
    return () => ac.abort();
  }, [load]);

  const sendCode = async () => {
    setError(null);
    setInfo(null);
    if (!orgName.trim()) return setError("Enter your company name.");
    if (!EMAIL_RE.test(email.trim())) return setError("Enter a valid work email address.");
    setBusy(true);
    try {
      const v = await emailApi.startVerification(
        tenant,
        { orgName: orgName.trim(), email: email.trim() },
      );
      setPending(v);
      setCode("");
      // Fall back to the address the user just entered if the response is thin
      // (so we never render "…code to undefined").
      setInfo(`We sent a 6-digit code to ${v.email ?? email.trim()}.`);
      setPhase("code");
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setError(null);
    if (code.trim().length < 4) return setError("Enter the code from your email.");
    setBusy(true);
    try {
      const result = await emailApi.verifyCode(tenant, code.trim());
      if (result.server) {
        setServer(result.server);
        setPhase("done");
        return;
      }
      // Verified, but the Postmark server couldn't be provisioned synchronously.
      // The backend may finish provisioning out-of-band, so poll the server a few
      // times (bounded) before asking the user to retry — recovery isn't manual-only.
      setPending(result.verification);
      setInfo("Email verified — finishing setup…");
      for (let attempt = 1; attempt <= 3; attempt++) {
        await delay(800 * attempt);
        const srv = await emailApi.getEmailServer(tenant).catch(() => null);
        if (srv) {
          setServer(srv);
          setInfo(null);
          setPhase("done");
          return;
        }
      }
      setInfo(null);
      setError(
        result.provisioningError ??
          "Your email is verified, but we couldn't finish setup. Please try again shortly.",
      );
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const restart = () => {
    setPending(null);
    setCode("");
    setError(null);
    setInfo(null);
    setPhase("form");
  };

  return (
    <>
      <PageMeta
        title="Email | Lukeflow"
        description="Set up your company's sending email in Lukeflow."
      />

      {!allowed ? (
        <Locked />
      ) : phase === "loading" ? (
        <Centered>
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
        </Centered>
      ) : phase === "error" ? (
        <LoadError message={error} onRetry={() => void load()} />
      ) : phase === "done" && server ? (
        <div className="mx-auto max-w-xl space-y-6">
          <Connected server={server} />
          <EmailBoxes tenant={tenant} senderDomain={server.senderDomain} />
        </div>
      ) : (
        <div className="mx-auto max-w-xl">
          <Stepper phase={phase} />
          <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03] sm:p-8">
            {phase === "form" ? (
              <FormStep
                orgName={orgName}
                email={email}
                busy={busy}
                onOrgName={setOrgName}
                onEmail={setEmail}
                onSubmit={sendCode}
              />
            ) : (
              <CodeStep
                email={pending?.email ?? email}
                code={code}
                busy={busy}
                attemptsRemaining={pending?.attemptsRemaining}
                onCode={setCode}
                onVerify={verify}
                onRestart={restart}
              />
            )}

            {error && <Banner tone="error">{error}</Banner>}
            {info && !error && <Banner tone="info">{info}</Banner>}
          </div>
        </div>
      )}
    </>
  );
}

/* ── steps ─────────────────────────────────────────────────────────────── */

function FormStep({
  orgName,
  email,
  busy,
  onOrgName,
  onEmail,
  onSubmit,
}: {
  orgName: string;
  email: string;
  busy: boolean;
  onOrgName: (v: string) => void;
  onEmail: (v: string) => void;
  onSubmit: () => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) onSubmit();
      }}
    >
      <Header
        icon={<EnvelopeIcon className="size-6" />}
        title="Set up your sending email"
        subtitle="Confirm a work email so Lukeflow can send on your company's behalf. We'll email you a verification code."
      />

      <div className="mt-6 space-y-5">
        <div>
          <Label htmlFor="orgName">Company name</Label>
          <Input
            id="orgName"
            placeholder="Acme Corporation"
            value={orgName}
            onChange={(e) => onOrgName(e.target.value)}
            disabled={busy}
            autoFocus
          />
        </div>
        <div>
          <Label htmlFor="email">Work email</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@acme.com"
            value={email}
            onChange={(e) => onEmail(e.target.value)}
            disabled={busy}
            hint="Use your company domain — personal addresses (gmail, outlook…) aren't accepted."
          />
        </div>
      </div>

      <Button
        className="mt-6 w-full"
        disabled={busy}
        endIcon={<ArrowRightIcon className="size-5" />}
      >
        {busy ? "Sending code…" : "Send verification code"}
      </Button>
    </form>
  );
}

function CodeStep({
  email,
  code,
  busy,
  attemptsRemaining,
  onCode,
  onVerify,
  onRestart,
}: {
  email: string;
  code: string;
  busy: boolean;
  attemptsRemaining?: number;
  onCode: (v: string) => void;
  onVerify: () => void;
  onRestart: () => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy && attemptsRemaining !== 0) onVerify();
      }}
    >
      <Header
        icon={<MailIcon className="size-6" />}
        title="Enter your verification code"
        subtitle={`We sent a 6-digit code to ${email}. Enter it below to finish setup.`}
      />

      <div className="mt-6">
        <Label htmlFor="code">Verification code</Label>
        <Input
          id="code"
          type="text"
          placeholder="123456"
          value={code}
          onChange={(e) => onCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          disabled={busy}
          autoFocus
          className="text-center text-lg tracking-[0.5em]"
        />
        {typeof attemptsRemaining === "number" && attemptsRemaining < 5 && (
          <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
            {attemptsRemaining === 0
              ? "No attempts left — use a different email to try again."
              : `${attemptsRemaining} attempt${attemptsRemaining === 1 ? "" : "s"} left.`}
          </p>
        )}
      </div>

      <Button className="mt-6 w-full" disabled={busy || attemptsRemaining === 0}>
        {busy ? "Verifying…" : "Verify & finish"}
      </Button>

      <button
        type="button"
        onClick={onRestart}
        disabled={busy}
        className="mt-4 w-full text-center text-sm text-brand-500 hover:text-brand-600 disabled:opacity-50"
      >
        Use a different email
      </button>
    </form>
  );
}

function Connected({ server }: { server: EmailServer }) {
  return (
    <div className="mx-auto max-w-xl">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03] sm:p-8">
        <div className="flex items-start gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-success-50 text-success-500 dark:bg-success-500/15">
            <CheckCircleIcon className="size-6" />
          </span>
          <div>
            <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">
              Your email is set up
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Lukeflow now sends on behalf of your company from the address below.
            </p>
          </div>
        </div>

        <dl className="mt-6 divide-y divide-gray-100 dark:divide-gray-800">
          <Row label="Sends from" value={server.defaultFrom} mono />
          <Row label="Sending domain" value={server.senderDomain} mono />
          {server.verifiedEmail && <Row label="Verified by" value={server.verifiedEmail} mono />}
          <Row
            label="Status"
            value={
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success-50 px-2.5 py-0.5 text-xs font-medium text-success-600 dark:bg-success-500/15 dark:text-success-400">
                <span className="size-1.5 rounded-full bg-success-500" />
                {server.status === "ACTIVE" ? "Active" : server.status}
              </span>
            }
          />
        </dl>
      </div>
    </div>
  );
}

/* ── email boxes (inbound / outbound addresses) ─────────────────────────── */

function EmailBoxes({ tenant, senderDomain }: { tenant: string; senderDomain: string }) {
  const [boxes, setBoxes] = useState<EmailBox[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [direction, setDirection] = useState<EmailBoxDirection>("OUTBOUND");
  const [localPart, setLocalPart] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [streamType, setStreamType] = useState("Transactional");
  const [workflowTrigger, setWorkflowTrigger] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    boxesApi
      .listBoxes(tenant)
      .then((b) => active && setBoxes(b))
      .catch((e) => active && setError(messageOf(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [tenant]);

  async function register() {
    if (!localPart.trim() || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await boxesApi.registerBox(tenant, {
        direction,
        localPart: localPart.trim(),
        displayName: displayName.trim() || undefined,
        streamType: direction === "OUTBOUND" ? streamType : undefined,
        workflowTrigger: direction === "INBOUND" ? workflowTrigger : undefined,
      });
      setBoxes((prev) => [...prev, res.box]);
      setLocalPart("");
      setDisplayName("");
      if (res.warning) setNotice(res.warning);
      else if (res.inboundWebhookUrl)
        setNotice(
          `Inbound is wired. Point MX for ${senderDomain} at Postmark to receive at this address` +
            (res.postmarkInboundAddress ? `, or forward to ${res.postmarkInboundAddress}.` : "."),
        );
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const prev = boxes;
    setBoxes((b) => b.filter((x) => x.id !== id));
    try {
      await boxesApi.deleteBox(tenant, id);
    } catch (e) {
      setBoxes(prev); // rollback
      setError(messageOf(e));
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03] sm:p-8">
      <div className="flex items-start gap-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-500 dark:bg-brand-500/10">
          <MailIcon className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Email boxes</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Register addresses on <span className="font-mono">{senderDomain}</span> to send from
            (outbound) or receive at (inbound). Inbound mail can trigger a workflow.
          </p>
        </div>
      </div>

      {/* Register */}
      <div className="mt-6 space-y-4 rounded-xl border border-gray-100 p-4 dark:border-gray-800">
        <div className="inline-flex rounded-lg border border-gray-200 p-0.5 dark:border-gray-700">
          {(["OUTBOUND", "INBOUND"] as EmailBoxDirection[]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDirection(d)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                direction === d
                  ? "bg-brand-500 text-white"
                  : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.03]"
              }`}
            >
              {d === "OUTBOUND" ? "Outbound (send)" : "Inbound (receive)"}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="sm:flex-1">
            <Label htmlFor="box-localpart">Address</Label>
            <div className="flex items-center">
              <Input
                id="box-localpart"
                value={localPart}
                onChange={(e) => setLocalPart(e.target.value.replace(/@.*/, ""))}
                placeholder={direction === "INBOUND" ? "support" : "sales"}
              />
              <span className="ml-2 whitespace-nowrap font-mono text-sm text-gray-400">
                @{senderDomain}
              </span>
            </div>
          </div>
          <div className="sm:flex-1">
            <Label htmlFor="box-name">Display name (optional)</Label>
            <Input
              id="box-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={direction === "INBOUND" ? "Support inbox" : "Sales"}
            />
          </div>
        </div>

        {direction === "OUTBOUND" ? (
          <div>
            <Label htmlFor="box-stream">Stream type</Label>
            <select
              id="box-stream"
              value={streamType}
              onChange={(e) => setStreamType(e.target.value)}
              className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 sm:w-56"
            >
              <option value="Transactional">Transactional</option>
              <option value="Broadcasts">Broadcasts</option>
            </select>
          </div>
        ) : (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <input
              type="checkbox"
              checked={workflowTrigger}
              onChange={(e) => setWorkflowTrigger(e.target.checked)}
              className="size-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-900"
            />
            Trigger a workflow when mail arrives
          </label>
        )}

        <Button size="sm" disabled={!localPart.trim() || busy} onClick={register}>
          {busy ? "Registering…" : `Register ${direction === "INBOUND" ? "inbound" : "outbound"} box`}
        </Button>
        {notice && <Banner tone="info">{notice}</Banner>}
        {error && <Banner tone="error">{error}</Banner>}
      </div>

      {/* List */}
      <div className="mt-6">
        {loading ? (
          <p className="text-sm text-gray-400">Loading boxes…</p>
        ) : boxes.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No boxes yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {boxes.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-mono text-sm text-gray-800 dark:text-gray-100">
                    <span className="truncate">{b.address}</span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        b.direction === "INBOUND"
                          ? "bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400"
                          : "bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400"
                      }`}
                    >
                      {b.direction === "INBOUND" ? "Inbound" : "Outbound"}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {b.direction === "INBOUND"
                      ? b.workflowTrigger
                        ? "Fires a workflow on receipt"
                        : "Stored only (no workflow)"
                      : b.postmarkStreamId
                        ? `Stream: ${b.postmarkStreamId}`
                        : "Outbound"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => remove(b.id)}
                  className="shrink-0 text-xs text-gray-400 transition hover:text-error-500"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ── small pieces ──────────────────────────────────────────────────────── */

function Header({
  icon,
  title,
  subtitle,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-start gap-4">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-500 dark:bg-brand-500/10">
        {icon}
      </span>
      <div>
        <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">{title}</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
      </div>
    </div>
  );
}

function Stepper({ phase }: { phase: Phase }) {
  const step = phase === "code" ? 2 : 1;
  // List semantics + aria-current so AT can convey the steps and which is active (#34).
  return (
    <ol className="mb-4 flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400">
      <li aria-current={step === 1 ? "step" : undefined} className={step >= 1 ? "text-brand-500" : ""}>
        1. Your email
      </li>
      <span aria-hidden="true" className="h-px w-6 bg-gray-200 dark:bg-gray-700" />
      <li aria-current={step === 2 ? "step" : undefined} className={step >= 2 ? "text-brand-500" : ""}>
        2. Verify
      </li>
    </ol>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <dt className="text-sm text-gray-500 dark:text-gray-400">{label}</dt>
      <dd
        className={`text-sm text-gray-800 dark:text-white/90 ${mono ? "font-mono" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

function Banner({ tone, children }: { tone: "error" | "info"; children: ReactNode }) {
  const classes =
    tone === "error"
      ? "border-error-200 bg-error-50 text-error-600 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400"
      : "border-brand-200 bg-brand-50 text-brand-600 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-400";
  // Announce status changes to AT: errors assertively, info politely (#34).
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
      className={`mt-5 rounded-lg border px-4 py-3 text-sm ${classes}`}
    >
      {children}
    </div>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">{children}</div>
  );
}

function LoadError({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  return (
    <Centered>
      <div className="flex max-w-md flex-col items-center rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-16 text-center dark:border-gray-800 dark:bg-white/[0.03]">
        <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">
          Couldn't load email setup
        </h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          {message ?? "Something went wrong. Please try again."}
        </p>
        <Button className="mt-6" onClick={onRetry}>
          Retry
        </Button>
      </div>
    </Centered>
  );
}

function Locked() {
  return (
    <Centered>
      <div className="flex max-w-md flex-col items-center rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-16 text-center dark:border-gray-800 dark:bg-white/[0.03]">
        <span className="flex size-12 items-center justify-center rounded-full bg-gray-100 text-gray-400 dark:bg-white/10">
          <LockIcon className="size-6" />
        </span>
        <h1 className="mt-4 text-2xl font-semibold text-gray-800 dark:text-white/90">Email</h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Email isn't enabled for your workspace. Ask an admin to grant the Email capability.
        </p>
      </div>
    </Centered>
  );
}
