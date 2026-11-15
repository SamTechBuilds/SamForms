import { useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, Star, Upload, X } from "lucide-react";
import type { Question } from "@/schema/form";
import type { FieldConfig } from "../types";
import { FileUploaderContext } from "../uploader";

export interface FieldInputProps {
  question: Question;
  config: FieldConfig;
  value: unknown;
  onChange: (v: unknown) => void;
  inputId: string;
  describedBy?: string;
  invalid?: boolean;
  disabled?: boolean;
}
type C<T> = FieldConfig & T;

const aria = (p: FieldInputProps) => ({ id: p.inputId, "aria-describedby": p.describedBy, "aria-invalid": p.invalid || undefined, disabled: p.disabled });
const s = (v: unknown) => (typeof v === "string" ? v : "");

function TextLike({ type, ...p }: FieldInputProps & { type: string }) {
  return <input type={type} className="sf-input" placeholder={p.question.placeholder} value={s(p.value)} maxLength={p.question.validation.maxLength}
    onChange={e => p.onChange(e.target.value)} autoComplete={type === "email" ? "email" : type === "tel" ? "tel" : type === "url" ? "url" : "off"} {...aria(p)} />;
}

export const ShortTextInput = (p: FieldInputProps) => <TextLike type="text" {...p} />;
export const EmailInput = (p: FieldInputProps) => <TextLike type="email" {...p} />;
export const PhoneInput = (p: FieldInputProps) => <TextLike type="tel" {...p} />;
export const UrlInput = (p: FieldInputProps) => <TextLike type="url" {...p} />;

export function LongTextInput(p: FieldInputProps) {
  const c = p.config as C<{ rows: number }>;
  return <textarea className="sf-input resize-y" rows={c.rows} placeholder={p.question.placeholder} value={s(p.value)} maxLength={p.question.validation.maxLength}
    onChange={e => p.onChange(e.target.value)} {...aria(p)} />;
}

export function NameInput(p: FieldInputProps) {
  const c = p.config as C<{ format: "full" | "first_last" }>;
  if (c.format === "full") return <input type="text" className="sf-input" autoComplete="name" placeholder={p.question.placeholder} value={s(p.value)} onChange={e => p.onChange(e.target.value)} {...aria(p)} />;
  const v = (p.value && typeof p.value === "object" ? p.value : {}) as { first?: string; last?: string };
  const set = (k: "first" | "last", x: string) => { const n = { first: v.first ?? "", last: v.last ?? "", [k]: x }; p.onChange(n.first || n.last ? n : undefined); };
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <input className="sf-input" aria-label="First name" autoComplete="given-name" placeholder="First name" value={v.first ?? ""} onChange={e => set("first", e.target.value)} {...aria(p)} />
      <input className="sf-input" aria-label="Last name" autoComplete="family-name" placeholder="Last name" value={v.last ?? ""} onChange={e => set("last", e.target.value)} id={`${p.inputId}-last`} disabled={p.disabled} aria-invalid={p.invalid || undefined} />
    </div>
  );
}

function NumberLike(p: FieldInputProps & { prefix?: string; step?: string }) {
  const [text, setText] = useState(typeof p.value === "number" ? String(p.value) : "");
  useEffect(() => { if (typeof p.value === "number" && Number(text) !== p.value) setText(String(p.value)); if (p.value === undefined && text !== "" && Number.isFinite(Number(text))) setText(""); }, [p.value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="flex items-center gap-2">
      {p.prefix && <span className="sf-muted text-sm font-medium">{p.prefix}</span>}
      <input type="number" inputMode="decimal" className="sf-input" step={p.step} placeholder={p.question.placeholder} value={text}
        min={p.question.validation.min} max={p.question.validation.max}
        onChange={e => { setText(e.target.value); const n = e.target.valueAsNumber; p.onChange(e.target.value === "" ? undefined : Number.isFinite(n) ? n : e.target.value); }} {...aria(p)} />
    </div>
  );
}
export const NumberInput = (p: FieldInputProps) => <NumberLike {...p} step={(p.config as C<{ allowDecimals: boolean }>).allowDecimals ? "any" : "1"} />;
export const CurrencyInput = (p: FieldInputProps) => <NumberLike {...p} prefix={(p.config as C<{ currency: string }>).currency} step="0.01" />;

/** Deterministic per-question shuffle so the order is stable while answering. */
function useOrderedOptions(q: Question, randomize: boolean) {
  return useMemo(() => {
    const opts = q.options ?? [];
    if (!randomize) return opts;
    let seed = [...q.id].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
    return [...opts].map(o => { seed = (seed * 1103515245 + 12345) >>> 0; return { o, k: seed }; }).sort((a, b) => a.k - b.k).map(x => x.o);
  }, [q.id, q.options, randomize]);
}
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function ChoiceList({ p, multiple }: { p: FieldInputProps; multiple: boolean }) {
  const c = p.config as C<{ allowOther: boolean; randomize: boolean }>;
  const opts = useOrderedOptions(p.question, c.randomize);
  const values = new Set(opts.map(o => o.value));
  const selected: string[] = multiple ? (Array.isArray(p.value) ? (p.value as string[]) : []) : typeof p.value === "string" ? [p.value] : [];
  const other = selected.find(v => !values.has(v));
  const [otherOn, setOtherOn] = useState(other !== undefined);
  const toggle = (v: string) => {
    if (!multiple) return p.onChange(selected[0] === v ? undefined : v);
    const next = selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v];
    p.onChange(next.length ? next : undefined);
  };
  const setOther = (text: string) => {
    const rest = selected.filter(v => values.has(v));
    if (multiple) { const n = text ? [...rest, text] : rest; p.onChange(n.length ? n : undefined); } else p.onChange(text || undefined);
  };
  return (
    <div role={multiple ? "group" : "radiogroup"} aria-labelledby={`${p.inputId}-label`} aria-describedby={p.describedBy} aria-invalid={p.invalid || undefined} id={p.inputId} className="flex flex-col gap-2">
      {opts.map((o, i) => {
        const on = selected.includes(o.value);
        return (
          <button key={o.id} type="button" role={multiple ? "checkbox" : "radio"} aria-checked={on} disabled={p.disabled} className="sf-choice" onClick={() => toggle(o.value)}>
            <span className="sf-key" aria-hidden="true">{LETTERS[i] ?? "•"}</span>
            <span className="flex-1">{o.label}</span>
            {on && <Check className="h-4 w-4" aria-hidden="true" />}
          </button>
        );
      })}
      {c.allowOther && (
        <div className="flex flex-col gap-2">
          <button type="button" role={multiple ? "checkbox" : "radio"} aria-checked={otherOn} disabled={p.disabled} className="sf-choice"
            onClick={() => { const n = !otherOn; setOtherOn(n); if (!n) setOther(""); }}>
            <span className="sf-key" aria-hidden="true">{LETTERS[opts.length] ?? "•"}</span><span className="flex-1">Other</span>
          </button>
          {otherOn && <input className="sf-input" aria-label="Other (please specify)" placeholder="Please specify" value={other ?? ""} maxLength={200} onChange={e => setOther(e.target.value)} disabled={p.disabled} />}
        </div>
      )}
    </div>
  );
}
export const SingleChoiceInput = (p: FieldInputProps) => <ChoiceList p={p} multiple={false} />;
export const MultipleChoiceInput = (p: FieldInputProps) => <ChoiceList p={p} multiple />;

export function DropdownInput(p: FieldInputProps) {
  return (
    <select className="sf-input" value={s(p.value)} onChange={e => p.onChange(e.target.value || undefined)} {...aria(p)}>
      <option value="">{p.question.placeholder || "Select…"}</option>
      {(p.question.options ?? []).map(o => <option key={o.id} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function YesNoInput(p: FieldInputProps) {
  const c = p.config as C<{ yesLabel: string; noLabel: string }>;
  return (
    <div role="radiogroup" id={p.inputId} aria-labelledby={`${p.inputId}-label`} aria-describedby={p.describedBy} aria-invalid={p.invalid || undefined} className="grid max-w-sm grid-cols-2 gap-2">
      {[{ v: true, l: c.yesLabel, k: "Y" }, { v: false, l: c.noLabel, k: "N" }].map(o => (
        <button key={String(o.v)} type="button" role="radio" aria-checked={p.value === o.v} disabled={p.disabled} className="sf-choice" onClick={() => p.onChange(p.value === o.v ? undefined : o.v)}>
          <span className="sf-key" aria-hidden="true">{o.k}</span>{o.l}
        </button>
      ))}
    </div>
  );
}

export function ToggleInput(p: FieldInputProps) {
  const c = p.config as C<{ onLabel: string }>;
  const on = p.value === true;
  return (
    <label className="inline-flex cursor-pointer items-center gap-3">
      <button type="button" role="switch" aria-checked={on} onClick={() => p.onChange(!on)} {...aria(p)}
        className="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2"
        style={{ background: on ? "var(--sf-primary)" : "color-mix(in srgb, var(--sf-fg) 20%, transparent)" }}>
        <span className="block h-5 w-5 rounded-full bg-white shadow transition-transform" style={{ transform: on ? "translateX(1.6rem)" : "translateX(0.25rem)" }} />
      </button>
      <span>{c.onLabel}</span>
    </label>
  );
}

export function DateInput(p: FieldInputProps) {
  const c = p.config as C<{ minDate?: string; maxDate?: string }>;
  return <input type="date" className="sf-input max-w-xs" value={s(p.value)} min={c.minDate} max={c.maxDate} onChange={e => p.onChange(e.target.value || undefined)} {...aria(p)} />;
}
export const TimeInput = (p: FieldInputProps) => <input type="time" className="sf-input max-w-xs" value={s(p.value)} onChange={e => p.onChange(e.target.value || undefined)} {...aria(p)} />;
export function DateRangeInput(p: FieldInputProps) {
  const c = p.config as C<{ startLabel: string; endLabel: string }>;
  const v = (p.value && typeof p.value === "object" ? p.value : {}) as { start?: string; end?: string };
  const set = (k: "start" | "end", x: string) => { const n = { start: v.start ?? "", end: v.end ?? "", [k]: x }; p.onChange(n.start || n.end ? n : undefined); };
  return (
    <div className="grid max-w-md gap-3 sm:grid-cols-2">
      <label className="text-sm"><span className="sf-muted mb-1 block">{c.startLabel}</span><input type="date" className="sf-input" value={v.start ?? ""} onChange={e => set("start", e.target.value)} {...aria(p)} /></label>
      <label className="text-sm"><span className="sf-muted mb-1 block">{c.endLabel}</span><input type="date" className="sf-input" value={v.end ?? ""} min={v.start} onChange={e => set("end", e.target.value)} disabled={p.disabled} aria-invalid={p.invalid || undefined} /></label>
    </div>
  );
}

export function StarRatingInput(p: FieldInputProps) {
  const c = p.config as C<{ max: number }>;
  const [hover, setHover] = useState(0);
  const val = typeof p.value === "number" ? p.value : 0;
  return (
    <div role="radiogroup" id={p.inputId} aria-labelledby={`${p.inputId}-label`} aria-describedby={p.describedBy} aria-invalid={p.invalid || undefined} className="flex flex-wrap gap-1" onMouseLeave={() => setHover(0)}>
      {Array.from({ length: c.max }, (_, i) => i + 1).map(n => (
        <button key={n} type="button" role="radio" aria-checked={val === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} disabled={p.disabled}
          className="rounded p-1 focus-visible:outline focus-visible:outline-2" onMouseEnter={() => setHover(n)} onClick={() => p.onChange(val === n ? undefined : n)}>
          <Star className="h-8 w-8" style={{ color: "var(--sf-primary)" }} fill={(hover || val) >= n ? "currentColor" : "none"} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

function Scale({ p, from, to, labels }: { p: FieldInputProps; from: number; to: number; labels: [string?, string?, string?] }) {
  return (
    <div>
      <div role="radiogroup" id={p.inputId} aria-labelledby={`${p.inputId}-label`} aria-describedby={p.describedBy} aria-invalid={p.invalid || undefined} className="flex flex-wrap gap-1.5">
        {Array.from({ length: to - from + 1 }, (_, i) => from + i).map(n => (
          <button key={n} type="button" role="radio" aria-checked={p.value === n} disabled={p.disabled} className="sf-choice !w-11 justify-center !px-0" onClick={() => p.onChange(p.value === n ? undefined : n)}>{n}</button>
        ))}
      </div>
      {(labels[0] || labels[1] || labels[2]) && (
        <div className="sf-muted mt-2 flex justify-between gap-2 text-xs"><span>{labels[0]}</span><span>{labels[1]}</span><span>{labels[2]}</span></div>
      )}
    </div>
  );
}
export function LinearScaleInput(p: FieldInputProps) {
  const c = p.config as C<{ min: number; max: number; minLabel?: string; maxLabel?: string }>;
  return <Scale p={p} from={c.min} to={c.max} labels={[c.minLabel, undefined, c.maxLabel]} />;
}
export function OpinionScaleInput(p: FieldInputProps) {
  const c = p.config as C<{ start: number; end: number; leftLabel?: string; centerLabel?: string; rightLabel?: string }>;
  return <Scale p={p} from={c.start} to={c.end} labels={[c.leftLabel, c.centerLabel, c.rightLabel]} />;
}

type FileRef = { id: string; name: string; size: number; mimeType: string };
function FilesInput({ p, accept }: { p: FieldInputProps; accept: string }) {
  const files = Array.isArray(p.value) ? (p.value as FileRef[]) : [];
  const max = p.question.validation.maxFiles ?? 1;
  const ref = useRef<HTMLInputElement>(null);
  const upload = useContext(FileUploaderContext);
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function take(picked: File[]) {
    setUploadError(null);
    const room = Math.max(0, max - files.length);
    const chosen = picked.slice(0, room);
    if (chosen.length === 0) return;
    if (!upload) {
      // Builder preview: record metadata only so validation can run. Nothing leaves the browser.
      const local = chosen.map((f, i) => ({ id: `local-${Date.now()}-${i}`, name: f.name, size: f.size, mimeType: f.type || "application/octet-stream" }));
      p.onChange([...files, ...local]);
      return;
    }
    // Public form: each file is reserved and stored on the server before it is referenced.
    setBusy(true);
    try {
      const done: FileRef[] = [];
      for (const f of chosen) done.push(await upload(p.question.id, f));
      p.onChange([...files, ...done]);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "The file could not be uploaded.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <input ref={ref} type="file" className="sr-only" accept={accept} multiple={max > 1} {...aria(p)}
        onChange={e => { const picked = Array.from(e.target.files ?? []); e.target.value = ""; void take(picked); }} />
      <button type="button" className="sf-choice justify-center border-dashed py-6" disabled={p.disabled || busy || files.length >= max} onClick={() => ref.current?.click()}>
        <Upload className="h-5 w-5" aria-hidden="true" /> {busy ? "Uploading…" : files.length >= max ? "Maximum files selected" : "Choose file"}
      </button>
      {uploadError && <p role="alert" className="text-sm text-red-600">{uploadError}</p>}
      <p className="sf-muted text-xs">Up to {max} file{max > 1 ? "s" : ""}, {p.question.validation.maxFileSizeMb ?? 10} MB each.</p>
      {files.length > 0 && (
        <ul className="space-y-1 text-sm">
          {files.map(f => (
            <li key={f.id} className="flex items-center justify-between gap-2">
              <span className="truncate">{f.name} <span className="sf-muted">({Math.ceil(f.size / 1024)} KB)</span></span>
              <button type="button" aria-label={`Remove ${f.name}`} disabled={p.disabled} onClick={() => { const n = files.filter(x => x.id !== f.id); p.onChange(n.length ? n : undefined); }}><X className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
export const FileUploadInput = (p: FieldInputProps) => <FilesInput p={p} accept={(p.question.validation.allowedMimeTypes ?? []).join(",")} />;
export const ImageUploadInput = (p: FieldInputProps) => <FilesInput p={p} accept={(p.question.validation.allowedMimeTypes ?? ["image/*"]).join(",")} />;

export function SignatureInput(p: FieldInputProps) {
  const c = p.config as C<{ penColor: string }>;
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const ctx = () => canvas.current?.getContext("2d") ?? null;
  const pos = (e: React.PointerEvent) => { const r = canvas.current!.getBoundingClientRect(); return [(e.clientX - r.left) * (canvas.current!.width / r.width), (e.clientY - r.top) * (canvas.current!.height / r.height)] as const; };
  return (
    <div className="space-y-2">
      <canvas ref={canvas} width={600} height={180} id={p.inputId} aria-label="Signature pad: draw your signature" aria-describedby={p.describedBy} aria-invalid={p.invalid || undefined}
        className="h-36 w-full touch-none rounded border-2 border-dashed" style={{ borderColor: "var(--sf-primary)", borderRadius: "var(--sf-radius)", background: "var(--sf-bg)" }}
        onPointerDown={e => { if (p.disabled) return; const g = ctx(); if (!g) return; drawing.current = true; canvas.current!.setPointerCapture(e.pointerId); const [x, y] = pos(e); g.strokeStyle = c.penColor; g.lineWidth = 2.5; g.lineCap = "round"; g.beginPath(); g.moveTo(x, y); }}
        onPointerMove={e => { if (!drawing.current) return; const g = ctx(); if (!g) return; const [x, y] = pos(e); g.lineTo(x, y); g.stroke(); }}
        onPointerUp={() => { if (!drawing.current) return; drawing.current = false; p.onChange(canvas.current!.toDataURL("image/png")); }} />
      <button type="button" className="sf-muted text-sm underline" disabled={p.disabled} onClick={() => { const g = ctx(); if (g && canvas.current) g.clearRect(0, 0, canvas.current.width, canvas.current.height); p.onChange(undefined); }}>Clear signature</button>
    </div>
  );
}

export function ColorPickerInput(p: FieldInputProps) {
  const v = s(p.value);
  return (
    <div className="flex items-center gap-3">
      <input type="color" className="h-12 w-16 cursor-pointer rounded border-0 bg-transparent p-0" value={v || "#000000"} onChange={e => p.onChange(e.target.value)} {...aria(p)} />
      <span className="font-mono text-sm">{v || "No colour chosen"}</span>
    </div>
  );
}

// ----------------------------------------------------------- content blocks
export function ContentBlock({ question, config }: { question: Question; config: FieldConfig }): ReactNode {
  switch (question.type) {
    case "heading": {
      const level = (config as C<{ level: 1 | 2 | 3 }>).level;
      const cls = level === 1 ? "text-3xl" : level === 2 ? "text-2xl" : "text-xl";
      const H = (`h${level + 1}`) as "h2" | "h3" | "h4";
      return <div><H className={`${cls} font-semibold`}>{question.label || "Heading"}</H>{question.description && <p className="sf-muted mt-2">{question.description}</p>}</div>;
    }
    case "description":
      return <div>{question.label && <p className="font-semibold">{question.label}</p>}<p className="sf-muted whitespace-pre-line">{question.description}</p></div>;
    case "image": {
      const c = config as C<{ url?: string; alt: string; size: "small" | "medium" | "full" }>;
      if (!c.url) return <div className="sf-muted rounded border border-dashed p-6 text-center text-sm">No image URL set</div>;
      const w = c.size === "small" ? "max-w-xs" : c.size === "medium" ? "max-w-md" : "w-full";
      return <figure><img src={c.url} alt={c.alt} referrerPolicy="no-referrer" loading="lazy" className={`${w} rounded`} style={{ borderRadius: "var(--sf-radius)" }} />{question.label && <figcaption className="sf-muted mt-1 text-sm">{question.label}</figcaption>}</figure>;
    }
    case "divider": return <hr className="border-t" style={{ borderColor: "color-mix(in srgb, var(--sf-fg) 20%, transparent)" }} />;
    default: return null;
  }
}

/**
 * Ranking: the respondent orders every option. The list always holds a complete order
 * (the initial/shuffled order is the default answer), so "required" is satisfied as soon
 * as the question is shown. Reordering uses accessible Up/Down buttons rather than drag
 * and drop, which is more robust for keyboard, screen-reader and touch users.
 */
export function RankingInput(p: FieldInputProps) {
  const c = p.config as C<{ randomize: boolean }>;
  const initial = useOrderedOptions(p.question, c.randomize);
  const labelOf = useMemo(() => new Map((p.question.options ?? []).map(o => [o.value, o.label])), [p.question.options]);
  const values = useMemo(() => initial.map(o => o.value), [initial]);
  const current = useMemo(() => {
    const v = Array.isArray(p.value) ? (p.value as string[]) : [];
    const valid = v.length === values.length && values.every(x => v.includes(x));
    return valid ? v : values;
  }, [p.value, values]);
  const [announce, setAnnounce] = useState("");

  // Persist the default order so the answer is complete without any interaction.
  const isDefault = !(Array.isArray(p.value) && p.value.length === values.length && values.every(x => (p.value as string[]).includes(x)));
  useEffect(() => {
    if (isDefault && values.length) p.onChange(values);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDefault, values]);

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= current.length) return;
    const next = [...current];
    [next[index], next[target]] = [next[target]!, next[index]!];
    p.onChange(next);
    setAnnounce(`${labelOf.get(next[target]!) ?? next[target]} moved to position ${target + 1} of ${next.length}`);
  };

  return (
    <div id={p.inputId} aria-describedby={p.describedBy} aria-invalid={p.invalid || undefined} className="flex flex-col gap-2">
      <ol className="flex flex-col gap-2" aria-label="Ranked options, most preferred first">
        {current.map((v, i) => (
          <li key={v} className="sf-choice items-center">
            <span className="sf-key" aria-hidden="true">{i + 1}</span>
            <span className="flex-1">{labelOf.get(v) ?? v}</span>
            <button type="button" className="sf-btn sf-btn-ghost px-2 py-1 text-xs" disabled={p.disabled || i === 0}
              onClick={() => move(i, -1)} aria-label={`Move ${labelOf.get(v) ?? v} up`}>▲</button>
            <button type="button" className="sf-btn sf-btn-ghost px-2 py-1 text-xs" disabled={p.disabled || i === current.length - 1}
              onClick={() => move(i, 1)} aria-label={`Move ${labelOf.get(v) ?? v} down`}>▼</button>
          </li>
        ))}
      </ol>
      <p className="sr-only" aria-live="polite">{announce}</p>
    </div>
  );
}
