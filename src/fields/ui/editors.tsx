import { useId, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { NativeSelect } from "@/components/ui/select";
import type { Question } from "@/schema/form";
import type { FieldConfig } from "../types";
import { DOCUMENT_MIME_TYPES, IMAGE_MIME_TYPES } from "../definitions";

export interface ConfigEditorProps {
  question: Question;
  config: FieldConfig;
  setConfig: (patch: FieldConfig) => void;
  update: (patch: Partial<Omit<Question, "id">>) => void;
}

export function Row({ label, children, hint }: { label: string; children: (id: string) => ReactNode; hint?: string }) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children(id)}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
export function SwitchRow({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-3">
      <div><Label id={id}>{label}</Label>{hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}</div>
      <Switch checked={checked} onCheckedChange={onChange} aria-labelledby={id} />
    </div>
  );
}
const optStr = (v: string) => (v.trim() === "" ? undefined : v);
const num = (v: string) => (v === "" ? undefined : Number(v));
const IntSelect = ({ id, value, from, to, onChange }: { id: string; value: number; from: number; to: number; onChange: (n: number) => void }) => (
  <NativeSelect id={id} value={value} onChange={e => onChange(Number(e.target.value))}>
    {Array.from({ length: to - from + 1 }, (_, i) => from + i).map(n => <option key={n} value={n}>{n}</option>)}
  </NativeSelect>
);

export const LongTextEditor = ({ config, setConfig }: ConfigEditorProps) => (
  <Row label="Visible rows">{id => <IntSelect id={id} value={config.rows as number} from={2} to={12} onChange={rows => setConfig({ rows })} />}</Row>
);
export const NameEditor = ({ config, setConfig }: ConfigEditorProps) => (
  <Row label="Name format">{id => (
    <NativeSelect id={id} value={config.format as string} onChange={e => setConfig({ format: e.target.value })}>
      <option value="full">Single field (full name)</option><option value="first_last">First and last name</option>
    </NativeSelect>)}</Row>
);
export const NumberEditor = ({ config, setConfig }: ConfigEditorProps) => (
  <SwitchRow label="Allow decimals" checked={config.allowDecimals as boolean} onChange={allowDecimals => setConfig({ allowDecimals })} />
);
export const CurrencyEditor = ({ config, setConfig }: ConfigEditorProps) => (
  <Row label="Currency code" hint="3-letter ISO code, e.g. USD, CAD, EUR, INR">{id => (
    <Input id={id} value={config.currency as string} maxLength={3} onChange={e => setConfig({ currency: e.target.value.toUpperCase().replace(/[^A-Z]/g, "") })} />)}</Row>
);
export const PhoneEditor = ({ config, setConfig }: ConfigEditorProps) => (
  <Row label="Default country code (optional)" hint="Shown as a hint, e.g. +1 or +91">{id => (
    <Input id={id} value={(config.defaultCountryCode as string) ?? ""} maxLength={5} placeholder="+1" onChange={e => setConfig({ defaultCountryCode: optStr(e.target.value) })} />)}</Row>
);
export const ChoiceEditor = ({ config, setConfig }: ConfigEditorProps) => (
  <div className="space-y-3">
    <SwitchRow label="Allow “Other” answer" checked={config.allowOther as boolean} onChange={allowOther => setConfig({ allowOther })} />
    <SwitchRow label="Randomize option order" checked={config.randomize as boolean} onChange={randomize => setConfig({ randomize })} />
  </div>
);
export const YesNoEditor = ({ config, setConfig }: ConfigEditorProps) => (
  <div className="grid grid-cols-2 gap-3">
    <Row label="Yes label">{id => <Input id={id} value={config.yesLabel as string} maxLength={40} onChange={e => setConfig({ yesLabel: e.target.value })} />}</Row>
    <Row label="No label">{id => <Input id={id} value={config.noLabel as string} maxLength={40} onChange={e => setConfig({ noLabel: e.target.value })} />}</Row>
  </div>
);
export const ToggleEditor = ({ config, setConfig }: ConfigEditorProps) => (
  <Row label="Switch label" hint="If the question is required, respondents must switch it on (useful for consent).">{id => (
    <Input id={id} value={config.onLabel as string} maxLength={100} onChange={e => setConfig({ onLabel: e.target.value })} />)}</Row>
);
export const DateEditor = ({ config, setConfig }: ConfigEditorProps) => (
  <div className="grid grid-cols-2 gap-3">
    <Row label="Earliest date">{id => <Input id={id} type="date" value={(config.minDate as string) ?? ""} onChange={e => setConfig({ minDate: optStr(e.target.value) })} />}</Row>
    <Row label="Latest date">{id => <Input id={id} type="date" value={(config.maxDate as string) ?? ""} onChange={e => setConfig({ maxDate: optStr(e.target.value) })} />}</Row>
  </div>
);
export const TimeEditor = ({ config, setConfig }: ConfigEditorProps) => (
  <SwitchRow label="24-hour format in exports" checked={config.use24h as boolean} onChange={use24h => setConfig({ use24h })} />
);
export const DateRangeEditor = ({ config, setConfig }: ConfigEditorProps) => (
  <div className="grid grid-cols-2 gap-3">
    <Row label="Start label">{id => <Input id={id} value={config.startLabel as string} maxLength={40} onChange={e => setConfig({ startLabel: e.target.value })} />}</Row>
    <Row label="End label">{id => <Input id={id} value={config.endLabel as string} maxLength={40} onChange={e => setConfig({ endLabel: e.target.value })} />}</Row>
  </div>
);
export const StarEditor = ({ config, setConfig }: ConfigEditorProps) => (
  <Row label="Number of stars">{id => <IntSelect id={id} value={config.max as number} from={3} to={10} onChange={max => setConfig({ max })} />}</Row>
);
export const LinearScaleEditor = ({ config, setConfig }: ConfigEditorProps) => (
  <div className="space-y-3">
    <div className="grid grid-cols-2 gap-3">
      <Row label="From">{id => <IntSelect id={id} value={config.min as number} from={0} to={1} onChange={min => setConfig({ min })} />}</Row>
      <Row label="To">{id => <IntSelect id={id} value={config.max as number} from={2} to={10} onChange={max => setConfig({ max })} />}</Row>
    </div>
    <div className="grid grid-cols-2 gap-3">
      <Row label="Low label">{id => <Input id={id} value={(config.minLabel as string) ?? ""} maxLength={40} onChange={e => setConfig({ minLabel: optStr(e.target.value) })} />}</Row>
      <Row label="High label">{id => <Input id={id} value={(config.maxLabel as string) ?? ""} maxLength={40} onChange={e => setConfig({ maxLabel: optStr(e.target.value) })} />}</Row>
    </div>
  </div>
);
export const OpinionScaleEditor = ({ config, setConfig }: ConfigEditorProps) => (
  <div className="space-y-3">
    <div className="grid grid-cols-2 gap-3">
      <Row label="Start at">{id => <IntSelect id={id} value={config.start as number} from={0} to={1} onChange={start => setConfig({ start })} />}</Row>
      <Row label="End at">{id => <IntSelect id={id} value={config.end as number} from={5} to={10} onChange={end => setConfig({ end })} />}</Row>
    </div>
    {(["leftLabel", "centerLabel", "rightLabel"] as const).map(k => (
      <Row key={k} label={k === "leftLabel" ? "Left label" : k === "centerLabel" ? "Centre label" : "Right label"}>{id => (
        <Input id={id} value={(config[k] as string) ?? ""} maxLength={40} onChange={e => setConfig({ [k]: optStr(e.target.value) })} />)}</Row>
    ))}
  </div>
);
const MIME_LABELS: Record<string, string> = {
  "application/pdf": "PDF", "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word (.docx)",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel (.xlsx)", "text/plain": "Text", "text/csv": "CSV",
  "image/png": "PNG", "image/jpeg": "JPEG", "image/webp": "WebP", "image/gif": "GIF",
};
function FileTypesEditor({ question, update, choices }: ConfigEditorProps & { choices: string[] }) {
  const v = question.validation;
  const allowed = new Set(v.allowedMimeTypes ?? []);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Row label="Max files">{id => <IntSelect id={id} value={v.maxFiles ?? 1} from={1} to={10} onChange={maxFiles => update({ validation: { ...v, maxFiles } })} />}</Row>
        <Row label="Max size (MB)">{id => <Input id={id} type="number" min={1} max={50} value={v.maxFileSizeMb ?? 10}
          onChange={e => { const n = num(e.target.value); update({ validation: { ...v, maxFileSizeMb: n === undefined ? undefined : Math.min(50, Math.max(1, n)) } }); }} />}</Row>
      </div>
      <fieldset className="space-y-1.5">
        <legend className="mb-1 text-sm font-medium">Allowed file types</legend>
        <div className="grid grid-cols-2 gap-1">
          {choices.map(m => (
            <label key={m} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={allowed.has(m)} onChange={e => {
                const next = new Set(allowed); if (e.target.checked) next.add(m); else next.delete(m);
                update({ validation: { ...v, allowedMimeTypes: next.size ? choices.filter(c => next.has(c)) : undefined } });
              }} /> {MIME_LABELS[m] ?? m}
            </label>
          ))}
        </div>
        {allowed.size === 0 && <p className="text-xs text-amber-700">No restriction selected — any type of this kind will be accepted.</p>}
      </fieldset>
    </div>
  );
}
export const FileUploadEditor = (p: ConfigEditorProps) => <FileTypesEditor {...p} choices={DOCUMENT_MIME_TYPES} />;
export const ImageUploadEditor = (p: ConfigEditorProps) => <FileTypesEditor {...p} choices={IMAGE_MIME_TYPES} />;
export const SignatureEditor = ({ config, setConfig }: ConfigEditorProps) => (
  <Row label="Pen colour">{id => <input id={id} type="color" className="h-10 w-16 cursor-pointer rounded border" value={config.penColor as string} onChange={e => setConfig({ penColor: e.target.value })} />}</Row>
);
export const HeadingEditor = ({ config, setConfig }: ConfigEditorProps) => (
  <Row label="Size">{id => (
    <NativeSelect id={id} value={config.level as number} onChange={e => setConfig({ level: Number(e.target.value) })}>
      <option value={1}>Large</option><option value={2}>Medium</option><option value={3}>Small</option>
    </NativeSelect>)}</Row>
);
export const ImageEditor = ({ config, setConfig }: ConfigEditorProps) => (
  <div className="space-y-3">
    <Row label="Image URL" hint="https:// only. Uploading images from your device arrives with storage in Phase 3.">{id => (
      <Input id={id} type="url" placeholder="https://…" value={(config.url as string) ?? ""} onChange={e => setConfig({ url: optStr(e.target.value) })} />)}</Row>
    <Row label="Alt text" hint="Describes the image for screen readers.">{id => <Input id={id} value={config.alt as string} maxLength={300} onChange={e => setConfig({ alt: e.target.value })} />}</Row>
    <Row label="Size">{id => (
      <NativeSelect id={id} value={config.size as string} onChange={e => setConfig({ size: e.target.value })}>
        <option value="small">Small</option><option value="medium">Medium</option><option value="full">Full width</option>
      </NativeSelect>)}</Row>
  </div>
);
