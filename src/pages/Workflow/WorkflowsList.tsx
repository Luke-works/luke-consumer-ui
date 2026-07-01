import { Plus, Workflow as WorkflowIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import PageMeta from "../../components/common/PageMeta";
import { useAuth } from "../../context/AuthContext";
import { WORKFLOW, canWrite } from "../../lib/capabilities";
import {
  blankWorkflow,
  createDefinition,
  listDefinitions,
  type WorkflowDefinition,
} from "../../lib/workflowApi";

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-600 dark:bg-white/10",
  PUBLISHED: "bg-success-50 text-success-600 dark:bg-success-500/15",
};
const fmtDateTime = (s?: string | null) => (s ? new Date(s).toLocaleString() : "—");

export default function WorkflowsList() {
  const navigate = useNavigate();
  const { session, isLoaded } = useAuth();
  const tenant = session?.tenant ?? null;
  const canEdit = canWrite(session, WORKFLOW);

  const [rows, setRows] = useState<WorkflowDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    if (!tenant) return;
    setLoading(true);
    setError(null);
    try {
      setRows(await listDefinitions(tenant));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load workflows");
    } finally {
      setLoading(false);
    }
  }, [tenant]);

  useEffect(() => {
    if (isLoaded && tenant) void refresh();
  }, [isLoaded, tenant, refresh]);

  const onCreate = useCallback(async () => {
    if (!tenant) return;
    const name = window.prompt("Name this workflow")?.trim();
    if (!name) return;
    setCreating(true);
    try {
      const def = await createDefinition(tenant, {
        name,
        json: JSON.stringify(blankWorkflow(name)),
      });
      navigate(`/workflow/${def.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create workflow");
    } finally {
      setCreating(false);
    }
  }, [tenant, navigate]);

  return (
    <>
      <PageMeta title="Workflows" description="Design and run automated workflows" />
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">Workflows</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Compose forms, email, and integrations into automated processes.
          </p>
        </div>
        {canEdit ? (
          <button
            type="button"
            onClick={onCreate}
            disabled={creating}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
          >
            <Plus className="size-4" /> New workflow
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="mb-4 rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/15">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 py-16 text-center dark:border-gray-800">
          <WorkflowIcon className="mx-auto mb-3 size-8 text-gray-300" />
          <p className="text-sm text-gray-500 dark:text-gray-400">No workflows yet.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-500 dark:bg-white/5 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Published</th>
                <th className="px-4 py-3 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {rows.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => navigate(`/workflow/${r.id}`)}
                  className="cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5"
                >
                  <td className="px-4 py-3 font-medium text-gray-800 dark:text-white/90">{r.name}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[r.status] ?? STATUS_BADGE.DRAFT}`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                    {r.publishedVersion != null ? `v${r.publishedVersion}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{fmtDateTime(r.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
