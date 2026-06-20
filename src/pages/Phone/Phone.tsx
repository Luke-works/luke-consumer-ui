import PageMeta from "../../components/common/PageMeta";
import { PhoneIcon } from "../../icons";

export default function Phone() {
  return (
    <>
      <PageMeta
        title="Phone | Lukeflow"
        description="Phone - Lukeflow, an orchestrator for a better future."
      />
      <div className="flex min-h-[60vh] flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-16 text-center dark:border-gray-800 dark:bg-white/[0.03]">
        <span className="flex size-12 items-center justify-center rounded-full bg-gray-100 text-gray-400 dark:bg-white/10">
          <PhoneIcon className="size-6" />
        </span>
        <span className="mt-4 inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-400/10 dark:text-amber-300">
          Coming soon
        </span>
        <h1 className="mt-3 text-2xl font-semibold text-gray-800 dark:text-white/90 sm:text-3xl">
          Phone &amp; voice
        </h1>
        <p className="mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400">
          Phone and voice orchestrations aren’t available yet. This area is a placeholder while we
          build it — there’s nothing to configure here for now.
        </p>
      </div>
    </>
  );
}
