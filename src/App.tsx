import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { RequireAdmin } from "@/features/auth/RequireAdmin";
import { AppLayout } from "@/features/dashboard/AppLayout";
import { LoginPage } from "@/pages/LoginPage";
import { ForgotPasswordPage } from "@/pages/ForgotPasswordPage";
import { ResetPasswordPage } from "@/pages/ResetPasswordPage";
import { UnauthorizedPage } from "@/pages/UnauthorizedPage";
import { OverviewPage } from "@/pages/OverviewPage";
import { FormsPage } from "@/pages/FormsPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { ComingSoonPage } from "@/pages/ComingSoonPage";
import { PublicFormPage } from "@/pages/PublicFormPage";
const CreateFormPage = lazy(() => import("@/pages/CreateFormPage").then(m => ({ default: m.CreateFormPage })));
const BuilderPage = lazy(() => import("@/pages/BuilderPage").then(m => ({ default: m.BuilderPage })));
const PreviewPage = lazy(() => import("@/pages/PreviewPage").then(m => ({ default: m.PreviewPage })));
const TemplatesPage = lazy(() => import("@/pages/TemplatesPage").then(m => ({ default: m.TemplatesPage })));
const Loading = () => <div className="p-8 text-sm text-muted-foreground" role="status">Loading…</div>;
import { NotFoundPage } from "@/pages/NotFoundPage";

export function App() {
  return (
    <Suspense fallback={<Loading />}>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />
      {/* Public respondent route: outside RequireAdmin on purpose. */}
      <Route path="/f/:slug" element={<PublicFormPage />} />
      <Route element={<RequireAdmin />}>
        <Route element={<AppLayout />}>
          <Route index element={<OverviewPage />} />
          <Route path="forms" element={<FormsPage />} />
          <Route path="forms/new" element={<CreateFormPage />} />
          <Route path="forms/:id/edit" element={<BuilderPage />} />
          <Route path="forms/:id/preview" element={<PreviewPage />} />
          <Route path="responses" element={<ComingSoonPage title="Responses" phase={4} description="Browse, search and export submissions. Requires public forms (Phase 3) and response management (Phase 4)." />} />
          <Route path="templates" element={<TemplatesPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
    </Suspense>
  );
}
