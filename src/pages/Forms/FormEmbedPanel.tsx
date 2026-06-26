/**
 * FormEmbedPanel — the "Embed this form" modal (Route B), ported from the legacy
 * FormBuilderPage into the @lukeflow/form-builder (Builder-v2) shell.
 *
 * Mints the form's opaque, HMAC-signed embed token (lazily, on first open), renders the
 * copy-paste snippet (a div + the @lukeflow/form-embed SDK script), and manages the
 * per-tenant frame-ancestors allowlist (M2) and link rotation/revocation (M4). The engine
 * serves the embed page at the gateway origin with the computed CSP — see [[embeddable-forms-vision]].
 *
 * Self-contained: it owns its token/allowlist/copy state. Keyed by formId at the call site
 * so navigating to another form's builder mints a fresh token rather than reusing a stale one.
 */
import { useEffect, useState } from "react";
import { Modal } from "../../components/ui/modal";
import Button from "../../components/ui/button/Button";
import { MonitorPlay } from "lucide-react";
import { getEmbedToken, rotateEmbedToken, updateMeta } from "../../lib/formsApi";

export default function FormEmbedPanel({
  open,
  onClose,
  tenant,
  formId,
}: {
  open: boolean;
  onClose: () => void;
  tenant: string;
  formId: string;
}) {
  const [embedToken, setEmbedToken] = useState<string | null>(null);
  const [embedErr, setEmbedErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [embedDomains, setEmbedDomains] = useState(""); // per-form allowed embed origins (M2)
  const [savingDomains, setSavingDomains] = useState(false);
  const [domainsSaved, setDomainsSaved] = useState(false);
  const [rotating, setRotating] = useState(false); // regenerating the embed token (M4)
  const [confirmRegen, setConfirmRegen] = useState(false); // "regenerate link" confirmation

  // Mint the token lazily on first open (cached after). A published version is required —
  // the engine 404s an unpublished form; that surfaces here as an error.
  useEffect(() => {
    if (!open || embedToken) return;
    let active = true;
    getEmbedToken(tenant, formId)
      .then(({ token, allowedEmbedOrigins }) => {
        if (!active) return;
        setEmbedToken(token);
        setEmbedDomains(allowedEmbedOrigins ?? "");
      })
      .catch((e) => active && setEmbedErr((e as { message?: string })?.message ?? "Couldn’t generate the embed code."));
    return () => { active = false; };
  }, [open, embedToken, tenant, formId]);

  // Reset the transient affordances each time the modal reopens.
  useEffect(() => { if (open) { setCopied(false); setEmbedErr(null); } }, [open]);

  // The embed PAGE is served by the engine (gateway origin) with a per-tenant frame-ancestors
  // header; VITE_AUTH_API_URL is that gateway base. The SDK script loads from this app's origin
  // but mounts a cross-origin iframe pointed at the gateway via data-lukeform-host.
  const gatewayOrigin = (import.meta.env.VITE_AUTH_API_URL as string | undefined) || window.location.origin;
  const embedUrl = embedToken ? `${gatewayOrigin}/embed/${embedToken}` : "";
  const embedSnippet = embedToken
    ? `<div data-lukeform-token="${embedToken}" data-lukeform-host="${gatewayOrigin}"></div>\n<script src="${window.location.origin}/embed.js" data-lukeform-auto></script>`
    : "";

  const copyEmbed = async () => {
    try { await navigator.clipboard.writeText(embedSnippet); setCopied(true); } catch { /* ignore */ }
  };

  // Persist the per-form embed allowlist (M2). The engine sanitizes + stores it and serves it
  // back as the embed page's frame-ancestors policy; reflect the canonical value back so the
  // tenant sees exactly what's enforced (deduped/lower-cased, junk dropped).
  const saveEmbedDomains = async () => {
    setSavingDomains(true);
    setDomainsSaved(false);
    setEmbedErr(null);
    try {
      const saved = (await updateMeta(tenant, formId, { allowedEmbedOrigins: embedDomains })) as { allowedEmbedOrigins?: string | null };
      setEmbedDomains(saved?.allowedEmbedOrigins ?? "");
      setDomainsSaved(true);
    } catch (e) {
      setEmbedErr((e as { message?: string })?.message ?? "Couldn’t save the allowed domains.");
    } finally {
      setSavingDomains(false);
    }
  };

  // Revoke the current link everywhere it's pasted and mint a fresh one (M4). Confirmed via the
  // confirmRegen modal (not a window.confirm), so this runs only after the user accepts.
  const regenerateEmbed = async () => {
    setRotating(true);
    setEmbedErr(null);
    setCopied(false);
    try {
      const { token, allowedEmbedOrigins } = await rotateEmbedToken(tenant, formId);
      setEmbedToken(token);
      setEmbedDomains(allowedEmbedOrigins ?? "");
    } catch (e) {
      setEmbedErr((e as { message?: string })?.message ?? "Couldn’t regenerate the embed link.");
    } finally {
      setRotating(false);
    }
  };

  return (
    <>
    <Modal isOpen={open} onClose={onClose} className="mx-4 w-full max-w-[560px]">
      <div className="p-6">
        <h2 className="mb-1 text-lg font-semibold text-gray-800 dark:text-white/90">Embed this form</h2>
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
          Paste this snippet into any web page. Submissions create a response and start a process.
        </p>
        {embedErr ? (
          <p className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-500 dark:bg-error-500/10">{embedErr}</p>
        ) : !embedToken ? (
          <p className="py-6 text-center text-sm text-gray-400">Generating…</p>
        ) : (
          <>
            <pre className="overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700 dark:border-gray-700 dark:bg-white/5 dark:text-gray-300">{embedSnippet}</pre>
            <div className="mt-3 flex items-center gap-2">
              <Button size="sm" onClick={copyEmbed}>{copied ? "Copied ✓" : "Copy snippet"}</Button>
              <Button size="sm" variant="outline" startIcon={<MonitorPlay className="size-4" />} onClick={() => window.open(embedUrl, "_blank", "noopener,noreferrer")}>Open preview</Button>
              <Button size="sm" variant="outline" onClick={() => setConfirmRegen(true)} disabled={rotating}>{rotating ? "Regenerating…" : "Regenerate link"}</Button>
            </div>
            <p className="mt-3 text-xs text-gray-400">The link is opaque and signed — it carries only this form, scoped to your organization.</p>

            <div className="mt-5 border-t border-gray-200 pt-4 dark:border-gray-700">
              <label htmlFor="embed-domains" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Allowed embed domains</label>
              <p className="mb-2 mt-0.5 text-xs text-gray-400">
                One origin per line, e.g. <code>https://acme.com</code> or <code>https://*.acme.com</code>. Only these sites may frame the form. Leave empty to allow any site.
              </p>
              <textarea
                id="embed-domains"
                value={embedDomains}
                onChange={(e) => { setEmbedDomains(e.target.value); setDomainsSaved(false); }}
                rows={3}
                spellCheck={false}
                placeholder="https://example.com"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 font-mono text-xs text-gray-700 focus:border-brand-400 focus:outline-none dark:border-gray-700 dark:bg-white/5 dark:text-gray-200"
              />
              <div className="mt-2">
                <Button size="sm" variant="outline" onClick={saveEmbedDomains} disabled={savingDomains}>
                  {savingDomains ? "Saving…" : domainsSaved ? "Saved ✓" : "Save domains"}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>

    {/* Regenerate (revoke) confirmation — replaces the old window.confirm. */}
    <Modal isOpen={confirmRegen} onClose={() => setConfirmRegen(false)} className="mx-4 w-full max-w-[440px]">
      <div className="p-6">
        <h2 className="mb-1 text-lg font-semibold text-gray-800 dark:text-white/90">Regenerate embed link?</h2>
        <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">
          The snippet you’ve already pasted on any site will stop working until you replace it with the new one.
        </p>
        <div className="flex justify-end gap-3">
          <Button size="sm" variant="outline" onClick={() => setConfirmRegen(false)}>Cancel</Button>
          <Button size="sm" variant="danger" onClick={() => { setConfirmRegen(false); void regenerateEmbed(); }}>Regenerate link</Button>
        </div>
      </div>
    </Modal>
    </>
  );
}
