import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/features/auth/auth-context";
import { PageHeader } from "./PageHeader";

export function SettingsPage() {
  const { state, signOut } = useAuth();
  const admin = state.status === "authorized" ? state.admin : null;
  return (
    <>
      <PageHeader title="Settings" />
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Platform settings (retention, notifications) arrive in later phases.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
            <dt className="text-muted-foreground">Email</dt><dd>{admin?.email}</dd>
            <dt className="text-muted-foreground">Role</dt><dd>{admin?.role === "super_admin" ? "Super Admin" : admin?.role}</dd>
          </dl>
          <Button variant="outline" onClick={() => void signOut()}>Sign out</Button>
        </CardContent>
      </Card>
    </>
  );
}
