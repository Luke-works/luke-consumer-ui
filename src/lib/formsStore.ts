// React state for the Forms list, backed by the capability-engine (see formsApi).
// Forms persist server-side and are tenant-scoped — no browser-local storage.
import { useCallback, useEffect, useState } from "react";
import { useAuth, useUser } from "../context/AuthContext";
import * as api from "./formsApi";

export type { StoredForm, FormStatus, FormArtifact, AuditEvent } from "./formsApi";
export { latestVersion } from "./formsApi";

/** The signed-in user's id (used to label "you" in lists). */
export function useUserId(): string | null {
  const { user } = useUser();
  return user?.id ?? null;
}

/**
 * Loads the tenant's forms (live + trashed) and exposes lifecycle operations.
 * Every operation hits the backend and then refreshes the cached lists.
 */
export function useForms() {
  const { isLoaded, session } = useAuth();
  // The engine userId (e.g. "workos:user_…") — matches what the backend stamps
  // as createdBy/updatedBy, so the list can label the current user's own forms.
  const userId = session?.userId ?? null;
  const tenant = session?.tenant ?? null;

  const [forms, setForms] = useState<api.StoredForm[]>([]);
  const [trashed, setTrashed] = useState<api.StoredForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!tenant) return;
    setLoading(true);
    setError(null);
    try {
      const [live, gone] = await Promise.all([api.listForms(tenant, false), api.listForms(tenant, true)]);
      setForms(live);
      setTrashed(gone);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load forms");
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

  const createForm = useCallback(
    (name: string, kind: api.FormKind = "INBOUND") => op((t) => api.createForm(t, name, undefined, kind)),
    [op],
  );
  const clone = useCallback((id: string) => op((t) => api.cloneForm(t, id)), [op]);
  const archive = useCallback((id: string, archived: boolean) => op((t) => api.archiveForm(t, id, archived)), [op]);
  const softDelete = useCallback((id: string) => op((t) => api.softDelete(t, id)), [op]);
  const restore = useCallback((id: string) => op((t) => api.restoreForm(t, id)), [op]);
  const purge = useCallback((id: string) => op((t) => api.purgeForm(t, id)), [op]);

  return {
    ready: isLoaded && !!tenant,
    loading,
    error,
    userId,
    tenant,
    forms,
    trashed,
    refresh,
    createForm,
    clone,
    archive,
    softDelete,
    restore,
    purge,
  };
}
