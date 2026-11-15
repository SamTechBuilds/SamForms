import type { ReactNode } from "react";

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: string; actions?: ReactNode; eyebrow?: string }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b pb-6">
      <div className="min-w-0 space-y-1.5">
        {eyebrow && <p className="text-xs font-semibold uppercase tracking-wider text-primary">{eyebrow}</p>}
        <h1 className="text-balance text-3xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
