// Wire the pdf.js worker for react-pdf in Vite. Importing this module (for its side
// effect) sets the worker source to the pdfjs-dist build that ships with react-pdf, so
// the API and worker versions always match. Vite resolves the URL to a hashed asset.
import { pdfjs } from "react-pdf";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();
