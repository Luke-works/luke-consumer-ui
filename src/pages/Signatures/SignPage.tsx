import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { AlertCircle } from "lucide-react";
import { SigningCeremony } from "@lukeflow/sign-react";
import { ApiError, signaturesClient, type SigningSession } from "../../lib/signaturesApi";

/**
 * Public, token-authenticated signing page (outside the authed app shell). The guided
 * ceremony UI lives in @lukeflow/sign-react; this page only fetches the session and wires
 * submit/error to the app's signatures client.
 */
export default function SignPage() {
  const { token } = useParams<{ token: string }>();
  const [session, setSession] = useState<SigningSession | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    const ctl = new AbortController();
    setLoadError(null);
    signaturesClient
      .getSigningSession(token, ctl.signal)
      .then(setSession)
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setLoadError(messageFor(e));
      });
    return () => ctl.abort();
  }, [token]);

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
        <div className="mx-auto max-w-md rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <AlertCircle className="mx-auto mb-3 size-10 text-error-500" />
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">This link can’t be opened</h1>
          <p className="mt-1 text-sm text-gray-500">{loadError}</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950">
        <p className="text-sm text-gray-400">Loading document…</p>
      </div>
    );
  }

  return (
    <SigningCeremony
      session={session}
      brandName="Lukeflow"
      onSubmit={async (input) => {
        await signaturesClient.submitSignature(token!, input);
      }}
      errorMessage={messageFor}
    />
  );
}

function messageFor(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 404) return "This signing link is invalid or no longer available.";
    if (e.status === 410) return "This document has already been signed or has been voided.";
    if (e.status === 403) return "Signing is not permitted from your current network.";
    if (e.status === 400) return "Please draw your signature and accept the consent before signing.";
    return e.message;
  }
  return "Something went wrong. Please try again.";
}
