import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { FileText, Inbox, LayoutDashboard, LayoutTemplate, LogOut, Menu, PlusCircle, Settings, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-context";

export const NAV_ITEMS = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/forms", label: "My Forms", icon: FileText, end: true },
  { to: "/forms/new", label: "Create Form", icon: PlusCircle, end: true },
  { to: "/responses", label: "Responses", icon: Inbox, end: false },
  { to: "/templates", label: "Templates", icon: LayoutTemplate, end: false },
  { to: "/settings", label: "Settings", icon: Settings, end: false },
] as const;

export function AppLayout() {
  const { state, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const email = state.status === "authorized" ? state.admin.email : "";

  const nav = (
    <nav aria-label="Main" className="flex flex-1 flex-col gap-1 p-3">
      {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)}
          className={({ isActive }) => cn("flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>
          <Icon className="h-4 w-4" aria-hidden="true" /> {label}
        </NavLink>
      ))}
    </nav>
  );

  const footer = (
    <div className="border-t p-3">
      <p className="mb-2 truncate px-3 text-xs text-muted-foreground" title={email}>{email}</p>
      <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => void signOut()}>
        <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out
      </Button>
    </div>
  );

  return (
    <div className="min-h-screen md:flex">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-card md:flex md:sticky md:top-0 md:h-screen">
        <div className="px-6 py-5 text-lg font-semibold tracking-tight">Sam Forms</div>
        {nav}{footer}
      </aside>

      <header className="flex items-center justify-between border-b bg-card px-4 py-3 md:hidden">
        <span className="font-semibold">Sam Forms</span>
        <Button variant="ghost" size="icon" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen(o => !o)}>
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </header>
      {open && <div className="flex flex-col border-b bg-card md:hidden">{nav}{footer}</div>}

      <main className="min-w-0 flex-1 p-4 md:p-8"><Outlet /></main>
    </div>
  );
}
