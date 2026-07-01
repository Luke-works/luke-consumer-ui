import { useEffect, useState } from "react";
import { Check, KeyRound, Phone as PhoneIcon, X } from "lucide-react";
import {
  connectApiKey,
  disconnectApiKey,
  getMyNumber,
  getSettings,
  provisionNumber,
  updateDefaults,
  type PhoneNumber,
  type PhoneSettings,
  type ProvisionNumberInput,
} from "../../lib/phoneApi";

/**
 * Phone configuration drawer. SaaS model: a workspace owns exactly ONE number (provisioned once,
 * under the platform Vapi account), which is its identity for inbound + outbound. Lets the tenant
 * provision that number, choose the default assistant, and — optionally — bring its own Vapi key.
 * Writes are gated by {@code canEdit}; the server enforces the PHONE capability regardless.
 */
export default function PhoneSettingsDrawer({
  tenant,
  canEdit,
  onClose,
}: {
  tenant: string;
  canEdit: boolean;
  onClose: () => void;
}) {
  const [settings, setSettings] = useState<PhoneSettings | null>(null);
  const [number, setNumber] = useState<PhoneNumber | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setErr(null);
    try {
      const [s, n] = await Promise.all([getSettings(tenant), getMyNumber(tenant)]);
      setSettings(s);
      setNumber(n);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant]);

  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/40" onClick={onClose}>
      <div className="h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-xl dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Phone settings</h2>
            <p className="text-xs text-gray-400">Your workspace number, the default assistant, and Vapi connection.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10">
            <X className="size-5" />
          </button>
        </div>

        {err && <p className="mb-4 text-sm text-error-500">{err}</p>}
        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : (
          <div className="space-y-6">
            <NumberSection number={number} canEdit={canEdit} tenant={tenant} onProvisioned={reload} onError={setErr} />
            <DefaultAssistantSection settings={settings} canEdit={canEdit} tenant={tenant} onChange={setSettings} onError={setErr} />
            <ApiKeySection settings={settings} canEdit={canEdit} tenant={tenant} onChange={setSettings} onError={setErr} />
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</h3>
      <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
        {hint && <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{hint}</p>}
        {children}
      </div>
    </div>
  );
}

// ── Your one number ──────────────────────────────────────────────────────────
function NumberSection({
  number,
  canEdit,
  tenant,
  onProvisioned,
  onError,
}: {
  number: PhoneNumber | null;
  canEdit: boolean;
  tenant: string;
  onProvisioned: () => void;
  onError: (m: string | null) => void;
}) {
  const [form, setForm] = useState<ProvisionNumberInput>({ provider: "vapi" });
  const [busy, setBusy] = useState(false);

  if (number) {
    return (
      <Section title="Your number">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 font-mono text-sm text-gray-900 dark:text-white">
            <PhoneIcon className="size-4 text-brand-500" /> {number.number}
          </span>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] uppercase text-gray-500 dark:bg-white/10">{number.provider}</span>
        </div>
        <p className="mt-2 text-xs text-gray-400">This is your workspace’s number for inbound and outbound calls. One number per workspace.</p>
      </Section>
    );
  }

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    onError(null);
    try {
      await provisionNumber(tenant, form);
      onProvisioned();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not provision the number");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Your number" hint="Get the one number this workspace uses for inbound and outbound calls.">
      {!canEdit ? (
        <p className="text-sm text-gray-400">No number yet. An owner can provision one.</p>
      ) : (
        <div className="space-y-2">
          <select
            value={form.provider}
            onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value as ProvisionNumberInput["provider"] }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-white/5"
          >
            <option value="vapi">Vapi number (US)</option>
            <option value="twilio">Import Twilio</option>
            <option value="telnyx">Import Telnyx</option>
            <option value="vonage">Import Vonage</option>
          </select>
          {form.provider === "vapi" ? (
            <input
              value={form.areaCode ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, areaCode: e.target.value }))}
              placeholder="Area code (optional, e.g. 415)"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-white/5"
            />
          ) : (
            <>
              <input
                value={form.number ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}
                placeholder="Number, E.164 (e.g. +14155551234)"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-white/5"
              />
              <input
                value={form.credentialId ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, credentialId: e.target.value }))}
                placeholder="Vapi credential id for the carrier"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-white/5"
              />
            </>
          )}
          <input
            value={form.assistantId ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, assistantId: e.target.value }))}
            placeholder="Assistant id to answer inbound (optional)"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-white/5"
          />
          <div className="flex justify-end">
            <button onClick={submit} disabled={busy} className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50">
              {busy ? "Provisioning…" : "Get my number"}
            </button>
          </div>
        </div>
      )}
    </Section>
  );
}

// ── Default assistant ────────────────────────────────────────────────────────
function DefaultAssistantSection({
  settings,
  canEdit,
  tenant,
  onChange,
  onError,
}: {
  settings: PhoneSettings | null;
  canEdit: boolean;
  tenant: string;
  onChange: (s: PhoneSettings) => void;
  onError: (m: string | null) => void;
}) {
  const [assistant, setAssistant] = useState(settings?.defaultAssistantId ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setSaved(false);
    onError(null);
    try {
      onChange(await updateDefaults(tenant, { defaultAssistantId: assistant || null }));
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Default assistant" hint="Used to answer inbound calls and place outbound calls when one isn’t specified.">
      <input
        value={assistant}
        disabled={!canEdit}
        onChange={(e) => setAssistant(e.target.value)}
        placeholder="Vapi assistant id"
        className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-white/5 disabled:opacity-60"
      />
      {canEdit && (
        <div className="flex items-center justify-end gap-2">
          {saved && <span className="text-xs text-success-600">Saved</span>}
          <button onClick={save} disabled={busy} className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50">
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </Section>
  );
}

// ── Optional: bring your own Vapi key ────────────────────────────────────────
function ApiKeySection({
  settings,
  canEdit,
  tenant,
  onChange,
  onError,
}: {
  settings: PhoneSettings | null;
  canEdit: boolean;
  tenant: string;
  onChange: (s: PhoneSettings) => void;
  onError: (m: string | null) => void;
}) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);

  const connect = async () => {
    if (!key.trim() || busy) return;
    setBusy(true);
    onError(null);
    try {
      onChange(await connectApiKey(tenant, key.trim()));
      setKey("");
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not connect the key");
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    onError(null);
    try {
      onChange(await disconnectApiKey(tenant));
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not disconnect the key");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title="Bring your own Vapi (optional)"
      hint="By default your number and calls run on the platform’s Vapi account. Advanced: connect your own Vapi private key to run on your account instead."
    >
      {settings?.hasApiKey ? (
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 text-sm text-success-600">
            <Check className="size-4" /> Using your own Vapi key
          </span>
          {canEdit && (
            <button onClick={disconnect} disabled={busy} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs dark:border-gray-700 disabled:opacity-50">
              Disconnect
            </button>
          )}
        </div>
      ) : (
        canEdit && (
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <KeyRound className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
              <input
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="vapi private key"
                className="w-full rounded-lg border border-gray-300 py-2 pl-8 pr-3 text-sm dark:border-gray-700 dark:bg-white/5"
              />
            </div>
            <button onClick={connect} disabled={!key.trim() || busy} className="shrink-0 rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50">
              {busy ? "Saving…" : "Connect"}
            </button>
          </div>
        )
      )}
    </Section>
  );
}
