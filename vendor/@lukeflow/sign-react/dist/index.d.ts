import * as react from 'react';
import { ReactNode } from 'react';
import { PdfGeometry, SigningSession, SubmitSignatureInput } from '@lukeflow/sign-core';
export * from '@lukeflow/sign-core';

/**
 * Renders one PDF page (from an uploaded File or a data:/URL string) at a fixed CSS width,
 * with an optional absolutely-positioned overlay and a click handler reporting CSS-pixel
 * coordinates relative to the page. Annotation/text layers are off (no extra CSS, faster).
 * Pairs with @lukeflow/sign-core geometry helpers (placeField / fieldToCssRect).
 */
declare function PdfView({ source, pageNumber, width, onGeometry, onClick, onError, overlay, }: {
    source: File | string;
    pageNumber?: number;
    width: number;
    onGeometry?: (g: PdfGeometry) => void;
    onClick?: (p: {
        cssX: number;
        cssY: number;
    }) => void;
    onError?: (e: unknown) => void;
    overlay?: ReactNode;
}): react.JSX.Element;

/**
 * Self-contained draw-to-sign canvas (mouse + touch). Emits the drawn signature as a PNG
 * data URL via onChange (empty string when cleared). Inline-styled so it needs no CSS
 * framework; the host can wrap/theme it.
 */
declare function SignaturePad({ onChange, penColor, width, height, }: {
    onChange: (pngDataUrl: string) => void;
    penColor?: string;
    width?: number;
    height?: number;
}): react.JSX.Element;

type CeremonyTheme = "light" | "dark";
type Palette = {
    bg: string;
    surface: string;
    surfaceMuted: string;
    border: string;
    borderStrong: string;
    text: string;
    textMuted: string;
    textFaint: string;
    accent: string;
    accentHover: string;
    accentText: string;
    accentSoft: string;
    danger: string;
    dangerSoft: string;
    success: string;
    successSoft: string;
    warning: string;
    warningSoft: string;
    shadow: string;
};
/** TailAdmin brand-500 — the consumer-ui default accent; override via the `accent` prop. */
declare const DEFAULT_ACCENT = "#465fff";
declare function palette(theme: CeremonyTheme, accent?: string): Palette;
/** Apply an alpha to a #rrggbb hex; falls back to the color itself for non-hex inputs. */
declare function hexA(hex: string, alpha: number): string;
/**
 * Resolve the effective theme. If `override` is given it wins; otherwise we read the
 * document's `.dark` class and `prefers-color-scheme`, re-evaluating when either changes.
 */
declare function useCeremonyTheme(override?: CeremonyTheme): CeremonyTheme;

type DocumentViewerProps = {
    /** PDF source: an uploaded File or a data:/http(s) URL string. */
    source: File | string;
    /** CSS width (px) of the page at 100% zoom. The page scales from here. */
    baseWidth?: number;
    /** 0-based page index to start on (and the target of the "Go to field" jump). */
    fieldPage?: number;
    /** Initial page (0-based). Defaults to fieldPage ?? 0. */
    initialPage?: number;
    minZoom?: number;
    maxZoom?: number;
    /** Show the page-nav + zoom toolbar (default true). */
    toolbar?: boolean;
    /** Click handler for placement — fires only when provided (adds a crosshair capture layer). */
    onClick?: (p: {
        page: number;
        cssX: number;
        cssY: number;
        geometry: PdfGeometry;
    }) => void;
    /** Overlay for the currently-rendered page, positioned over it (absolute, inset 0). */
    renderOverlay?: (ctx: {
        page: number;
        geometry: PdfGeometry;
    }) => ReactNode;
    /** Called once per page render with that page's geometry (current page). */
    onGeometry?: (g: PdfGeometry, page: number) => void;
    onError?: (e: unknown) => void;
    theme?: CeremonyTheme;
    accent?: string;
    /** Label for the "jump to field" button (when fieldPage is set). */
    jumpLabel?: string;
};
/**
 * An enterprise-grade PDF viewer: multi-page navigation, zoom, an optional click-capture
 * layer for field placement, and a per-page overlay slot. Built directly on react-pdf so it
 * knows the page count; pairs with @lukeflow/sign-core geometry helpers. Inline-styled.
 */
declare function DocumentViewer({ source, baseWidth, fieldPage, initialPage, minZoom, maxZoom, toolbar, onClick, renderOverlay, onGeometry, onError, theme, accent, jumpLabel, }: DocumentViewerProps): react.JSX.Element;

type AdoptMethod = "draw" | "type" | "upload";
type AdoptSignatureProps = {
    /** Pre-fills the typed signature. */
    signerName?: string;
    /** Which methods to offer, in order. Default: all three. */
    methods?: AdoptMethod[];
    /** Emits the adopted signature as a PNG data URL ("" when none/cleared). */
    onChange: (pngDataUrl: string) => void;
    onMethodChange?: (m: AdoptMethod) => void;
    /** Logical signature size in CSS px (the PNG renders at 2× for crispness). */
    width?: number;
    height?: number;
    /** Max bytes for an uploaded image (default 5 MB). */
    maxUploadBytes?: number;
    theme?: CeremonyTheme;
    accent?: string;
};
declare function AdoptSignature({ signerName, methods, onChange, onMethodChange, width, height, maxUploadBytes, theme, accent, }: AdoptSignatureProps): react.JSX.Element;

type SigningCeremonyProps = {
    session: SigningSession;
    /** Submit the adopted signature. Resolve to finish; reject to surface an error. */
    onSubmit: (input: SubmitSignatureInput) => Promise<void>;
    onError?: (e: unknown) => void;
    brandName?: string;
    logoUrl?: string;
    accent?: string;
    theme?: CeremonyTheme;
    adoptMethods?: AdoptMethod[];
    /** Map an error to a signer-facing message (host owns API error wording). */
    errorMessage?: (e: unknown) => string;
};
/**
 * The full guided signing ceremony: review the document, adopt a signature
 * (draw / type / upload), see it placed in the field, give consent, and finish.
 * Self-contained and inline-styled — the host fetches the session and supplies onSubmit.
 */
declare function SigningCeremony({ session, onSubmit, onError, brandName, logoUrl, accent, theme, adoptMethods, errorMessage, }: SigningCeremonyProps): react.JSX.Element;

export { type AdoptMethod, AdoptSignature, type AdoptSignatureProps, type CeremonyTheme, DEFAULT_ACCENT, DocumentViewer, type DocumentViewerProps, type Palette, PdfView, SignaturePad, SigningCeremony, type SigningCeremonyProps, hexA, palette, useCeremonyTheme };
