import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { useAuth } from "@/features/auth/auth-context";
import { AuthShell } from "./AuthShell";

// Mirrors supabase/config.toml: minimum_password_length = 12, lower_upper_letters_digits.
export const PasswordPolicy = z.string()
  .min(12, "Use at least 12 characters.")
  .regex(/[a-z]/, "Include a lowercase letter.")
  .regex(/[A-Z]/, "Include an uppercase letter.")
  .regex(/[0-9]/, "Include a digit.");

export function ResetPasswordPage() {
  const { recoveryActive, state, updatePassword } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (state.status === "loading") return <AuthShell title="Reset password"><p role="status">Checking your reset link…</p></AuthShell>;

  if (!recoveryActive) {
    return (
      <AuthShell title="Link expired or invalid">
        <p className="mb-4 text-sm text-muted-foreground">This password reset link can’t be used. Request a new one.</p>
        <Link to="/forgot-password" className="text-sm text-primary hover:underline">Request a new link</Link>
      </AuthShell>
    );
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = PasswordPolicy.safeParse(form.get("password"));
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Invalid password."); return; }
    if (form.get("confirm") !== parsed.data) { setError("Passwords do not match."); return; }
    setError(null); setBusy(true);
    const res = await updatePassword(parsed.data);
    setBusy(false);
    if (res.error) setError(res.error); else navigate("/", { replace: true });
  }

  return (
    <AuthShell title="Choose a new password">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {error && <Alert variant="destructive">{error}</Alert>}
        <div className="space-y-2">
          <Label htmlFor="password">New password</Label>
          <Input id="password" name="password" type="password" autoComplete="new-password" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm password</Label>
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
        </div>
        <Button type="submit" className="w-full" disabled={busy}>Update password</Button>
      </form>
    </AuthShell>
  );
}
