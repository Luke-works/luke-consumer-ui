import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { createColumnHelper } from "@tanstack/react-table";
import DataTable from "../../components/tables/DataTable";
import Tooltip from "../../components/ui/tooltip/Tooltip";
import { useAuth, useUser } from "../../context/AuthContext";
import { canWrite, EMAIL } from "../../lib/capabilities";
import PageMeta from "../../components/common/PageMeta";
import { Modal } from "../../components/ui/modal";
import Button from "../../components/ui/button/Button";
import Label from "../../components/form/Label";
import Input from "../../components/form/input/InputField";
import { PlusIcon, MailIcon, TrashBinIcon, TimeIcon, CopyIcon, BoxIcon } from "../../icons";
import { useEmailTemplates, type StoredTemplate, type TemplateStatus } from "../../lib/emailTemplatesStore";
import { listVersions, publishVersion, type TemplateVersion } from "../../lib/emailTemplatesApi";

const STATUS_BADGE: Record<TemplateStatus, string> = {
  draft: "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400",
  published: "bg-success-50 text-success-600 dark:bg-success-500/15",
  retired: "bg-amber-50 text-amber-600 dark:bg-amber-500/15",
};

const col = createColumnHelper<StoredTemplate>();

function formatUpdated(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function EmailTemplatesList() {
  const navigate = useNavigate();
  const { user } = useUser();
  const { session } = useAuth();
  // read → view-only (no create/edit/delete); read-write → full control.
  const canEdit = canWrite(session, EMAIL);
  const { userId, tenant, templates, trashed, loading, error, createTemplate, clone, retire, softDelete, restore, purge, refresh } = useEmailTemplates();
  const me = user?.fullName || user?.firstName || user?.email || "You";
  // Prefer the server-resolved display name; fall back to "You" for self, then a short id.
  const who = (id?: string, name?: string) =>
    id && id === userId ? me : name ? name : id ? `${id.slice(0, 10)}…` : "—";

  const [isModalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [historyTpl, setHistoryTpl] = useState<StoredTemplate | null>(null);
  const [historyVersions, setHistoryVersions] = useState<TemplateVersion[]>([]);
  const [showTrash, setShowTrash] = useState(false);
  const [purgeTarget, setPurgeTarget] = useState<StoredTemplate | null>(null);
  const [purging, setPurging] = useState(false);

  const onRowClick = (tpl: StoredTemplate) => navigate(`/email-templates/${tpl.id}`);

  const confirmPurge = async () => {
    if (!purgeTarget || purging) return;
    setPurging(true);
    try {
      await purge(purgeTarget.id);
      setPurgeTarget(null);
    } finally {
      setPurging(false);
    }
  };

  // Load checked-in versions whenever the history modal opens for a template.
  useEffect(() => {
    if (!historyTpl || !tenant) { setHistoryVersions([]); return; }
    let active = true;
    listVersions(tenant, historyTpl.id)
      .then((vs) => active && setHistoryVersions(vs))
      .catch(() => active && setHistoryVersions([]));
    return () => { active = false; };
  }, [historyTpl, tenant]);

  const openModal = () => {
    setName("");
    setModalOpen(true);
  };

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    try {
      const tpl = await createTemplate(trimmed);
      setModalOpen(false);
      setName("");
      if (tpl) navigate(`/email-templates/${tpl.id}`);
    } finally {
      setCreating(false);
    }
  };

  const hasTemplates = templates.length > 0;

  const columns = [
    col.accessor("name", {
      header: "Template Name",
      cell: (c) => (
        <div className="flex items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-500 dark:bg-brand-500/10">
            <MailIcon className="size-4" />
          </span>
          <span className="font-medium text-gray-800 dark:text-white/90">{c.getValue()}</span>
        </div>
      ),
    }),
    col.accessor("subject", {
      header: "Subject",
      cell: (c) => (
        <span className="block max-w-[280px] truncate text-gray-600 dark:text-gray-300">{c.getValue() || "—"}</span>
      ),
    }),
    col.accessor("code", {
      header: "Template ID",
      cell: (c) => (
        <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{c.getValue()}</span>
      ),
    }),
    col.accessor("status", {
      header: "Status",
      cell: (c) => (
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${STATUS_BADGE[c.getValue()]}`}>
          {c.getValue()}
        </span>
      ),
    }),
    col.accessor((t) => t.publishedVersion ?? 0, {
      id: "version",
      header: "Version",
      cell: (c) => (
        <span className="text-gray-600 dark:text-gray-300">{c.getValue() ? `v${c.getValue()}` : "—"}</span>
      ),
    }),
    col.accessor("updatedAt", {
      header: "Last Modified",
      cell: (c) => <span className="text-gray-500 dark:text-gray-400">{formatUpdated(c.getValue())}</span>,
    }),
    col.accessor((t) => who(t.updatedBy, t.updatedByName), {
      id: "updatedBy",
      header: "Modified By",
      cell: (c) => <span className="text-gray-500 dark:text-gray-400">{c.getValue()}</span>,
    }),
    col.display({
      id: "actions",
      header: "",
      enableSorting: false,
      meta: { align: "right" },
      cell: (c) => {
        const tpl = c.row.original;
        return (
          <div className="flex items-center justify-end gap-0.5 opacity-0 transition group-hover:opacity-100">
            {canEdit && (
              <>
                {tpl.latestVersion > 0 && (
                  <button type="button" aria-label="Version history" onClick={(e) => { e.stopPropagation(); setHistoryTpl(tpl); }} className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-brand-500 dark:hover:bg-gray-800"><TimeIcon className="size-4" /></button>
                )}
                <button type="button" aria-label="Duplicate" onClick={(e) => { e.stopPropagation(); clone(tpl.id); }} className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800"><CopyIcon className="size-4" /></button>
                <button type="button" aria-label={tpl.status === "retired" ? "Unretire" : "Retire"} onClick={(e) => { e.stopPropagation(); retire(tpl.id, tpl.status !== "retired"); }} className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-amber-500 dark:hover:bg-gray-800"><BoxIcon className="size-4" /></button>
                <button type="button" aria-label="Delete" onClick={(e) => { e.stopPropagation(); softDelete(tpl.id); }} className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-error-500 dark:hover:bg-gray-800"><TrashBinIcon className="size-4" /></button>
              </>
            )}
          </div>
        );
      },
    }),
  ];

  // Toolbar icon buttons (next to search), each explained by a hover/focus tooltip.
  const toolbar = canEdit ? (
    <div className="flex items-center gap-2">
      {trashed.length > 0 && (
        <Tooltip content="Deleted templates — restore them or remove permanently" position="top">
          <button
            type="button"
            aria-label={`View trash (${trashed.length} deleted)`}
            onClick={() => setShowTrash(true)}
            className="relative inline-flex size-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition hover:bg-gray-100 hover:text-gray-800 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/5"
          >
            <TrashBinIcon className="size-5" />
            <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-error-500 px-1 text-[10px] font-medium leading-none text-white">
              {trashed.length}
            </span>
          </button>
        </Tooltip>
      )}
      <Tooltip content="Create a new email template" position="top">
        <button
          type="button"
          aria-label="Create email template"
          onClick={openModal}
          className="inline-flex size-9 items-center justify-center rounded-lg bg-brand-500 text-white transition hover:bg-brand-600"
        >
          <PlusIcon className="size-5" />
        </button>
      </Tooltip>
    </div>
  ) : undefined;

  return (
    <>
      <PageMeta
        title="Email Templates | Lukeflow"
        description="Design and manage your email templates with the Lukeflow AI builder."
      />

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-gray-800 dark:text-white/90">
            Email Templates
            {!canEdit && (
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:bg-white/10 dark:text-gray-400">
                View only
              </span>
            )}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {canEdit
              ? "Open a template to design it with the AI email builder."
              : "You have read-only access to email templates. Ask an org owner for edit access."}
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-error-500 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-500/40 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </div>
      )}

      {loading && templates.length === 0 && !showTrash ? (
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-gray-400">Loading templates…</div>
      ) : showTrash ? (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowTrash(false)}
            className="mb-2 inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/5"
          >
            Back to templates
          </button>
          {trashed.map((tpl) => (
            <div key={tpl.id} className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3 dark:border-gray-800">
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{tpl.name}</p>
                <p className="text-xs text-gray-400">Deleted {tpl.deletedAt ? formatUpdated(tpl.deletedAt) : ""}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => restore(tpl.id)}>Restore</Button>
                <Button size="sm" variant="outline" onClick={() => setPurgeTarget(tpl)}>Delete forever</Button>
              </div>
            </div>
          ))}
        </div>
      ) : hasTemplates ? (
        <DataTable
          columns={columns}
          data={templates}
          onRowClick={onRowClick}
          searchPlaceholder="Search templates…"
          minWidth="min-w-[980px]"
          toolbar={toolbar}
          emptyMessage="No templates match your search."
        />
      ) : (
        // Empty state shown if the user dismisses the create modal.
        <div className="flex min-h-[50vh] flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-16 text-center dark:border-gray-800 dark:bg-white/[0.03]">
          <span className="flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-500 dark:bg-brand-500/10">
            <MailIcon className="size-6" />
          </span>
          <h2 className="mt-4 text-lg font-semibold text-gray-800 dark:text-white/90">
            No email templates yet
          </h2>
          <p className="mt-1 max-w-sm text-sm text-gray-500 dark:text-gray-400">
            {canEdit
              ? "Create your first template and design it by chatting with the AI email builder."
              : "There are no templates to view yet, and you have read-only access."}
          </p>
          {canEdit && (
            <div className="mt-6">
              <Button startIcon={<PlusIcon className="size-4" />} onClick={openModal}>
                Create template
              </Button>
            </div>
          )}
        </div>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => setModalOpen(false)}
        className="mx-4 w-full max-w-[480px]"
      >
        <div className="p-6 sm:p-8">
          <h2 className="mb-2 text-xl font-semibold text-gray-800 dark:text-white/90">
            Name your template
          </h2>
          <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
            Give your email template a name to get started. You can change it later.
          </p>

          <div>
            <Label>
              Template name <span className="text-error-500">*</span>
            </Label>
            <Input
              name="templateName"
              placeholder="Welcome email"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="mt-8 flex justify-end gap-3">
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!name.trim() || creating}>
              {creating ? "Creating…" : "Create & design"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Version history */}
      <Modal isOpen={!!historyTpl} onClose={() => setHistoryTpl(null)} className="mx-4 w-full max-w-[480px]">
        <div className="p-6">
          <h2 className="mb-1 text-lg font-semibold text-gray-800 dark:text-white/90">Version history</h2>
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">{historyTpl?.name}</p>
          <ul className="space-y-2">
            {historyVersions.length === 0 && (
              <li className="py-2 text-sm text-gray-400">No checked-in versions yet.</li>
            )}
            {historyVersions.slice().reverse().map((ver) => {
              const isLive = historyTpl?.publishedVersion === ver.version;
              return (
                <li key={ver.version} className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 px-4 py-2.5 dark:border-gray-800">
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-gray-800 dark:text-white/90">v{ver.version}</span>
                    {isLive && <span className="ml-2 rounded-full bg-success-50 px-2 py-0.5 text-[10px] font-medium uppercase text-success-600 dark:bg-success-500/15">Live</span>}
                    <span className="ml-2 text-xs text-gray-400">{new Date(ver.checkedInAt).toLocaleString()}</span>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    {canEdit && !isLive && (
                      <Button size="sm" variant="outline" onClick={async () => {
                        if (!tenant || !historyTpl) return;
                        await publishVersion(tenant, historyTpl.id, ver.version);
                        await refresh();
                        setHistoryTpl({ ...historyTpl, publishedVersion: ver.version, status: "published" });
                      }}>Publish</Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </Modal>

      {/* Delete-forever confirmation */}
      <Modal isOpen={!!purgeTarget} onClose={() => (purging ? undefined : setPurgeTarget(null))} className="mx-4 w-full max-w-[440px]">
        <div className="p-6 sm:p-8">
          <h2 className="mb-2 text-lg font-semibold text-gray-800 dark:text-white/90">Delete forever?</h2>
          <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
            <span className="font-medium text-gray-700 dark:text-gray-200">{purgeTarget?.name}</span> and all its versions
            will be permanently deleted. This can't be undone.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setPurgeTarget(null)} disabled={purging}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmPurge} disabled={purging}>
              {purging ? "Deleting…" : "Delete forever"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
