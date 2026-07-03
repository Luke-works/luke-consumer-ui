import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useMutationLock } from "../../hooks/useMutationLock";
import { guardedLeave } from "../../lib/leaveGuard";
import PageMeta from "../../components/common/PageMeta";
import Button from "../../components/ui/button/Button";
import Tooltip from "../../components/ui/tooltip/Tooltip";
import { Modal } from "../../components/ui/modal";
import Label from "../../components/form/Label";
import Input from "../../components/form/input/InputField";
import { useAuth } from "../../context/AuthContext";
import { canWrite, EMAIL } from "../../lib/capabilities";
import { ChevronLeftIcon, CheckLineIcon, PaperPlaneIcon, PencilIcon } from "../../icons";
import { FlaskConical, BadgeCheck } from "lucide-react";
// Lazy-load the react-email renderer (~510 KB gz) so it's not in this route's initial
// chunk — it loads when the preview mounts, and the compiler loads on check-in.
const EmailRenderer = lazy(() => import("../../components/emailBuilder/EmailRenderer"));
import EmailAiAssistPanel from "./EmailAiAssistPanel";
import {
  checkIn,
  getAudit,
  getTemplate,
  latestVersion,
  publishVersion,
  saveDraft,
  sendTest,
  updateMeta,
  type AuditEvent,
  type StoredTemplate,
  type TemplateStatus,
} from "../../lib/emailTemplatesApi";
import { generateTestData } from "../../lib/emailAgentApi";
import {
  emptyEmailDoc,
  extractVariables,
  parseEmailDoc,
  validateEmailDoc,
  type EmailDoc,
  type Problem,
} from "../../lib/emailDoc";

const STATUS_BADGE: Record<TemplateStatus, string> = {
  draft: "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400",
  published: "bg-success-50 text-success-600 dark:bg-success-500/15",
  retired: "bg-amber-50 text-amber-600 dark:bg-amber-500/15",
};

function Builder({ tenant, templateId, template }: {
  tenant: string;
  templateId: string;
  template: StoredTemplate;
}) {
  const navigate = useNavigate();
  const { session } = useAuth();
  // read → view-only (no edits persisted, write actions hidden). read-write → full.
  const canEdit = canWrite(session, EMAIL);

  // The live EmailDoc (the authoring source) + the inline-editable name/subject.
  const [doc, setDoc] = useState<EmailDoc>(() => parseEmailDoc(template.doc) ?? emptyEmailDoc());
  const [name, setName] = useState(template.name);
  const [subject, setSubject] = useState(template.subject || doc.subject || "");
  const [status, setStatus] = useState<TemplateStatus>(template.status);
  const [version, setVersion] = useState(() => latestVersion(template));
  const [publishedVersion, setPublishedVersion] = useState(template.publishedVersion);

  const [saved, setSaved] = useState(true);
  const [saveError, setSaveError] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [problemsOpen, setProblemsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [formDesc, setFormDesc] = useState(template.description ?? "");

  // Send-test modal state.
  const [testOpen, setTestOpen] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testModel, setTestModel] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [testSent, setTestSent] = useState(false);

  const saveTimer = useRef<number | null>(null);
  const unsavedRef = useRef(false);
  // Keep the autosave closure reading the latest name/subject/doc.
  const docRef = useRef(doc);
  const subjectRef = useRef(subject);
  useEffect(() => { docRef.current = doc; }, [doc]);
  useEffect(() => { subjectRef.current = subject; }, [subject]);

  const { locked: mutating, runExclusive } = useMutationLock();

  // Live problem report. `blocking` gates check-in / publish (mirror Problems panel).
  const problems = useMemo<Problem[]>(() => validateEmailDoc({ ...doc, subject }), [doc, subject]);
  const blocking = useMemo(() => problems.filter((p) => p.severity === "error"), [problems]);
  const warnCount = problems.filter((p) => p.severity === "warning").length;
  const variables = useMemo(() => extractVariables({ ...doc, subject }), [doc, subject]);

  // Load the activity feed when the settings modal opens.
  useEffect(() => {
    if (!settingsOpen) return;
    let active = true;
    getAudit(tenant, templateId)
      .then((a) => active && setAuditEvents(a))
      .catch(() => active && setAuditEvents([]));
    return () => { active = false; };
  }, [settingsOpen, tenant, templateId]);

  // Persist the working draft (doc JSON + subject), surfacing failures.
  const persistDraft = async (): Promise<boolean> => {
    try {
      await saveDraft(tenant, templateId, JSON.stringify({ ...docRef.current, subject: subjectRef.current }), subjectRef.current);
      unsavedRef.current = false;
      setSaved(true);
      setSaveError(false);
      return true;
    } catch {
      setSaved(false);
      setSaveError(true);
      return false;
    }
  };

  // Mark dirty and (debounced) autosave — the single 600ms autosave path shared
  // by inline subject edits and AI-applied docs.
  const scheduleSave = () => {
    if (!canEdit) return;
    setSaved(false);
    setSaveError(false);
    setDirty(true);
    unsavedRef.current = true;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => { void persistDraft(); }, 600);
  };

  const onSubjectChange = (v: string) => {
    setSubject(v);
    subjectRef.current = v;
    setDoc((d) => ({ ...d, subject: v }));
    scheduleSave();
  };

  // Apply an AI-produced doc: the panel already saved the draft, so just swap it
  // into local state and re-render the preview. No refetch, no loading.
  const applyAiDoc = (next: EmailDoc) => {
    setDoc(next);
    setSubject(next.subject);
    subjectRef.current = next.subject;
    docRef.current = next;
    setDirty(true);
    setSaved(true);
    setSaveError(false);
  };

  // Flush a pending autosave on unmount (route change), so the last edits aren't lost.
  useEffect(() => () => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    if (canEdit && unsavedRef.current) {
      unsavedRef.current = false;
      saveDraft(tenant, templateId, JSON.stringify({ ...docRef.current, subject: subjectRef.current }), subjectRef.current).catch((e) => {
        console.error("Autosave on unmount failed; unsaved edits may be lost", e);
      });
    }
  }, [tenant, templateId, canEdit]);

  // Warn before a full page unload (tab close / refresh) with unsaved edits.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (unsavedRef.current) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const flushSave = async (): Promise<boolean> => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    return persistDraft();
  };

  // Leaving the builder during the autosave window must not drop edits: flush
  // first (awaited, error-handled) and only navigate if it succeeds.
  const leaveBuilder = async (to: string) => {
    const safe = await guardedLeave(canEdit && unsavedRef.current, flushSave);
    if (safe) navigate(to);
  };

  // Check-in: compile html/text in the browser, store the version (doc+subject),
  // and publish to Postmark. First check-in auto-publishes. Gated on zero errors.
  const handleCheckIn = () => runExclusive(async () => {
    if (blocking.length) { setProblemsOpen(true); return; } // never check in a broken email
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    try {
      await persistDraft();
      const current = { ...docRef.current, subject: subjectRef.current };
      const { compileEmail } = await import("../../components/emailBuilder/EmailRenderer");
      const { html, text } = await compileEmail(current);
      const ver = await checkIn(tenant, templateId, {
        doc: JSON.stringify(current),
        subject: current.subject,
        html,
        text,
        publish: true,
      });
      if (!ver) { setSaveError(true); return; }
      setVersion(ver.version);
      setPublishedVersion(ver.version);
      setStatus("published");
      setSaved(true);
      setDirty(false);
      setSaveError(false);
    } catch (e) {
      console.error("Check-in failed", e);
      setSaveError(true);
    }
  });

  const handlePublish = () => runExclusive(async () => {
    if (blocking.length) { setProblemsOpen(true); return; }
    try {
      await publishVersion(tenant, templateId, version);
      setPublishedVersion(version);
      setStatus("published");
      setSaveError(false);
    } catch (e) {
      console.error("Publish failed", e);
      setSaveError(true);
    }
  });

  const saveSettings = async () => {
    const next = name.trim() || template.name;
    setName(next);
    await updateMeta(tenant, templateId, { name: next, description: formDesc });
    setSettingsOpen(false);
  };

  // Open the send-test modal and pre-fill plausible variable values via the agent.
  const openTest = async () => {
    setTestOpen(true);
    setTestError(null);
    setTestSent(false);
    // Seed empty values for every variable so the form renders even if AI fails.
    setTestModel((prev) => {
      const seeded: Record<string, string> = {};
      for (const v of variables) seeded[v] = prev[v] ?? "";
      return seeded;
    });
    if (variables.length === 0) return;
    setGenerating(true);
    try {
      const { samples } = await generateTestData({ ...docRef.current, subject: subjectRef.current }, 1, session?.tenant ?? undefined);
      const values = samples[0]?.values ?? {};
      setTestModel((prev) => {
        const next = { ...prev };
        for (const v of variables) {
          const val = values[v];
          if (val != null && (!next[v] || next[v] === "")) next[v] = String(val);
        }
        return next;
      });
    } catch (e) {
      setTestError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  const sendTestEmail = async () => {
    if (!testTo.trim()) return;
    setSending(true);
    setTestError(null);
    setTestSent(false);
    try {
      await sendTest(tenant, templateId, { to: testTo.trim(), model: testModel });
      setTestSent(true);
    } catch (e) {
      setTestError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const eq = "min-w-[128px]"; // uniform width for toolbar action buttons

  return (
    <>
      <PageMeta title={`${template.name} | Lukeflow`} description="Design your email template in Lukeflow." />

      {/* Toolbar */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Tooltip content="Back to template list">
          <button type="button" onClick={() => void leaveBuilder("/email-templates")} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/5">
            <ChevronLeftIcon className="size-5" />Templates
          </button>
        </Tooltip>
        <div className="h-6 w-px bg-gray-200 dark:bg-gray-700" />
        <div className="min-w-0">
          <button type="button" onClick={() => setSettingsOpen(true)} className="group flex max-w-full items-center gap-1.5 text-base font-semibold text-gray-800 dark:text-white/90">
            <span className="truncate">{name}</span>
            <PencilIcon className="size-3.5 shrink-0 text-gray-300 transition group-hover:text-gray-500" />
          </button>
          <p className="flex items-center gap-1.5 text-[11px] leading-tight text-gray-400">
            <span className="font-mono">{template.code}</span>
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase ${STATUS_BADGE[status]}`}>{status}</span>
            <span>{publishedVersion ? `v${publishedVersion} live` : version ? `v${version} checked in` : "never checked in"}</span>
            {dirty && (<><span className="size-1 rounded-full bg-amber-400" /><span className="text-amber-500">unchecked-in changes</span></>)}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {!canEdit ? (
            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:bg-white/10 dark:text-gray-400">View only</span>
          ) : (
            <>
              <span className={`mr-1 hidden text-xs sm:inline ${saveError ? "text-error-500" : "text-gray-400"}`}>{saveError ? "Save failed — retry" : saved ? "Draft saved" : "Saving…"}</span>
              {problems.length > 0 && (
                <Tooltip content={blocking.length ? `${blocking.length} problem(s) block check-in & publish` : `${warnCount} warning(s)`}>
                  <button
                    type="button"
                    onClick={() => setProblemsOpen(true)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                      blocking.length
                        ? "bg-error-50 text-error-600 hover:bg-error-100 dark:bg-error-500/10 dark:text-error-400"
                        : "bg-amber-50 text-amber-600 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-400"
                    }`}
                  >
                    <span aria-hidden>{blocking.length ? "⊘" : "⚠"}</span>
                    {blocking.length ? `${blocking.length} error${blocking.length > 1 ? "s" : ""}` : `${warnCount} warning${warnCount > 1 ? "s" : ""}`}
                  </button>
                </Tooltip>
              )}
              <Tooltip content="Send yourself a test email with sample values for each variable."><Button size="sm" variant="outline" className={eq} onClick={openTest} disabled={!publishedVersion} startIcon={<FlaskConical className="size-4" />}>Send test</Button></Tooltip>
              <Tooltip content="Save your progress as a draft."><Button size="sm" variant="outline" className={eq} onClick={flushSave} startIcon={<CheckLineIcon className="size-4" />}>Save</Button></Tooltip>
              <Tooltip content={blocking.length ? "Fix the blocking problems before checking in." : "Compile the email and publish it to Postmark as a new version."}><Button size="sm" variant="outline" className={eq} onClick={handleCheckIn} disabled={blocking.length > 0 || mutating} startIcon={<PaperPlaneIcon className="size-4" />}>Check in</Button></Tooltip>
              {version > 0 && (
                <Tooltip content={blocking.length ? "Fix the blocking problems before publishing." : "Re-publish the latest checked-in version to Postmark."}><Button size="sm" className={eq} onClick={handlePublish} disabled={publishedVersion === version || blocking.length > 0 || mutating}>{publishedVersion === version ? "Published" : `Publish v${version}`}</Button></Tooltip>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1 space-y-4">
          {/* Subject line — the only inline field (everything else via AI chat). */}
          <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
            <Label>Subject line</Label>
            <Input
              value={subject}
              onChange={(e) => onSubjectChange(e.target.value)}
              placeholder="Welcome, {{firstName}}!"
              disabled={!canEdit}
            />
            {variables.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] uppercase tracking-wide text-gray-400">Variables</span>
                {variables.map((v) => (
                  <span key={v} className="rounded-full bg-brand-50 px-2 py-0.5 font-mono text-[11px] text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">{`{{${v}}}`}</span>
                ))}
              </div>
            )}
          </div>

          {/* Center: live preview. */}
          <div className="rounded-2xl border border-gray-200 bg-white p-2 dark:border-gray-800 dark:bg-white/[0.03]">
            <Suspense fallback={<div className="flex h-[680px] items-center justify-center text-sm text-gray-400">Loading preview…</div>}>
              <EmailRenderer doc={doc} height={680} />
            </Suspense>
          </div>
        </div>

        {/* Permanent LukeBuilds rail — sticky and viewport-tall. */}
        {canEdit && (
          <aside className="sticky top-24 hidden h-[calc(100vh-9rem)] w-[360px] shrink-0 lg:block">
            <EmailAiAssistPanel
              tenant={tenant}
              templateId={templateId}
              templateName={name}
              doc={doc}
              subject={subject}
              onApplied={applyAiDoc}
            />
          </aside>
        )}
      </div>

      {/* Problems */}
      <Modal isOpen={problemsOpen} onClose={() => setProblemsOpen(false)} className="mx-4 max-h-[80vh] w-full max-w-[520px] overflow-y-auto">
        <div className="p-6">
          <h2 className="mb-1 text-lg font-semibold text-gray-800 dark:text-white/90">Problems</h2>
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            {blocking.length
              ? `${blocking.length} blocking issue${blocking.length > 1 ? "s" : ""} must be fixed before you can check in or publish.`
              : "No blocking issues. The items below are advisory."}
          </p>
          {problems.length === 0 ? (
            <p className="rounded-lg bg-success-50 px-4 py-3 text-sm text-success-600 dark:bg-success-500/10">Everything looks good — no problems found.</p>
          ) : (
            <ul className="space-y-2">
              {problems.map((p, i) => (
                <li key={i}>
                  <div className={`flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm ${p.severity === "error" ? "border-error-200 dark:border-error-500/30" : "border-amber-200 dark:border-amber-500/30"}`}>
                    <span aria-hidden className={p.severity === "error" ? "text-error-500" : "text-amber-500"}>{p.severity === "error" ? "⊘" : "⚠"}</span>
                    <span className="min-w-0">
                      <span className="font-medium text-gray-800 dark:text-gray-200">{p.blockIndex != null ? `Block ${p.blockIndex + 1}` : "Email"}</span>
                      <span className="block text-gray-500 dark:text-gray-400">{p.message}</span>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>

      {/* Template settings */}
      <Modal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} className="mx-4 w-full max-w-[480px]">
        <div className="p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">Template settings</h2>
          <div className="mb-4 rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/5">
            <span className="text-xs text-gray-400">Template ID</span>
            <p className="font-mono text-sm font-medium text-gray-700 dark:text-gray-200">{template.code}</p>
          </div>
          <div className="mb-4">
            <Label>Template name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} />
          </div>
          <div className="mb-6">
            <Label>Description</Label>
            <Input value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="Optional" disabled={!canEdit} />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>{canEdit ? "Cancel" : "Close"}</Button>
            {canEdit && <Button onClick={saveSettings} disabled={!name.trim()}>Save</Button>}
          </div>

          {auditEvents.length > 0 && (
            <div className="mt-6 border-t border-gray-100 pt-4 dark:border-gray-800">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Activity</p>
              <ul className="max-h-40 space-y-1 overflow-y-auto">
                {auditEvents.map((ev, i) => (
                  <li key={i} className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                    <span><span className="font-medium text-gray-700 dark:text-gray-300">{ev.action.replace(/_/g, " ")}</span>{ev.detail ? ` ${ev.detail}` : ""}{ev.actorName ? ` · ${ev.actorName}` : ""}</span>
                    <span className="text-gray-400">{new Date(ev.at).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Modal>

      {/* Send test */}
      <Modal isOpen={testOpen} onClose={() => setTestOpen(false)} className="mx-4 max-h-[90vh] w-full max-w-[520px] overflow-y-auto">
        <div className="p-6 sm:p-8">
          <h2 className="mb-1 text-lg font-semibold text-gray-800 dark:text-white/90">Send a test — {template.name}</h2>
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            Sends through the published Postmark template. Fill in sample values for each variable, or let the assistant suggest them.
          </p>

          <div className="mb-4">
            <Label>Send to <span className="text-error-500">*</span></Label>
            <Input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com" />
          </div>

          {variables.length > 0 && (
            <div className="mb-4 space-y-2">
              <div className="flex items-center justify-between">
                <Label>Variable values</Label>
                <button type="button" onClick={() => void openTest()} disabled={generating} className="inline-flex items-center gap-1 text-xs font-medium text-brand-500 hover:text-brand-600 disabled:opacity-50">
                  <BadgeCheck className="size-3.5" />{generating ? "Suggesting…" : "Suggest values"}
                </button>
              </div>
              {variables.map((v) => (
                <div key={v} className="flex items-center gap-2">
                  <span className="w-1/3 shrink-0 truncate font-mono text-xs text-gray-500 dark:text-gray-400">{`{{${v}}}`}</span>
                  <Input value={testModel[v] ?? ""} onChange={(e) => setTestModel((m) => ({ ...m, [v]: e.target.value }))} placeholder={`value for ${v}`} />
                </div>
              ))}
            </div>
          )}

          {testError && <p className="mb-3 rounded-lg bg-error-50 px-3 py-2 text-xs text-error-600 dark:bg-error-500/10">{testError}</p>}
          {testSent && <p className="mb-3 rounded-lg bg-success-50 px-3 py-2 text-xs text-success-600 dark:bg-success-500/10">Test email sent to {testTo}.</p>}

          <div className="flex justify-end gap-3 border-t border-gray-100 pt-4 dark:border-gray-800">
            <Button variant="outline" onClick={() => setTestOpen(false)}>Close</Button>
            <Button onClick={sendTestEmail} disabled={!testTo.trim() || sending} startIcon={<PaperPlaneIcon className="size-4" />}>
              {sending ? "Sending…" : "Send test"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export default function EmailTemplateBuilderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { session, refreshSession } = useAuth();
  const tenant = session?.tenant ?? null;
  const [template, setTemplate] = useState<StoredTemplate | null>(null);
  const [loading, setLoading] = useState(true);

  // Re-read the session on entry so the editor reflects the caller's current EMAIL access.
  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    if (!tenant || !id) return;
    let active = true;
    setLoading(true);
    getTemplate(tenant, id)
      .then((t) => { if (active) { setTemplate(t); setLoading(false); } })
      .catch(() => { if (active) { setLoading(false); navigate("/email-templates", { replace: true }); } });
    return () => { active = false; };
  }, [tenant, id, navigate]);

  if (loading) {
    return <div className="flex h-[60vh] items-center justify-center text-sm text-gray-400">Loading template…</div>;
  }
  if (!tenant || !id || !template) return null;

  return (
    <div>
      <Builder
        key={template.id}
        tenant={tenant}
        templateId={id}
        template={template}
      />
    </div>
  );
}
