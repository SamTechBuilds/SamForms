import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-context";
import { AuthShell } from "./AuthShell";

export function UnauthorizedPage() {
  const { state, signOut } = useAuth();
  if (state.status === "signed_out") return <Navigate to="/login" replace />;
  if (state.status === "authorized") return <Navigate to="/" replace />;
  return (
    <AuthShell title="Access denied" description="This account is not authorized to use STB Forms.">
      <p className="mb-4 text-sm text-muted-foreground">
        {state.status === "unauthorized" && state.email ? `Signed in as ${state.email}. ` : ""}
        Only the allowlisted administrator can access this application.
      </p>
      <Button variant="outline" className="w-full" onClick={() => void signOut()}>Sign out</Button>
    </AuthShell>
  );
}
