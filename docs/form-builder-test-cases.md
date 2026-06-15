# Form Builder & Renderer — Test Cases

Test-case catalog for the "rock solid" hardening of the form builder
([FormBuilderPage.tsx](../src/pages/Forms/FormBuilderPage.tsx)) and renderer
([FormRenderer.tsx](../src/components/formBuilder/FormRenderer.tsx)).

Two layers:

1. **Unit tests** — already automated with vitest (`npm test`). Pure logic in
   [formSchema.ts](../src/lib/formSchema.ts) and [expression.ts](../src/lib/expression.ts).
2. **E2E tests** — behavior in the running app. Documented here as manual cases
   now; **Playwright automation is deferred to the end of the product** and will
   map 1:1 to the `E2E-*` ids below.

| Tier | Theme | Unit ids | E2E ids |
|------|-------|----------|---------|
| A | Data integrity (keys, grid payload) | UT-KEY-\*, UT-NORM-\* | E2E-A-\* |
| B | Runtime correctness (calc, grid, clearOnHide) | UT-EXPR-EVAL-\* | E2E-B-\* |
| C | Schema robustness (repair on load) | UT-REPAIR-\* | E2E-C-\* |
| D | Builder UX (problems, gating, expr, leave-guard) | UT-VALID-\*, UT-EXPR-\* | E2E-D-\* |
| E | Accessibility + field tooltips | — | E2E-E-\* |
| F | Field help content (HTML modal) | — | E2E-F-\* |
| G | Text Field hardening (add-ons, label pos, validateOn, multi-value, clearable) | UT-REND-\* | E2E-G-\* |

Statuses: ✅ automated · ⬜ manual (pending Playwright).

---

## Preconditions (shared, for all E2E cases)

- **PRE-1** Signed in to https://consdev.lukeflow.com/ with a user holding the
  **FORMS read-write** capability in an active tenant.
- **PRE-2** A scratch form exists (or create one) and is open in the builder at
  `/forms/:id`.
- **PRE-3** "Preview" opens the live renderer in a modal; "Check in" / "Publish"
  appear in the toolbar for read-write users.

---

## Layer 1 — Unit tests (✅ automated)

Run: `npm test`. 111 cases across four files. Listed here for traceability.
The renderer suite ([FormRenderer.test.tsx](../src/components/formBuilder/FormRenderer.test.tsx))
mounts the real component in jsdom (testing-library) and covers the Tier-G
Text Field hardening.

### formSchema.test.ts

| Id | Case | Expect |
|----|------|--------|
| UT-KEY-01 | `isValidKey` accepts `email`, `emailAddress`, `_private`, `field2` | true |
| UT-KEY-02 | `isValidKey` rejects spaces, leading digit, punctuation, reserved words, non-string | false |
| UT-KEY-03 | `sanitizeKey` preserves already-valid keys verbatim | unchanged |
| UT-KEY-04 | `sanitizeKey` camelCases `"First Name"` → `firstName` | ok |
| UT-KEY-05 | `sanitizeKey` prefixes leading-digit results so they're valid | valid |
| UT-KEY-06 | `sanitizeKey` falls back to `field` for empty/garbage/null | `field` |
| UT-KEY-07 | `sanitizeKey` escapes reserved words (`true` → `trueField`) | ok |
| UT-KEY-08 | `uniqueKey` returns base when free | base |
| UT-KEY-09 | `uniqueKey` suffixes incrementally on collision, starting at 1 | `email1`, `email2` |
| UT-KEY-10 | `duplicateKeyIds` flags later field reusing an earlier key | only 2nd id |
| UT-KEY-11 | `duplicateKeyIds` detects collisions across nested containers | size 1 |
| UT-KEY-12 | `isAutoKey` treats label base + base-with-digits as auto | true |
| UT-KEY-13 | `isAutoKey` treats a diverged/manual key as not-auto | false |
| UT-KEY-14 | `isAutoKey` treats empty key as auto | true |
| UT-NORM-01 | `normalizeKeys` preserves valid unique, dedupes collisions | no dupes |
| UT-NORM-02 | `normalizeKeys` does not mutate input | input unchanged |
| UT-NORM-03 | `normalizeKeys` is idempotent | second pass equal |
| UT-NORM-04 | `normalizeKeys` leaves unkeyed (layout) entities alone | no key added |
| UT-NORM-05 | `normalizeKeys` derives key from label when missing | from label |
| UT-VALID-01 | `validateSchema` clean schema → no problems | `[]` |
| UT-VALID-02 | `validateSchema` malformed input → `malformed-schema` | error |
| UT-VALID-03 | `validateSchema` dangling root + child refs | both codes |
| UT-VALID-04 | `validateSchema` duplicate + invalid keys → errors | blocking |
| UT-VALID-05 | `validateSchema` detects container cycle, no infinite loop | `cycle` |
| UT-VALID-06 | `validateSchema` warns about orphaned entities | `orphan` warning |
| UT-REPAIR-01 | `repairSchema` leaves sound schema unchanged, sets parentId | no removed |
| UT-REPAIR-02 | `repairSchema` drops dangling root + child refs | filtered |
| UT-REPAIR-03 | `repairSchema` breaks cycles → valid schema | no `cycle` |
| UT-REPAIR-04 | `repairSchema` removes + reports unreachable entities | `removed` listed |
| UT-REPAIR-05 | `repairSchema` severs child claimed by two parents | single parent |
| UT-REPAIR-06 | `repairSchema` does not mutate input | input unchanged |

### expression.test.ts

| Id | Case | Expect |
|----|------|--------|
| UT-EXPR-01 | `analyzeExpression` empty/undefined/whitespace → ok | null |
| UT-EXPR-02 | valid expr referencing known fields → ok | null |
| UT-EXPR-03 | syntax errors flagged | `/syntax/i` |
| UT-EXPR-04 | references to unknown fields flagged with name | `/unknown field/i`, name |
| UT-EXPR-05 | multiple unknown fields → plural message | `/fields/i` |
| UT-EXPR-EVAL-01 | `evaluateExpression` arithmetic against scope | `3*4=12` |
| UT-EXPR-EVAL-02 | `evaluateCondition` defaults to show on bad/empty condition | true |

### FormRenderer.test.tsx (component, jsdom)

| Id | Case | Expect |
|----|------|--------|
| UT-REND-01 | Text field renders `prefix` + `suffix` add-ons | both visible |
| UT-REND-02 | `customClass` applied to the field wrapper | class present |
| UT-REND-03 | `labelPosition: left` keeps label↔control association | `getByLabelText` resolves |
| UT-REND-04 | `autocompleteToken` set → input `autocomplete` attr | semantic token |
| UT-REND-05 | No token → legacy `autocomplete:true` → `on` | fallback works |
| UT-REND-06 | `validateOn:blur` on required field → error on blur | `/required/i` |
| UT-REND-07 | `validateOn:change` minLength → error live, clears when satisfied | toggles |
| UT-REND-08 | No `validateOn` → no live error (only clears on edit) | no alert |
| UT-REND-09 | Invalid email blocks submit + shows error | `onSubmit` not called |
| UT-REND-10 | Valid field submits keyed data | `{ name: "Ada" }` |
| UT-REND-11 | Required enforced on submit | blocked |
| UT-REND-12 | `textCase:uppercase` transforms input | `ABC` |
| UT-REND-13 | `showCharCount` renders the counter | `2 characters` |
| UT-REND-14 | `multiple` adds/removes entries, submits an array | `["first","second"]` |
| UT-REND-15 | `multiple` email validates each entry | `/valid email/i` |
| UT-REND-16 | `multiple` entry ✕ removes a row | count drops |
| UT-REND-17 | `clearable` ✕ empties the field | value `""` |
| UT-REND-18 | `clearable` button hidden while empty | no button |
| UT-REND-19 | Empty form → "no fields yet" message | shown |
| UT-REND-20 | `readOnly` disables inputs + hides submit | disabled, no button |
| UT-REND-21 | `validateOn:blur` on a **Number** (custom control) → error on blur | `/required/i` |
| UT-REND-22 | Multi-value **Number** submits an array + numeric per-entry check | `/≤ 10/` |
| UT-REND-23 | Multi-**select** renders a checkbox group, submits an array | `["js","ts"]` |
| UT-REND-24 | Multi-select required on empty | blocked |
| UT-REND-25 | **Text Area** renders prefix/suffix add-ons | both visible |
| UT-REND-26 | **Password** honors an autocomplete token | `current-password` |
| UT-REND-27 | **Checkbox** required must be checked (false ≠ provided) | blocked then submits `true` |
| UT-REND-28 | **Time** enforces minTime / maxTime | `/at or after 09:00/` |
| UT-REND-29 | **Time** accepts an in-range value | submits |
| UT-REND-30 | **Tags** enforces minTags | `/at least 2 tags/` |
| UT-REND-31 | **Tags** enforces maxTags | `/at most 2 tags/` |
| UT-REND-32 | **File** sets the `accept` attribute | `image/*,.pdf` |
| UT-REND-33 | **File** enforces maxFiles on submit | `/at most 2 files/` |
| UT-REND-34 | **File** enforces maxSize (MB) per file | `/≤ 1 MB/` |
| UT-REND-35 | **Signature** required blocks empty submit | `/required/i` |
| UT-REND-36 | **Signature** submits when present | data URL |
| UT-REND-37 | **Content** renders rich HTML (`<b>`, `<a href>`) | markup present |
| UT-REND-38 | **Content** sanitizes XSS (`<script>`, `onerror`) | stripped, safe kept |
| UT-REND-39 | **Data Grid** enforces minRows | `/at least 2 rows/` |
| UT-REND-40 | **Data Grid** disables Add at maxRows | button disabled |
| UT-REND-41 | **Button** honors the disabled attribute | disabled |
| UT-REND-42 | **Button** reset action restores initial values | input cleared |
| UT-REND-43 | **Auto-validate**: `onResult` ok + empty `errorKeys` when valid | `{ok:true,errorKeys:[]}` |
| UT-REND-44 | **Auto-validate**: `onResult` returns failing field keys | `{ok:false,errorKeys:["name"]}` |
| UT-REND-45 | **Playback**: types each field in, then validates | value typed + `{ok:true}` |

### autofill.test.ts ("Test the form" data generator)

| Id | Case | Expect |
|----|------|--------|
| UT-FILL-01 | invalid JSON → `{}` | empty |
| UT-FILL-02 | output keyed by field key | `{firstName: …}` |
| UT-FILL-03 | respects minLength / maxLength | length bounds |
| UT-FILL-04 | valid email / url / number (within min/max) | valid |
| UT-FILL-05 | picks first option for select/radio | first value |
| UT-FILL-06 | checks a required checkbox | `true` |
| UT-FILL-07 | fills minSelected select boxes | array len = min |
| UT-FILL-08 | fills minTags tags | array len = min |
| UT-FILL-09 | wraps a `multiple` field in an array | `[value]` |
| UT-FILL-10 | fills minRows grid rows keyed by cell key | rows[] |
| UT-FILL-11 | skips layout/static entities | only fields |
| UT-FILL-12 | (covers null/garbage option shapes) | safe |
| UT-FILL-13 | negative: required field → empty + expected | `{reason:"required"}` |
| UT-FILL-14 | negative: non-required email → format-violating value | `not-an-email` |
| UT-FILL-15 | negative: numeric `min` violated | `min-1` |
| UT-FILL-16 | negative: field with no constraint → not expected | `[]` |
| UT-FILL-17 | negative: conditionally-hidden field excluded | `[]` |
| UT-FILL-18 | negative: only targeted fields invalid, rest valid | per-field |

---

## Layer 2 — E2E test cases (⬜ pending Playwright)

### Tier A — Data integrity

**E2E-A-01 — Duplicate key shows inline error** · P0
1. Add two Text fields.
2. Open the 2nd field's settings → Property Name (key) → enter the 1st field's key (e.g. `email`).

✅ Inline error under the key input: *"Duplicate key 'email' — already used by another field."*

**E2E-A-02 — Invalid key (identifier) shows inline error** · P0
1. Open a field's settings → key → enter `first name` (space).

✅ Inline error: *"Use letters, numbers and underscores only (must start with a letter)."*
2. Try `2cool`, `price-total` → same error each time.

**E2E-A-03 — Resolving a duplicate clears the error** · P1
1. From E2E-A-01, change the 2nd field's key to a unique value.

✅ Both the inline error and the toolbar Problems pill clear.

**E2E-A-04 — Delete resolving a duplicate re-evaluates** · P1
1. Create a duplicate (E2E-A-01), then delete one of the two fields.

✅ The remaining field's key error clears (no stale error).

**E2E-A-05 — New field auto-gets a unique key** · P1
1. Add three Text fields without editing keys.

✅ Keys are `textField`, `textField1`, `textField2` (no collisions, no errors).

**E2E-A-08 — Key auto-derives from label (camelCase)** · P0
1. Add a Text field. In its settings, set the **Label** to `First Name`.

✅ The **key** updates live to `firstName` as you type. Change the label to
`Email Address` → key becomes `emailAddress`.

**E2E-A-09 — Duplicate labels suffix the key** · P0
1. Add two fields, both labelled `First Name`.

✅ First field key = `firstName`, second = `firstName1` (then `firstName2`, …).

**E2E-A-10 — Manual key edit locks (stops following label)** · P0
1. Field labelled `First Name` (key `firstName`). Edit the **key** directly to
   `applicantName`.
2. Now change the **label** to `Full Name`.

✅ The key stays `applicantName` — it no longer follows the label (manual
override). A brand-new field whose key still matches its label keeps syncing.

**E2E-A-06 — AI-applied schema is camelCased + normalized** · P1
1. Use LukeTalks to generate a form with fields like "First Name", "Last Name"
   (the agent emits snake_case keys `first_name`, `last_name`).

✅ After apply, keys are **camelCase** (`firstName`, `lastName`), unique, and
identifier-safe; any conditional/expression references are rewritten to match;
draft persists (reload → keys unchanged). Existing snake_case AI forms get fixed
on the next AI edit (whole schema re-camelCased).

**E2E-A-07 — Grid submission keyed by field key, not entity id** · P0
1. Build a Data Grid with two cell fields (keys `qty`, `price`).
2. Preview → add a row → fill it → Submit.

✅ The submitted JSON shows the grid value as rows of `{ qty, price }` (field
keys) — never internal `entityId`-style keys.

---

### Tier B — Runtime correctness

**E2E-B-01 — Calculated value computes without churn** · P0
1. Fields `price`, `quantity`, and `total` with Calculated Value `price * quantity`.
2. Preview → type `price=3`, `quantity=4`.

✅ `total` shows `12`; no flicker/cursor-jump; typing in `price` doesn't fight
the calc.

**E2E-B-02 — allowCalculateOverride lets the user take over** · P1
1. On `total`, enable "Allow manual override".
2. Preview → let it auto-calc, then type a manual value into `total`.

✅ Manual value sticks; editing `price` afterwards does not overwrite it.

**E2E-B-03 — clearOnHide clears type-correctly** · P1
1. A Select-Boxes (multi) field with "Clear when hidden" and a conditional that
   hides it.
2. Preview → select options → trigger the hide condition → reveal again.

✅ On hide the value clears to empty (no leftover/garbage); no console error from
an array field being set to `""`.

**E2E-B-04 — Grid cells run full validation** · P0
1. Data Grid with a Number cell (`min 1, max 10`) and a required Text cell.
2. Preview → add a row → leave the number `0` and the text empty → Submit.

✅ Row-level errors appear (e.g. *"Row 1: … Must be ≥ 1"* and required), not just
"add at least one row".

**E2E-B-05 — Required grid with zero rows** · P2
1. Required Data Grid, no rows. Preview → Submit.

✅ Error: *"Add at least one row."*

**E2E-B-06 — Wizard step gating** · P2
1. Tabs/wizard with a required field in step 1 and a Next button
   (blockedByValidation).
2. Preview → leave step-1 field empty → Next.

✅ Cannot advance; the step-1 error shows.

---

### Tier C — Schema robustness

> These rely on a corrupted draft. Easiest setup: a QA endpoint or DB edit to
> store a malformed `draftSchema`. Document the corruption used per run.

**E2E-C-01 — Dangling references don't crash the builder** · P1
1. Store a draft whose `root` includes a missing id and a container referencing a
   missing child. Open the form in the builder.

✅ Builder loads (no white screen / thrown error); the bad references are gone;
valid fields render.

**E2E-C-02 — Cycle doesn't hang the renderer** · P1
1. Store a draft with a container cycle (A→B→A). Open Preview.

✅ Renderer shows the form without freezing/looping.

**E2E-C-03 — Corrupted draft renders best-effort in Preview** · P2
1. Store a draft with an orphan entity (not reachable from root). Open Preview.

✅ Reachable fields render; orphan is silently dropped (no crash).

---

### Tier D — Builder UX

**E2E-D-01 — Problems pill reflects error count** · P0
1. Introduce a blocking problem (duplicate key, E2E-A-01).

✅ Toolbar shows a red **`⊘ 1 error`** pill. Resolve it → pill disappears.

**E2E-D-02 — Problems modal lists + focuses** · P0
1. With a problem present, click the Problems pill.

✅ Modal lists each problem with the field label; clicking a row closes the modal,
selects that field, and opens its settings.

**E2E-D-03 — Check-in blocked by errors** · P0
1. With a blocking problem present, observe/click **Check in**.

✅ The button is **disabled** (tooltip explains); attempting it opens the Problems
modal instead of checking in.

**E2E-D-04 — Publish blocked by errors** · P0
1. With a blocking problem present, observe **Publish**.

✅ Disabled while errors exist; enables once resolved (and a checked-in version
exists).

**E2E-D-05 — Expression syntax error surfaces** · P1
1. A field's Calculated Value = `price *` (incomplete).

✅ Inline/panel warning: *"Syntax error: …"*.

**E2E-D-06 — Expression unknown-field reference surfaces** · P1
1. Calculated Value = `price * quantty` (typo) while only `price`/`quantity` exist.

✅ Warning: *"Unknown field: quantty."* (advisory — does not block publish).

**E2E-D-07 — Leave-guard flushes on navigation** · P0
1. Make an edit, then within ~½ second click browser Back (or navigate away).
2. Return to the form.

✅ The last edit is present (it was flushed, not lost in the 600 ms debounce).

**E2E-D-08 — beforeunload warns on unsaved edits** · P1
1. Make an edit and immediately attempt a tab close / refresh.

✅ Browser shows the "Leave site? Changes may not be saved" prompt.

**E2E-D-09 — AI remount does not clobber applied schema** · P1
1. Make a manual edit, then immediately apply a LukeTalks change.
2. Reload the form.

✅ The AI's schema is what persists (the outgoing builder's stale flush was
suppressed); no revert to the pre-AI state.

**E2E-D-10 — View-only user sees no write actions** · P2
1. Open the builder as a FORMS read-only user.

✅ Palette and Save/Check-in/Publish/Problems-gating hidden; canvas is browsable
but not editable; nothing persists.

---

### Tier E — Accessibility

**E2E-E-01 — Label ↔ control association** · P1
1. Inspect a rendered field (Preview).

✅ `<label htmlFor>` matches the control's `id`; clicking the label focuses the
control. Group controls (radio/select-boxes/day/signature) use
`aria-labelledby` to the label id.

**E2E-E-02 — Error association + announcement** · P1
1. Submit with a required field empty.

✅ The error `<p>` has `role="alert"`; the control has `aria-invalid="true"` and
`aria-describedby` pointing at the error id. (SR announces on appear.)

**E2E-E-03 — Description / counters described** · P2
1. A field with a description and char/word count.

✅ Control's `aria-describedby` references the description and counter ids.

**E2E-E-04 — Required announced** · P2
1. A required field.

✅ Control (or group) has `aria-required="true"`.

**E2E-E-05 — Keyboard traversal** · P1
1. Tab through a Preview form.

✅ Focus reaches every control in order, including custom ones (searchable Select
button = `aria-haspopup/expanded`; tags input; signature canvas is focusable).

**E2E-E-06 — Custom validation authoritative (noValidate)** · P1
1. An Email field with an invalid value → Submit.

✅ Our validation message shows (no native browser bubble); submit isn't hijacked
by native `type=email`/`url`/`date` validation.

**E2E-E-07 — Field tooltip (hover/focus)** · P1
1. Set a field's **Tooltip** attribute. Preview → hover (and Tab to) the `ⓘ`
   icon next to the label.

✅ The tooltip text appears on hover and on keyboard focus; the icon has an
`aria-label` of the text.

---

### Tier F — Field help content (HTML modal)

**E2E-F-01 — Help link is a substring of the label** · P0
1. On a **Checkbox** (also Radio / Select Boxes / Select), set **Label** =
   `I agree to the Terms and Conditions`, **Help link text** =
   `Terms and Conditions` (a substring of the label), and author **Help content**
   in the WYSIWYG (a heading, a paragraph, a list).
2. Preview → only the `Terms and Conditions` words are an underlined link (no
   duplicated/appended text); click it.

✅ A modal opens showing the content **rendered**, titled with the link text;
Esc / backdrop closes it. The rest of the label is plain text.

**E2E-F-05 — WYSIWYG authoring** · P1
1. In the Help-content editor, use the toolbar (bold, heading, bullet list).
2. Preview → open the modal.

✅ The modal shows the formatting as authored (no raw HTML tags visible).

**E2E-F-06 — Link text not in label → appended (fallback)** · P2
1. Set Label = `Consent` and Help link text = `Privacy Policy` (not a substring).

✅ The link is appended after the label (`Consent Privacy Policy`) and still
opens the modal.

**E2E-F-02 — Link click does not toggle the checkbox** · P0
1. From E2E-F-01, click the `Terms and Conditions` link on a checkbox.

✅ The modal opens and the checkbox state is unchanged (link click is isolated).

**E2E-F-03 — HTML is sanitized (no XSS)** · P0
1. Set Help content to `<img src=x onerror="alert(1)"><script>alert(2)</script><b>ok</b>`.
2. Preview → open the modal.

✅ No alert fires; `<script>`/`onerror` are stripped; safe markup (`<b>ok</b>`)
still renders (DOMPurify).

**E2E-F-04 — No link when content is incomplete** · P2
1. Set only the link text (no HTML), or only HTML (no link text).

✅ No link renders (both are required to show the trigger).

---

### Tier G — Text Field hardening

> These apply to the **text-like family** (Text Field, Email, URL, Phone,
> Password) which share one attribute set — verify on at least Text Field + Email.

**E2E-G-01 — Prefix / suffix render at runtime** · P1
1. Add a Text Field; set **Prefix** = `$` and **Suffix** = `.00`. Preview.

✅ The prefix and suffix sit inline beside the input (previously only Number/Currency
showed them).

**E2E-G-02 — Label position (left / right)** · P2
1. Set **Label Position** = `left`, Preview; then `right`.

✅ Label sits beside the control (left or right); clicking the label still focuses
the input (association preserved).

**E2E-G-03 — Custom CSS class on the field** · P2
1. Set **Custom CSS Class** = `qa-highlight`. Preview → inspect the field.

✅ The field wrapper carries the `qa-highlight` class.

**E2E-G-04 — Validate on blur** · P0
1. Required Text Field, **Validate On** = `blur`. Preview → focus then blur empty.

✅ The required error appears on blur (not only on submit); fixing + blurring clears it.

**E2E-G-05 — Validate on change** · P1
1. Text Field with **Min Length** = 3, **Validate On** = `change`. Preview → type 2 chars.

✅ Error shows live; typing the 3rd char clears it immediately.

**E2E-G-06 — Semantic autocomplete token** · P2
1. Email field → **Autocomplete (browser autofill)** = `email`. Preview → inspect input.

✅ Input has `autocomplete="email"`; the browser offers the right autofill.

**E2E-G-07 — Multiple values** · P0
1. Text Field → enable **Allow multiple values**. Preview.

✅ One entry shows with **+ Add another**; add a couple, fill them, remove one with its
✕. Submit → the value is an **array** keyed by the field key. Required = at least one
non-empty entry; per-entry validation (e.g. email format) applies.

**E2E-G-08 — Clearable** · P1
1. Text Field → enable **Show clear (✕) button**. Preview.

✅ With a value, a ✕ appears and empties the field on click; it's hidden while empty
and while the field is multi-value or read-only.

---

### Tier H — Test the form (positive + negative + sign-off)

**E2E-H-01 — Positive: animated fill passes** · P0
1. Open a form → click **Test** (opens on the **Positive** tab).

✅ The form **types itself in** field by field (you can watch each value appear, the
focused field scrolls into view), then validation runs and the summary shows
*Positive: ✓ valid*. **Re-run** replays the animation.

**E2E-H-02 — Negative: invalid data is rejected per field** · P0
1. On a form with constrained fields, open **Test** → **Negative** tab.

✅ Each constrained field is filled with an invalid value; the breakdown lists every
field as *✓ rejected*, and the summary shows *Negative: ✓ N/N rejected*. A field shown
as *✗ NOT rejected* is a real validation gap.

**E2E-H-03 — Sign off needs both green; persists** · P0
1. With Positive ✓ and Negative ✓, click **Sign off**.

✅ Sign-off is enabled only when both pass; a **Tested ✓** badge shows in the toolbar
and persists on reload (capability-engine `lastTestedAt`/`by` + `tested` audit event).

**E2E-H-04 — Pattern/custom fields surface in Positive** · P1
1. Add a field with a regex **pattern** the generator can't satisfy → Test.

✅ Positive reports the error and the field shows its inline error; fix or fill manually
and **Re-run**.

**E2E-H-05 — View-only can test but not sign off** · P2
1. Open as a FORMS read-only user → Test.

✅ Both tabs run and show verdicts, but **Sign off** is hidden/disabled.

---

## Traceability & next steps

- Each `E2E-*` id is a future Playwright `test(...)` title → 1:1 mapping.
- When Playwright lands: add stable `data-testid`s where selectors are ambiguous
  (palette items, field cards, key input, Problems pill/modal, toolbar buttons),
  and a fixture form per tier.
- Priorities: **P0** = ship-blocking smoke set; **P1** = full regression; **P2** =
  edge coverage.
