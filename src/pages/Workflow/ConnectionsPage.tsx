import { Link2, RefreshCw, Unplug } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import PageMeta from "../../components/common/PageMeta";
import ConnectIntegration from "../../components/workflow/ConnectIntegration";
import { useAuth } from "../../context/AuthContext";
import { WORKFLOW, canWrite } from "../../lib/capabilities";
import {
  disconnect as apiDisconnect,
  listConnections,
  type IntegrationConnection,
  type IntegrationConnectionStatus,
} from "../../lib/workflowApi";

const STATUS_BADGE: Record<IntegrationConnectionStatus, string> = {
  PENDING: "bg-amber-50 text-amber-600 dark:bg-amber-500/15",
  ACTIVE: "bg-success-50 text-success-600 dark:bg-success-500/15",
  NEEDS_RECONNECT: "bg-error-50 text-error-600 dark:bg-error-500/15",
  REVOKED: "bg-gray-100 text-gray-500 dark:bg-white/10",
};
const STATUS_LABEL: Record<IntegrationConnectionStatus, string> = {
  PENDING: "Pending",
  ACTIVE: "Connected",
  NEEDS_RECONNECT: "Reconnect needed",
  REVOKED: "Revoked",
};

// Common providers to offer; a free-text field covers anything else Nango supports.
const COMMON_PROVIDERS = ["salesforce", "hubspot", "slack", "google-mail", "google-sheet"];

const fmtDateTime = (s?: string | null) => (s ? new Date(s).toLocaleString() : "—");

export default function ConnectionsPage() {
  const { session, isLoaded } = useAuth();
  const tenant = session?.tenant ?? null;
  const canEdit = canWrite(session, WORKFLOW);

  const [rows, setRows] = useState<IntegrationConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState("salesforce");

  const refresh = useCallback(async () => {
    if (!tenant) return;
    setLoading(true);
    setError(null);
    try {
      setRows(await listConnections(tenant));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load connections");
    } finally {
      setLoading(false);
    }
  }, [tenant]);

  useEffect(() => {
    if (isLoaded && tenant) void refresh();
  }, [isLoaded, tenant, refresh]);

  const onDisconnect = useCallback(
    async (id: string) => {
      if (!tenant) return;
      try {
        await apiDisconnect(tenant, id);
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to disconnect");
      }
    },
    [tenant, refresh],
  );

  return (
    <>
      <PageMeta title="Connections" description="Connect third-party apps for workflows" />
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">Connections</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Authorize the third-party apps your workflows read from and write to.
        </p>
      </div>

      {canEdit ? (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
          <label className="text-sm text-gray-600 dark:text-gray-300">Connect an app</label>
          <input
            list="wf-providers"
            value={provider}
            onChange={(e) => setProvider(e.target.value.trim())}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-white/5"
            placeholder="provider key, e.g. salesforce"
          />
          <datalist id="wf-providers">
            {COMMON_PROVIDERS.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          {tenant ? (
            <ConnectIntegration
              tenant={tenant}
              provider={provider}
              disabled={!provider}
              onConnected={() => void refresh()}
            />
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/15">{error}</div>
      ) : null}

      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 py-16 text-center dark:border-gray-800">
          <Link2 className="mx-auto mb-3 size-8 text-gray-300" />
          <p className="text-sm text-gray-500 dark:text-gray-400">No connections yet.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-500 dark:bg-white/5 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3 font-medium">App</th>
                <th className="px-4 py-3 font-medium">Account</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Connected</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {rows.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3 font-medium capitalize text-gray-800 dark:text-white/90">{c.providerKey}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{c.externalAccount ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[c.status]}`}>
                      {STATUS_LABEL[c.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{fmtDateTime(c.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    {canEdit ? (
                      <div className="inline-flex items-center gap-2">
                        {c.status === "NEEDS_RECONNECT" && tenant ? (
                          <ConnectIntegration
                            tenant={tenant}
                            provider={c.providerKey}
                            label="Reconnect"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1 text-xs hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-white/5"
                            onConnected={() => void refresh()}
                          />
                        ) : null}
                        <button
                          type="button"
                          onClick={() => onDisconnect(c.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
                        >
                          <Unplug className="size-3.5" /> Disconnect
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canEdit ? (
        <button
          type="button"
          onClick={() => void refresh()}
          className="mt-4 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400"
        >
          <RefreshCw className="size-4" /> Refresh
        </button>
      ) : null}
    </>
  );
}
