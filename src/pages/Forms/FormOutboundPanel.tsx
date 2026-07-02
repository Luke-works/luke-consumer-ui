/**
 * FormOutboundPanel — setup for an OUTBOUND form (prefilled by a preparer, sent to a recipient).
 *
 * Outbound forms are never embedded. Instead the preparer supplies the recipient's identity
 * (firstName / lastName / email — always preparer-provided) and, for each form field, decides
 * who fills it: the PREPARER (prefills it), the RECIPIENT (fills it), or EITHER (shared). The
 * form's fields are shown as data points that map to the submission object we generate.
 *
 * Fields are enumerated from the form's latest checked-in version; if none exists yet, we prompt
 * the user to check one in. Roles persist via PUT /outbound-config.
 */
import { useEffect, useState } from "react";
import { Modal } from "../../components/ui/modal";
import Button from "../../components/ui/button/Button";
import { getFields, setOutboundConfig, type FieldContract, type FieldRole } from "../../lib/formsApi";

const ROLES: { value: FieldRole; label: string }[] = [
  { value: "PREPARER", label: "Preparer" },
  { value: "RECIPIENT", label: "Recipient" },
  { value: "EITHER", label: "Either" },
];

export default function FormOutboundPanel({
  open,
  onClose,
  tenant,
  formId,
  code,
  initialRoles,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  tenant: string;
  formId: string;
  code: string;
  initialRoles?: Record<string, FieldRole>;
  onSaved?: (roles: Record<string, FieldRole>) => void;
}) {
  const [fields, setFields] = useState<FieldContract[] | null>(null);
  const [roles, setRoles] = useState<Record<string, FieldRole>>({});
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFields(null);
    setLoadErr(null);
    setSaved(false);
    let active = true;
    getFields(tenant, code, "latest")
      .then((fs) => {
        if (!active) return;
        setFields(fs);
        // Seed roles from what's saved, defaulting anything new to RECIPIENT (they fill it).
        const seed: Record<string, FieldRole> = {};
        for (const f of fs) seed[f.key] = initialRoles?.[f.key] ?? "RECIPIENT";
        setRoles(seed);
      })
      .catch((e) => active && setLoadErr((e as { message?: string })?.message ?? "Couldn’t load the form’s fields."));
    return () => {
      active = false;
    };
  }, [open, tenant, code, initialRoles]);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setLoadErr(null);
    try {
      await setOutboundConfig(tenant, formId, roles);
      setSaved(true);
      onSaved?.(roles);
    } catch (e) {
      setLoadErr((e as { message?: string })?.message ?? "Couldn’t save the field roles.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={open} onClose={onClose} className="mx-4 max-h-[90vh] w-full max-w-[640px] overflow-y-auto">
      <div className="p-6">
        <h2 className="mb-1 text-lg font-semibold text-gray-800 dark:text-white/90">Outbound setup</h2>
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
          This form is prefilled and sent to a recipient — it isn’t embedded. Decide who fills each field.
        </p>

        {/* Recipient identity — always provided by the preparer when sending. */}
        <div className="mb-5 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-white/5">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">Recipient</h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            You’ll provide these when you send the form:
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {["First name", "Last name", "Email address"].map((m) => (
              <span key={m} className="rounded-full bg-white px-2.5 py-0.5 text-xs text-gray-600 ring-1 ring-gray-200 dark:bg-white/10 dark:text-gray-300 dark:ring-gray-700">
                {m}
              </span>
            ))}
          </div>
        </div>

        <h3 className="mb-2 text-sm font-semibold text-gray-800 dark:text-white/90">Field roles</h3>
        {loadErr ? (
          <p className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-500 dark:bg-error-500/10">{loadErr}</p>
        ) : fields === null ? (
          <p className="py-6 text-center text-sm text-gray-400">Loading fields…</p>
        ) : fields.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            No fields yet. Add fields and check in a version, then map their roles here.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-white/5 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Data point</th>
                  <th className="px-4 py-2.5 font-medium">Who fills it</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {fields.map((f) => (
                  <tr key={f.key}>
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-xs text-gray-700 dark:text-gray-200">{f.key}</span>
                      {f.required ? <span className="ml-1 text-error-500">*</span> : null}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                        {ROLES.map((r) => {
                          const active = (roles[f.key] ?? "RECIPIENT") === r.value;
                          return (
                            <button
                              type="button"
                              key={r.value}
                              onClick={() => setRoles((prev) => ({ ...prev, [f.key]: r.value }))}
                              className={`px-3 py-1 text-xs transition ${
                                active
                                  ? "bg-brand-500 text-white"
                                  : "bg-white text-gray-600 hover:bg-gray-50 dark:bg-transparent dark:text-gray-300 dark:hover:bg-white/5"
                              }`}
                            >
                              {r.label}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={save} disabled={saving || !fields || fields.length === 0}>
            {saving ? "Saving…" : saved ? "Saved ✓" : "Save roles"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
