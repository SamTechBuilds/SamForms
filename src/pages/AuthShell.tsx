import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import logo from "@/assets/stb-forms-logo.png";

export function AuthShell({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <img src={logo} alt="" className="h-8 w-8 rounded-lg" aria-hidden="true" />
          <p className="text-lg font-semibold tracking-tight">STB Forms</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{title}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
      </div>
    </main>
  );
}
