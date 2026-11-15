import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { FileText, Inbox, LayoutDashboard, LayoutTemplate, LogOut, Menu, PlusCircle, Settings, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import logo from "@/assets/stb-forms-logo.png";
import { useAuth } from "@/features/auth/auth-context";
import { AccentPicker, ThemeToggle } from "@/features/theme/ThemeToggle";

type NavItem = { to: string; label: string; icon: typeof FileText; end: boolean };

/** Main navigation, in display order. Settings sits at the bottom of the sidebar. */
export const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/forms", label: "Forms", icon: FileText, end: true },
  { to: "/responses", label: "Responses", icon: Inbox, end: false },
  { to: "/templates", label: "Templates", icon: LayoutTemplate, end: false },
  { to: "/forms/new", label: "New form", icon: PlusCircle, end: true },
  { to: "/forms/new/ai", label: "Draft with AI", icon: Sparkles, end: true },
];

function initials(email: string): string {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._-]+/).filter(Boolean);
  const letters = parts.length >= 2 ? `${parts[0]![0]}${parts[1]![0]}` : local.slice(0, 2);
  return letters.toUpperCase() || "?";
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <img src={logo} alt="" className="h-9 w-9 rounded-xl" aria-hidden="true" />
      <p className="text-base font-semibold tracking-tight">STB Forms</p>
    </div>
  );
}

const linkClass = (isActive: boolean) => cn(
  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  isActive ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground",
);

export function AppLayout() {
  const { state, signOut } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const email = state.status === "authorized" ? state.admin.email : "";

  const nav = (
    <nav aria-label="Main" className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
      {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)} className={({ isActive }) => linkClass(isActive)}>
          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{label}</span>
        </NavLink>
      ))}
      <div className="mt-auto pt-4">
        <NavLink to="/settings" onClick={() => setOpen(false)} className={({ isActive }) => linkClass(isActive)}>
          <Settings className="h-4 w-4 shrink-0" aria-hidden="true" /> Settings
        </NavLink>
      </div>
    </nav>
  );

  const footer = (
    <div className="space-y-3 border-t p-3">
      <div className="flex items-center gap-3 rounded-xl bg-muted/60 p-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground" aria-hidden="true">
          {email ? initials(email) : "?"}
        </span>
        <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={email}>{email}</p>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground" aria-label="Sign out" onClick={() => void signOut()}>
          <LogOut className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
      <div className="flex items-center justify-between gap-2 px-1">
        <ThemeToggle />
        <AccentPicker />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-muted/30 md:flex">
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-card md:sticky md:top-0 md:flex md:h-screen">
        <div className="px-5 py-6"><Brand /></div>
        {nav}
        {footer}
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-card/95 px-4 py-3 backdrop-blur md:hidden">
        <Brand />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button variant="ghost" size="icon" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen(o => !o)}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </header>
      {open && (
        <div className="fixed inset-x-0 bottom-0 top-[57px] z-20 flex flex-col overflow-y-auto border-b bg-card md:hidden">
          {nav}
          {footer}
        </div>
      )}

      <main key={location.pathname} className="min-w-0 flex-1 page-enter">
        <div className="mx-auto w-full max-w-6xl p-4 md:p-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
