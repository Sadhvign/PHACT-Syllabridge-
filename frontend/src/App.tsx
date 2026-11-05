import { ReactNode } from "react";
import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import AppLayout from "./components/AppLayout";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import AdminAnalyticsPage from "./pages/AdminAnalyticsPage";
import AdminSourcesPage from "./pages/AdminSourcesPage";
import AdminSubmissionPage from "./pages/AdminSubmissionPage";
import AdminUniversitiesPage, { AdminUniversityPage } from "./pages/AdminUniversitiesPage";
import SharedReportPage from "./pages/SharedReportPage";
import CompetenciesPage from "./pages/CompetenciesPage";
import DashboardPage from "./pages/DashboardPage";
import ExportPage from "./pages/ExportPage";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import PlaceholderPage from "./pages/PlaceholderPage";
import RecommendationsPage from "./pages/RecommendationsPage";
import ReviewPage from "./pages/ReviewPage";
import UploadPage from "./pages/UploadPage";

function RequireAuth({ children }: { children: ReactNode }) {
  const { profile, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) {
    return (
      <div className="splash" role="status">
        <span className="spinner" aria-hidden="true" />
        Loading PHACT…
      </div>
    );
  }
  return profile ? children : <Navigate to="/welcome" replace state={{ from: location.pathname }} />;
}

function PublicHome() {
  const { profile, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="splash" role="status">
        <span className="spinner" aria-hidden="true" />
        Loading PHACT…
      </div>
    );
  }
  return profile ? <Navigate to="/" replace /> : <LandingPage />;
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  return profile?.is_admin ? children : <Navigate to="/" replace />;
}

function Home() {
  const { profile } = useAuth();
  return profile?.is_admin ? <AdminAnalyticsPage /> : <DashboardPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <TooltipProvider delayDuration={200}>
        <HashRouter>
          <Routes>
            <Route path="/welcome" element={<PublicHome />} />
            <Route path="/login" element={<LoginPage />} />
            <Route
              element={
                <RequireAuth>
                  <AppLayout />
                </RequireAuth>
              }
            >
              <Route index element={<Home />} />
              <Route path="upload" element={<UploadPage />} />
              <Route path="recommendations" element={<RecommendationsPage />} />
              <Route path="competencies" element={<CompetenciesPage />} />
              <Route path="review" element={<ReviewPage />} />
              <Route path="export" element={<ExportPage />} />
              <Route path="shared/:shareId" element={<SharedReportPage />} />
              <Route path="resources" element={<PlaceholderPage title="Resources" />} />
              <Route path="community" element={<PlaceholderPage title="Community" />} />
              <Route path="admin/sources" element={<RequireAdmin><AdminSourcesPage /></RequireAdmin>} />
              <Route
                path="admin/universities"
                element={<RequireAdmin><AdminUniversitiesPage /></RequireAdmin>}
              />
              <Route
                path="admin/universities/:universityId"
                element={<RequireAdmin><AdminUniversityPage /></RequireAdmin>}
              />
              <Route
                path="admin/submissions/:submissionId"
                element={<RequireAdmin><AdminSubmissionPage /></RequireAdmin>}
              />
            </Route>
            <Route path="*" element={<Navigate to="/welcome" replace />} />
          </Routes>
        </HashRouter>
        <Toaster richColors closeButton position="top-right" />
      </TooltipProvider>
    </AuthProvider>
  );
}
