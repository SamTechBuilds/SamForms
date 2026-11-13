import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { useAuth } from "@/features/auth/auth-context";
import { AuthShell } from "./AuthShell";

export function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = z.string().trim().email("Enter a valid email address.").safeParse(new FormData(e.currentTarget).get("email"));
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Enter a valid email."); return; }
    setError(null); setBusy(true);
    const res = await requestPasswordReset(parsed.data);
    setBusy(false);
    if (res.error) setError(res.error); else setSent(true);
  }

  return (
    <AuthShell title="Reset password" description="We’ll email a reset link if the address belongs to an administrator.">
      {sent ? (
        <div className="space-y-4">
          <Alert>If that address is registered, a reset link is on its way. Check your inbox.</Alert>
          <Link to="/login" className="text-sm text-primary hover:underline">Back to sign in</Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {error && <Alert variant="destructive">{error}</Alert>}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>Send reset link</Button>
          <p className="text-center text-sm"><Link to="/login" className="text-primary hover:underline">Back to sign in</Link></p>
        </form>
      )}
    </AuthShell>
  );
}
