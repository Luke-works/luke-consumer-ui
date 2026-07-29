import { test as base, expect } from "@playwright/test";

/**
 * The `test` the flow specs use. Identical to Playwright's own, except when RECORD=1, where it
 * draws a visible cursor into the page.
 *
 * Why: a recording without a pointer is unreadable. Fields fill themselves, buttons depress with
 * nothing touching them, and a viewer can't tell whether the run did something or the page did.
 * Playwright drives real mouse events but the browser never paints a cursor into a video, so the
 * pointer has to be drawn by us.
 *
 * This is presentation for the recording ONLY. It is off in every normal run, adds no listeners
 * there, and nothing asserts on it — a test that depended on this overlay would be testing the
 * harness. Injected via addInitScript so it survives navigation within a spec.
 */
const RECORDING = process.env.RECORD === "1";

const CURSOR_SCRIPT = () => {
  const install = () => {
    if (document.getElementById("__e2e_cursor__")) return;

    const dot = document.createElement("div");
    dot.id = "__e2e_cursor__";
    dot.style.cssText = [
      "position:fixed",
      "z-index:2147483647",
      "width:20px",
      "height:20px",
      "margin:-10px 0 0 -10px",
      "border-radius:50%",
      // High contrast on ANY background: a blue dot vanished against a blue primary button, which
      // is exactly where the clicks happen. White fill + dark ring reads on both themes.
      "background:rgba(255,255,255,0.9)",
      "border:2.5px solid rgba(17,24,39,0.95)",
      "box-shadow:0 1px 6px rgba(0,0,0,0.45)",
      "pointer-events:none",
      "transition:transform 90ms linear",
      "left:-100px",
      "top:-100px",
    ].join(";");
    document.body.appendChild(dot);

    addEventListener(
      "mousemove",
      (e) => {
        dot.style.left = `${e.clientX}px`;
        dot.style.top = `${e.clientY}px`;
      },
      true,
    );

    // A brief pulse on click, so a viewer can see WHEN the press happened rather than inferring
    // it from whatever changed next.
    addEventListener(
      "mousedown",
      () => {
        dot.style.transform = "scale(0.55)";
        setTimeout(() => (dot.style.transform = "scale(1)"), 140);
      },
      true,
    );
  };

  if (document.body) install();
  else addEventListener("DOMContentLoaded", install);
};

export const test = base.extend<{ cursor: void }>({
  cursor: [
    async ({ page }, use) => {
      if (RECORDING) await page.addInitScript(CURSOR_SCRIPT);
      await use();
    },
    { auto: true },
  ],
});

export { expect };
