import Nango from "@nangohq/frontend";
import { Plug } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { startConnect } from "../../lib/workflowApi";

/**
 * Launches Nango's Connect UI for a provider. The secret key never touches the browser:
 * we ask core-engine for a short-lived session token (`startConnect`), then hand it to
 * `@nangohq/frontend`'s Connect UI. On success the caller refreshes its connection list.
 *
 * Flow (per Nango docs): open the Connect UI first (it shows a loader), then set the
 * session token once the backend returns it.
 */
export interface ConnectIntegrationProps {
  tenant: string;
  provider: string;
  userEmail?: string;
  label?: string;
  disabled?: boolean;
  className?: string;
  onConnected?: (connectionId: string) => void;
}

export default function ConnectIntegration({
  tenant,
  provider,
  userEmail,
  label = "Connect",
  disabled,
  className,
  onConnected,
}: ConnectIntegrationProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingId = useRef<string | null>(null);

  const launch = useCallback(async () => {
    if (!tenant || !provider) return;
    setBusy(true);
    setError(null);
    try {
      const nango = new Nango();
      const connectUI = nango.openConnectUI({
        onEvent: (event) => {
          if (event.type === "connect") {
            if (pendingId.current) onConnected?.(pendingId.current);
            setBusy(false);
          } else if (event.type === "close") {
            setBusy(false);
          } else if (event.type === "error") {
            setError("Authorization failed");
            setBusy(false);
          }
        },
      });
      const res = await startConnect(tenant, provider, userEmail);
      pendingId.current = res.connectionId;
      connectUI.setSessionToken(res.sessionToken);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the connect flow");
      setBusy(false);
    }
  }, [tenant, provider, userEmail, onConnected]);

  return (
    <span className="inline-flex flex-col items-start">
      <button
        type="button"
        onClick={launch}
        disabled={disabled || busy}
        className={
          className ??
          "inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
        }
      >
        <Plug className="size-4" /> {busy ? "Connecting…" : label}
      </button>
      {error ? <span className="mt-1 text-xs text-error-500">{error}</span> : null}
    </span>
  );
}
