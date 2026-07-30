/**
 * Invitations — owner-only. Invite someone by email (luke-auth → WorkOS) and manage the
 * pending invitations for this organization.
 */
import { useCallback, useEffect, useState } from "react";
import { Clock, Send, Trash2, UserPlus } from "lucide-react";
import * as api from "../../lib/authApi";
import type { Invitation } from "../../lib/authApi";
import { getAuthErrorMessage } from "../../components/auth/authError";
import Label from "../../components/form/Label";
import Input from "../../components/form/input/InputField";
import Button from "../../components/ui/button/Button";
import { card, SectionHeader } from "./shared";

export default function InvitationsSection({ tenant }: { tenant: string }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<{ kind: "idle" | "sending" | "ok" | "error"; msg?: string }>({
    kind: "idle",
  });
  const [invitations, setInvitations] = useState<Invitation[]>([]);

  const reload = useCallback(() => {
    api
      .listInvitations(tenant)
      .then((r) => setInvitations(r.invitations ?? []))
      .catch(() => setInvitations([]));
  }, [tenant]);

  useEffect(() => reload(), [reload]);

  async function send() {
    if (!email.trim()) return;
    setStatus({ kind: "sending" });
    try {
      await api.invite(tenant, { firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim() });
      setStatus({ kind: "ok", msg: `Invitation sent to ${email.trim()}.` });
      setFirstName("");
      setLastName("");
      setEmail("");
      reload();
    } catch (err) {
      setStatus({ kind: "error", msg: getAuthErrorMessage(err) });
    }
  }

  async function revoke(id: string) {
    try {
      await api.revokeInvitation(tenant, id);
      reload();
    } catch {
      reload();
    }
  }

  return (
    <div className="space-y-6">
      <section className={card}>
        <SectionHeader
          icon={UserPlus}
          title="Invite a teammate"
          subtitle="They'll get an email with a link to set their password. Add them to this organization from the Authorization tab once they've accepted."
        />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <div>
            <Label htmlFor="inv-first">First name</Label>
            <Input id="inv-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Ada" />
          </div>
          <div>
            <Label htmlFor="inv-last">Last name</Label>
            <Input id="inv-last" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Lovelace" />
          </div>
          <div>
            <Label htmlFor="inv-email">Email</Label>
            <Input
              id="inv-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ada@company.com"
            />
          </div>
        </div>
        <div className="mt-6 flex items-center gap-3 border-t border-gray-100 pt-5 dark:border-gray-800">
          <Button
            size="sm"
            startIcon={<Send className="size-4" />}
            disabled={!email.trim() || status.kind === "sending"}
            onClick={send}
          >
            {status.kind === "sending" ? "Sending…" : "Send invite"}
          </Button>
          {status.kind === "ok" && <span className="text-sm text-success-600 dark:text-success-400">{status.msg}</span>}
          {status.kind === "error" && <span className="text-sm text-error-500">{status.msg}</span>}
        </div>
      </section>

      <section className={card}>
        <SectionHeader icon={Clock} title="Pending invitations" />
        {invitations.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No invitations yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {invitations.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm text-gray-700 dark:text-gray-200">{inv.email}</p>
                  <p className="text-xs text-gray-400">{inv.state ?? "pending"}</p>
                </div>
                {inv.state === "pending" && (
                  <button
                    onClick={() => revoke(inv.id)}
                    className="flex items-center gap-1.5 text-sm text-error-500 hover:text-error-600"
                  >
                    <Trash2 className="size-3.5" />
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
