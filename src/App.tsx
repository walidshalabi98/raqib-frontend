import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useOptionalAuth } from "@/contexts/AuthContext";
import { PasswordHandoverProvider } from "@/components/settings/PasswordHandover";
import { RaqibLogo } from "@/components/common/RaqibLogo";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { RequireCapability } from "@/components/RequireCapability";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PageSkeleton } from "@/components/layout/PageSkeleton";

// The screens before sign-in load on demand with the translations they use (English and Arabic),
// so the main bundle stays small.
const Login = lazy(() => import("./pages/Login"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));

// The signed-in layout loads with the translations it uses (labels of its icon buttons).
const Layout = lazy(() => import("@/components/layout/Layout").then((module) => ({ default: module.Layout })));

// Pages behind sign-in are loaded on demand so the login screen downloads less code.
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Projects = lazy(() => import("./pages/Projects"));
const ProjectDetail = lazy(() => import("./pages/ProjectDetail"));
const AIWizard = lazy(() => import("./pages/AIWizard"));
const Assessments = lazy(() => import("./pages/Assessments"));
const Reports = lazy(() => import("./pages/Reports"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const Beneficiaries = lazy(() => import("./pages/Beneficiaries"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * While a sign-in screen loads (with its translations): the card it appears in, with the logo and grey
 * placeholder lines, so a slow first visit does not show a blank page. No text: the translations are what is
 * loading.
 */
export const PublicFallback = () => (
  <main aria-busy="true" className="flex min-h-screen items-center justify-center bg-background p-4">
    <div data-testid="public-fallback" className="card-surface w-full max-w-sm p-6 sm:p-8">
      <div dir="ltr" className="mb-6 flex justify-center">
        <RaqibLogo size="lg" />
      </div>
      <div className="mx-auto mb-6 h-5 w-28 animate-pulse rounded bg-muted" />
      <div className="space-y-5">
        <div className="h-10 animate-pulse rounded-lg bg-muted" />
        <div className="h-10 animate-pulse rounded-lg bg-muted" />
        <div className="h-11 animate-pulse rounded-lg bg-muted" />
      </div>
    </div>
  </main>
);

/** Toasts in the signed-in user's direction, so Arabic toasts read right to left (no translations needed here). */
export function UserToaster() {
  const auth = useOptionalAuth();
  return <Sonner dir={auth?.user?.languagePref === "ar" ? "rtl" : "ltr"} />;
}

/**
 * Every route. `/` is the sign-in screen; `/login` (the address in older invitation emails) goes there
 * too. `/reset-password?token=…` is public: the token in the emailed link is the proof.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Suspense fallback={<PublicFallback />}><Login /></Suspense>} />
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="/reset-password" element={<Suspense fallback={<PublicFallback />}><ResetPassword /></Suspense>} />
      <Route
        element={
          <ProtectedRoute>
            <Suspense fallback={<PageSkeleton />}>
              <Layout />
            </Suspense>
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/:id" element={<ProjectDetail />} />
        <Route
          path="/wizard/:id"
          element={
            // AI framework generation is for org staff; donor viewers go back to the project, and so does
            // everyone while the project is archived (read-only; the wizard checks, in its own chunk).
            <RequireCapability capability="ai.run" redirectTo={(p) => `/projects/${encodeURIComponent(p.id ?? "")}`}>
              <AIWizard />
            </RequireCapability>
          }
        />
        <Route path="/beneficiaries" element={<Beneficiaries />} />
        <Route path="/assessments" element={<Assessments />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Suspense fallback={null}><NotFound /></Suspense>} />
    </Routes>
  );
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <UserToaster />
          {/* Above the routes: a temporary password is shown even if the admin left Settings meanwhile. */}
          <PasswordHandoverProvider>
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          </PasswordHandoverProvider>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
