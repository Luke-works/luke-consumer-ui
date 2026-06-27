import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { BrowserRouter as Router, Routes, Route, useLocation } from "react-router";
import { AuthProvider } from "./context/AuthContext";
import ErrorBoundary from "./components/common/ErrorBoundary";
import SignIn from "./pages/AuthPages/SignIn";
import SignUp from "./pages/AuthPages/SignUp";
import SsoCallback from "./pages/AuthPages/SsoCallback";
import NotFound from "./pages/OtherPage/NotFound";
import AppLayout from "./layout/AppLayout";
import { ScrollToTop } from "./components/common/ScrollToTop";
import Home from "./pages/Dashboard/Home";
import FormsList from "./pages/Forms/FormsList";
import EmailTemplatesList from "./pages/EmailTemplates/EmailTemplatesList";
import Email from "./pages/Email/Email";
import Phone from "./pages/Phone/Phone";
import Profile from "./pages/Account/Profile";
import Settings from "./pages/Account/Settings";
import Support from "./pages/Support/Support";
import AccessManagement from "./pages/Access/AccessManagement";

// Code-split the form designer (@lukeflow/form-builder) to its own route chunk.
const FormBuilderPage = lazy(() => import("./pages/Forms/FormBuilderPage"));
const FormFill = lazy(() => import("./pages/Forms/FormFill"));
const FormResponses = lazy(() => import("./pages/Forms/FormResponses"));
const FormEmbed = lazy(() => import("./pages/Forms/FormEmbed"));
const FormInstancesList = lazy(() => import("./pages/Forms/FormInstancesList"));
const FormInbox = lazy(() => import("./pages/Forms/FormInbox"));
// Code-split the email-template builder (react-email render) to its own chunk.
const EmailTemplateBuilderPage = lazy(() => import("./pages/EmailTemplates/EmailTemplateBuilderPage"));
// Code-split the signature pages (react-pdf + pdf.js) to their own chunk.
const SignaturesList = lazy(() => import("./pages/Signatures/SignaturesList"));
const SignatureBuilderPage = lazy(() => import("./pages/Signatures/SignatureBuilderPage"));
const SignPage = lazy(() => import("./pages/Signatures/SignPage"));
import ProtectedRoute from "./components/auth/ProtectedRoute";
import GuestRoute from "./components/auth/GuestRoute";
import OnboardingGate from "./components/auth/OnboardingGate";
import CapabilityRoute from "./components/auth/CapabilityRoute";
import { EMAIL, FORMS, SIGNATURES } from "./lib/capabilities";
import { loadFreeEmailDomains } from "./lib/emailDomains";

if (!import.meta.env.VITE_AUTH_API_URL) {
  throw new Error(
    "Missing VITE_AUTH_API_URL. Point it at the luke-auth-engine base URL in your .env.local.",
  );
}

export default function App() {
  // Pull the authoritative free-email-domain list once (advisory hint; #38).
  useEffect(() => { void loadFreeEmailDomains(); }, []);
  return (
    <Router>
      <ScrollToTop />
      <AuthProvider>
        <AppErrorBoundary>
        <Routes>
          {/* Protected routes */}
          <Route element={<ProtectedRoute />}>
            {/* Landing after login: onboarding for new users, app for provisioned. */}
            <Route index path="/" element={<OnboardingGate />} />

            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<Home />} />
              {/* Email — gated behind the EMAIL capability (read to view). */}
              <Route element={<CapabilityRoute code={EMAIL} />}>
                <Route path="/email" element={<Email />} />
                {/* Email Templates — list + AI-chat builder, behind the same EMAIL gate. */}
                <Route path="/email-templates" element={<EmailTemplatesList />} />
                <Route
                  path="/email-templates/:id"
                  element={
                    <Suspense
                      fallback={
                        <div className="flex h-[60vh] items-center justify-center text-sm text-gray-400">
                          Loading builder…
                        </div>
                      }
                    >
                      <EmailTemplateBuilderPage />
                    </Suspense>
                  }
                />
              </Route>
              {/* Signatures — gated behind the SIGNATURES capability (read to view, write to send). */}
              <Route element={<CapabilityRoute code={SIGNATURES} />}>
                <Route
                  path="/signatures"
                  element={
                    <Suspense fallback={<div className="flex h-[60vh] items-center justify-center text-sm text-gray-400">Loading…</div>}>
                      <SignaturesList />
                    </Suspense>
                  }
                />
                <Route
                  path="/signatures/:id"
                  element={
                    <Suspense fallback={<div className="flex h-[60vh] items-center justify-center text-sm text-gray-400">Loading designer…</div>}>
                      <SignatureBuilderPage />
                    </Suspense>
                  }
                />
              </Route>
              <Route path="/phone" element={<Phone />} />
              <Route path="/account/profile" element={<Profile />} />
              <Route path="/account/settings" element={<Settings />} />
              <Route path="/access" element={<AccessManagement />} />
              <Route path="/support" element={<Support />} />

              {/* Forms — gated behind the FORMS capability (read to view, write to edit). */}
              <Route element={<CapabilityRoute code={FORMS} />}>
                <Route path="/forms" element={<FormsList />} />
                {/* Form Instances — all submissions + the end-to-end process trace. */}
                <Route
                  path="/forms/instances"
                  element={
                    <Suspense fallback={<div className="flex h-[60vh] items-center justify-center text-sm text-gray-400">Loading…</div>}>
                      <FormInstancesList />
                    </Suspense>
                  }
                />
                {/* Form Inbox — open user tasks (Review Submission) for the tenant. */}
                <Route
                  path="/forms/inbox"
                  element={
                    <Suspense fallback={<div className="flex h-[60vh] items-center justify-center text-sm text-gray-400">Loading…</div>}>
                      <FormInbox />
                    </Suspense>
                  }
                />
                {/* Form designer — lives in the normal dashboard shell. */}
                <Route
                  path="/forms/:id"
                  element={
                    <Suspense
                      fallback={
                        <div className="flex h-[60vh] items-center justify-center text-sm text-gray-400">
                          Loading designer…
                        </div>
                      }
                    >
                      <FormBuilderPage />
                    </Suspense>
                  }
                />
                {/* Fill a form (creates a runtime instance) and view its responses. */}
                <Route
                  path="/forms/:code/fill"
                  element={
                    <Suspense fallback={<div className="flex h-[60vh] items-center justify-center text-sm text-gray-400">Loading…</div>}>
                      <FormFill />
                    </Suspense>
                  }
                />
                <Route
                  path="/forms/:code/responses"
                  element={
                    <Suspense fallback={<div className="flex h-[60vh] items-center justify-center text-sm text-gray-400">Loading…</div>}>
                      <FormResponses />
                    </Suspense>
                  }
                />
              </Route>
            </Route>
          </Route>

          {/* Auth pages (only for signed-out users) */}
          <Route element={<GuestRoute />}>
            <Route path="/signin" element={<SignIn />} />
            <Route path="/signup" element={<SignUp />} />
          </Route>

          {/* Public embeddable form (iframe target) — no auth; the signed token is the auth. */}
          <Route
            path="/embed/:token"
            element={
              <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-gray-400">Loading…</div>}>
                <FormEmbed />
              </Suspense>
            }
          />

          {/* Public signing page — no auth; the unguessable sign token is the auth. */}
          <Route
            path="/sign/:token"
            element={
              <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-gray-400">Loading…</div>}>
                <SignPage />
              </Suspense>
            }
          />

          {/* Social / SSO redirect handler — outside the guards (no session yet). */}
          <Route path="/sso-callback" element={<SsoCallback />} />

          {/* Fallback Route */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        </AppErrorBoundary>
      </AuthProvider>
    </Router>
  );
}

/** Top-level boundary so a render throw shows a recoverable fallback, not a blank
 *  page. Keyed by path so navigating away clears a crashed route. */
function AppErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <ErrorBoundary resetKeys={[pathname]} label="app-root">
      {children}
    </ErrorBoundary>
  );
}
