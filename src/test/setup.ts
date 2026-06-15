// Vitest global setup: jest-dom matchers (toBeInTheDocument, toHaveValue, …)
// and a jsdom shim for canvas (SignaturePad calls getContext/toDataURL).
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Globals are off, so testing-library's auto-cleanup isn't registered — unmount
// between tests ourselves to keep the DOM isolated.
afterEach(() => cleanup());

// jsdom has no canvas implementation; stub getContext (it otherwise logs a
// "Not implemented" notice) so a form with a Signature field mounts quietly.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
HTMLCanvasElement.prototype.getContext = (() => null) as any;
