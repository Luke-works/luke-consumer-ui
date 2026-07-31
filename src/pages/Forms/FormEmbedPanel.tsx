/**
 * FormEmbedPanel — the "Embed this form" dialog (Route B).
 *
 * Mints the form's opaque, HMAC-signed embed token (lazily, on first open), renders the copy-paste
 * snippet (a div + the @lukeflow/form-embed SDK script), and manages the per-tenant frame-ancestors
 * allowlist (M2), version pinning (M6) and link rotation/revocation (M4). The engine serves the embed
 * page at the gateway origin with the computed CSP — see [[embeddable-forms-vision]].
 *
 * <p>Laid out as TABS rather than one long scroll. The four sections answer unrelated questions —
 * what do I paste, which version do visitors get, which sites may show it — and stacking them meant
 * the allowlist, the one thing people come back to change, sat below three screens of content.
 *
 * Self-contained: it owns its token/allowlist/copy state. Keyed by formId at the call site so
 * navigating to another form's builder mints a fresh token rather than reusing a stale one.
 */
import { useEffect, useMemo, useState } from "react";
import { Modal } from "../../components/ui/modal";
import Button from "../../components/ui/button/Button";
import { Code2, Globe, History, MonitorPlay } from "lucide-react";
import { ICON_LABEL_NUDGE } from "../../lib/iconAlign";
import EmbedSitesEditor from "./EmbedSitesEditor";
import {
  canSaveSites,
  emptyRow,
  parseEmbedSites,
  serializeEmbedSites,
  type EmbedSiteRow,
} from "../../lib/embedSites";
import {
  getEmbedToken,
  getEmbedVersion,
  listEmbedSites,
  rotateEmbedToken,
  setEmbedVersion,
  setSubmissionHandling,
  updateMeta,
  type EmbedSite,
  type EmbedVersionState,
} from "../../lib/formsApi";

const TABS = [
  { id: "snippet", label: "Snippet", icon: Code2 },
  { id: "version", label: "Version", icon: History },
  { id: "websites", label: "Websites", icon: Globe },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function FormEmbedPanel({
  open,
  onClose,
  tenant,
  formId,
  publishedVersion,
  submissionHandling,
  onSubmissionHandled,
}: {
  open: boolean;
  onClose: () => void;
  tenant: string;
  formId: string;
  /** The live version the embed serves (the engine resolves @published). Null = not published. */
  publishedVersion?: number | null;
  /** Inbound gate: null/blank = the user hasn't decided what happens to submissions → embed stays locked. */
  submissionHandling?: string | null;
  /** Called after the user picks a submission handling, so the parent can refresh the form. */
  onSubmissionHandled?: () => void;
}) {
  // Embedding is gated until the user decides what happens to submissions (inbound rule).
  const needsHandling = publishedVersion != null && !submissionHandling;
  const [tab, setTab] = useState<TabId>("snippet");
  const [deciding, setDeciding] = useState(false);
  const [embedToken, setEmbedToken] = useState<string | null>(null);
  const [embedErr, setEmbedErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sitesRows, setSitesRows] = useState<EmbedSiteRow[]>([]); // per-form allowed embed sites (M2)
  const [savingSites, setSavingSites] = useState(false);
  const [sitesSaved, setSitesSaved] = useState(false);
  const [rotating, setRotating] = useState(false); // regenerating the embed token (M4)
  const [confirmRegen, setConfirmRegen] = useState(false); // "regenerate link" confirmation
  // Which version fillers are served, and whether a publish is waiting to reach them (M6).
  const [embedVersion, setEmbedVersionState] = useState<EmbedVersionState | null>(null);
  const [savingVersion, setSavingVersion] = useState(false);
  // Websites we have OBSERVED framing this form. Intelligence for the author, never a permission.
  const [sites, setSites] = useState<EmbedSite[] | null>(null);

  // Mint the token lazily on first open (cached after). A published version is required —
  // the engine 404s an unpublished form; that surfaces here as an error.
  useEffect(() => {
    if (!open || embedToken || needsHandling) return;
    let active = true;
    getEmbedToken(tenant, formId)
      .then(({ token, allowedEmbedOrigins, embedOriginNames }) => {
        if (!active) return;
        setEmbedToken(token);
        setSitesRows(parseEmbedSites(allowedEmbedOrigins, embedOriginNames));
      })
      .catch((e) => active && setEmbedErr((e as { message?: string })?.message ?? "Couldn’t generate the embed code."));
    return () => { active = false; };
  }, [open, embedToken, tenant, formId, needsHandling]);

  // Inbound gate: record "collect submissions" as the handling, which unlocks the embed.
  const decideCollect = async () => {
    setDeciding(true);
    setEmbedErr(null);
    try {
      await setSubmissionHandling(tenant, formId, "COLLECT");
      onSubmissionHandled?.();
    } catch (e) {
      setEmbedErr((e as { message?: string })?.message ?? "Couldn’t save your choice.");
    } finally {
      setDeciding(false);
    }
  };

  // Reset the transient affordances each time the modal reopens.
  useEffect(() => { if (open) { setCopied(false); setEmbedErr(null); setTab("snippet"); } }, [open]);

  // The embed PAGE is served by the engine (gateway origin) with a per-tenant frame-ancestors
  // header; VITE_AUTH_API_URL is that gateway base. The SDK script loads from this app's origin
  // but mounts a cross-origin iframe pointed at the gateway via data-lukeform-host.
  const gatewayOrigin = (import.meta.env.VITE_AUTH_API_URL as string | undefined) || window.location.origin;
  const embedUrl = embedToken ? `${gatewayOrigin}/embed/${embedToken}` : "";
  const embedSnippet = embedToken
    ? `<div data-lukeform-token="${embedToken}" data-lukeform-host="${gatewayOrigin}"></div>\n<script src="${window.location.origin}/embed.js" data-lukeform-auto></script>`
    : "";

  // Load the version state + observed sites once the embed surface is actually usable.
  useEffect(() => {
    if (!open || needsHandling) return;
    let active = true;
    getEmbedVersion(tenant, formId)
      .then((v) => active && setEmbedVersionState(v))
      .catch(() => active && setEmbedVersionState(null));
    listEmbedSites(tenant, formId)
      .then((s) => active && setSites(s))
      .catch(() => active && setSites([])); // an empty list reads the same as "nowhere yet"
    return () => { active = false; };
  }, [open, needsHandling, tenant, formId]);

  /** Switch between AUTO (always latest) and PINNED, or move a pin up to the published version. */
  const applyVersionMode = async (mode: "AUTO" | "PINNED", version?: number) => {
    setSavingVersion(true);
    setEmbedErr(null);
    try {
      setEmbedVersionState(await setEmbedVersion(tenant, formId, mode, version));
    } catch (e) {
      setEmbedErr((e as { message?: string })?.message ?? "Couldn’t change the embed version.");
    } finally {
      setSavingVersion(false);
    }
  };

  const copyEmbed = async () => {
    try { await navigator.clipboard.writeText(embedSnippet); setCopied(true); } catch { /* ignore */ }
  };

  // Persist the per-form allowlist (M2). The engine sanitizes + stores it and serves it back as the
  // embed page's frame-ancestors policy; reflect the canonical value back so the author sees exactly
  // what's enforced (deduped/lower-cased, junk dropped).
  const saveSites = async () => {
    setSavingSites(true);
    setSitesSaved(false);
    setEmbedErr(null);
    try {
      const patch = serializeEmbedSites(sitesRows);
      const saved = (await updateMeta(tenant, formId, patch)) as {
        allowedEmbedOrigins?: string | null;
        embedOriginNames?: Record<string, string> | null;
      };
      setSitesRows(parseEmbedSites(saved?.allowedEmbedOrigins, saved?.embedOriginNames));
      setSitesSaved(true);
    } catch (e) {
      setEmbedErr((e as { message?: string })?.message ?? "Couldn’t save the allowed websites.");
    } finally {
      setSavingSites(false);
    }
  };

  // Revoke the current link everywhere it's pasted and mint a fresh one (M4). Confirmed via the
  // confirmRegen modal (not a window.confirm), so this runs only after the user accepts.
  const regenerateEmbed = async () => {
    setRotating(true);
    setEmbedErr(null);
    setCopied(false);
    try {
      const { token, allowedEmbedOrigins, embedOriginNames } = await rotateEmbedToken(tenant, formId);
      setEmbedToken(token);
      setSitesRows(parseEmbedSites(allowedEmbedOrigins, embedOriginNames));
    } catch (e) {
      setEmbedErr((e as { message?: string })?.message ?? "Couldn’t regenerate the embed link.");
    } finally {
      setRotating(false);
    }
  };

  // Always give the editor a row to type into, without persisting a phantom entry.
  const editorRows = useMemo(() => (sitesRows.length ? sitesRows : [emptyRow()]), [sitesRows]);
  const sitesValid = canSaveSites(editorRows);

  /** The gate, the error, or the tabbed body — the three states this dialog can be in. */
  const body = () => {
    if (needsHandling) {
      return (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-white/5">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">First, decide what happens to submissions</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            This form can’t be embedded until you choose how submissions are handled. For now you can start collecting
            them — you can add follow-up actions (email, call) later.
          </p>
          {embedErr ? <p className="mt-3 text-sm text-error-500">{embedErr}</p> : null}
          <div className="mt-4">
            <Button size="sm" onClick={decideCollect} disabled={deciding}>
              {deciding ? "Saving…" : "Collect submissions & enable embed"}
            </Button>
          </div>
        </div>
      );
    }
    if (embedErr && !embedToken) {
      return <p className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-500 dark:bg-error-500/10">{embedErr}</p>;
    }
    if (!embedToken) return <p className="py-6 text-center text-sm text-gray-400">Generating…</p>;

    return (
      <>
        {embedErr ? (
          <p role="alert" className="mb-4 rounded-lg bg-error-50 px-4 py-2.5 text-sm text-error-500 dark:bg-error-500/10">{embedErr}</p>
        ) : null}

        {tab === "snippet" && (
          <div role="tabpanel" id="embed-panel-snippet" aria-labelledby="embed-tab-snippet">
            <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
              Paste this into any web page. The snippet never has to change — it points at this form,
              and we decide which version to serve.
            </p>
            <pre className="overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700 dark:border-gray-700 dark:bg-white/5 dark:text-gray-300">{embedSnippet}</pre>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={copyEmbed}>{copied ? "Copied ✓" : "Copy snippet"}</Button>
              <Button size="sm" variant="outline" startIcon={<MonitorPlay className="size-4" />} onClick={() => window.open(embedUrl, "_blank", "noopener,noreferrer")}>Open preview</Button>
              <Button size="sm" variant="outline" onClick={() => setConfirmRegen(true)} disabled={rotating}>{rotating ? "Regenerating…" : "Regenerate link"}</Button>
            </div>
            <p className="mt-3 text-xs text-gray-400">The link is opaque and signed — it carries only this form, scoped to your organization.</p>
          </div>
        )}

        {/* WHICH VERSION fillers get. Publishing reaches every embed instantly in AUTO — nothing on
            the embedding site ever changes. PINNED is the opposite promise: a publish does NOT move
            a live form under people until you say so, which is what you want for anything
            legally significant. */}
        {tab === "version" && (
          <div role="tabpanel" id="embed-panel-version" aria-labelledby="embed-tab-version">
            {embedVersion ? (
              <>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className="text-gray-500 dark:text-gray-400">
                    Live now:{" "}
                    <span className="font-medium text-gray-800 dark:text-white/90">
                      {embedVersion.servingVersion != null ? `v${embedVersion.servingVersion}` : "—"}
                    </span>
                  </span>
                  <span className="text-gray-500 dark:text-gray-400">
                    Latest published:{" "}
                    <span className="font-medium text-gray-800 dark:text-white/90">
                      {embedVersion.publishedVersion != null ? `v${embedVersion.publishedVersion}` : "—"}
                    </span>
                  </span>
                  {embedVersion.updateAvailable && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
                      New version ready
                    </span>
                  )}
                </div>

                {embedVersion.updateAvailable && embedVersion.publishedVersion != null && (
                  <div className="mt-4">
                    <Button
                      size="sm"
                      onClick={() => void applyVersionMode("PINNED", embedVersion.publishedVersion ?? undefined)}
                      disabled={savingVersion}
                    >
                      {savingVersion ? "Updating…" : `Update embeds to v${embedVersion.publishedVersion}`}
                    </Button>
                    <p className="mt-1.5 text-xs text-gray-400">
                      Takes effect immediately, everywhere this form is embedded. No change needed on any website.
                    </p>
                  </div>
                )}

                <div className="mt-4 space-y-3">
                  <label className="flex cursor-pointer items-start gap-2 text-sm">
                    <input
                      type="radio"
                      name="embed-version-mode"
                      checked={embedVersion.mode === "AUTO"}
                      onChange={() => void applyVersionMode("AUTO")}
                      disabled={savingVersion}
                      className="mt-1"
                    />
                    <span>
                      <span className="font-medium text-gray-700 dark:text-gray-300">Always serve the latest</span>
                      <span className="block text-xs text-gray-400">
                        Publishing a version puts it in front of visitors straight away.
                      </span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-2 text-sm">
                    <input
                      type="radio"
                      name="embed-version-mode"
                      checked={embedVersion.mode === "PINNED"}
                      onChange={() => void applyVersionMode("PINNED", embedVersion.servingVersion ?? undefined)}
                      disabled={savingVersion}
                      className="mt-1"
                    />
                    <span>
                      <span className="font-medium text-gray-700 dark:text-gray-300">Hold on a version I choose</span>
                      <span className="block text-xs text-gray-400">
                        Publishing won’t change the live form until you update the embed here.
                      </span>
                    </span>
                  </label>
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-400">Version details aren’t available for this form.</p>
            )}
          </div>
        )}

        {tab === "websites" && (
          <div role="tabpanel" id="embed-panel-websites" aria-labelledby="embed-tab-websites">
            <EmbedSitesEditor rows={editorRows} onChange={setSitesRows} disabled={savingSites} />

            {/* WHERE the form is live. Learned from the embedding page's Referer, so it's an
                observation: a site that hides its referrer simply never appears. */}
            <div className="mt-6 border-t border-gray-200 pt-4 dark:border-gray-700">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Seen embedding this form</h3>
              {sites == null ? (
                <p className="mt-1 text-xs text-gray-400">Checking…</p>
              ) : sites.length === 0 ? (
                <p className="mt-1 text-xs text-gray-400">
                  No sites seen yet. A website appears here the first time someone loads the form on it.
                </p>
              ) : (
                <ul className="mt-2 divide-y divide-gray-100 dark:divide-gray-800">
                  {sites.map((s) => (
                    <li key={s.origin} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                      <span className="font-mono text-xs text-gray-700 dark:text-gray-300">{s.origin}</span>
                      <span className="flex items-center gap-2 text-[11px] text-gray-400">
                        {!s.allowed && (
                          <span
                            title="This site is not in your allowed websites, so the browser is blocking it."
                            className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-600 dark:bg-amber-500/15 dark:text-amber-400"
                          >
                            Not allowed
                          </span>
                        )}
                        {s.lastSeenAt ? `last seen ${new Date(s.lastSeenAt).toLocaleString()}` : null}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-1.5 text-xs text-gray-400">
                Detected from the embedding page, and sampled — treat it as a guide, not an audit. Sites
                that send no referrer won’t show up.
              </p>
            </div>
          </div>
        )}
      </>
    );
  };

  return (
    <>
      <Modal
        isOpen={open}
        onClose={onClose}
        ariaLabel="Embed this form"
        // Rectangular with rounded corners, and a fixed height so switching tabs doesn't resize the
        // dialog under the pointer. The column lives on the CHILD wrapper — see Modal's contentClassName.
        className="mx-4 h-[min(88vh,40rem)] w-full max-w-[760px] overflow-hidden"
        contentClassName="flex h-full flex-col"
      >
        <div className="shrink-0 border-b border-gray-100 px-6 pb-4 pt-6 dark:border-gray-800">
          <h2 className="pr-8 text-lg font-semibold text-gray-800 dark:text-white/90">Embed this form</h2>
          <p className="mt-0.5 text-sm text-gray-400">
            Put this form on any website. Submissions create a response and start a process.
          </p>
        </div>

        {!needsHandling && embedToken ? (
          <div
            role="tablist"
            aria-label="Embed sections"
            className="flex shrink-0 gap-1 overflow-x-auto border-b border-gray-100 px-4 dark:border-gray-800"
          >
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`embed-tab-${id}`}
                aria-selected={tab === id}
                aria-controls={`embed-panel-${id}`}
                onClick={() => setTab(id)}
                className={`-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition ${ICON_LABEL_NUDGE} ${
                  tab === id
                    ? "border-brand-500 text-brand-600 dark:text-brand-400"
                    : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                }`}
              >
                <Icon className="size-4" />
                {label}
              </button>
            ))}
          </div>
        ) : null}

        {/* min-h-0 is what lets this flex child actually scroll — without it a flex item refuses to
            shrink below its content and the panel grows the dialog instead. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6">
          <div className="py-5">{body()}</div>
        </div>

        {/* Save belongs to the Websites tab only — the other two persist on the spot. */}
        {tab === "websites" && !needsHandling && embedToken ? (
          <div className="flex shrink-0 items-center justify-end gap-3 border-t border-gray-100 px-6 py-4 dark:border-gray-800">
            {!sitesValid ? (
              <span className="mr-auto text-xs text-error-500">Fix the highlighted website before saving.</span>
            ) : sitesSaved ? (
              <span className="mr-auto text-xs text-success-600 dark:text-success-400">Saved ✓</span>
            ) : null}
            <Button size="sm" onClick={saveSites} disabled={savingSites || !sitesValid}>
              {savingSites ? "Saving…" : "Save websites"}
            </Button>
          </div>
        ) : null}
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
