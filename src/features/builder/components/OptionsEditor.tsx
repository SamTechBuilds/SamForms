import { useState } from "react";
import { ArrowDown, ArrowUp, ListPlus, Plus, Trash2 } from "lucide-react";
import type { Question } from "@/schema/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { newId, newOption } from "../factory";

type Option = NonNullable<Question["options"]>[number];
const toValue = (label: string) => label.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 200) || "option";

/** Keeps option values unique (stored answers use values; labels are free to change). */
function uniqueValue(base: string, taken: Set<string>) {
  let v = base, n = 2;
  while (taken.has(v)) v = `${base}_${n++}`;
  return v;
}

export function OptionsEditor({ question, onChange }: { question: Question; onChange: (options: Option[]) => void }) {
  const options = question.options ?? [];
  const [bulk, setBulk] = useState<string | null>(null);
  const set = (i: number, patch: Partial<Option>) => onChange(options.map((o, j) => (i === j ? { ...o, ...patch } : o)));
  const move = (i: number, d: -1 | 1) => { const n = [...options]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x!); onChange(n); };

  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm font-medium">Options</legend>
      <ol className="space-y-1.5">
        {options.map((o, i) => (
          <li key={o.id} className="flex items-center gap-1">
            <span className="w-5 text-center text-xs text-muted-foreground" aria-hidden="true">{i + 1}</span>
            <Input aria-label={`Option ${i + 1} label`} value={o.label} maxLength={200} className="h-8"
              onChange={e => {
                const label = e.target.value;
                // Keep the stored value in step with the label until the label is cleared/duplicated.
                const others = new Set(options.filter((_, j) => j !== i).map(x => x.value));
                set(i, label.trim() ? { label, value: uniqueValue(toValue(label), others) } : { label });
              }} />
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={`Move option ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={`Move option ${i + 1} down`} disabled={i === options.length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-destructive" aria-label={`Remove option ${i + 1}`} disabled={options.length <= 1} onClick={() => onChange(options.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5" /></Button>
          </li>
        ))}
      </ol>
      {options.some(o => !o.label.trim()) && <p className="text-xs text-destructive">Every option needs a label.</p>}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => onChange([...options, newOption(options)])} disabled={options.length >= 200}><Plus className="h-4 w-4" /> Add option</Button>
        <Button variant="ghost" size="sm" onClick={() => setBulk(bulk === null ? "" : null)}><ListPlus className="h-4 w-4" /> Add many</Button>
      </div>
      {bulk !== null && (
        <div className="space-y-2">
          <Textarea aria-label="Options, one per line" rows={5} placeholder={"One option per line"} value={bulk} onChange={e => setBulk(e.target.value)} />
          <Button size="sm" onClick={() => {
            const taken = new Set(options.map(o => o.value));
            const added = bulk.split("\n").map(l => l.trim()).filter(Boolean).slice(0, 200 - options.length).map(label => {
              const value = uniqueValue(toValue(label), taken); taken.add(value);
              return { id: newId("o"), label: label.slice(0, 200), value };
            });
            onChange([...options, ...added]); setBulk(null);
          }}>Add {bulk.split("\n").filter(l => l.trim()).length} option(s)</Button>
        </div>
      )}
    </fieldset>
  );
}
