import { useEffect, useRef } from "react";

/**
 * Self-contained draw-to-sign canvas (mouse + touch). Emits the drawn signature as a PNG
 * data URL via onChange (empty string when cleared). Standalone so the public SignPage has
 * no dependency on the authed FormRenderer.
 */
export default function SignaturePad({
  onChange,
  penColor = "#111827",
  width = 500,
  height = 180,
}: {
  onChange: (pngDataUrl: string) => void;
  penColor?: string;
  width?: number;
  height?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  // Paint a white background once so the exported PNG isn't transparent (renders cleanly in the PDF).
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, c.width, c.height);
    }
  }, []);

  const point = (e: React.MouseEvent | React.TouchEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const t = "touches" in e ? e.touches[0] : (e as React.MouseEvent);
    // Map CSS coords to the canvas's intrinsic pixel grid.
    const scaleX = ref.current!.width / r.width;
    const scaleY = ref.current!.height / r.height;
    return { x: (t.clientX - r.left) * scaleX, y: (t.clientY - r.top) * scaleY };
  };

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    drawing.current = true;
    const ctx = ref.current!.getContext("2d")!;
    const { x, y } = point(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const move = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = ref.current!.getContext("2d")!;
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
    onChange(ref.current!.toDataURL("image/png"));
  };

  const clear = () => {
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    onChange("");
  };

  return (
    <div>
      <canvas
        ref={ref}
        width={width}
        height={height}
        role="img"
        aria-label="Signature drawing area"
        className="w-full max-w-full touch-none rounded-lg border border-gray-300 bg-white dark:border-gray-700"
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
      <button
        type="button"
        onClick={clear}
        className="mt-1 text-xs text-gray-500 hover:text-error-500"
      >
        Clear
      </button>
    </div>
  );
}
