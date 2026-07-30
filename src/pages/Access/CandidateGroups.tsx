/**
 * Candidate Groups — owner-only. Create groups, manage each group's members (who gets routed
 * tasks) and its owners (who may edit that membership without being a full org owner — the
 * delegated-manager model).
 */
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Crown, Pencil, Plus, Trash2, Users, UsersRound, XCircle } from "lucide-react";
import * as api from "../../lib/authApi";
import type { OrgGroup, OrgGroupManager, OrgMember } from "../../lib/authApi";
import { getAuthErrorMessage } from "../../components/auth/authError";
import Label from "../../components/form/Label";
import Input from "../../components/form/input/InputField";
import Button from "../../components/ui/button/Button";
import { card, memberLabel, SectionHeader } from "./shared";

/** Full candidate-group administration: create groups, and per group manage its
 *  members (who's routed tasks) and its owners (who may edit its membership without
 *  being a full org owner — the delegated-manager model). Owner-only surface. */
export default function CandidateGroupsSection({ tenant }: { tenant: string }) {
  const [groups, setGroups] = useState<OrgGroup[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [newName, setNewName] = useState("");
  const [createStatus, setCreateStatus] = useState<{ kind: "idle" | "saving" | "error"; msg?: string }>({
    kind: "idle",
  });

  const reload = useCallback(() => {
    return Promise.all([api.listGroups(tenant), api.listOrgUsers(tenant)])
      .then(([g, m]) => {
        setGroups(g);
        setMembers(m);
      })
      .catch((e) => setError(getAuthErrorMessage(e)));
  }, [tenant]);

  const reloadMembers = useCallback(() => {
    api
      .listOrgUsers(tenant)
      .then(setMembers)
      .catch((e) => setError(getAuthErrorMessage(e)));
  }, [tenant]);

  useEffect(() => {
    setLoading(true);
    reload().finally(() => setLoading(false));
  }, [reload]);

  async function createGroup() {
    if (!newName.trim()) return;
    setCreateStatus({ kind: "saving" });
    try {
      const g = await api.createGroup(tenant, newName.trim());
      setGroups((prev) => (prev.some((x) => x.id === g.id) ? prev : [...prev, g]));
      setNewName("");
      setCreateStatus({ kind: "idle" });
    } catch (err) {
      setCreateStatus({ kind: "error", msg: getAuthErrorMessage(err) });
    }
  }

  if (loading) {
    return <div className="flex h-[40vh] items-center justify-center text-sm text-gray-400">Loading…</div>;
  }

  // Members eligible to be assigned/appointed — exclude platform/support accounts.
  const realMembers = members.filter((m) => !m.platform);

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-error-500 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-500/40 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </div>
      )}

      {/* Create group */}
      <section className={card}>
        <SectionHeader
          icon={Plus}
          title="Create a candidate group"
          subtitle="Groups route tasks to a set of people. After creating one, add members and (optionally) appoint owners who can manage its membership."
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="sm:flex-1">
            <Label htmlFor="cg-name">Group name</Label>
            <Input
              id="cg-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Sales"
            />
          </div>
          <Button
            size="sm"
            startIcon={<Plus className="size-4" />}
            disabled={!newName.trim() || createStatus.kind === "saving"}
            onClick={createGroup}
          >
            {createStatus.kind === "saving" ? "Creating…" : "Create group"}
          </Button>
        </div>
        {createStatus.kind === "error" && <p className="mt-3 text-sm text-error-500">{createStatus.msg}</p>}
      </section>

      {/* Groups list */}
      <section className={card}>
        <SectionHeader
          icon={UsersRound}
          title={
            <>
              Groups <span className="text-sm font-normal text-gray-400">({groups.length})</span>
            </>
          }
        />
        {groups.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No groups yet. Create one above.</p>
        ) : (
          <div className="space-y-2">
            {groups.map((g) => (
              <GroupCard
                key={g.id}
                tenant={tenant}
                group={g}
                members={realMembers}
                onMembersChanged={reloadMembers}
                onGroupChanged={reload}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/** One expandable candidate group: rename/delete, a members editor (toggle who's in
 *  the group) and an owners editor (multi-select add, per-row remove). */
function GroupCard({
  tenant,
  group,
  members,
  onMembersChanged,
  onGroupChanged,
}: {
  tenant: string;
  group: OrgGroup;
  members: OrgMember[];
  onMembersChanged: () => void;
  onGroupChanged: () => Promise<unknown> | void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Rename
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState(group.name);

  // Delete confirm
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Owners (lazy-loaded on first expand)
  const [owners, setOwners] = useState<OrgGroupManager[] | null>(null);
  const [pick, setPick] = useState<Set<string>>(new Set());

  const inGroup = members.filter((m) => m.candidateGroups.includes(group.id));
  const memberIdsInGroup = new Set(inGroup.map((m) => m.id));

  const loadOwners = useCallback(() => {
    api
      .listGroupOwners(tenant, group.id)
      .then(setOwners)
      .catch((e) => setErr(getAuthErrorMessage(e)));
  }, [tenant, group.id]);

  useEffect(() => {
    if (open && owners === null) loadOwners();
  }, [open, owners, loadOwners]);

  async function run(fn: () => Promise<unknown>, after?: () => void) {
    setBusy(true);
    setErr("");
    try {
      await fn();
      after?.();
    } catch (e) {
      setErr(getAuthErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const ownerIds = new Set((owners ?? []).map((o) => o.id));
  const eligibleForOwner = members.filter((m) => !ownerIds.has(m.id));

  function togglePick(id: string) {
    setPick((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function addSelectedOwners() {
    const ids = [...pick];
    if (ids.length === 0) return;
    await run(
      () => Promise.all(ids.map((id) => api.addGroupOwner(tenant, group.id, id))),
      () => {
        setPick(new Set());
        loadOwners();
      },
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <UsersRound className="size-4 shrink-0 text-gray-400" />
          <span className="truncate font-medium text-gray-800 dark:text-white/90">{group.name}</span>
          <span className="shrink-0 text-xs text-gray-400">
            {inGroup.length} member{inGroup.length === 1 ? "" : "s"}
          </span>
        </span>
        <span className="shrink-0 text-xs text-gray-400">{open ? "Hide" : "Manage"}</span>
      </button>

      {open && (
        <div className="space-y-5 border-t border-gray-100 px-4 py-4 dark:border-gray-800">
          {err && <p className="text-sm text-error-500">{err}</p>}

          {/* Rename / delete */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1">
              <Label htmlFor={`rename-${group.id}`}>Name</Label>
              {editing ? (
                <div className="flex gap-2">
                  <Input
                    id={`rename-${group.id}`}
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                  />
                  <Button
                    size="sm"
                    disabled={busy || !nameInput.trim() || nameInput.trim() === group.name}
                    onClick={() =>
                      run(
                        () => api.renameGroup(tenant, group.id, nameInput.trim()),
                        () => {
                          setEditing(false);
                          onGroupChanged();
                        },
                      )
                    }
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setNameInput(group.name);
                      setEditing(false);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-700 dark:text-gray-200">{group.name}</span>
                  <button
                    onClick={() => setEditing(true)}
                    className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-brand-600 dark:text-gray-400"
                  >
                    <Pencil className="size-3.5" /> Rename
                  </button>
                </div>
              )}
            </div>
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Delete this group?</span>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={busy}
                  onClick={() => run(() => api.deleteGroup(tenant, group.id), () => onGroupChanged())}
                >
                  Delete
                </Button>
                <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                variant="outline"
                startIcon={<Trash2 className="size-4" />}
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </Button>
            )}
          </div>

          {/* Members editor */}
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-200">
              <Users className="size-4 text-gray-400" /> Members
            </p>
            {members.length === 0 ? (
              <p className="text-xs text-gray-400">No org members to assign yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {members.map((m) => {
                  const isin = memberIdsInGroup.has(m.id);
                  return (
                    <button
                      key={m.id}
                      disabled={busy}
                      onClick={() =>
                        run(
                          () =>
                            isin
                              ? api.removeUserFromGroup(tenant, m.id, group.id)
                              : api.addUserToGroup(tenant, m.id, group.id),
                          onMembersChanged,
                        )
                      }
                      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition disabled:opacity-50 ${
                        isin
                          ? "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300"
                          : "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                      }`}
                    >
                      {isin ? <CheckCircle2 className="size-3.5" /> : <Plus className="size-3.5" />}
                      {memberLabel(m)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Owners editor: current owners (per-row remove) + multi-select add */}
          <div>
            <p className="mb-1 flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-200">
              <Crown className="size-4 text-amber-500" /> Owners
            </p>
            <p className="mb-2 text-xs text-gray-400">
              Owners can add or remove this group's members without being a full org owner.
            </p>
            {owners === null ? (
              <p className="text-xs text-gray-400">Loading owners…</p>
            ) : (
              <>
                {owners.length === 0 ? (
                  <p className="mb-3 text-xs text-gray-400">No owners yet — this group is managed by org owners only.</p>
                ) : (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {owners.map((o) => {
                      const name =
                        [o.firstName, o.lastName].filter(Boolean).join(" ").trim() || o.id;
                      return (
                        <span
                          key={o.id}
                          className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
                        >
                          <Crown className="size-3.5" />
                          {name}
                          <button
                            disabled={busy}
                            onClick={() =>
                              run(() => api.removeGroupOwner(tenant, group.id, o.id), loadOwners)
                            }
                            className="ml-0.5 text-amber-600 hover:text-error-500 disabled:opacity-50 dark:text-amber-400"
                            aria-label={`Remove ${name} as owner`}
                          >
                            <XCircle className="size-3.5" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Multi-select add */}
                {eligibleForOwner.length > 0 && (
                  <div className="rounded-lg border border-dashed border-gray-200 p-3 dark:border-gray-700">
                    <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">Appoint owners</p>
                    <div className="flex flex-wrap gap-2">
                      {eligibleForOwner.map((m) => {
                        const sel = pick.has(m.id);
                        return (
                          <button
                            key={m.id}
                            disabled={busy}
                            onClick={() => togglePick(m.id)}
                            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition disabled:opacity-50 ${
                              sel
                                ? "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/20 dark:text-amber-200"
                                : "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                            }`}
                          >
                            {sel ? <CheckCircle2 className="size-3.5" /> : <Plus className="size-3.5" />}
                            {memberLabel(m)}
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-3">
                      <Button
                        size="sm"
                        startIcon={<Crown className="size-4" />}
                        disabled={busy || pick.size === 0}
                        onClick={addSelectedOwners}
                      >
                        {pick.size > 0 ? `Add ${pick.size} as owner${pick.size === 1 ? "" : "s"}` : "Add as owners"}
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
