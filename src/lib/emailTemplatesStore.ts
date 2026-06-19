// React state for the Email Templates list, backed by core-engine (see
// emailTemplatesApi). Templates persist server-side and are tenant-scoped — no
// browser-local storage.
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import * as api from "./emailTemplatesApi";

export type { StoredTemplate, TemplateStatus, TemplateVersion, AuditEvent } from "./emailTemplatesApi";
export { latestVersion } from "./emailTemplatesApi";

/**
 * Loads the tenant's email templates (live + trashed) and exposes lifecycle
 * operations. Every operation hits the backend and then refreshes the cached lists.
 */
export function useEmailTemplates() {
  const { isLoaded, session } = useAuth();
  // The engine userId (e.g. "workos:user_…") — matches what the backend stamps
  // as createdBy/updatedBy, so the list can label the current user's own templates.
  const userId = session?.userId ?? null;
  const tenant = session?.tenant ?? null;

  const [templates, setTemplates] = useState<api.StoredTemplate[]>([]);
  const [trashed, setTrashed] = useState<api.StoredTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!tenant) return;
    setLoading(true);
    setError(null);
    try {
      const [live, gone] = await Promise.all([api.listTemplates(tenant, false), api.listTemplates(tenant, true)]);
      setTemplates(live);
      setTrashed(gone);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load email templates");
    } finally {
      setLoading(false);
    }
  }, [tenant]);

  useEffect(() => {
    if (isLoaded && tenant) void refresh();
  }, [isLoaded, tenant, refresh]);

  const op = useCallback(
    async <T>(fn: (t: string) => Promise<T>): Promise<T | undefined> => {
      if (!tenant) return undefined;
      const result = await fn(tenant);
      await refresh();
      return result;
    },
    [tenant, refresh],
  );

  const createTemplate = useCallback((name: string) => op((t) => api.createTemplate(t, name)), [op]);
  const clone = useCallback((id: string) => op((t) => api.cloneTemplate(t, id)), [op]);
  const retire = useCallback((id: string, retired: boolean) => op((t) => api.retireTemplate(t, id, retired)), [op]);
  const softDelete = useCallback((id: string) => op((t) => api.softDelete(t, id)), [op]);
  const restore = useCallback((id: string) => op((t) => api.restoreTemplate(t, id)), [op]);
  const purge = useCallback((id: string) => op((t) => api.purgeTemplate(t, id)), [op]);

  return {
    ready: isLoaded && !!tenant,
    loading,
    error,
    userId,
    tenant,
    templates,
    trashed,
    refresh,
    createTemplate,
    clone,
    retire,
    softDelete,
    restore,
    purge,
  };
}
