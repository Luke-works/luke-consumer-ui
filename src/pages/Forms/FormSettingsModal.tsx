/**
 * FormSettingsModal — everything about a form that isn't a field, behind one gear icon.
 *
 * The builder's top bar had accumulated a name-with-a-pencil, a status badge, a version, a save
 * indicator and seven buttons; the settings themselves were a single 500px column you scrolled through
 * to find one checkbox. This splits them into tabs so each group is a short, complete page.
 *
 * <p><b>Two save models live here, deliberately visible in the UI.</b> Anything in the VERSIONED schema
 * (submission message, attachments, PDF, font, the consent statement) autosaves on change and re-gates
 * sign-off/publish — it is part of what gets published. Form METADATA (name, description, the Lukeflow
 * badge) is saved by the footer button and takes effect on the live form immediately. The footer says
 * which is which rather than pretending they are the same.
 *
 * Purely presentational: every value and handler is owned by {@link FormBuilderPage}, which holds the
 * lifecycle (dirty tracking, autosave debounce, the paid-plan gate on branding).
 */
import { useEffect, useState } from "react";
import { Modal } from "../../components/ui/modal";
import Label from "../../components/form/Label";
import Input from "../../components/form/input/InputField";
import Checkbox from "../../components/form/input/Checkbox";
import Button from "../../components/ui/button/Button";
import LukeflowBadge from "../../components/common/LukeflowBadge";
import FormConsentGate from "../../components/formBuilder/FormConsentGate";
import { FORM_FONTS, resolveFont } from "../../lib/formFonts";
import { CONSENT_DEFAULT_TEXT, CONSENT_MAX_LENGTH } from "../../lib/formSchema";
import type { AuditEvent, StoredForm } from "../../lib/formsApi";
import { ICON_LABEL_NUDGE } from "../../lib/iconAlign";
import { CircleCheckBig, Clock, Gavel, Info, Palette } from "lucide-react";
import FormActivityTimeline from "./FormActivityTimeline";

// Four of the five are circular, which reads far calmer than mixing diagonals (a paper plane and a
// gavel side by side looked busier, not evener). Every icon here has EXACTLY 20x20 of ink inside its 24-unit viewBox (measured, not eyeballed).
// Lucide glyphs vary from 14x14 to 20x20, and mixing them makes a uniform box + uniform gap still look
// ragged — the icons appear to be different sizes and to sit at different distances from their labels.
const TABS = [
  { id: "general", label: "General", icon: Info },
  { id: "submission", label: "Submission", icon: CircleCheckBig },
  { id: "legal", label: "Legal", icon: Gavel },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "activity", label: "Activity", icon: Clock },
] as const;

type TabId = (typeof TABS)[number]["id"];

const TEXTAREA =
  "w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/20 disabled:opacity-60 dark:border-gray-700 dark:text-white/90";

/** A settings row: control, then the one sentence explaining what it does to a live form. */
function Field({ children, hint }: { children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="mb-6">
      {children}
      {hint ? <p className="mt-1.5 text-xs leading-relaxed text-gray-400">{hint}</p> : null}
    </div>
  );
}

export default function FormSettingsModal({
  open,
  onClose,
  form,
  canEdit,
  checkedOut,
  editable,
  // General (metadata — saved by the footer button)
  formName,
  onFormName,
  formDesc,
  onFormDesc,
  // Submission (versioned schema — autosaves)
  submitMessage,
  onSubmitMessage,
  allowAttachments,
  onToggleAttachments,
  saveSubmissionPdf,
  onToggleSaveSubmissionPdf,
  // Legal (versioned schema — autosaves)
  consentEnabled,
  onToggleConsent,
  consentText,
  onConsentText,
  // Appearance
  font,
  onFontChange,
  showBranding,
  onShowBranding,
  // Activity
  auditEvents,
  // Footer
  settingsError,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  form: StoredForm;
  canEdit: boolean;
  checkedOut: boolean;
  editable: boolean;
  formName: string;
  onFormName: (v: string) => void;
  formDesc: string;
  onFormDesc: (v: string) => void;
  submitMessage: string;
  onSubmitMessage: (v: string) => void;
  allowAttachments: boolean;
  onToggleAttachments: (on: boolean) => void;
  saveSubmissionPdf: boolean;
  onToggleSaveSubmissionPdf: (on: boolean) => void;
  consentEnabled: boolean;
  onToggleConsent: (on: boolean) => void;
  consentText: string;
  onConsentText: (v: string) => void;
  font: string;
  onFontChange: (id: string) => void;
  showBranding: boolean;
  onShowBranding: (on: boolean) => void;
  auditEvents: AuditEvent[];
  settingsError: string | null;
  onSave: () => void;
}) {
  const [tab, setTab] = useState<TabId>("general");

  // Always reopen on General. Landing on whichever tab was last used means the first thing you see
  // depends on invisible history — worse than a predictable start, especially for a shared form.
  useEffect(() => {
    if (open) setTab("general");
  }, [open]);

  const chosen = resolveFont(font);
  // Blank wording is not a silent no-op: the server substitutes its standard statement, so say so and
  // show exactly what would be used. (Ticking the box seeds this field, so it only happens if cleared.)
  const consentBlank = consentEnabled && !consentText.trim();
  const effectiveConsent = consentText.trim() || CONSENT_DEFAULT_TEXT;

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      ariaLabel="Form settings"
      className="mx-4 h-[min(88vh,42rem)] w-full max-w-[720px] overflow-hidden"
      // The column has to live on the CHILD wrapper, not here — see Modal's contentClassName.
      contentClassName="flex h-full flex-col"
    >
      <div className="shrink-0 border-b border-gray-100 px-6 pb-4 pt-6 dark:border-gray-800">
        <h2 className="pr-8 text-lg font-semibold text-gray-800 dark:text-white/90">Form settings</h2>
        <p className="mt-0.5 truncate text-sm text-gray-400">
          {form.name} · <span className="font-mono text-xs">{form.code}</span>
        </p>
      </div>

      {/* Tabs. Horizontally scrollable rather than wrapping, so a narrow window never reflows the
          dialog into two rows of tabs above a squashed panel. */}
      <div
        role="tablist"
        aria-label="Form settings sections"
        className="flex shrink-0 gap-1 overflow-x-auto border-b border-gray-100 px-4 dark:border-gray-800"
      >
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`form-settings-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`form-settings-panel-${id}`}
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

      <div
        role="tabpanel"
        id={`form-settings-panel-${tab}`}
        aria-labelledby={`form-settings-tab-${tab}`}
        // Vertical padding lives on the INNER wrapper, not here. A sticky `top-0` heading pins to the
        // scroll container's CONTENT box, so padding-top on the scroller left a 20px window above the
        // pinned heading through which scrolled rows were visible — the day label looked like entries
        // were sliding over it. With the padding inside, the heading pins flush to the panel's top.
        className="min-h-0 flex-1 overflow-y-auto px-6"
      >
        <div className="py-5">
        {/* Editing settings is part of the edit lifecycle (it dirties the draft and re-gates publish),
            so it needs a checkout — matching the builder canvas. */}
        {canEdit && !checkedOut && tab !== "activity" && (
          <p className="mb-5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500 dark:border-gray-700 dark:bg-white/5 dark:text-gray-400">
            Check the form out (Checkout in the toolbar) to change these settings.
          </p>
        )}

        {tab === "general" && (
          <>
            <Field hint="Shown as the heading on the embed, the respond page and the submission PDF.">
              <Label>Form name</Label>
              <Input value={formName} onChange={(e) => onFormName(e.target.value)} disabled={!editable} />
            </Field>
            <Field hint="Internal only — it helps your team find this form. Fillers never see it.">
              <Label>Description</Label>
              <Input
                value={formDesc}
                onChange={(e) => onFormDesc(e.target.value)}
                placeholder="Optional"
                disabled={!editable}
              />
            </Field>
            <div className="rounded-lg bg-gray-50 px-3 py-2.5 dark:bg-white/5">
              <span className="text-xs text-gray-400">Form ID</span>
              <p className="font-mono text-sm font-medium text-gray-700 dark:text-gray-200">{form.code}</p>
            </div>
            {(form.createdByName || form.updatedByName) && (
              <p className="mt-3 text-xs text-gray-400">
                {form.createdByName && (
                  <>Created by <span className="text-gray-600 dark:text-gray-300">{form.createdByName}</span></>
                )}
                {form.updatedByName && (
                  <>
                    {form.createdByName ? " · " : ""}last edited by{" "}
                    <span className="text-gray-600 dark:text-gray-300">{form.updatedByName}</span>
                  </>
                )}
              </p>
            )}
          </>
        )}

        {tab === "submission" && (
          <>
            <Field hint="Shown with a success animation after the form is submitted. Leave blank for the default.">
              <Label>Submission message</Label>
              <textarea
                value={submitMessage}
                onChange={(e) => onSubmitMessage(e.target.value)}
                disabled={!editable}
                rows={3}
                placeholder="Thank you! Your response has been recorded."
                className={TEXTAREA}
              />
            </Field>
            <Field hint="Adds an Attachments tab to the form so people can upload supporting files with their submission.">
              <Checkbox
                checked={allowAttachments}
                onChange={onToggleAttachments}
                disabled={!editable}
                label="Allow file attachments"
              />
            </Field>
            <Field hint="On submit, generates a PDF of the completed form — including the submission record — and attaches it to the process instance, viewable in the Form Inbox and Core UI Tasklist.">
              <Checkbox
                checked={saveSubmissionPdf}
                onChange={onToggleSaveSubmissionPdf}
                disabled={!editable}
                label="Save submission as Attachment"
              />
            </Field>
          </>
        )}

        {tab === "legal" && (
          <>
            <Field
              hint={
                consentEnabled
                  ? "Fillers must tick this statement before they can submit. Enforced on the server, so it holds for the embed, the emailed link and in-app fills alike — not just in the browser."
                  : "Turn this on to require an explicit agreement before a submission is accepted."
              }
            >
              <Checkbox
                checked={consentEnabled}
                onChange={onToggleConsent}
                disabled={!editable}
                label="Require the filler to accept an agreement"
              />
            </Field>

            {consentEnabled && (
              <>
                <Field
                  hint={
                    <>
                      The exact wording is stored with each submission, so re-wording it later never changes
                      what an earlier filler agreed to. Paste a link (https://…) and it becomes clickable.
                      {" "}
                      {consentText.trim().length}/{CONSENT_MAX_LENGTH}
                    </>
                  }
                >
                  <Label>Agreement statement</Label>
                  <textarea
                    value={consentText}
                    onChange={(e) => onConsentText(e.target.value.slice(0, CONSENT_MAX_LENGTH))}
                    disabled={!editable}
                    rows={4}
                    placeholder={CONSENT_DEFAULT_TEXT}
                    className={TEXTAREA}
                  />
                </Field>

                {consentBlank && (
                  <p className="mb-5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-400">
                    With no wording of your own, the form uses our standard statement (shown below). Write
                    your own if this submission needs to commit someone to specific terms.
                  </p>
                )}

                <div className="mb-6">
                  <p className="mb-2 text-[11px] uppercase tracking-wide text-gray-400">
                    Preview — what the filler sees
                  </p>
                  {/* The real component, so what's approved here is exactly what appears on the form. */}
                  <FormConsentGate text={effectiveConsent} agreed={false} onChange={() => {}} disabled />
                </div>
              </>
            )}

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-white/5">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Always recorded, on every form
              </p>
              <ul className="mt-2 space-y-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                <li>· The date and time of submission</li>
                <li>· The IP address and device the submission came from</li>
                <li>· Which door it came through — embed, emailed link, or signed-in user</li>
              </ul>
              <p className="mt-2.5 text-xs leading-relaxed text-gray-400">
                You'll find these on each response under “Submission record”. An IP address is weak evidence
                on its own — shared, proxied and reassigned — which is why the agreement above is what makes
                a submission provable. Note that an IP address is personal data under GDPR; it is kept for
                as long as the response is.
              </p>
            </div>
          </>
        )}

        {tab === "appearance" && (
          <>
            <Field hint={chosen.hint}>
              <Label>Font</Label>
              <select
                value={font || "default"}
                onChange={(e) => onFontChange(e.target.value)}
                disabled={!editable}
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/20 disabled:opacity-60 dark:border-gray-700 dark:text-white/90"
              >
                {FORM_FONTS.map((f) => (
                  // Each option is set in its own face so the list previews the choices. (Native option
                  // styling is limited on some platforms — the live preview below is the honest one.)
                  <option key={f.id} value={f.id} style={{ fontFamily: f.stack }}>
                    {f.label}
                  </option>
                ))}
              </select>
              <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 dark:border-gray-700 dark:bg-white/5">
                <p className="text-[11px] uppercase tracking-wide text-gray-400">Preview</p>
                <p className="mt-1 text-base text-gray-800 dark:text-white/90" style={{ fontFamily: chosen.stack }}>
                  {form.name} — Aa Bb Cc 0123
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400" style={{ fontFamily: chosen.stack }}>
                  The quick brown fox jumps over the lazy dog.
                </p>
              </div>
              {chosen.google && (
                <p className="mt-1.5 text-xs leading-relaxed text-gray-400">
                  This font is downloaded from Google Fonts when someone opens the form, which means their
                  browser contacts Google. Pick one of the “System” fonts to avoid any third-party request.
                </p>
              )}
            </Field>

            {/* Attribution. Form METADATA, so it saves with the footer button and takes effect on the live
                embed / respond link immediately — no re-publish. On the free plan it is locked ON; the
                server enforces that independently of this UI. */}
            <Field
              hint={
                form.brandingLocked
                  ? "A small Lukeflow credit appears under this form on your embed and respond links. Hiding it is available on paid plans."
                  : "Adds a small Lukeflow credit under this form on your embed and respond links. Thanks for the support — switch it off any time."
              }
            >
              <div className="flex flex-wrap items-center gap-2">
                <Checkbox
                  checked={showBranding}
                  onChange={onShowBranding}
                  disabled={!editable || form.brandingLocked}
                  label="Show the “Developed at Lukeflow” tag"
                />
                {form.brandingLocked && (
                  <span className="inline-flex items-center rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
                    Paid plan
                  </span>
                )}
              </div>
              {showBranding && (
                <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 px-3 pb-3 pt-1 dark:border-gray-700 dark:bg-white/5">
                  <p className="pt-2 text-[11px] uppercase tracking-wide text-gray-400">Preview</p>
                  {/* The real badge, so what they approve here is exactly what a filler sees. */}
                  <LukeflowBadge surface="embed" className="!mt-2" />
                </div>
              )}
            </Field>
          </>
        )}

        {tab === "activity" && <FormActivityTimeline events={auditEvents} />}
        </div>
      </div>

      <div className="shrink-0 border-t border-gray-100 px-6 py-4 dark:border-gray-800">
        {settingsError && (
          <p className="mb-3 rounded-lg bg-error-50 px-3 py-2 text-xs text-error-500 dark:bg-error-500/10">
            {settingsError}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* The two save models, stated rather than implied — otherwise "Save" looks like it covers
              everything and a font change appearing without it looks like a bug. */}
          <p className="text-xs text-gray-400">
            {tab === "activity"
              ? "A read-only record of everything that has happened to this form."
              : editable
                ? "Submission, Legal and Font settings save as you change them. Save applies the name, description and tag."
                : "Read-only."}
          </p>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={onClose}>{editable ? "Cancel" : "Close"}</Button>
            {editable && <Button onClick={onSave} disabled={!formName.trim()}>Save</Button>}
          </div>
        </div>
      </div>
    </Modal>
  );
}
