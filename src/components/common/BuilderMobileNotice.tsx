import { Monitor } from "lucide-react";

/**
 * Small-screen fallback for the drag-and-drop builders. The DnD canvases (form,
 * workflow, signature) can't be operated at phone widths, so below `sm` we show
 * this notice instead of a cramped, unusable canvas.
 *
 * Usage: render this alongside the builder and put `hidden sm:…` on the builder's
 * own container so exactly one of the two shows at any width:
 *
 *   <BuilderMobileNotice label="form builder" />
 *   <div className="hidden sm:block">…builder…</div>
 */
export default function BuilderMobileNotice({ label = "builder" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-gray-200 bg-white px-6 py-12 text-center sm:hidden dark:border-gray-800 dark:bg-white/[0.03]">
      <Monitor className="size-8 text-gray-400" />
      <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
        Best on a larger screen
      </h2>
      <p className="max-w-xs text-sm text-gray-500 dark:text-gray-400">
        The {label} needs room to drag and drop. Rotate your device to landscape, or open
        this on a tablet or desktop to edit.
      </p>
    </div>
  );
}
