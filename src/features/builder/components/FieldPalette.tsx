import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { fieldsByCategory } from "@/fields/registry";
import { fieldUi } from "@/fields/ui";
import { useBuilder } from "../context";

/** Left panel: every registered field type, grouped by category. Click to add. */
export function FieldPalette({ onAdded }: { onAdded?: () => void }) {
  const { addQuestion } = useBuilder();
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const groups = fieldsByCategory
    .map(c => ({ ...c, fields: c.fields.filter(f => !needle || f.label.toLowerCase().includes(needle) || f.description.toLowerCase().includes(needle)) }))
    .filter(c => c.fields.length);
  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input aria-label="Search field types" placeholder="Search fields" className="h-9 pl-8" value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        {groups.map(c => (
          <section key={c.id} aria-labelledby={`cat-${c.id}`}>
            <h3 id={`cat-${c.id}`} className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{c.label}</h3>
            <ul className="grid grid-cols-2 gap-1.5 lg:grid-cols-1 xl:grid-cols-2">
              {c.fields.map(f => {
                const Icon = fieldUi[f.type].icon;
                return (
                  <li key={f.type}>
                    <button type="button" title={f.description} onClick={() => { addQuestion(f.type); onAdded?.(); }}
                      className="flex w-full items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-left text-sm hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      <span className="truncate">{f.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        {groups.length === 0 && <p className="px-1 text-sm text-muted-foreground">No field types match “{q}”.</p>}
      </div>
    </div>
  );
}
