import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as api from "../lib/authApi";
import type {
  AuthResult,
  SessionView,
  SocialProvider,
  WorkosUser,
} from "../lib/authApi";
import { setObservabilityContext } from "../lib/observability";

type SignUpInput = {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
};

type AuthValue = {
  isLoaded: boolean;
  isSignedIn: boolean;
  user: WorkosUser | null;
  session: SessionView | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<void>;
  signOut: () => Promise<void>;
  social: (provider: SocialProvider) => void;
  completeFromToken: () => Promise<boolean>;
  updateProfile: (input: { firstName?: string; lastName?: string }) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  deleteAccount: () => Promise<void>;
  createOrganization: (input: { name: string }) => Promise<api.CreateOrgResult>;
  refreshSession: (opts?: { fresh?: boolean }) => Promise<void>;
  getToken: () => string | null;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [user, setUser] = useState<WorkosUser | null>(null);
  const [session, setSession] = useState<SessionView | null>(null);

  const apply = useCallback((r: AuthResult | null) => {
    if (r) {
      api.setAccessToken(r.accessToken);
      setUser(r.user);
      setSession(r.session);
    } else {
      api.setAccessToken(null);
      setUser(null);
      setSession(null);
    }
  }, []);

  // Bootstrap from the refresh cookie on first load.
  useEffect(() => {
    let active = true;
    api
      .refresh()
      .then((r) => active && apply(r))
      .catch(() => active && apply(null))
      .finally(() => active && setIsLoaded(true));
    return () => {
      active = false;
    };
  }, [apply]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      apply(await api.login(email, password));
    },
    [apply],
  );

  const signUp = useCallback(
    async (input: SignUpInput) => {
      await api.register(input);
      // Users are created email-verified (backend flag) → sign straight in.
      apply(await api.login(input.email, input.password));
    },
    [apply],
  );

  const signOut = useCallback(async () => {
    await api.logout();
    apply(null);
  }, [apply]);

  const social = useCallback((provider: SocialProvider) => {
    window.location.assign(api.socialUrl(provider));
  }, []);

  const completeFromToken = useCallback(async () => {
    const r = await api.refresh();
    apply(r);
    return !!r;
  }, [apply]);

  const updateProfile = useCallback(
    async (input: { firstName?: string; lastName?: string }) => {
      const { user: u } = await api.updateProfile(input);
      setUser(u);
    },
    [],
  );

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      await api.changePassword(currentPassword, newPassword);
    },
    [],
  );

  const deleteAccount = useCallback(async () => {
    await api.deleteAccount();
    apply(null);
  }, [apply]);

  const createOrganization = useCallback(
    async (input: { name: string }) => {
      const res = await api.createOrganization({
        name: input.name,
        firstName: user?.firstName ?? undefined,
        lastName: user?.lastName ?? undefined,
        email: user?.email,
      });
      // Re-read the session scoped to the new tenant (bypasses the gateway's
      // per-(user,tenant) cache of the old unprovisioned view) → provisioned:true.
      setSession(await api.getSession(res.tenantId));
      return res;
    },
    [user],
  );

  // Keep the latest session in a ref so refreshSession can read the current
  // tenant WITHOUT depending on `session`. Depending on `session` gave it a new
  // identity on every session change, so any effect keyed on [refreshSession]
  // (e.g. the Forms editor's "re-read session on entry") looped infinitely,
  // hammering the session endpoint.
  const sessionRef = useRef<SessionView | null>(session);
  useEffect(() => {
    sessionRef.current = session;
    // Tag error reports with the active tenant/user for multi-tenant triage (#23).
    setObservabilityContext({ tenant: session?.tenant, userId: session?.userId });
  }, [session]);

  const refreshSession = useCallback(async (opts?: { fresh?: boolean }) => {
    setSession(await api.getSession(sessionRef.current?.tenant ?? undefined, opts));
  }, []);

  const value: AuthValue = {
    isLoaded,
    isSignedIn: !!user,
    user,
    session,
    signIn,
    signUp,
    signOut,
    social,
    completeFromToken,
    updateProfile,
    changePassword,
    deleteAccount,
    createOrganization,
    refreshSession,
    getToken: api.getAccessToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

export type UiUser = WorkosUser & { fullName: string | null };

// Small Clerk-ish shape so page swaps stay minimal.
export function useUser(): { isLoaded: boolean; user: UiUser | null } {
  const { isLoaded, user } = useAuth();
  const ui: UiUser | null = user
    ? {
        ...user,
        fullName: [user.firstName, user.lastName].filter(Boolean).join(" ") || null,
      }
    : null;
  return { isLoaded, user: ui };
}
