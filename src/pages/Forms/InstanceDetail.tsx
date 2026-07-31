import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Eye, GitBranch, Workflow } from "lucide-react";
import Button from "../../components/ui/button/Button";
import { Modal } from "../../components/ui/modal";
import FormRenderer from "../../components/formBuilder/LukeFormRenderer";
import TracePanel, { pidOf } from "./TracePanel";
import { listVersions, type FormArtifact } from "../../lib/formsApi";
import { getInstance, STATE_LABEL, type FormInstance, type InstanceState } from "../../lib/formInstancesApi";

/** How a submission reached us, in words rather than the stored enum. Mirrors SubmissionSource
 *  (core-engine) and the wording printed on the submission PDF, so the two agree. */
const VIA_LABEL: Record<string, string> = {
  EMBED: "Embedded form on a website",
  RESPOND: "Emailed link, verified by one-time code",
  APP: "Completed in Lukeflow by a signed-in user",
};

export const STATE_BADGE: Record<InstanceState, string> = {
  CREATED: "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400",
  SENT: "bg-blue-50 text-blue-600 dark:bg-blue-500/15",
  OPENED: "bg-blue-50 text-blue-600 dark:bg-blue-500/15",
  IN_PROGRESS: "bg-amber-50 text-amber-600 dark:bg-amber-500/15",
  SUBMITTED: "bg-success-50 text-success-600 dark:bg-success-500/15",
  PROCESSED: "bg-success-50 text-success-600 dark:bg-success-500/15",
  EXPIRED: "bg-gray-100 text-gray-400 dark:bg-white/10",
  CANCELLED: "bg-error-50 text-error-500 dark:bg-error-500/15",
};

const fmt = (ms?: number) => (ms ? new Date(ms).toLocaleString() : "—");

type FieldMeta = { label: string; type: string };
function schemaFields(schemaStr: string): Record<string, FieldMeta> {
  try {
    const s = JSON.parse(schemaStr) as { entities?: Record<string, { type: string; attributes?: { key?: string; label?: string } }> };
    const out: Record<string, FieldMeta> = {};
    for (const [id, e] of Object.entries(s.entities ?? {})) {
      const a = e.attributes ?? {};
      out[a.key || id] = { label: a.label || a.key || id, type: e.type };
    }
    return out;
  } catch {
    return {};
  }
}

function fmtValue(v: unknown): string {
  if (v == null || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) return v.length ? v.map((x) => (x && typeof x === "object" ? JSON.stringify(x) : String(x))).join(", ") : "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="shrink-0 text-xs uppercase tracking-wide text-gray-400">{label}</span>
      <span className="text-right text-sm text-gray-700 dark:text-gray-200">{children}</span>
    </div>
  );
}

/**
 * One form instance, in full: metadata, a version toggle that re-renders the
 * submitted data under any of the form's versions, the data as a presentable
 * label→value list, and the actual submission rendered (read-only) in a modal.
 */
export default function InstanceDetail({
  tenant,
  instance,
  formName,
  formId,
  onBack,
}: {
  tenant: string;
  instance: FormInstance;
  formName?: string;
  /** The form definition's internal id (for loading its versions). */
  formId?: string;
  onBack?: () => void;
}) {
  const [versions, setVersions] = useState<FormArtifact[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<number>(instance.version);
  const [showForm, setShowForm] = useState(false);
  const [showTrace, setShowTrace] = useState(false);

  // Load every checked-in version's schema so the data can be re-rendered under
  // any of them (default = the version it was submitted on). Falls back to the
  // instance's pinned schema if the form id / versions can't be resolved.
  useEffect(() => {
    let active = true;
    (async () => {
      const vs = formId ? await listVersions(tenant, formId).catch(() => []) : [];
      if (active && vs.length) { setVersions(vs.sort((a, b) => b.version - a.version)); return; }
      // Fallback: just the pinned version's schema for this instance.
      const v = await getInstance(tenant, instance.id).catch(() => null);
      if (active && v) setVersions([{ version: instance.version, schema: v.schema, checkedInAt: 0 }]);
    })();
    return () => { active = false; };
  }, [tenant, formId, instance.id, instance.version]);

  const schema = useMemo(
    () => versions.find((v) => v.version === selectedVersion)?.schema ?? versions[0]?.schema ?? "",
    [versions, selectedVersion],
  );
  const fields = useMemo(() => schemaFields(schema), [schema]);
  const data = instance.data ?? {};
  const entries = Object.entries(data);
  const pid = pidOf(instance);
  const processLabel = pid ? "started" : instance.context?.processStartStatus === "FAILED" ? "failed" : "—";

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          {onBack && (
            <button type="button" onClick={onBack} className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-gray-500 transition hover:text-gray-800 dark:hover:text-gray-200">
              <ChevronLeft className="size-4" /> Back
            </button>
          )}
          <h2 className="truncate text-lg font-semibold text-gray-800 dark:text-white/90">{formName ?? instance.definitionCode}</h2>
          <p className="mt-0.5 font-mono text-xs text-gray-400">{instance.id}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${STATE_BADGE[instance.state]}`}>{STATE_LABEL[instance.state]}</span>
      </div>

      {/* Metadata */}
      <div className="mb-5 divide-y divide-gray-100 rounded-xl border border-gray-100 px-4 dark:divide-gray-800 dark:border-gray-800">
        <MetaRow label="Form"><span className="font-mono text-xs">{instance.definitionCode}</span> · v{instance.version}</MetaRow>
        <MetaRow label="Submitted">{fmt(instance.submittedAt ?? undefined) }</MetaRow>
        <MetaRow label="Created">{fmt(instance.createdAt)}{instance.createdBy ? ` · ${instance.createdBy.replace(/^workos:/, "")}` : ""}</MetaRow>
        <MetaRow label="Process">
          <span className={processLabel === "started" ? "text-success-600" : processLabel === "failed" ? "text-error-500" : "text-gray-400"}>{processLabel}</span>
        </MetaRow>
        <MetaRow label="Token"><span className="font-mono text-xs">{instance.token}</span></MetaRow>
      </div>

      {/* Submission record — the provenance captured at submit. Only rendered once there is something
          to show, so instances submitted before this was recorded don't display empty rows. */}
      {(instance.submittedIp || instance.submittedVia || instance.submittedUserAgent || instance.consentText) && (
        <div className="mb-5 rounded-xl border border-gray-100 px-4 dark:border-gray-800">
          <p className="border-b border-gray-100 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:border-gray-800">
            Submission record
          </p>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {instance.submittedIp && (
              <MetaRow label="IP address"><span className="font-mono text-xs">{instance.submittedIp}</span></MetaRow>
            )}
            {instance.submittedVia && <MetaRow label="Submitted via">{VIA_LABEL[instance.submittedVia] ?? instance.submittedVia}</MetaRow>}
            {instance.submittedUserAgent && (
              <MetaRow label="Device">
                <span className="break-all text-xs text-gray-500 dark:text-gray-400">{instance.submittedUserAgent}</span>
              </MetaRow>
            )}
          </div>
          {/* The agreement, quoted verbatim and given its own block rather than a table row — this is the
              part that shows what the person actually committed to, so it must be readable as prose and
              obviously unedited. Only the exact stored statement is rendered, never the form's current
              wording, so re-wording a live form can't retroactively change an old record. */}
          {instance.consentText && (
            <div className="border-t border-gray-100 py-3 dark:border-gray-800">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Agreed to{instance.consentAgreedAt ? ` · ${fmt(instance.consentAgreedAt)}` : ""}
              </p>
              <blockquote className="mt-1.5 border-s-2 border-brand-300 ps-3 text-sm italic leading-relaxed text-gray-700 dark:border-brand-500/50 dark:text-gray-200">
                “{instance.consentText}”
              </blockquote>
            </div>
          )}
          <p className="pb-3 pt-2 text-[11px] text-gray-400">
            Captured automatically at submission. The IP address is the address observed at that moment
            {instance.consentText ? "; the statement above is the exact wording the form presented" : ""}.
          </p>
        </div>
      )}

      {/* Submitted data + version toggle */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Submitted data</h3>
        {versions.length > 1 && (
          <label className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <GitBranch className="size-3.5" /> Render under
            <select
              value={selectedVersion}
              onChange={(e) => setSelectedVersion(Number(e.target.value))}
              className="h-8 rounded-lg border border-gray-300 bg-transparent px-2 text-xs text-gray-700 dark:border-gray-700 dark:text-gray-300"
            >
              {versions.map((v) => (
                <option key={v.version} value={v.version}>v{v.version}{v.version === instance.version ? " (submitted)" : ""}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-200 py-6 text-center text-sm text-gray-400 dark:border-gray-700">No data captured.</p>
      ) : (
        <dl className="divide-y divide-gray-100 rounded-xl border border-gray-100 dark:divide-gray-800 dark:border-gray-800">
          {entries.map(([key, value]) => {
            const meta = fields[key];
            return (
              <div key={key} className="grid grid-cols-3 gap-3 px-4 py-2.5">
                <dt className="col-span-1 min-w-0">
                  <span className="block truncate text-sm font-medium text-gray-700 dark:text-gray-300">{meta?.label ?? key}</span>
                  <span className="block truncate font-mono text-[11px] text-gray-400">{key}{!meta ? " · not in this version" : ""}</span>
                </dt>
                <dd className="col-span-2 break-words text-sm text-gray-800 dark:text-gray-200">{fmtValue(value)}</dd>
              </div>
            );
          })}
        </dl>
      )}

      {/* Actions */}
      <div className="mt-5 flex flex-wrap gap-2 border-t border-gray-100 pt-4 dark:border-gray-800">
        <Button size="sm" onClick={() => setShowForm(true)} disabled={!schema} startIcon={<Eye className="size-4" />}>View submission</Button>
        <Button size="sm" variant="outline" onClick={() => setShowTrace(true)} startIcon={<Workflow className="size-4" />}>Process trace</Button>
      </div>

      {/* The actual submission, rendered read-only under the selected version. */}
      <Modal isOpen={showForm} onClose={() => setShowForm(false)} className="mx-4 flex max-h-[90vh] w-full max-w-[640px] flex-col overflow-hidden"
      contentClassName="min-h-0 flex-1 overflow-y-auto">
        <div className="p-6 sm:p-8">
          <h2 className="mb-1 text-lg font-semibold text-gray-800 dark:text-white/90">{formName ?? instance.definitionCode}</h2>
          <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">Submission rendered with v{selectedVersion}{selectedVersion !== instance.version ? ` (submitted on v${instance.version})` : ""}.</p>
          {schema ? <FormRenderer schema={schema} initialValues={data} readOnly /> : <p className="text-sm text-gray-400">Schema unavailable.</p>}
        </div>
      </Modal>

      <Modal isOpen={showTrace} onClose={() => setShowTrace(false)} className="mx-4 flex max-h-[85vh] w-full max-w-[560px] flex-col overflow-hidden"
      contentClassName="min-h-0 flex-1 overflow-y-auto">
        {showTrace ? <TracePanel tenant={tenant} instance={instance} formName={formName} /> : null}
      </Modal>
    </div>
  );
}
