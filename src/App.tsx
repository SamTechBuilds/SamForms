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
import { NotFoundPage } from "@/pages/NotFoundPage";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />
      <Route element={<RequireAdmin />}>
        <Route element={<AppLayout />}>
          <Route index element={<OverviewPage />} />
          <Route path="forms" element={<FormsPage />} />
          <Route path="forms/new" element={<ComingSoonPage title="Create Form" phase={2} description="Create from scratch, import a document, or generate with AI. The builder and canonical schema editor arrive in Phase 2 (AI creation in Phase 5)." />} />
          <Route path="responses" element={<ComingSoonPage title="Responses" phase={4} description="Browse, search and export submissions. Requires public forms (Phase 3) and response management (Phase 4)." />} />
          <Route path="templates" element={<ComingSoonPage title="Templates" phase={2} description="Starter form templates arrive with the builder in Phase 2." />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
