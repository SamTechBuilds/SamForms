import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { useAuth } from "@/features/auth/auth-context";
import { AuthShell } from "./AuthShell";

const LoginInput = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

export function LoginPage() {
  const { state, signIn } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/";
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (state.status === "authorized") return <Navigate to={from} replace />;
  if (state.status === "unauthorized") return <Navigate to="/unauthorized" replace />;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = LoginInput.safeParse({ email: form.get("email"), password: form.get("password") });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check your details."); return; }
    setError(null); setBusy(true);
    const res = await signIn(parsed.data.email, parsed.data.password);
    setBusy(false);
    if (res.error) setError(res.error);
  }

  return (
    <AuthShell title="Sign in" description="Administrator access only.">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {error && <Alert variant="destructive">{error}</Alert>}
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="username" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Sign in
        </Button>
        <p className="text-center text-sm">
          <Link to="/forgot-password" className="text-primary underline-offset-4 hover:underline">Forgot password?</Link>
        </p>
      </form>
    </AuthShell>
  );
}
