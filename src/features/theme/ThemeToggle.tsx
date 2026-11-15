import { Check, Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACCENT_SWATCH, ADMIN_ACCENTS, setAdminAccent, setAdminThemeMode, useAdminAccent, useAdminThemeMode, type AdminThemeMode } from "./adminTheme";

const OPTIONS: { mode: AdminThemeMode; label: string; icon: typeof Sun }[] = [
  { mode: "light", label: "Light", icon: Sun },
  { mode: "dark", label: "Dark", icon: Moon },
  { mode: "system", label: "System", icon: Monitor },
];

export function ThemeToggle({ className }: { className?: string }) {
  const mode = useAdminThemeMode();
  return (
    <div role="group" aria-label="Colour theme" className={cn("inline-flex rounded-lg bg-muted p-1", className)}>
      {OPTIONS.map(({ mode: value, label, icon: Icon }) => {
        const active = mode === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            aria-label={`${label} theme`}
            title={`${label} theme`}
            onClick={() => setAdminThemeMode(value)}
            className={cn(
              "inline-flex h-7 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active && "bg-card text-foreground shadow-sm",
              !active && "hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

export function AccentPicker({ className }: { className?: string }) {
  const accent = useAdminAccent();
  return (
    <div role="group" aria-label="Accent colour" className={cn("flex items-center gap-1.5", className)}>
      {ADMIN_ACCENTS.map(a => {
        const active = accent === a;
        return (
          <button
            key={a}
            type="button"
            aria-pressed={active}
            aria-label={`${a} accent`}
            title={`${a} accent`}
            onClick={() => setAdminAccent(a)}
            className={cn(
              "flex h-5 w-5 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition-shadow",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active && "ring-2 ring-foreground/70",
            )}
            style={{ backgroundColor: ACCENT_SWATCH[a] }}
          >
            {active && <Check className="h-3 w-3 text-white" strokeWidth={3} aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}
