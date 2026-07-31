/**
 * FormRolesPanel — decide who fills each field of an OUTBOUND form.
 *
 * An outbound form is completed by two people, and until this panel existed there was no way to
 * say which. The role map, the API and the recipient-side enforcement were all built; the only
 * way a field could become preparer-owned was for the AI assistant to mark it `disabled`, which
 * a human could neither see nor change. This is the missing half.
 *
 * Roles are keyed by FIELD KEY and stored on the definition, so changing them takes effect for
 * the next send without cutting a new form version. Fields already sent keep whatever the map
 * said when their instance was created, because the recipient surface reads the map at render.
 */
import { useEffect, useState } from "react";
import { Modal, MODAL_HEADER_SAFE } from "../../components/ui/modal";
import Button from "../../components/ui/button/Button";
import { setOutboundConfig, type StoredForm } from "../../lib/formsApi";
import { buildFormTemplate, type TemplateMetaColumn } from "@lukeflow/form-core";
import { Download } from "lucide-react";
import { ICON_LABEL_NUDGE } from "../../lib/iconAlign";
import { FIELD_ROLES, ROLE_LABEL, fieldsWithRoles, type FieldRole } from "../../lib/outboundRoles";

const ROLE_HINT: Record<FieldRole, string> = {
  RECIPIENT: "Only they can fill it. You won't be asked for it when sending.",
  PREPARER: "You fill it when sending. They see it but can't change it.",
  EITHER: "You can fill it when sending, and they can still correct it.",
};

export default function FormRolesPanel({
  open,
  onClose,
  tenant,
  form,
  schema,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  tenant: string;
  form: StoredForm;
  /** The working schema — the field list comes from here, not from the stored role map. */
  schema: string;
  onSaved: (roles: Record<string, FieldRole>) => void;
}) {
  const [roles, setRoles] = useState<Record<string, FieldRole>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seed from the effective roles, so a form that never had an explicit map opens showing what it
  // actually does today (derived from `disabled`) rather than a blank slate that would silently
  // reassign every field on save.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setSaving(false);
    const seeded: Record<string, FieldRole> = {};
    for (const f of fieldsWithRoles(schema, form.outboundRoles)) seeded[f.key] = f.role;
    setRoles(seeded);
  }, [open, schema, form.outboundRoles]);

  const fields = fieldsWithRoles(schema, roles);

  /**
   * Who the row is being sent to. Prepended to every generated template because a prefill row is
   * useless without a recipient — the form data alone says WHAT to send, never to whom.
   *
   * Email and phone form a "one of these" pair rather than each being required. Note the engine's
   * send endpoint currently requires an email and has no SMS delivery, so a phone-only row cannot
   * actually be sent yet; the column is here because the recipient record wants it, and the header
   * note is honest about which one does the work today.
   */
  const RECIPIENT_META: TemplateMetaColumn[] = [
    { key: "recipient.firstName", label: "First name", type: "string", required: false, example: "Ada" },
    { key: "recipient.lastName", label: "Last name", type: "string", required: false, example: "Lovelace" },
    { key: "recipient.email", label: "Email", type: "string", required: false, requiredGroup: "contact", example: "ada@example.com" },
    { key: "recipient.phone", label: "Phone", type: "string", required: false, requiredGroup: "contact", example: "+44 7700 900000" },
  ];

  /**
   * The template carries ONLY what the preparer supplies: the recipient, plus the fields they own.
   * A column for a field only the recipient can answer is noise at best, and at worst reads as an
   * instruction to answer on their behalf — which the engine would then strip anyway.
   */
  const preparerKeys = fields.filter((f) => f.role === "PREPARER" || f.role === "EITHER").map((f) => f.key);

  const generateTemplate = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(schema);
    } catch {
      setError("Couldn't read this form's schema to build a template.");
      return;
    }
    const template = buildFormTemplate(parsed as never, undefined, {
      includeKeys: preparerKeys,
      metaColumns: RECIPIENT_META,
    });
    const stem = (form.name || "form").trim().replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "form";
    // A second header row naming the "one of these" rule: there is no import to enforce it, so the
    // only place it can be stated is where the preparer is looking when they fill the sheet.
    const note = "# fill one of recipient.email or recipient.phone for every row\r\n";
    const blob = new Blob([template.csv + note], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${stem}-template.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await setOutboundConfig(tenant, form.id, roles);
      onSaved(roles);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={open} onClose={onClose} className="mx-4 flex max-h-[90vh] w-full max-w-[640px] flex-col overflow-hidden"
      contentClassName="min-h-0 flex-1 overflow-y-auto">
      <div className="p-6">
        <h2 className={`mb-1 text-lg font-semibold text-gray-800 dark:text-white/90 ${MODAL_HEADER_SAFE}`}>Who fills each field</h2>
        <p className={`mb-5 text-sm text-gray-500 dark:text-gray-400 ${MODAL_HEADER_SAFE}`}>
          This form is completed by two people. Choose which fields you answer before sending, and
          which you're asking the recipient for.
        </p>

        {error ? (
          <p className="mb-4 rounded-lg bg-error-50 px-4 py-2 text-sm text-error-500 dark:bg-error-500/10">{error}</p>
        ) : null}

        {fields.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">
            This form has no fields yet. Add some in the builder, then come back.
          </p>
        ) : (
          <div className="space-y-3">
            {fields.map((f) => (
              <div
                key={f.key}
                className="rounded-xl border border-gray-200 p-3 dark:border-gray-700"
              >
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium text-gray-800 dark:text-white/90">{f.label}</span>
                  <code className="text-xs text-gray-400">{f.key}</code>
                </div>
                <div
                  role="radiogroup"
                  aria-label={`Who fills ${f.label}`}
                  className="flex flex-wrap gap-2"
                >
                  {FIELD_ROLES.map((role) => {
                    const active = roles[f.key] === role;
                    return (
                      <button
                        key={role}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        title={ROLE_HINT[role]}
                        onClick={() => setRoles((r) => ({ ...r, [f.key]: role }))}
                        className={
                          "rounded-lg border px-3 py-1.5 text-xs font-medium transition " +
                          (active
                            ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400"
                            : "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5")
                        }
                      >
                        {ROLE_LABEL[role]}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs text-gray-400">{ROLE_HINT[roles[f.key] ?? "RECIPIENT"]}</p>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          {/* The template depends on these very decisions, so it belongs here rather than in a
              separate view the author would have to go and find. */}
          <button
            type="button"
            onClick={generateTemplate}
            disabled={preparerKeys.length === 0}
            title={
              preparerKeys.length === 0
                ? "Assign at least one field to yourself to generate a template."
                : "Download a spreadsheet: the recipient's details plus the fields you fill."
            }
            className={`me-auto inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5 ${ICON_LABEL_NUDGE}`}
          >
            <Download className="size-4" />Generate template
          </button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || fields.length === 0}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
