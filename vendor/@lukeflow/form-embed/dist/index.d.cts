/**
 * `@lukeflow/form-embed` — a tiny, dependency-free SDK for embedding a Lukeflow form on ANY
 * website. It mounts the public form surface (`<host>/embed/:token`) in a CROSS-ORIGIN iframe and
 * runs a secure `postMessage` bridge between the host page and the iframe.
 *
 * Two entry points:
 *  - {@link createEmbed} — HOST side (the third-party site / the builder's "copy embed code" snippet).
 *  - {@link connectEmbedFrame} — IFRAME side (the form page calls this to emit ready/resize/submitted/error).
 *
 * SECURITY (the bridge):
 *  - The host only accepts a message when it comes from the iframe's OWN window AND from the form
 *    host's exact origin AND carries the per-embed nonce — so a sibling frame or a malicious page
 *    can't spoof events.
 *  - The iframe learns the parent origin from the host's `init` handshake and posts events ONLY back
 *    to that origin (never `*`) — so embedded form events don't leak to other frames.
 *  - The data that crosses is non-sensitive (height, a ready/submitted/error signal, the new
 *    instance id) — never field values.
 *  - Clickjacking is NOT solved here (a public embed is framable by design); restrict who may frame
 *    the form with a `frame-ancestors` CSP at the gateway (separate, server-side).
 *
 * @packageDocumentation
 */
interface EmbedOptions {
    /** The signed embed token (from the builder's "Copy embed code"). */
    token: string;
    /** Where to mount: a CSS selector or an element. */
    target: string | HTMLElement;
    /**
     * The origin serving the form, e.g. `"https://forms.acme.com"`. Defaults to the origin the embed
     * script itself was loaded from (so a hosted `embed.js` "just works"); set explicitly otherwise.
     */
    host?: string;
    /** Grow the iframe to its content height (default `true`). */
    autoResize?: boolean;
    /** Accessible iframe title (default `"Form"`). */
    title?: string;
    /** Extra `sandbox` tokens. Omit to not sandbox (the form app needs its own origin); opt in for strictness. */
    sandbox?: string;
    onReady?: () => void;
    onResize?: (height: number) => void;
    onSubmit?: (event: {
        instanceId: string;
    }) => void;
    onError?: (message: string) => void;
}
interface EmbedHandle {
    /** The created iframe element. */
    readonly iframe: HTMLIFrameElement;
    /** Tear down: remove the listener and the iframe. */
    destroy(): void;
}
/**
 * Mount a form in a cross-origin iframe with the secure bridge. Returns a handle to tear it down.
 * Throws if `target` can't be resolved.
 */
declare function createEmbed(options: EmbedOptions): EmbedHandle;
/**
 * Auto-initialize from the script tag's data attributes, so a host can embed with zero JS:
 *
 * ```html
 * <div data-lukeform-token="TOKEN"></div>
 * <script src="https://forms.acme.com/embed.js" data-lukeform-auto></script>
 * ```
 *
 * Each element with `[data-lukeform-token]` becomes an embed (host defaults to the script's origin).
 */
declare function autoEmbed(): EmbedHandle[];
interface FrameBridge {
    /** Signal the form is loaded + rendered. */
    ready(): void;
    /** Signal a successful submission (the new instance id). */
    submitted(instanceId: string): void;
    /** Signal a load/submit error. */
    error(message: string): void;
    /** Stop the bridge (removes listeners + the resize observer). */
    destroy(): void;
}
/**
 * The IFRAME-side bridge (the form page calls this). It waits for the host's `init` handshake to
 * learn the parent origin + nonce, then posts events ONLY to that origin. When not framed it is a
 * no-op, so the same page works standalone. Auto-reports content height on resize (default on).
 */
declare function connectEmbedFrame(opts?: {
    autoResize?: boolean;
    element?: HTMLElement;
}): FrameBridge;

export { type EmbedHandle, type EmbedOptions, type FrameBridge, autoEmbed, connectEmbedFrame, createEmbed };
