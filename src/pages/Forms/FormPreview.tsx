// Standalone, full-page preview of a form's CURRENT working schema — the target of the builder's
// Preview → "Open in new tab". The designer hands the schema off via localStorage (too big for a URL)
// under `lukeform:preview:{id}`; we read it once and render it read-to-fill. This is a throwaway
// preview: submitting shows the configured success message but persists nothing.
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import PageMeta from "../../components/common/PageMeta";
import Button from "../../components/ui/button/Button";
import FormRenderer from "../../components/formBuilder/LukeFormRenderer";
import SubmissionSuccess from "../../components/formBuilder/SubmissionSuccess";
import { readSubmitMessage } from "../../lib/formSchema";

type Payload = { schema: string; title: string };

const keyFor = (id: string) => `lukeform:preview:${id}`;

export default function FormPreview() {
  const { id } = useParams();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [missing, setMissing] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!id) return;
    try {
      const raw = localStorage.getItem(keyFor(id));
      if (raw) setPayload(JSON.parse(raw) as Payload);
      else setMissing(true);
    } catch {
      setMissing(true);
    }
  }, [id]);

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 dark:bg-gray-950">
      <PageMeta title={`Preview${payload ? ` — ${payload.title}` : ""} | Lukeflow`} description="Form preview." />
      <div className="mx-auto max-w-[640px]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
            Preview — not a real submission
          </span>
          {id && (
            <Link
              to={`/forms/${id}`}
              className="text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              Back to the designer
            </Link>
          )}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 sm:p-8 dark:border-gray-800 dark:bg-white/[0.03]">
          {missing || !payload ? (
            <div className="py-12 text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                This preview has expired. Re-open it from the designer&rsquo;s <span className="font-medium">Preview → New tab</span>.
              </p>
              {id && (
                <Link
                  to={`/forms/${id}`}
                  className="mt-4 inline-flex items-center rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
                >
                  Back to the designer
                </Link>
              )}
            </div>
          ) : (
            <>
              <h1 className="mb-5 text-xl font-semibold text-gray-800 dark:text-white/90">{payload.title}</h1>
              {done ? (
                <>
                  <SubmissionSuccess message={readSubmitMessage(payload.schema)} />
                  <div className="text-center">
                    <Button size="sm" variant="outline" onClick={() => setDone(false)}>Fill again</Button>
                  </div>
                </>
              ) : (
                <FormRenderer schema={payload.schema} onSubmit={() => setDone(true)} allowJs />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
