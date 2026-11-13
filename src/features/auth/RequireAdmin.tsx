import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { useAuth } from "./auth-context";

export function FullPageSpinner() {
  return (
    <div role="status" aria-live="polite" className="flex min-h-screen items-center justify-center text-muted-foreground">
      <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" /> Loading…
    </div>
  );
}

/**
 * UX guard only. Real enforcement is in the database: every table is behind RLS keyed on is_admin().
 */
export function RequireAdmin() {
  const { state, retry, signOut } = useAuth();
  const location = useLocation();

  switch (state.status) {
    case "loading": return <FullPageSpinner />;
    case "signed_out": return <Navigate to="/login" state={{ from: location.pathname }} replace />;
    case "unauthorized": return <Navigate to="/unauthorized" replace />;
    case "error":
      return (
        <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
          <Alert variant="destructive">We couldn’t verify your access: {state.message}</Alert>
          <div className="flex gap-2">
            <Button onClick={retry}>Try again</Button>
            <Button variant="outline" onClick={() => void signOut()}>Sign out</Button>
          </div>
        </div>
      );
    case "authorized": return <Outlet />;
  }
}
