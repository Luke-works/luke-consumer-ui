import { ReactNode, useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  position?: "top" | "bottom";
  className?: string;
}

const MAX_W = 256; // px — matches max-w-[16rem]
const EDGE = 8; // keep this far from the viewport edge

/**
 * Lightweight hover/focus tooltip. Wrap any trigger element; the bubble shows on hover or keyboard
 * focus of the wrapper's contents.
 *
 * The bubble is rendered into a PORTAL on document.body with `position: fixed`, NOT as an absolutely
 * positioned child. That's deliberate: builder pages wrap their toolbar in `overflow-x-clip` (to stop
 * native drag-and-drop edge auto-scroll), which would otherwise CLIP a tooltip that extends past the
 * trigger — the right-edge buttons (Publish / Embed) lost their tooltips this way. A portal escapes any
 * ancestor clipping, and the center is clamped to the viewport so it can neither be cut off nor push the
 * page horizontally.
 */
export default function Tooltip({ content, children, position = "bottom", className = "" }: TooltipProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const show = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const center = r.left + r.width / 2;
    // Clamp the center so a max-width bubble stays fully on-screen (fixes right-edge clipping).
    const left = Math.min(Math.max(center, MAX_W / 2 + EDGE), window.innerWidth - MAX_W / 2 - EDGE);
    const top = position === "top" ? r.top - EDGE : r.bottom + EDGE;
    setPos({ left, top });
  }, [position]);

  const hide = useCallback(() => setPos(null), []);

  return (
    <span
      ref={ref}
      className={`inline-flex ${className}`}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {pos &&
        createPortal(
          <span
            role="tooltip"
            style={{
              position: "fixed",
              left: pos.left,
              top: pos.top,
              maxWidth: MAX_W,
              transform: `translateX(-50%)${position === "top" ? " translateY(-100%)" : ""}`,
            }}
            className="pointer-events-none z-[9999] w-max rounded-lg bg-gray-900 px-3 py-2 text-left text-xs font-normal leading-relaxed text-white shadow-theme-lg dark:bg-gray-700"
          >
            {content}
          </span>,
          document.body,
        )}
    </span>
  );
}
