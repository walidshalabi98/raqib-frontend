import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { RequireCapability } from "@/components/RequireCapability";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PageSkeleton } from "@/components/layout/PageSkeleton";
import Login from "./pages/Login";

// The signed-in layout loads with the translations it uses (labels of its icon buttons), so the
// login screen's bundle stays small.
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

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
          <Routes>
            <Route path="/" element={<Login />} />
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
                  // AI framework generation is for org staff; donor viewers go back to the project.
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
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
