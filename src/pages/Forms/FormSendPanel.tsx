/**
 * FormSendPanel — send an OUTBOUND form to a recipient (Phase 3). The preparer supplies the
 * recipient's identity (firstName/lastName/email) and prefills the fields tagged PREPARER or
 * EITHER; on send the backend creates a prefilled instance and emails the recipient a /respond
 * link (they verify by email OTP, then fill the rest). Shows the resulting link + email status.
 */
import { useEffect, useState } from "react";
import { Modal } from "../../components/ui/modal";
import Button from "../../components/ui/button/Button";
import Label from "../../components/form/Label";
import Input from "../../components/form/input/InputField";
import { getFields, sendOutbound, type FieldContract, type OutboundSendResult } from "../../lib/formsApi";
import { roleOf, ROLE_LABEL, type FieldRole } from "../../lib/outboundRoles";

export default function FormSendPanel({
  open,
  onClose,
  tenant,
  formId,
  code,
  outboundRoles,
}: {
  open: boolean;
  onClose: () => void;
  tenant: string;
  formId: string;
  code: string;
  /** Per-field ownership for this form; absent entries fall back to the schema's `disabled`. */
  outboundRoles?: Record<string, FieldRole>;
}) {
  const [fields, setFields] = useState<FieldContract[] | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [prefill, setPrefill] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OutboundSendResult | null>(null);
  const [copied, setCopied] = useState<"link" | "portal" | null>(null);

  useEffect(() => {
    if (!open) return;
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
    setPrefill({});
    setResult(null);
    setError(null);
    setCopied(null);
    setFields(null);
    let active = true;
    getFields(tenant, code, "latest")
      .then((fs) => active && setFields(fs))
      .catch(() => active && setFields([]));
    return () => {
      active = false;
    };
  }, [open, tenant, code]);

  // What you can pre-answer: the fields you OWN (PREPARER) plus the ones you may seed and the
  // recipient may still correct (EITHER). Fields with no explicit role fall back to how preparer
  // fields were expressed before the role map existed — `disabled` in the schema — so forms
  // authored earlier keep working untouched.
  const preparerFields = (fields ?? []).filter(
    (f) => roleOf(f.key, { disabled: f.disabled }, outboundRoles) !== "RECIPIENT",
  );

  const send = async () => {
    if (!email.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const clean: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(prefill)) if (v !== "") clean[k] = v;
      const r = await sendOutbound(
        tenant,
        formId,
        { firstName, lastName, email: email.trim(), phone: phone.trim() || undefined },
        clean,
      );
      setResult(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const copy = async (which: "link" | "portal", text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
    } catch {
      /* ignore */
    }
  };

  return (
    <Modal isOpen={open} onClose={onClose} className="mx-4 max-h-[90vh] w-full max-w-[560px] overflow-y-auto">
      <div className="p-6">
        <h2 className="mb-1 text-lg font-semibold text-gray-800 dark:text-white/90">Send to a recipient</h2>
        <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">
          We'll create a prefilled copy and email the recipient a secure link. They verify by email before filling.
        </p>

        {result ? (
          <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
            <p className="text-sm font-medium text-success-600 dark:text-success-400">
              {result.emailStatus === "SENT" ? "Sent ✓ — the recipient has been emailed." : "Instance created."}
            </p>
            {result.emailStatus !== "SENT" ? (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                Email status: {result.emailStatus}. Share the link below manually if needed.
              </p>
            ) : null}
            <p className="mt-3 text-xs font-medium uppercase text-gray-400">Direct form link</p>
            <div className="mt-1 flex items-center gap-2">
              <code className="flex-1 truncate rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700 dark:border-gray-700 dark:bg-white/5 dark:text-gray-300">
                {result.link}
              </code>
              <Button size="sm" variant="outline" onClick={() => copy("link", result.link)}>
                {copied === "link" ? "Copied ✓" : "Copy"}
              </Button>
            </div>
            {result.portalLink ? (
              <>
                <p className="mt-3 text-xs font-medium uppercase text-gray-400">Recipient portal (all their forms)</p>
                <div className="mt-1 flex items-center gap-2">
                  <code className="flex-1 truncate rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700 dark:border-gray-700 dark:bg-white/5 dark:text-gray-300">
                    {result.portalLink}
                  </code>
                  <Button size="sm" variant="outline" onClick={() => copy("portal", result.portalLink)}>
                    {copied === "portal" ? "Copied ✓" : "Copy"}
                  </Button>
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  The recipient verifies their email once here and sees every form you've sent them.
                </p>
              </>
            ) : null}
            <div className="mt-5 flex justify-end">
              <Button variant="outline" onClick={onClose}>Done</Button>
            </div>
          </div>
        ) : (
          <>
            {error ? (
              <p className="mb-4 rounded-lg bg-error-50 px-4 py-2 text-sm text-error-500 dark:bg-error-500/10">{error}</p>
            ) : null}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label>First name</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jordan" />
              </div>
              <div>
                <Label>Last name</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Lee" />
              </div>
            </div>
            <div className="mt-3">
              <Label>Email <span className="text-error-500">*</span></Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jordan@acme.com" />
            </div>
            <div className="mt-3">
              <Label>Mobile <span className="text-gray-400">(optional)</span></Label>
              <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 123 4567" />
              <p className="mt-1 text-xs text-gray-400">For text-message (SMS) verification in the portal, once enabled.</p>
            </div>

            {preparerFields.length > 0 ? (
              <div className="mt-5">
                <p className="mb-2 text-xs font-medium uppercase text-gray-400">Prefill (you fill these)</p>
                <div className="space-y-3">
                  {preparerFields.map((f) => {
                    const role = roleOf(f.key, { disabled: f.disabled }, outboundRoles);
                    return (
                      <div key={f.key}>
                        <Label>
                          {f.label || f.key}
                          {/* EITHER looks identical here but behaves differently on the recipient's
                              side, so say which one it is rather than letting them find out. */}
                          <span className="ml-2 text-xs font-normal text-gray-400">{ROLE_LABEL[role]}</span>
                        </Label>
                        <Input
                          value={prefill[f.key] ?? ""}
                          onChange={(e) => setPrefill((p) => ({ ...p, [f.key]: e.target.value }))}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : fields === null ? (
              <p className="mt-4 text-sm text-gray-400">Loading fields…</p>
            ) : null}

            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={send} disabled={sending || !email.trim()}>
                {sending ? "Sending…" : "Send"}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
