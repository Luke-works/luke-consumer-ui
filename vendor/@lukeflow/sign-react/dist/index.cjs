"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __reExport = (target, mod, secondTarget) => (__copyProps(target, mod, "default"), secondTarget && __copyProps(secondTarget, mod, "default"));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  AdoptSignature: () => AdoptSignature,
  DEFAULT_ACCENT: () => DEFAULT_ACCENT,
  DocumentViewer: () => DocumentViewer,
  PdfView: () => PdfView,
  SignaturePad: () => SignaturePad,
  SigningCeremony: () => SigningCeremony,
  hexA: () => hexA,
  palette: () => palette,
  useCeremonyTheme: () => useCeremonyTheme
});
module.exports = __toCommonJS(index_exports);

// src/PdfView.tsx
var import_react = require("react");
var import_react_pdf2 = require("react-pdf");

// src/pdfWorker.ts
var import_react_pdf = require("react-pdf");
var import_meta = {};
var wired = false;
function ensurePdfWorker() {
  if (wired) return;
  wired = true;
  import_react_pdf.pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import_meta.url
  ).toString();
}

// src/PdfView.tsx
var import_jsx_runtime = require("react/jsx-runtime");
ensurePdfWorker();
function PdfView({
  source,
  pageNumber = 1,
  width,
  onGeometry,
  onClick,
  onError,
  overlay
}) {
  const file = (0, import_react.useMemo)(() => source, [source]);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "relative inline-block", style: { width }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      import_react_pdf2.Document,
      {
        file,
        loading: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { padding: 24, fontSize: 14, color: "#9ca3af" }, children: "Loading document\u2026" }),
        error: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { padding: 24, fontSize: 14, color: "#ef4444" }, children: "Could not load the document." }),
        onLoadError: onError,
        onSourceError: onError,
        children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          import_react_pdf2.Page,
          {
            pageNumber,
            width,
            renderAnnotationLayer: false,
            renderTextLayer: false,
            onLoadError: onError,
            onRenderError: onError,
            onLoadSuccess: (page) => onGeometry?.({
              pdfW: page.originalWidth,
              pdfH: page.originalHeight,
              cssW: page.width,
              cssH: page.height,
              rotate: page.rotate ?? 0
            })
          }
        )
      }
    ),
    onClick && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "div",
      {
        style: { position: "absolute", inset: 0, cursor: "crosshair" },
        onClick: (e) => {
          const r = e.currentTarget.getBoundingClientRect();
          onClick({ cssX: e.clientX - r.left, cssY: e.clientY - r.top });
        }
      }
    ),
    overlay
  ] });
}

// src/SignaturePad.tsx
var import_react2 = require("react");
var import_jsx_runtime2 = require("react/jsx-runtime");
function SignaturePad({
  onChange,
  penColor = "#111827",
  width = 500,
  height = 180
}) {
  const ref = (0, import_react2.useRef)(null);
  const drawing = (0, import_react2.useRef)(false);
  (0, import_react2.useEffect)(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, c.width, c.height);
    }
  }, []);
  const point = (e) => {
    const r = ref.current.getBoundingClientRect();
    const t = "touches" in e ? e.touches[0] : e;
    const scaleX = ref.current.width / r.width;
    const scaleY = ref.current.height / r.height;
    return { x: (t.clientX - r.left) * scaleX, y: (t.clientY - r.top) * scaleY };
  };
  const start = (e) => {
    drawing.current = true;
    const ctx = ref.current.getContext("2d");
    const { x, y } = point(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = ref.current.getContext("2d");
    ctx.strokeStyle = penColor;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const { x, y } = point(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(ref.current.toDataURL("image/png"));
  };
  const clear = () => {
    const c = ref.current;
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    onChange("");
  };
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      "canvas",
      {
        ref,
        width,
        height,
        role: "img",
        "aria-label": "Signature drawing area",
        style: {
          width: "100%",
          maxWidth: "100%",
          touchAction: "none",
          borderRadius: 8,
          border: "1px solid #d1d5db",
          background: "#fff"
        },
        onMouseDown: start,
        onMouseMove: move,
        onMouseUp: end,
        onMouseLeave: end,
        onTouchStart: start,
        onTouchMove: move,
        onTouchEnd: end
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      "button",
      {
        type: "button",
        onClick: clear,
        style: { marginTop: 4, fontSize: 12, color: "#6b7280", background: "none", border: "none", cursor: "pointer" },
        children: "Clear"
      }
    )
  ] });
}

// src/DocumentViewer.tsx
var import_react4 = require("react");
var import_react_pdf3 = require("react-pdf");

// src/theme.ts
var import_react3 = require("react");
var DEFAULT_ACCENT = "#465fff";
function palette(theme, accent = DEFAULT_ACCENT) {
  if (theme === "dark") {
    return {
      bg: "#0b0f19",
      surface: "#111827",
      surfaceMuted: "#1f2937",
      border: "#374151",
      borderStrong: "#4b5563",
      text: "#f9fafb",
      textMuted: "#9ca3af",
      textFaint: "#6b7280",
      accent,
      accentHover: accent,
      accentText: "#ffffff",
      accentSoft: hexA(accent, 0.18),
      danger: "#f87171",
      dangerSoft: "rgba(248,113,113,0.14)",
      success: "#34d399",
      successSoft: "rgba(52,211,153,0.14)",
      warning: "#fbbf24",
      warningSoft: "rgba(251,191,36,0.14)",
      shadow: "0 10px 30px rgba(0,0,0,0.5)"
    };
  }
  return {
    bg: "#f9fafb",
    surface: "#ffffff",
    surfaceMuted: "#f3f4f6",
    border: "#e5e7eb",
    borderStrong: "#d1d5db",
    text: "#111827",
    textMuted: "#6b7280",
    textFaint: "#9ca3af",
    accent,
    accentHover: accent,
    accentText: "#ffffff",
    accentSoft: hexA(accent, 0.12),
    danger: "#ef4444",
    dangerSoft: "rgba(239,68,68,0.08)",
    success: "#16a34a",
    successSoft: "rgba(22,163,74,0.08)",
    warning: "#d97706",
    warningSoft: "rgba(217,119,6,0.08)",
    shadow: "0 10px 30px rgba(17,24,39,0.12)"
  };
}
function hexA(hex, alpha) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const h = m[1];
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
function useCeremonyTheme(override) {
  const [theme, setTheme] = (0, import_react3.useState)(() => override ?? detectTheme());
  (0, import_react3.useEffect)(() => {
    if (override) {
      setTheme(override);
      return;
    }
    const update = () => setTheme(detectTheme());
    update();
    const mq = typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    mq?.addEventListener?.("change", update);
    let obs;
    if (typeof document !== "undefined" && typeof MutationObserver !== "undefined") {
      obs = new MutationObserver(update);
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    }
    return () => {
      mq?.removeEventListener?.("change", update);
      obs?.disconnect();
    };
  }, [override]);
  return theme;
}
function detectTheme() {
  if (typeof document !== "undefined" && document.documentElement.classList.contains("dark")) return "dark";
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches) return "dark";
  return "light";
}

// src/DocumentViewer.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
ensurePdfWorker();
function DocumentViewer({
  source,
  baseWidth = 680,
  fieldPage,
  initialPage,
  minZoom = 0.5,
  maxZoom = 2.5,
  toolbar = true,
  onClick,
  renderOverlay,
  onGeometry,
  onError,
  theme,
  accent,
  jumpLabel = "Go to signature"
}) {
  const t = useCeremonyTheme(theme);
  const c = palette(t, accent);
  const [numPages, setNumPages] = (0, import_react4.useState)(0);
  const [page, setPage] = (0, import_react4.useState)(initialPage ?? fieldPage ?? 0);
  const [zoom, setZoom] = (0, import_react4.useState)(1);
  const [geometry, setGeometry] = (0, import_react4.useState)(null);
  const file = (0, import_react4.useMemo)(() => source, [source]);
  const width = Math.round(baseWidth * zoom);
  const clampPage = (0, import_react4.useCallback)((p, max) => Math.max(0, Math.min(max - 1, p)), []);
  (0, import_react4.useEffect)(() => setGeometry(null), [page]);
  const handleGeometry = (0, import_react4.useCallback)(
    (g) => {
      setGeometry(g);
      onGeometry?.(g, page);
    },
    [onGeometry, page]
  );
  const handleClick = (0, import_react4.useCallback)(
    (e) => {
      if (!onClick || !geometry) return;
      const r = e.currentTarget.getBoundingClientRect();
      onClick({ page, cssX: e.clientX - r.left, cssY: e.clientY - r.top, geometry });
    },
    [onClick, geometry, page]
  );
  const zoomBy = (d) => setZoom((z) => Math.round(Math.max(minZoom, Math.min(maxZoom, z + d)) * 100) / 100);
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 10, alignItems: "stretch" }, children: [
    toolbar && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "8px 10px",
          borderRadius: 10,
          border: `1px solid ${c.border}`,
          background: c.surfaceMuted,
          flexWrap: "wrap"
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 6 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(ToolBtn, { c, disabled: page <= 0, onClick: () => setPage((p) => clampPage(p - 1, numPages)), "aria-label": "Previous page", children: "\u2039" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { style: { fontSize: 13, color: c.textMuted, minWidth: 92, textAlign: "center" }, children: [
              "Page ",
              numPages ? page + 1 : "\u2014",
              " / ",
              numPages || "\u2014"
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              ToolBtn,
              {
                c,
                disabled: numPages === 0 || page >= numPages - 1,
                onClick: () => setPage((p) => clampPage(p + 1, numPages)),
                "aria-label": "Next page",
                children: "\u203A"
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 6 }, children: [
            fieldPage != null && fieldPage !== page && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
              "button",
              {
                type: "button",
                onClick: () => setPage(clampPage(fieldPage, numPages || fieldPage + 1)),
                style: {
                  fontSize: 12,
                  fontWeight: 600,
                  color: c.accent,
                  background: c.accentSoft,
                  border: "none",
                  borderRadius: 8,
                  padding: "5px 10px",
                  cursor: "pointer"
                },
                children: [
                  jumpLabel,
                  " \u21A6"
                ]
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(ToolBtn, { c, disabled: zoom <= minZoom, onClick: () => zoomBy(-0.25), "aria-label": "Zoom out", children: "\u2212" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
              "button",
              {
                type: "button",
                onClick: () => setZoom(1),
                style: {
                  fontSize: 12,
                  color: c.textMuted,
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  minWidth: 44
                },
                children: [
                  Math.round(zoom * 100),
                  "%"
                ]
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(ToolBtn, { c, disabled: zoom >= maxZoom, onClick: () => zoomBy(0.25), "aria-label": "Zoom in", children: "+" })
          ] })
        ]
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      "div",
      {
        style: {
          maxHeight: "62vh",
          overflow: "auto",
          borderRadius: 12,
          border: `1px solid ${c.border}`,
          background: c.surfaceMuted,
          padding: 16,
          display: "flex",
          justifyContent: "center"
        },
        children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { position: "relative", width, boxShadow: c.shadow }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            import_react_pdf3.Document,
            {
              file,
              onLoadSuccess: (d) => setNumPages(d.numPages),
              loading: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { padding: 28, fontSize: 14, color: c.textFaint }, children: "Loading document\u2026" }),
              error: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { padding: 28, fontSize: 14, color: c.danger }, children: "Could not load the document." }),
              onLoadError: onError,
              onSourceError: onError,
              children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                import_react_pdf3.Page,
                {
                  pageNumber: page + 1,
                  width,
                  renderAnnotationLayer: false,
                  renderTextLayer: false,
                  onLoadError: onError,
                  onRenderError: onError,
                  onLoadSuccess: (p) => handleGeometry({
                    pdfW: p.originalWidth,
                    pdfH: p.originalHeight,
                    cssW: p.width,
                    cssH: p.height,
                    rotate: p.rotate ?? 0
                  })
                }
              )
            }
          ),
          geometry && renderOverlay?.({ page, geometry }),
          onClick && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { onClick: handleClick, style: { position: "absolute", inset: 0, cursor: "crosshair" } })
        ] })
      }
    )
  ] });
}
function ToolBtn({
  c,
  children,
  onClick,
  disabled,
  "aria-label": ariaLabel
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
    "button",
    {
      type: "button",
      "aria-label": ariaLabel,
      onClick,
      disabled,
      style: {
        width: 30,
        height: 30,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 18,
        lineHeight: 1,
        color: disabled ? c.textFaint : c.text,
        background: c.surface,
        border: `1px solid ${c.border}`,
        borderRadius: 8,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1
      },
      children
    }
  );
}

// src/AdoptSignature.tsx
var import_react5 = require("react");
var import_jsx_runtime4 = require("react/jsx-runtime");
var TYPE_FONTS = [
  { label: "Signature", family: "'Snell Roundhand', 'Apple Chancery', 'Segoe Script', 'Brush Script MT', cursive" },
  { label: "Casual", family: "'Brush Script MT', 'Segoe Script', cursive" },
  { label: "Formal", family: "'Palatino Linotype', 'Book Antiqua', Palatino, serif" },
  { label: "Print", family: "'Helvetica Neue', Arial, sans-serif" }
];
var METHOD_LABEL = { draw: "Draw", type: "Type", upload: "Upload" };
function AdoptSignature({
  signerName = "",
  methods = ["draw", "type", "upload"],
  onChange,
  onMethodChange,
  width = 500,
  height = 180,
  maxUploadBytes = 5 * 1024 * 1024,
  theme,
  accent
}) {
  const t = useCeremonyTheme(theme);
  const c = palette(t, accent);
  const first = methods[0] ?? "draw";
  const [method, setMethod] = (0, import_react5.useState)(first);
  const [drawn, setDrawn] = (0, import_react5.useState)("");
  const [typed, setTyped] = (0, import_react5.useState)(signerName);
  const [fontIdx, setFontIdx] = (0, import_react5.useState)(0);
  const [typedPng, setTypedPng] = (0, import_react5.useState)("");
  const [uploaded, setUploaded] = (0, import_react5.useState)("");
  const [uploadErr, setUploadErr] = (0, import_react5.useState)(null);
  const valueFor = (0, import_react5.useCallback)(
    (m) => m === "draw" ? drawn : m === "type" ? typedPng : uploaded,
    [drawn, typedPng, uploaded]
  );
  (0, import_react5.useEffect)(() => {
    if (typed.trim()) {
      setTypedPng(renderTypedSignature(typed.trim(), TYPE_FONTS[fontIdx].family, width, height));
    } else {
      setTypedPng("");
    }
  }, [typed, fontIdx, width, height]);
  (0, import_react5.useEffect)(() => {
    onChange(valueFor(method));
  }, [method, drawn, typedPng, uploaded, onChange, valueFor]);
  const selectMethod = (m) => {
    setMethod(m);
    onMethodChange?.(m);
  };
  const onUpload = async (file) => {
    setUploadErr(null);
    if (!file) {
      setUploaded("");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setUploadErr("Please choose an image file (PNG or JPG).");
      return;
    }
    if (file.size > maxUploadBytes) {
      setUploadErr(`Image is too large (max ${Math.round(maxUploadBytes / 1024 / 1024)} MB).`);
      return;
    }
    try {
      setUploaded(await renderUploadedImage(file, width, height));
    } catch {
      setUploadErr("That image couldn\u2019t be read. Try a different file.");
      setUploaded("");
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { role: "tablist", "aria-label": "Signature method", style: { display: "flex", gap: 4, marginBottom: 12 }, children: methods.map((m) => {
      const active = m === method;
      return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        "button",
        {
          role: "tab",
          "aria-selected": active,
          type: "button",
          onClick: () => selectMethod(m),
          style: {
            flex: 1,
            padding: "8px 12px",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            color: active ? c.accent : c.textMuted,
            background: active ? c.accentSoft : "transparent",
            border: `1px solid ${active ? c.accent : c.border}`,
            borderRadius: 8
          },
          children: METHOD_LABEL[m]
        },
        m
      );
    }) }),
    method === "draw" && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(SignaturePad, { onChange: setDrawn, width, height, penColor: "#111827" }) }),
    method === "type" && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        "input",
        {
          value: typed,
          onChange: (e) => setTyped(e.target.value),
          placeholder: "Type your full name",
          "aria-label": "Typed signature",
          style: {
            width: "100%",
            boxSizing: "border-box",
            padding: "10px 12px",
            fontSize: 14,
            color: c.text,
            background: c.surface,
            border: `1px solid ${c.border}`,
            borderRadius: 8,
            marginBottom: 10
          }
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: { display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }, children: TYPE_FONTS.map((f, i) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        "button",
        {
          type: "button",
          onClick: () => setFontIdx(i),
          style: {
            padding: "6px 10px",
            fontSize: 13,
            fontFamily: f.family,
            cursor: "pointer",
            color: i === fontIdx ? c.accent : c.textMuted,
            background: i === fontIdx ? c.accentSoft : "transparent",
            border: `1px solid ${i === fontIdx ? c.accent : c.border}`,
            borderRadius: 8
          },
          children: f.label
        },
        f.label
      )) }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Preview, { c, src: typedPng, placeholder: "Your typed signature will appear here", height })
    ] }),
    method === "upload" && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
        "label",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            height: 64,
            cursor: "pointer",
            color: c.textMuted,
            background: c.surfaceMuted,
            border: `1px dashed ${c.borderStrong}`,
            borderRadius: 8,
            marginBottom: 10,
            fontSize: 13
          },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: { fontWeight: 600, color: c.accent }, children: "Choose an image" }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: { fontSize: 12 }, children: "PNG or JPG of your signature" }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
              "input",
              {
                type: "file",
                accept: "image/png,image/jpeg",
                onChange: (e) => void onUpload(e.target.files?.[0] ?? null),
                style: { display: "none" }
              }
            )
          ]
        }
      ),
      uploadErr && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { style: { margin: "0 0 8px", fontSize: 13, color: c.danger }, children: uploadErr }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Preview, { c, src: uploaded, placeholder: "Your uploaded signature will appear here", height })
    ] })
  ] });
}
function Preview({ c, src, placeholder, height }) {
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
    "div",
    {
      style: {
        height,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 8,
        border: `1px solid ${c.border}`,
        background: "#ffffff",
        overflow: "hidden"
      },
      children: src ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("img", { src, alt: "Signature preview", style: { maxWidth: "100%", maxHeight: "100%" } }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: { fontSize: 13, color: "#9ca3af" }, children: placeholder })
    }
  );
}
function renderTypedSignature(text, fontFamily, w, h) {
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.scale(scale, scale);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#111827";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let size = Math.floor(h * 0.5);
  const maxW = w * 0.88;
  do {
    ctx.font = `${size}px ${fontFamily}`;
    if (ctx.measureText(text).width <= maxW || size <= 12) break;
    size -= 2;
  } while (size > 12);
  ctx.fillText(text, w / 2, h / 2);
  return canvas.toDataURL("image/png");
}
function renderUploadedImage(file, w, h) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode failed"));
      img.onload = () => {
        const scale = 2;
        const canvas = document.createElement("canvas");
        canvas.width = w * scale;
        canvas.height = h * scale;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("no 2d context"));
        ctx.scale(scale, scale);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        const r = Math.min(w / img.width, h / img.height);
        const dw = img.width * r;
        const dh = img.height * r;
        ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
        resolve(canvas.toDataURL("image/png"));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// src/SigningCeremony.tsx
var import_react6 = require("react");
var import_sign_core = require("@lukeflow/sign-core");
var import_jsx_runtime5 = require("react/jsx-runtime");
var STEPS = [
  { key: "review", label: "Review" },
  { key: "adopt", label: "Sign" },
  { key: "confirm", label: "Confirm" }
];
function SigningCeremony({
  session,
  onSubmit,
  onError,
  brandName = "Lukeflow",
  logoUrl,
  accent,
  theme,
  adoptMethods,
  errorMessage
}) {
  const t = useCeremonyTheme(theme);
  const c = palette(t, accent);
  const [step, setStep] = (0, import_react6.useState)("review");
  const [signaturePng, setSignaturePng] = (0, import_react6.useState)("");
  const [typedName, setTypedName] = (0, import_react6.useState)(session.signerName ?? "");
  const [consent, setConsent] = (0, import_react6.useState)(false);
  const [fieldGeom, setFieldGeom] = (0, import_react6.useState)(null);
  const [pdfError, setPdfError] = (0, import_react6.useState)(false);
  const [submitting, setSubmitting] = (0, import_react6.useState)(false);
  const [submitError, setSubmitError] = (0, import_react6.useState)(null);
  const [done, setDone] = (0, import_react6.useState)(false);
  const fieldPage = session.field.page ?? 0;
  const pdfSource = (0, import_react6.useMemo)(() => `data:application/pdf;base64,${session.pdfBase64}`, [session.pdfBase64]);
  const rotated = !!fieldGeom && (0, import_sign_core.isRotated)(fieldGeom);
  const stepIndex = STEPS.findIndex((s) => s.key === step);
  const onPdfError = (e) => {
    setPdfError(true);
    if (e) onError?.(e);
  };
  const canFinish = !!signaturePng && consent && !!fieldGeom && !rotated && !pdfError && !submitting;
  const submit = async () => {
    if (!canFinish) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit({
        signaturePngBase64: signaturePng,
        consent: true,
        signerNameTyped: typedName.trim() || void 0
      });
      setDone(true);
    } catch (e) {
      setSubmitError(errorMessage ? errorMessage(e) : e instanceof Error ? e.message : "Could not submit your signature.");
      onError?.(e);
    } finally {
      setSubmitting(false);
    }
  };
  const renderOverlay = ({ page, geometry }) => {
    if (page !== fieldPage) return null;
    const r = (0, import_sign_core.fieldToCssRect)(geometry, session.field);
    const placed = !!signaturePng && (step === "adopt" || step === "confirm");
    return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
      "div",
      {
        style: {
          position: "absolute",
          left: r.left,
          top: r.top,
          width: r.width,
          height: r.height,
          borderRadius: 4,
          border: placed ? `1px solid ${c.success}` : `2px dashed ${c.accent}`,
          background: placed ? "#ffffff" : c.accentSoft,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          boxShadow: placed ? "none" : `0 0 0 4px ${c.accentSoft}`,
          pointerEvents: "none"
        },
        children: placed ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("img", { src: signaturePng, alt: "Your signature", style: { maxWidth: "100%", maxHeight: "100%" } }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: { fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: c.accent, letterSpacing: 0.5 }, children: "Sign here" })
      }
    );
  };
  if (done) {
    return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Shell, { c, brandName, logoUrl, children: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(Centered, { c, children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(CheckIcon, { color: c.success }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("h1", { style: { margin: "16px 0 6px", fontSize: 20, fontWeight: 700, color: c.text }, children: "Signed \u2014 thank you" }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("p", { style: { margin: 0, fontSize: 14, color: c.textMuted }, children: [
        "Your signature has been recorded for \u201C",
        session.name,
        "\u201D. You can close this page."
      ] })
    ] }) });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(Shell, { c, brandName, logoUrl, children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 16 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("h1", { style: { margin: "0 0 4px", fontSize: 20, fontWeight: 700, color: c.text }, children: session.name }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("p", { style: { margin: 0, fontSize: 14, color: c.textMuted }, children: [
          session.signerName,
          ", please review the document and add your signature."
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Stepper, { c, steps: STEPS, current: stepIndex }),
      session.verification?.method && session.verification.method !== "NONE" && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
        "div",
        {
          style: {
            fontSize: 12,
            color: c.textMuted,
            background: c.surfaceMuted,
            border: `1px solid ${c.border}`,
            borderRadius: 8,
            padding: "8px 12px"
          },
          children: [
            "Identity verification: ",
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("strong", { style: { color: c.text }, children: vLabel(session.verification.method) }),
            session.verification.sentTo ? ` \xB7 sent to ${session.verification.sentTo}` : ""
          ]
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { display: "grid", gap: 16, gridTemplateColumns: "minmax(0,1fr)" }, className: "lukesign-ceremony-grid", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { minWidth: 0 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
            DocumentViewer,
            {
              source: pdfSource,
              fieldPage,
              initialPage: fieldPage,
              theme: t,
              accent,
              onError: onPdfError,
              onGeometry: (g, page) => {
                if (page === fieldPage) {
                  setPdfError(false);
                  setFieldGeom(g);
                }
              },
              renderOverlay,
              jumpLabel: "Go to signature"
            }
          ),
          pdfError && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { style: { marginTop: 8, fontSize: 13, color: c.danger }, children: "This document couldn\u2019t be displayed \u2014 please don\u2019t sign. Try reloading the page." }),
          rotated && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { style: { marginTop: 8, fontSize: 13, color: c.danger }, children: "This document has a rotated page and can\u2019t be signed here. Please contact the sender." })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
          "div",
          {
            style: {
              border: `1px solid ${c.border}`,
              borderRadius: 12,
              background: c.surface,
              padding: 16,
              alignSelf: "start"
            },
            children: [
              step === "review" && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("h2", { style: { margin: "0 0 6px", fontSize: 15, fontWeight: 700, color: c.text }, children: "Review the document" }),
                /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("p", { style: { margin: "0 0 16px", fontSize: 13, color: c.textMuted }, children: [
                  "Read through all pages. One signature is required, marked ",
                  /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("strong", { children: "Sign here" }),
                  "."
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(PrimaryBtn, { c, disabled: pdfError || rotated, onClick: () => setStep("adopt"), children: "Start signing" })
              ] }),
              step === "adopt" && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("h2", { style: { margin: "0 0 12px", fontSize: 15, fontWeight: 700, color: c.text }, children: "Add your signature" }),
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                  AdoptSignature,
                  {
                    signerName: session.signerName,
                    methods: adoptMethods,
                    onChange: setSignaturePng,
                    theme: t,
                    accent
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", gap: 8, marginTop: 16 }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(GhostBtn, { c, onClick: () => setStep("review"), children: "Back" }),
                  /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(PrimaryBtn, { c, disabled: !signaturePng, onClick: () => setStep("confirm"), children: "Apply signature" })
                ] })
              ] }),
              step === "confirm" && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("h2", { style: { margin: "0 0 12px", fontSize: 15, fontWeight: 700, color: c.text }, children: "Confirm & sign" }),
                /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("label", { style: { display: "block", marginBottom: 12 }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: { display: "block", marginBottom: 4, fontSize: 12, fontWeight: 600, color: c.textMuted }, children: "Full name" }),
                  /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                    "input",
                    {
                      value: typedName,
                      onChange: (e) => setTypedName(e.target.value),
                      style: {
                        width: "100%",
                        boxSizing: "border-box",
                        padding: "10px 12px",
                        fontSize: 14,
                        color: c.text,
                        background: c.surface,
                        border: `1px solid ${c.border}`,
                        borderRadius: 8
                      }
                    }
                  )
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("label", { style: { display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 16, fontSize: 13, color: c.textMuted }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                    "input",
                    {
                      type: "checkbox",
                      checked: consent,
                      onChange: (e) => setConsent(e.target.checked),
                      style: { marginTop: 2, width: 16, height: 16 }
                    }
                  ),
                  /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: "I agree to sign this document electronically and that my electronic signature is legally binding." })
                ] }),
                submitError && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { style: { margin: "0 0 12px", fontSize: 13, color: c.danger }, children: submitError }),
                /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", gap: 8 }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(GhostBtn, { c, onClick: () => setStep("adopt"), disabled: submitting, children: "Back" }),
                  /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(PrimaryBtn, { c, disabled: !canFinish, onClick: () => void submit(), children: submitting ? "Signing\u2026" : "Sign document" })
                ] })
              ] })
            ]
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("style", { children: `@media (min-width: 880px){.lukesign-ceremony-grid{grid-template-columns:minmax(0,1fr) 340px !important;align-items:start}}` })
  ] });
}
function Shell({ c, brandName, logoUrl, children }) {
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { minHeight: "100vh", background: c.bg, color: c.text }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
      "header",
      {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "14px 20px",
          borderBottom: `1px solid ${c.border}`,
          background: c.surface
        },
        children: [
          logoUrl ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("img", { src: logoUrl, alt: brandName, style: { height: 26 } }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: { fontSize: 16, fontWeight: 800, color: c.text }, children: brandName }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: { fontSize: 13, color: c.textFaint }, children: "Secure signing" })
        ]
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("main", { style: { maxWidth: 1100, margin: "0 auto", padding: "24px 20px 48px" }, children })
  ] });
}
function Stepper({ c, steps, current }) {
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: steps.map((s, i) => {
    const active = i === current;
    const past = i < current;
    const fill = past ? c.success : active ? c.accent : c.surfaceMuted;
    const fg = past || active ? "#ffffff" : c.textMuted;
    return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          "span",
          {
            style: {
              width: 24,
              height: 24,
              borderRadius: "50%",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontWeight: 700,
              background: fill,
              color: fg,
              border: active ? `2px solid ${c.accent}` : `1px solid ${c.border}`
            },
            children: past ? "\u2713" : i + 1
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: { fontSize: 13, fontWeight: active ? 700 : 500, color: active ? c.text : c.textMuted }, children: s.label })
      ] }),
      i < steps.length - 1 && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: { width: 24, height: 1, background: c.border } })
    ] }, s.key);
  }) });
}
function PrimaryBtn({ c, children, onClick, disabled }) {
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
    "button",
    {
      type: "button",
      onClick,
      disabled,
      style: {
        flex: 1,
        width: "100%",
        padding: "10px 16px",
        fontSize: 14,
        fontWeight: 600,
        color: c.accentText,
        background: c.accent,
        border: "none",
        borderRadius: 8,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1
      },
      children
    }
  );
}
function GhostBtn({ c, children, onClick, disabled }) {
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
    "button",
    {
      type: "button",
      onClick,
      disabled,
      style: {
        padding: "10px 16px",
        fontSize: 14,
        fontWeight: 600,
        color: c.text,
        background: "transparent",
        border: `1px solid ${c.border}`,
        borderRadius: 8,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1
      },
      children
    }
  );
}
function Centered({ c, children }) {
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
    "div",
    {
      style: {
        maxWidth: 420,
        margin: "48px auto 0",
        textAlign: "center",
        background: c.surface,
        border: `1px solid ${c.border}`,
        borderRadius: 12,
        padding: 32
      },
      children
    }
  );
}
function CheckIcon({ color }) {
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("svg", { width: "44", height: "44", viewBox: "0 0 24 24", fill: "none", style: { display: "block", margin: "0 auto" }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("circle", { cx: "12", cy: "12", r: "11", stroke: color, strokeWidth: "1.5" }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("path", { d: "M7 12.5l3.2 3.2L17 9", stroke: color, strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" })
  ] });
}
function vLabel(m) {
  return m === "EMAIL_OTP" ? "Email code" : m === "SMS_OTP" ? "SMS code" : m === "IDV" ? "ID verification" : m;
}

// src/index.ts
__reExport(index_exports, require("@lukeflow/sign-core"), module.exports);
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AdoptSignature,
  DEFAULT_ACCENT,
  DocumentViewer,
  PdfView,
  SignaturePad,
  SigningCeremony,
  hexA,
  palette,
  useCeremonyTheme,
  ...require("@lukeflow/sign-core")
});
//# sourceMappingURL=index.cjs.map