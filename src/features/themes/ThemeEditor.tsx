import type { CSSProperties } from "react";
import { AlertTriangle, Check } from "lucide-react";
import type { FormDefinition } from "@/schema/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/select";
import { Row, SwitchRow } from "@/fields/ui/editors";
import { cn } from "@/lib/utils";
import { FONT_STACKS, THEME_PRESETS, WALLPAPERS, themeToCssVars, themeWarnings, type Theme } from "./theme";

type Screen = NonNullable<FormDefinition["welcomeScreen"]>;

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Row label={label}>{id => (
      <div className="flex items-center gap-2">
        <input type="color" aria-label={`${label} picker`} className="h-10 w-12 cursor-pointer rounded border bg-transparent p-0.5" value={value} onChange={e => onChange(e.target.value)} />
        <Input id={id} className="font-mono" value={value} maxLength={7}
          onChange={e => { const v = e.target.value; if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v.toLowerCase()); }} />
      </div>)}</Row>
  );
}
function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map(([v, l]) => (
          <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}
            className={cn("rounded-md border px-3 py-1.5 text-sm", value === v ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent")}>{l}</button>
        ))}
      </div>
    </fieldset>
  );
}

export interface ThemeEditorProps {
  form: FormDefinition;
  setTheme: (patch: Partial<Theme>) => void;
  setScreen: (screen: "welcomeScreen" | "completionScreen", value: Screen | undefined) => void;
}

/** Theme + welcome/completion screen editor. Writes only canonical ThemeSchema/ScreenSchema values. */
export function ThemeEditor({ form, setTheme, setScreen }: ThemeEditorProps) {
  const t = form.theme;
  const warnings = themeWarnings(t);
  const custom = (patch: Partial<Theme>) => setTheme({ ...patch, preset: "custom" });
  const w = form.welcomeScreen;
  const c = form.completionScreen;
  const redirectInvalid = Boolean(c.redirectUrl && !/^https?:\/\/[^\s]+$/.test(c.redirectUrl));

  return (
    <div className="space-y-6 p-4">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Presets</h2>
        <div className="grid grid-cols-2 gap-2.5">
          {THEME_PRESETS.map(p => (
            <button key={p.id} type="button" aria-pressed={t.preset === p.id} onClick={() => setTheme(p.theme)}
              className={cn("relative overflow-hidden rounded-md border p-2 text-left text-xs", t.preset === p.id ? "border-primary ring-2 ring-primary/30" : "hover:border-primary/50")}>
              <div className="mb-1.5 flex h-10 items-end gap-1 rounded p-1.5" style={{ background: p.theme.background, fontFamily: FONT_STACKS[p.theme.fontFamily] }}>
                <span className="h-3 w-8" style={{ background: p.theme.primary, borderRadius: p.theme.buttonStyle === "pill" ? 999 : p.theme.borderRadius / 3 }} />
                <span className="h-3 w-4" style={{ background: p.theme.secondary, borderRadius: 2 }} />
              </div>
              <span className="font-medium">{p.name}</span>
              {t.preset === p.id && <Check className="absolute right-1.5 top-1.5 h-3.5 w-3.5 text-primary" aria-hidden="true" />}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Colours</h2>
        <ColorField label="Background" value={t.background} onChange={background => custom({ background })} />
        <ColorField label="Primary" value={t.primary} onChange={primary => custom({ primary })} />
        <ColorField label="Secondary" value={t.secondary} onChange={secondary => custom({ secondary })} />
        {warnings.map(m => <p key={m} className="flex gap-2 rounded-md bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"><AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />{m}</p>)}
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold">Style</h2>
        <Row label="Typography">{id => (
          <NativeSelect id={id} value={t.fontFamily} onChange={e => custom({ fontFamily: e.target.value as Theme["fontFamily"] })}>
            <option value="inter">Sans (Inter / system)</option><option value="serif">Serif</option><option value="mono">Monospace</option><option value="rounded">Rounded</option>
          </NativeSelect>)}</Row>
        <Segmented label="Buttons" value={t.buttonStyle} options={[["solid", "Solid"], ["outline", "Outline"], ["pill", "Pill"]] as const} onChange={buttonStyle => custom({ buttonStyle })} />
        <Segmented label="Inputs" value={t.inputStyle} options={[["underline", "Underline"], ["outlined", "Outlined"], ["filled", "Filled"]] as const} onChange={inputStyle => custom({ inputStyle })} />
        <Row label={`Corner radius: ${t.borderRadius}px`}>{id => <input id={id} type="range" min={0} max={32} value={t.borderRadius} onChange={e => custom({ borderRadius: Number(e.target.value) })} className="w-full accent-[hsl(var(--primary))]" />}</Row>
        <Segmented label="Progress indicator" value={t.progress} options={[["bar", "Bar"], ["steps", "Steps"], ["percent", "Percent"], ["none", "None"]] as const} onChange={progress => custom({ progress })} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Wallpaper</h2>
        <p className="text-xs text-muted-foreground">A subtle backdrop behind the form, built from this theme's own colours.</p>
        <div className="grid grid-cols-3 gap-2.5">
          {WALLPAPERS.map(wp => {
            const preview = themeToCssVars({ ...t, wallpaper: wp.id });
            return (
              <button key={wp.id} type="button" aria-pressed={t.wallpaper === wp.id} onClick={() => custom({ wallpaper: wp.id })}
                className={cn("overflow-hidden rounded-md border text-left text-xs", t.wallpaper === wp.id ? "border-primary ring-2 ring-primary/30" : "hover:border-primary/50")}>
                <div className="h-12 w-full" style={{ ...preview, backgroundColor: "var(--sf-bg)", backgroundImage: "var(--sf-wallpaper-image)", backgroundSize: "var(--sf-wallpaper-size)" } as CSSProperties} />
                <span className="block px-2 py-1 font-medium">{wp.name}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Welcome screen</h2>
        <SwitchRow label="Show a welcome screen" checked={Boolean(w)} onChange={on => setScreen("welcomeScreen", on ? { title: form.title || "Welcome", buttonLabel: "Start" } : undefined)} />
        {w && (
          <>
            <Row label="Title">{id => <Input id={id} maxLength={200} value={w.title} onChange={e => setScreen("welcomeScreen", { ...w, title: e.target.value })} />}</Row>
            <Row label="Message">{id => <Textarea id={id} rows={3} maxLength={2000} value={w.message ?? ""} onChange={e => setScreen("welcomeScreen", { ...w, message: e.target.value || undefined })} />}</Row>
            <Row label="Button label">{id => <Input id={id} maxLength={60} value={w.buttonLabel ?? ""} onChange={e => setScreen("welcomeScreen", { ...w, buttonLabel: e.target.value || undefined })} />}</Row>
          </>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Completion screen</h2>
        <Row label="Title">{id => <Input id={id} maxLength={200} value={c.title} onChange={e => setScreen("completionScreen", { ...c, title: e.target.value })} />}</Row>
        <Row label="Message">{id => <Textarea id={id} rows={3} maxLength={2000} value={c.message ?? ""} onChange={e => setScreen("completionScreen", { ...c, message: e.target.value || undefined })} />}</Row>
        <Row label="Redirect URL (optional)" hint="Respondents can be sent to this page after submitting.">{id => (
          <Input id={id} type="url" placeholder="https://" value={c.redirectUrl ?? ""} aria-invalid={redirectInvalid || undefined}
            onChange={e => setScreen("completionScreen", { ...c, redirectUrl: e.target.value.trim() || undefined })} />)}</Row>
        {redirectInvalid && <p className="text-xs text-destructive">Enter a full URL starting with http:// or https:// (the draft won't save until fixed).</p>}
        {c.redirectUrl && <Row label="Redirect button label">{id => <Input id={id} maxLength={60} value={c.buttonLabel ?? ""} onChange={e => setScreen("completionScreen", { ...c, buttonLabel: e.target.value || undefined })} />}</Row>}
      </section>
    </div>
  );
}
