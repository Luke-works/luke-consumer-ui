/**
 * Access — the organization's access-management console.
 *
 * The sub-nav is grouped to match how access is actually reasoned about:
 *
 *   You            — what the signed-in member holds, and how to ask for more
 *   Requests       — the owner's approval queue
 *   Access model   — Roles (what someone may do on the platform), Attributes (who they are,
 *                    from the identity provider) and Capabilities (which product areas they
 *                    may use). Each is a separate dimension, so each gets its own screen.
 *   Organization   — the people surfaces: members, candidate groups, invitations
 *
 * Everything owner-only is filtered out for ordinary members, who see only "Manage My Access".
 */
import { useEffect, useMemo, useState } from "react";
import {
  IdCard,
  Inbox,
  KeyRound,
  Layers,
  ShieldCheck,
  UserPlus,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import * as api from "../../lib/authApi";
import type { CapabilityCatalogItem } from "../../lib/authApi";
import PageMeta from "../../components/common/PageMeta";
import ManageMyAccessSection from "./ManageMyAccess";
import ApproveRequestsSection from "./ApproveRequests";
import RolesSection from "./RolesSection";
import AttributesSection from "./AttributesSection";
import CapabilitiesSection from "./CapabilitiesSection";
import MembersSection from "./MembersSection";
import CandidateGroupsSection from "./CandidateGroups";
import InvitationsSection from "./Invitations";
import { card } from "./shared";

type SectionId =
  | "my-access"
  | "approve"
  | "roles"
  | "attributes"
  | "capabilities"
  | "members"
  | "candidate-groups"
  | "invitations";

type SectionGroup = "You" | "Requests" | "Access model" | "Organization";

type Section = {
  id: SectionId;
  label: string;
  icon: LucideIcon;
  group: SectionGroup;
  ownerOnly: boolean;
};

const SECTIONS: Section[] = [
  { id: "my-access", label: "Manage My Access", icon: KeyRound, group: "You", ownerOnly: false },
  { id: "approve", label: "Approve Requests", icon: Inbox, group: "Requests", ownerOnly: true },
  { id: "roles", label: "Roles", icon: ShieldCheck, group: "Access model", ownerOnly: true },
  { id: "attributes", label: "Attributes", icon: IdCard, group: "Access model", ownerOnly: true },
  { id: "capabilities", label: "Capabilities", icon: Layers, group: "Access model", ownerOnly: true },
  { id: "members", label: "Members", icon: Users, group: "Organization", ownerOnly: true },
  {
    id: "candidate-groups",
    label: "Candidate Groups",
    icon: UsersRound,
    group: "Organization",
    ownerOnly: true,
  },
  { id: "invitations", label: "Invitations", icon: UserPlus, group: "Organization", ownerOnly: true },
];

const GROUP_ORDER: SectionGroup[] = ["You", "Requests", "Access model", "Organization"];

export default function AccessManagement() {
  const { session } = useAuth();
  const [section, setSection] = useState<SectionId>("my-access");
  const [catalog, setCatalog] = useState<CapabilityCatalogItem[]>([]);

  const tenant = session?.tenant ?? null;
  const isOwner = !!session?.tenantAdmin;

  // Non-owners only ever see "Manage My Access". Owners get the full rail.
  const sections = useMemo(() => SECTIONS.filter((s) => !s.ownerOnly || isOwner), [isOwner]);

  // If a non-owner somehow lands on an owner-only section (e.g. role changed),
  // snap back to the always-available "Manage My Access".
  useEffect(() => {
    if (!sections.some((s) => s.id === section)) setSection("my-access");
  }, [sections, section]);

  // Catalog is used to label/tier the "My access" capabilities. It's a best-effort
  // read — non-owners may not be allowed to list it, in which case we fall back to
  // showing the raw capability codes without a tier.
  useEffect(() => {
    if (!tenant) return;
    let active = true;
    api
      .listCapabilities(tenant)
      .then((c) => active && setCatalog(Array.isArray(c) ? c : []))
      .catch(() => active && setCatalog([]));
    return () => {
      active = false;
    };
  }, [tenant]);

  const groups = GROUP_ORDER.map((g) => ({ group: g, items: sections.filter((s) => s.group === g) })).filter(
    (g) => g.items.length > 0,
  );
  // With a single group there's nothing to distinguish, so drop the headings entirely.
  const showGroupLabels = groups.length > 1;

  return (
    <>
      <PageMeta
        title="Access | Lukeflow"
        description="Manage your access, approve requests, and administer your organization."
      />

      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-start gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-500 dark:bg-brand-500/10">
            <ShieldCheck className="size-6" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">Access</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Manage your own access and request more. Owners can approve requests, manage members, and
              send invitations.
            </p>
          </div>
        </div>

        {!tenant ? (
          <div className={card}>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Join or create an organization to manage access.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-6 lg:flex-row">
            {/* Left internal sub-sidebar */}
            <nav aria-label="Access sections" className="shrink-0 lg:w-56">
              <div className="flex gap-4 overflow-x-auto lg:flex-col lg:gap-5 lg:overflow-visible">
                {groups.map(({ group, items }) => (
                  <div key={group}>
                    {showGroupLabels && (
                      <p className="mb-1.5 hidden px-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400 lg:block">
                        {group}
                      </p>
                    )}
                    <ul className="flex gap-1 lg:flex-col">
                      {items.map((s) => {
                        const active = section === s.id;
                        return (
                          <li key={s.id} className="shrink-0">
                            <button
                              onClick={() => setSection(s.id)}
                              aria-current={active ? "page" : undefined}
                              className={`flex w-full items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                                active
                                  ? "bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400"
                                  : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                              }`}
                            >
                              <s.icon className="size-4 shrink-0" />
                              {s.label}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </nav>

            {/* Content pane */}
            <div className="min-w-0 flex-1">
              {section === "my-access" && (
                <ManageMyAccessSection
                  tenant={tenant}
                  capabilities={session?.capabilities ?? {}}
                  catalog={catalog}
                />
              )}
              {section === "approve" && isOwner && <ApproveRequestsSection tenant={tenant} />}
              {section === "roles" && isOwner && <RolesSection tenant={tenant} />}
              {section === "attributes" && isOwner && <AttributesSection tenant={tenant} />}
              {section === "capabilities" && isOwner && <CapabilitiesSection tenant={tenant} />}
              {section === "members" && isOwner && <MembersSection tenant={tenant} />}
              {section === "candidate-groups" && isOwner && <CandidateGroupsSection tenant={tenant} />}
              {section === "invitations" && isOwner && <InvitationsSection tenant={tenant} />}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
