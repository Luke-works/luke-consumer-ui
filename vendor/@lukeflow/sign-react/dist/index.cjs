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
  SignatureBuilder: () => SignatureBuilder_default,
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
  onNumPages,
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
              onLoadSuccess: (d) => {
                setNumPages(d.numPages);
                onNumPages?.(d.numPages);
              },
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

// src/SignatureBuilder.tsx
var import_react7 = require("react");
var import_sign_core2 = require("@lukeflow/sign-core");
var import_jsx_runtime6 = require("react/jsx-runtime");
var FIELD_SIZE = {
  SIGNATURE: { w: 160, h: 50 },
  INITIALS: { w: 72, h: 44 },
  DATE: { w: 120, h: 28 },
  NAME: { w: 160, h: 28 },
  TEXT: { w: 160, h: 32 }
};
var VERIFY_OPTIONS = [
  { value: "NONE", label: "No verification" },
  { value: "EMAIL_OTP", label: "Email code" },
  { value: "SMS_OTP", label: "SMS code" },
  { value: "IDV", label: "ID verification" }
];
var SignatureBuilder = (0, import_react7.forwardRef)(function SignatureBuilder2({ initialSchema, documentSource, onChange, onUploadDocument, readOnly = false, aside, theme, accent }, ref) {
  const t = useCeremonyTheme(theme);
  const c = palette(t, accent);
  const [schema, setSchemaState] = (0, import_react7.useState)(initialSchema);
  const [localFile, setLocalFile] = (0, import_react7.useState)(null);
  const [activeSignerId, setActiveSignerId] = (0, import_react7.useState)(initialSchema.signers[0]?.id ?? "signer-1");
  const [tool, setTool] = (0, import_react7.useState)(null);
  const [selectedFieldId, setSelectedFieldId] = (0, import_react7.useState)(null);
  const [rotatedWarn, setRotatedWarn] = (0, import_react7.useState)(false);
  const [uploadErr, setUploadErr] = (0, import_react7.useState)(null);
  const schemaRef = (0, import_react7.useRef)(schema);
  schemaRef.current = schema;
  const commit = (0, import_react7.useCallback)(
    (next) => {
      setSchemaState(next);
      schemaRef.current = next;
      onChange?.(next);
    },
    [onChange]
  );
  (0, import_react7.useImperativeHandle)(
    ref,
    () => ({
      getSchema: () => schemaRef.current,
      setSchema: (s) => {
        setSchemaState(s);
        schemaRef.current = s;
        if (!s.signers.some((sr) => sr.id === activeSignerId)) setActiveSignerId(s.signers[0]?.id ?? "");
      }
    }),
    [activeSignerId]
  );
  const docSource = localFile ?? documentSource ?? null;
  const problems = (0, import_react7.useMemo)(() => (0, import_sign_core2.validateSignatureSchema)(schema), [schema]);
  const errorCount = problems.filter((p) => p.level === "error").length;
  const signerColor = (id) => schema.signers.find((s) => s.id === id)?.color ?? c.accent;
  const addSigner = () => {
    const id = (0, import_sign_core2.nextId)("signer", schema.signers);
    const order = schema.signers.length + 1;
    const color = import_sign_core2.SIGNER_COLORS[schema.signers.length % import_sign_core2.SIGNER_COLORS.length];
    const signer = { id, label: `Signer ${order}`, order, verify: "NONE", color };
    commit({ ...schema, signers: [...schema.signers, signer] });
    setActiveSignerId(id);
  };
  const updateSigner = (id, patch) => commit({ ...schema, signers: schema.signers.map((s) => s.id === id ? { ...s, ...patch } : s) });
  const removeSigner = (id) => {
    if (schema.signers.length <= 1) return;
    const signers = schema.signers.filter((s) => s.id !== id);
    const fields = schema.fields.filter((f) => f.signerId !== id);
    commit({ ...schema, signers, fields });
    if (activeSignerId === id) setActiveSignerId(signers[0]?.id ?? "");
  };
  const placeNewField = (p) => {
    if (!tool || readOnly) return;
    if ((0, import_sign_core2.isRotated)(p.geometry)) {
      setRotatedWarn(true);
      return;
    }
    setRotatedWarn(false);
    const rect = (0, import_sign_core2.placeField)(p.geometry, p.cssX, p.cssY, FIELD_SIZE[tool], p.page);
    const field = {
      id: (0, import_sign_core2.nextId)("field", schema.fields),
      signerId: activeSignerId,
      type: tool,
      page: rect.page,
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: rect.h,
      required: true
    };
    commit({ ...schema, fields: [...schema.fields, field] });
    setSelectedFieldId(field.id);
    setTool(null);
  };
  const moveField = (id, x, y) => commit({ ...schema, fields: schema.fields.map((f) => f.id === id ? { ...f, x, y } : f) });
  const addVariable = () => commit({ ...schema, variables: [...schema.variables, { key: "", label: "", required: false }] });
  const updateVariable = (i, patch) => commit({ ...schema, variables: schema.variables.map((v, idx) => idx === i ? { ...v, ...patch } : v) });
  const removeVariable = (i) => commit({ ...schema, variables: schema.variables.filter((_, idx) => idx !== i) });
  const removeField = (id) => {
    commit({ ...schema, fields: schema.fields.filter((f) => f.id !== id) });
    if (selectedFieldId === id) setSelectedFieldId(null);
  };
  const onPickFile = async (file) => {
    setUploadErr(null);
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setUploadErr("Please choose a PDF.");
      return;
    }
    setLocalFile(file);
    commit({ ...schema, document: { ...schema.document, name: file.name, key: void 0 } });
    if (onUploadDocument) {
      try {
        const up = await onUploadDocument(file);
        commit({
          ...schemaRef.current,
          document: { key: up.key, name: up.name || file.name, pageCount: up.pageCount }
        });
      } catch {
        setUploadErr("Upload failed. Try again.");
      }
    }
  };
  const renderOverlay = ({ page, geometry }) => /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_jsx_runtime6.Fragment, { children: schema.fields.filter((f) => f.page === page).map((f) => /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
    FieldBox,
    {
      c,
      field: f,
      geometry,
      color: signerColor(f.signerId),
      signerLabel: schema.signers.find((s) => s.id === f.signerId)?.label ?? "?",
      selected: selectedFieldId === f.id,
      interactive: !tool && !readOnly,
      onSelect: () => setSelectedFieldId(f.id),
      onMove: (x, y) => moveField(f.id, x, y),
      onDelete: () => removeField(f.id)
    },
    f.id
  )) });
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
    "div",
    {
      style: {
        display: "grid",
        gridTemplateColumns: aside ? "248px minmax(0,1fr) 300px" : "248px minmax(0,1fr)",
        gap: 12,
        alignItems: "start",
        color: c.text,
        background: c.bg
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("aside", { style: { display: "flex", flexDirection: "column", gap: 16, padding: 12, border: `1px solid ${c.border}`, borderRadius: 12, background: c.surface }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(Section, { c, title: "Signers", children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: schema.signers.map((s) => /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
              SignerRow,
              {
                c,
                signer: s,
                active: s.id === activeSignerId,
                canRemove: schema.signers.length > 1 && !readOnly,
                readOnly,
                onActivate: () => setActiveSignerId(s.id),
                onChange: (patch) => updateSigner(s.id, patch),
                onRemove: () => removeSigner(s.id)
              },
              s.id
            )) }),
            !readOnly && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { type: "button", onClick: addSigner, style: ghost(c), children: "+ Add signer" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(Section, { c, title: "Fields", children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("p", { style: { margin: "0 0 8px", fontSize: 11, color: c.textFaint }, children: [
              "Pick a field, then click the document to place it for",
              " ",
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("strong", { style: { color: signerColor(activeSignerId) }, children: schema.signers.find((s) => s.id === activeSignerId)?.label ?? "the signer" }),
              "."
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }, children: import_sign_core2.FIELD_TYPES.map((ft) => /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
              "button",
              {
                type: "button",
                disabled: readOnly,
                onClick: () => setTool((cur) => cur === ft ? null : ft),
                style: {
                  padding: "8px 6px",
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: 8,
                  cursor: readOnly ? "not-allowed" : "pointer",
                  color: tool === ft ? c.accentText : c.text,
                  background: tool === ft ? c.accent : c.surfaceMuted,
                  border: `1px solid ${tool === ft ? c.accent : c.border}`,
                  opacity: readOnly ? 0.5 : 1
                },
                children: import_sign_core2.FIELD_TYPE_LABEL[ft]
              },
              ft
            )) }),
            tool && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("p", { style: { margin: "8px 0 0", fontSize: 11, color: c.accent }, children: [
              "Click the document to drop a ",
              import_sign_core2.FIELD_TYPE_LABEL[tool],
              " field. Esc/click again to cancel."
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(Section, { c, title: "Routing", children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { style: { display: "flex", gap: 6 }, children: ["sequential", "parallel"].map((r) => /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
              "button",
              {
                type: "button",
                disabled: readOnly,
                onClick: () => commit({ ...schema, routing: r }),
                style: {
                  flex: 1,
                  padding: "8px 6px",
                  fontSize: 12,
                  fontWeight: 600,
                  textTransform: "capitalize",
                  borderRadius: 8,
                  cursor: readOnly ? "not-allowed" : "pointer",
                  color: schema.routing === r ? c.accent : c.textMuted,
                  background: schema.routing === r ? c.accentSoft : "transparent",
                  border: `1px solid ${schema.routing === r ? c.accent : c.border}`
                },
                children: r
              },
              r
            )) }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { style: { margin: "8px 0 0", fontSize: 11, color: c.textFaint }, children: schema.routing === "sequential" ? "Signers sign one after another, in order." : "All signers sign in any order." })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(Section, { c, title: "Data attributes", children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("p", { style: { margin: "0 0 8px", fontSize: 11, color: c.textFaint }, children: [
              "Values a campaign supplies at send time, usable as ",
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("code", { children: "{{key}}" }),
              "."
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: schema.variables.map((v, i) => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: { border: `1px solid ${c.border}`, borderRadius: 8, padding: 8, background: c.surfaceMuted }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 6 }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
                  "input",
                  {
                    value: v.key,
                    disabled: readOnly,
                    placeholder: "key (e.g. fullName)",
                    onChange: (e) => updateVariable(i, { key: e.target.value.replace(/\s+/g, "") }),
                    style: { flex: 1, minWidth: 0, fontSize: 12, fontFamily: "monospace", color: c.text, background: c.surface, border: `1px solid ${c.border}`, borderRadius: 6, padding: "4px 6px" }
                  }
                ),
                !readOnly && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
                  "button",
                  {
                    type: "button",
                    onClick: () => removeVariable(i),
                    "aria-label": "Remove attribute",
                    style: { border: "none", background: "transparent", color: c.textFaint, cursor: "pointer", fontSize: 14 },
                    children: "\xD7"
                  }
                )
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
                "input",
                {
                  value: v.label,
                  disabled: readOnly,
                  placeholder: "Label",
                  onChange: (e) => updateVariable(i, { label: e.target.value }),
                  style: { marginTop: 6, width: "100%", boxSizing: "border-box", fontSize: 12, color: c.text, background: c.surface, border: `1px solid ${c.border}`, borderRadius: 6, padding: "4px 6px" }
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("label", { style: { display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 11, color: c.textMuted }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("input", { type: "checkbox", checked: !!v.required, disabled: readOnly, onChange: (e) => updateVariable(i, { required: e.target.checked }) }),
                "Required"
              ] })
            ] }, i)) }),
            !readOnly && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { type: "button", onClick: addVariable, style: ghost(c), children: "+ Add attribute" })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("main", { style: { minWidth: 0 }, children: [
          docSource ? /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { onKeyDown: (e) => e.key === "Escape" && setTool(null), tabIndex: -1, children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
              DocumentViewer,
              {
                source: docSource,
                theme: t,
                accent,
                onError: () => setUploadErr("This document couldn\u2019t be displayed."),
                onNumPages: (n) => {
                  if (schema.document.pageCount !== n) {
                    commit({ ...schemaRef.current, document: { ...schemaRef.current.document, pageCount: n } });
                  }
                },
                onClick: tool && !readOnly ? placeNewField : void 0,
                renderOverlay
              }
            ),
            rotatedWarn && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { style: { marginTop: 8, fontSize: 13, color: c.danger }, children: "That page is rotated \u2014 fields can\u2019t be placed on it accurately. Use an un-rotated page." })
          ] }) : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Dropzone, { c, readOnly, onPick: onPickFile, error: uploadErr }),
          docSource && uploadErr && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { style: { marginTop: 8, fontSize: 13, color: c.danger }, children: uploadErr }),
          docSource && !readOnly && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("label", { style: { display: "inline-block", marginTop: 10, fontSize: 12, color: c.accent, cursor: "pointer" }, children: [
            "Replace document",
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("input", { type: "file", accept: "application/pdf,.pdf", style: { display: "none" }, onChange: (e) => void onPickFile(e.target.files?.[0] ?? null) })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("aside", { style: { display: aside ? "flex" : "none", flexDirection: "column", gap: 12 }, children: [
          aside,
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(ProblemsPanel, { c, problems, errorCount })
        ] }),
        !aside && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { style: { gridColumn: "1 / -1" }, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(ProblemsPanel, { c, problems, errorCount }) })
      ]
    }
  );
});
var SignatureBuilder_default = SignatureBuilder;
function FieldBox({
  c,
  field,
  geometry,
  color,
  signerLabel,
  selected,
  interactive,
  onSelect,
  onMove,
  onDelete
}) {
  const r = (0, import_sign_core2.fieldToCssRect)(geometry, field);
  const drag = (0, import_react7.useRef)(null);
  const onPointerDown = (e) => {
    if (!interactive) return;
    e.stopPropagation();
    onSelect();
    drag.current = { startX: e.clientX, startY: e.clientY, fx: field.x, fy: field.y };
    e.target.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    const dxCss = e.clientX - drag.current.startX;
    const dyCss = e.clientY - drag.current.startY;
    const dxPdf = dxCss * geometry.pdfW / geometry.cssW;
    const dyPdf = dyCss * geometry.pdfH / geometry.cssH;
    const nx = Math.max(0, Math.min(geometry.pdfW - field.w, drag.current.fx + dxPdf));
    const ny = Math.max(0, Math.min(geometry.pdfH - field.h, drag.current.fy + dyPdf));
    onMove(nx, ny);
  };
  const endDrag = (e) => {
    if (drag.current) {
      drag.current = null;
      try {
        e.target.releasePointerCapture(e.pointerId);
      } catch {
      }
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
    "div",
    {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      style: {
        position: "absolute",
        left: r.left,
        top: r.top,
        width: r.width,
        height: r.height,
        borderRadius: 4,
        border: `2px solid ${color}`,
        background: hexWithAlpha(color, selected ? 0.28 : 0.16),
        boxShadow: selected ? `0 0 0 2px ${c.surface}, 0 0 0 4px ${color}` : "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "visible",
        cursor: interactive ? "move" : "default",
        pointerEvents: interactive ? "auto" : "none",
        touchAction: "none"
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { style: { fontSize: 9, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: 0.3, padding: "0 2px", textAlign: "center", lineHeight: 1.1 }, children: [
          import_sign_core2.FIELD_TYPE_LABEL[field.type],
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("br", {}),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { style: { fontWeight: 500, opacity: 0.85 }, children: signerLabel })
        ] }),
        selected && interactive && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
          "button",
          {
            type: "button",
            onPointerDown: (e) => e.stopPropagation(),
            onClick: (e) => {
              e.stopPropagation();
              onDelete();
            },
            "aria-label": "Remove field",
            style: {
              position: "absolute",
              top: -10,
              right: -10,
              width: 20,
              height: 20,
              borderRadius: "50%",
              border: "none",
              background: c.danger,
              color: "#fff",
              fontSize: 12,
              lineHeight: "20px",
              cursor: "pointer",
              padding: 0
            },
            children: "\xD7"
          }
        )
      ]
    }
  );
}
function SignerRow({
  c,
  signer,
  active,
  canRemove,
  readOnly,
  onActivate,
  onChange,
  onRemove
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
    "div",
    {
      onClick: onActivate,
      style: {
        border: `1px solid ${active ? signer.color ?? c.accent : c.border}`,
        borderRadius: 8,
        padding: 8,
        background: active ? hexWithAlpha(signer.color ?? c.accent, 0.1) : c.surfaceMuted,
        cursor: "pointer"
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 6 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { style: { width: 10, height: 10, borderRadius: "50%", background: signer.color ?? c.accent, flexShrink: 0 } }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
            "input",
            {
              value: signer.label,
              disabled: readOnly,
              onChange: (e) => onChange({ label: e.target.value }),
              onClick: (e) => e.stopPropagation(),
              style: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: c.text, background: "transparent", border: "none", outline: "none" }
            }
          ),
          canRemove && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
            "button",
            {
              type: "button",
              onClick: (e) => {
                e.stopPropagation();
                onRemove();
              },
              "aria-label": "Remove signer",
              style: { border: "none", background: "transparent", color: c.textFaint, cursor: "pointer", fontSize: 14 },
              children: "\xD7"
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
          "select",
          {
            value: signer.verify ?? "NONE",
            disabled: readOnly,
            onClick: (e) => e.stopPropagation(),
            onChange: (e) => onChange({ verify: e.target.value }),
            style: { marginTop: 6, width: "100%", fontSize: 11, color: c.textMuted, background: c.surface, border: `1px solid ${c.border}`, borderRadius: 6, padding: "4px 6px" },
            children: VERIFY_OPTIONS.map((o) => /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: o.value, children: o.label }, o.value))
          }
        )
      ]
    }
  );
}
function Dropzone({ c, readOnly, onPick, error }) {
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
    "label",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        minHeight: "50vh",
        textAlign: "center",
        border: `2px dashed ${c.borderStrong}`,
        borderRadius: 12,
        background: c.surfaceMuted,
        cursor: readOnly ? "not-allowed" : "pointer",
        color: c.textMuted
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { style: { fontSize: 15, fontWeight: 700, color: c.text }, children: "Upload the document to sign" }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { style: { fontSize: 13 }, children: "Drop a PDF here or click to choose" }),
        error && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { style: { fontSize: 13, color: c.danger }, children: error }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("input", { type: "file", accept: "application/pdf,.pdf", disabled: readOnly, style: { display: "none" }, onChange: (e) => onPick(e.target.files?.[0] ?? null) })
      ]
    }
  );
}
function ProblemsPanel({ c, problems, errorCount }) {
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: { border: `1px solid ${c.border}`, borderRadius: 12, background: c.surface, padding: 12 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: problems.length ? 8 : 0 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { style: { fontSize: 13, fontWeight: 700, color: c.text }, children: "Problems" }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
        "span",
        {
          style: {
            fontSize: 11,
            fontWeight: 700,
            padding: "1px 8px",
            borderRadius: 999,
            color: errorCount ? c.danger : c.success,
            background: errorCount ? c.dangerSoft : c.successSoft
          },
          children: errorCount ? `${errorCount} error${errorCount > 1 ? "s" : ""}` : "Ready"
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("ul", { style: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }, children: problems.map((p, i) => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("li", { style: { fontSize: 12, color: p.level === "error" ? c.danger : c.warning, display: "flex", gap: 6 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { "aria-hidden": true, children: p.level === "error" ? "\u26D4" : "\u26A0\uFE0F" }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: p.message })
    ] }, i)) })
  ] });
}
function Section({ c, title, children }) {
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("section", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("h3", { style: { margin: "0 0 8px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: c.textFaint }, children: title }),
    children
  ] });
}
function ghost(c) {
  return {
    marginTop: 8,
    width: "100%",
    padding: "8px 10px",
    fontSize: 12,
    fontWeight: 600,
    color: c.accent,
    background: c.accentSoft,
    border: "none",
    borderRadius: 8,
    cursor: "pointer"
  };
}
function hexWithAlpha(hex, alpha) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const h = m[1];
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${alpha})`;
}

// src/index.ts
__reExport(index_exports, require("@lukeflow/sign-core"), module.exports);
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AdoptSignature,
  DEFAULT_ACCENT,
  DocumentViewer,
  PdfView,
  SignatureBuilder,
  SignaturePad,
  SigningCeremony,
  hexA,
  palette,
  useCeremonyTheme,
  ...require("@lukeflow/sign-core")
});
//# sourceMappingURL=index.cjs.map