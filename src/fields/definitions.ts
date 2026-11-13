import { z } from "zod";
import type { FieldType, Question } from "@/schema/form";
import type { FieldDefinition, ValidationKey } from "./types";

// ----------------------------------------------------------------- helpers
const MB = 1024 * 1024;
const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const validIsoDate = (s: string) => isoDate.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);
const DateString = z.string().refine(validIsoDate, "Enter a valid date");
const optLabel = (q: Question, v: unknown) => q.options?.find(o => o.value === v)?.label;
const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));

/** Pattern validation without executing stored code: compile safely, cap input length. */
export function safePattern(source: string | undefined): RegExp | null {
  if (!source) return null;
  try { return new RegExp(source); } catch { return null; }
}
const MAX_PATTERN_INPUT = 5000;

function textAnswer(q: Question, hardMax: number) {
  const v = q.validation;
  let s = z.string().trim().max(hardMax, `Must be at most ${hardMax} characters`);
  if (v.minLength !== undefined) s = s.min(v.minLength, `Must be at least ${v.minLength} characters`);
  if (v.maxLength !== undefined) s = s.max(v.maxLength, `Must be at most ${v.maxLength} characters`);
  const re = safePattern(v.pattern);
  return re ? s.refine(x => re.test(x.slice(0, MAX_PATTERN_INPUT)), v.patternMessage || "Invalid format") : s;
}
function numberAnswer(q: Question, integer: boolean) {
  let s = z.number({ error: "Enter a number" }).finite();
  if (integer) s = s.int("Enter a whole number");
  if (q.validation.min !== undefined) s = s.min(q.validation.min, `Must be at least ${q.validation.min}`);
  if (q.validation.max !== undefined) s = s.max(q.validation.max, `Must be at most ${q.validation.max}`);
  return s;
}
const intRange = (min: number, max: number) => z.number().int().min(min, `Choose a value from ${min} to ${max}`).max(max, `Choose a value from ${min} to ${max}`);

const FileRef = z.object({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(255),
  size: z.number().int().positive(),
  mimeType: z.string().min(1).max(200),
});
function filesAnswer(q: Question, imageOnly: boolean) {
  const v = q.validation;
  const maxFiles = v.maxFiles ?? 1;
  const maxBytes = (v.maxFileSizeMb ?? 10) * MB;
  const allowed = v.allowedMimeTypes?.length ? v.allowedMimeTypes : null;
  return z.array(FileRef).min(1).max(maxFiles, `Upload at most ${maxFiles} file(s)`).superRefine((files, ctx) => {
    for (const f of files) {
      if (f.size > maxBytes) ctx.addIssue({ code: "custom", message: `${f.name} is larger than ${v.maxFileSizeMb ?? 10} MB` });
      if (imageOnly && !f.mimeType.startsWith("image/")) ctx.addIssue({ code: "custom", message: `${f.name} is not an image` });
      if (allowed && !allowed.includes(f.mimeType)) ctx.addIssue({ code: "custom", message: `${f.name} is not an allowed file type` });
    }
  });
}
const formatFiles = (v: unknown) => Array.isArray(v) ? v.map(f => (f && typeof f === "object" && "name" in f ? String((f as { name: unknown }).name) : "")).filter(Boolean).join("; ") : "";

function define<C extends z.ZodType<Record<string, unknown>>>(d: Omit<FieldDefinition, "configSchema" | "answerSchema" | "formatAnswer" | "sampleAnswer"> & {
  configSchema: C;
  answerSchema: (q: Question, c: z.infer<C>) => z.ZodType | null;
  formatAnswer: (v: unknown, q: Question, c: z.infer<C>) => string;
  sampleAnswer: (q: Question, c: z.infer<C>) => unknown;
}): FieldDefinition {
  return d as unknown as FieldDefinition;
}

const TEXT_V: readonly ValidationKey[] = ["minLength", "maxLength", "pattern", "patternMessage"];
const NUM_V: readonly ValidationKey[] = ["min", "max"];
const FILE_V: readonly ValidationKey[] = ["allowedMimeTypes", "maxFileSizeMb", "maxFiles"];
const NONE: readonly ValidationKey[] = [];
const Empty = z.object({});
const content = { isContent: true, hasOptions: false, supportsPlaceholder: false, validationKeys: NONE, answerSchema: () => null, formatAnswer: () => "", sampleAnswer: () => undefined } as const;
const defaultOptions = () => [1, 2, 3].map(i => ({ id: `opt${i}`, label: `Option ${i}`, value: `option_${i}` }));
const ChoiceConfig = z.object({ allowOther: z.boolean().default(false), randomize: z.boolean().default(false) });
const choiceAllowed = (q: Question, allowOther: boolean) => (x: string) => allowOther || (q.options ?? []).some(o => o.value === x);

export const IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
export const DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain", "text/csv", ...IMAGE_MIME_TYPES,
];

// -------------------------------------------------------------- definitions
export const FIELD_DEFINITIONS: Record<FieldType, FieldDefinition> = {
  short_text: define({
    type: "short_text", label: "Short text", description: "A single line of text.", category: "text",
    isContent: false, hasOptions: false, supportsPlaceholder: true, validationKeys: TEXT_V,
    configSchema: Empty,
    defaults: () => ({ label: "Short answer", placeholder: "Type your answer here…" }),
    answerSchema: q => textAnswer(q, 1000),
    formatAnswer: v => str(v),
    sampleAnswer: q => "x".repeat(Math.max(q.validation.minLength ?? 1, 1)),
  }),
  long_text: define({
    type: "long_text", label: "Long text", description: "A paragraph answer.", category: "text",
    isContent: false, hasOptions: false, supportsPlaceholder: true, validationKeys: TEXT_V,
    configSchema: z.object({ rows: z.number().int().min(2).max(12).default(4) }),
    defaults: () => ({ label: "Long answer", placeholder: "Type your answer here…" }),
    answerSchema: q => textAnswer(q, 10000),
    formatAnswer: v => str(v),
    sampleAnswer: q => "x".repeat(Math.max(q.validation.minLength ?? 1, 1)),
  }),
  name: define({
    type: "name", label: "Name", description: "A person's name.", category: "contact",
    isContent: false, hasOptions: false, supportsPlaceholder: true, validationKeys: NONE,
    configSchema: z.object({ format: z.enum(["full", "first_last"]).default("full") }),
    defaults: () => ({ label: "What's your name?", placeholder: "Jane Smith" }),
    answerSchema: (_q, c) => c.format === "full"
      ? z.string().trim().min(1, "Enter a name").max(200)
      : z.object({ first: z.string().trim().min(1, "Enter a first name").max(100), last: z.string().trim().min(1, "Enter a last name").max(100) }),
    formatAnswer: v => typeof v === "string" ? v : v && typeof v === "object" ? [str((v as Record<string, unknown>).first), str((v as Record<string, unknown>).last)].filter(Boolean).join(" ") : "",
    sampleAnswer: (_q, c) => c.format === "full" ? "Jane Smith" : { first: "Jane", last: "Smith" },
  }),
  email: define({
    type: "email", label: "Email", description: "An email address.", category: "contact",
    isContent: false, hasOptions: false, supportsPlaceholder: true, validationKeys: NONE,
    configSchema: Empty,
    defaults: () => ({ label: "What's your email address?", placeholder: "name@example.com" }),
    answerSchema: () => z.string().trim().max(320).pipe(z.email("Enter a valid email address")),
    formatAnswer: v => str(v),
    sampleAnswer: () => "jane@example.com",
  }),
  phone: define({
    type: "phone", label: "Phone", description: "A phone number.", category: "contact",
    isContent: false, hasOptions: false, supportsPlaceholder: true, validationKeys: NONE,
    configSchema: z.object({ defaultCountryCode: z.string().regex(/^\+\d{1,4}$/).optional() }),
    defaults: () => ({ label: "What's your phone number?", placeholder: "+1 555 123 4567" }),
    answerSchema: () => z.string().trim().regex(/^\+?[0-9 ().-]{7,24}$/, "Enter a valid phone number")
      .refine(s => s.replace(/\D/g, "").length >= 7 && s.replace(/\D/g, "").length <= 15, "Enter a valid phone number"),
    formatAnswer: v => str(v),
    sampleAnswer: () => "+1 555 123 4567",
  }),
  url: define({
    type: "url", label: "Website", description: "A web address.", category: "contact",
    isContent: false, hasOptions: false, supportsPlaceholder: true, validationKeys: NONE,
    configSchema: Empty,
    defaults: () => ({ label: "Website", placeholder: "https://" }),
    answerSchema: () => z.string().trim().max(2000).pipe(z.url({ protocol: /^https?$/, error: "Enter a valid URL starting with http:// or https://" })),
    formatAnswer: v => str(v),
    sampleAnswer: () => "https://example.com",
  }),
  number: define({
    type: "number", label: "Number", description: "A numeric value.", category: "numeric",
    isContent: false, hasOptions: false, supportsPlaceholder: true, validationKeys: NUM_V,
    configSchema: z.object({ allowDecimals: z.boolean().default(true) }),
    defaults: () => ({ label: "Enter a number", placeholder: "0" }),
    answerSchema: (q, c) => numberAnswer(q, !c.allowDecimals),
    formatAnswer: v => str(v),
    sampleAnswer: q => q.validation.min ?? 1,
  }),
  currency: define({
    type: "currency", label: "Currency", description: "A monetary amount.", category: "numeric",
    isContent: false, hasOptions: false, supportsPlaceholder: true, validationKeys: NUM_V,
    configSchema: z.object({ currency: z.string().regex(/^[A-Z]{3}$/, "Use a 3-letter ISO currency code").default("USD") }),
    defaults: () => ({ label: "Amount", placeholder: "0.00" }),
    answerSchema: q => numberAnswer(q, false).refine(n => Math.abs(Math.round(n * 100) - n * 100) < 1e-6, "Use at most 2 decimal places"),
    formatAnswer: (v, _q, c) => typeof v === "number" ? `${c.currency} ${v.toFixed(2)}` : str(v),
    sampleAnswer: q => q.validation.min ?? 10,
  }),
  single_choice: define({
    type: "single_choice", label: "Single choice", description: "Pick one option.", category: "choice",
    isContent: false, hasOptions: true, supportsPlaceholder: false, validationKeys: NONE,
    configSchema: ChoiceConfig,
    defaults: () => ({ label: "Choose one", options: defaultOptions() }),
    answerSchema: (q, c) => z.string().min(1).max(200).refine(choiceAllowed(q, c.allowOther), "Choose one of the options"),
    formatAnswer: (v, q) => optLabel(q, v) ?? (v ? `Other: ${str(v)}` : ""),
    sampleAnswer: q => q.options?.[0]?.value,
  }),
  multiple_choice: define({
    type: "multiple_choice", label: "Multiple choice", description: "Pick one or more options.", category: "choice",
    isContent: false, hasOptions: true, supportsPlaceholder: false, validationKeys: ["minSelections", "maxSelections"],
    configSchema: ChoiceConfig,
    defaults: () => ({ label: "Choose all that apply", options: defaultOptions() }),
    answerSchema: (q, c) => {
      let s = z.array(z.string().min(1).max(200).refine(choiceAllowed(q, c.allowOther), "Choose from the options")).max(200)
        .refine(a => new Set(a).size === a.length, "Each option can be chosen once");
      const { minSelections: min, maxSelections: max } = q.validation;
      if (min !== undefined) s = s.refine(a => a.length >= min, `Choose at least ${min}`);
      if (max !== undefined) s = s.refine(a => a.length <= max, `Choose at most ${max}`);
      return s;
    },
    formatAnswer: (v, q) => Array.isArray(v) ? v.map(x => optLabel(q, x) ?? `Other: ${str(x)}`).join("; ") : "",
    sampleAnswer: q => (q.options ?? []).slice(0, Math.max(q.validation.minSelections ?? 1, 1)).map(o => o.value),
  }),
  dropdown: define({
    type: "dropdown", label: "Dropdown", description: "Pick one option from a list.", category: "choice",
    isContent: false, hasOptions: true, supportsPlaceholder: true, validationKeys: NONE,
    configSchema: Empty,
    defaults: () => ({ label: "Select an option", placeholder: "Select…", options: defaultOptions() }),
    answerSchema: q => z.string().min(1).refine(choiceAllowed(q, false), "Choose one of the options"),
    formatAnswer: (v, q) => optLabel(q, v) ?? str(v),
    sampleAnswer: q => q.options?.[0]?.value,
  }),
  yes_no: define({
    type: "yes_no", label: "Yes / No", description: "A yes or no answer.", category: "boolean",
    isContent: false, hasOptions: false, supportsPlaceholder: false, validationKeys: NONE,
    configSchema: z.object({ yesLabel: z.string().min(1).max(40).default("Yes"), noLabel: z.string().min(1).max(40).default("No") }),
    defaults: () => ({ label: "Yes or no?" }),
    answerSchema: () => z.boolean({ error: "Choose yes or no" }),
    formatAnswer: (v, _q, c) => v === true ? c.yesLabel : v === false ? c.noLabel : "",
    sampleAnswer: () => true,
  }),
  toggle: define({
    type: "toggle", label: "Toggle", description: "An on/off switch, e.g. consent.", category: "boolean",
    isContent: false, hasOptions: false, supportsPlaceholder: false, validationKeys: NONE,
    configSchema: z.object({ onLabel: z.string().min(1).max(100).default("Yes") }),
    defaults: () => ({ label: "I agree to the terms" }),
    answerSchema: () => z.boolean(),
    formatAnswer: v => v === true ? "On" : v === false ? "Off" : "",
    sampleAnswer: () => true,
  }),
  date: define({
    type: "date", label: "Date", description: "A calendar date.", category: "date",
    isContent: false, hasOptions: false, supportsPlaceholder: false, validationKeys: NONE,
    configSchema: z.object({ minDate: DateString.optional(), maxDate: DateString.optional() }),
    defaults: () => ({ label: "Pick a date" }),
    answerSchema: (_q, c) => DateString
      .refine(d => !c.minDate || d >= c.minDate, `Choose a date on or after ${c.minDate}`)
      .refine(d => !c.maxDate || d <= c.maxDate, `Choose a date on or before ${c.maxDate}`),
    formatAnswer: v => str(v),
    sampleAnswer: (_q, c) => c.minDate ?? "2026-01-15",
  }),
  time: define({
    type: "time", label: "Time", description: "A time of day.", category: "date",
    isContent: false, hasOptions: false, supportsPlaceholder: false, validationKeys: NONE,
    configSchema: z.object({ use24h: z.boolean().default(false) }),
    defaults: () => ({ label: "Pick a time" }),
    answerSchema: () => z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a valid time"),
    formatAnswer: (v, _q, c) => {
      if (typeof v !== "string" || !/^\d{2}:\d{2}$/.test(v) || c.use24h) return str(v);
      const [h, m] = v.split(":").map(Number) as [number, number];
      return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
    },
    sampleAnswer: () => "09:30",
  }),
  date_range: define({
    type: "date_range", label: "Date range", description: "A start and end date.", category: "date",
    isContent: false, hasOptions: false, supportsPlaceholder: false, validationKeys: NONE,
    configSchema: z.object({ startLabel: z.string().min(1).max(40).default("Start date"), endLabel: z.string().min(1).max(40).default("End date") }),
    defaults: () => ({ label: "Select dates" }),
    answerSchema: () => z.object({ start: DateString, end: DateString }).refine(r => r.start <= r.end, "End date must be on or after the start date"),
    formatAnswer: v => v && typeof v === "object" ? `${str((v as Record<string, unknown>).start)} – ${str((v as Record<string, unknown>).end)}` : "",
    sampleAnswer: () => ({ start: "2026-01-10", end: "2026-01-12" }),
  }),
  star_rating: define({
    type: "star_rating", label: "Star rating", description: "Rate with stars.", category: "rating",
    isContent: false, hasOptions: false, supportsPlaceholder: false, validationKeys: NONE,
    configSchema: z.object({ max: z.number().int().min(3).max(10).default(5) }),
    defaults: () => ({ label: "How would you rate it?" }),
    answerSchema: (_q, c) => intRange(1, c.max),
    formatAnswer: (v, _q, c) => typeof v === "number" ? `${v}/${c.max}` : "",
    sampleAnswer: (_q, c) => c.max,
  }),
  linear_scale: define({
    type: "linear_scale", label: "Linear scale", description: "Pick a number on a scale.", category: "rating",
    isContent: false, hasOptions: false, supportsPlaceholder: false, validationKeys: NONE,
    configSchema: z.object({
      min: z.union([z.literal(0), z.literal(1)]).default(1),
      max: z.number().int().min(2).max(10).default(5),
      minLabel: z.string().max(40).optional(), maxLabel: z.string().max(40).optional(),
    }),
    defaults: () => ({ label: "On a scale, how much do you agree?" }),
    answerSchema: (_q, c) => intRange(c.min, c.max),
    formatAnswer: v => str(v),
    sampleAnswer: (_q, c) => c.min,
  }),
  opinion_scale: define({
    type: "opinion_scale", label: "Opinion scale", description: "A labelled 0–10 style scale (e.g. NPS).", category: "rating",
    isContent: false, hasOptions: false, supportsPlaceholder: false, validationKeys: NONE,
    configSchema: z.object({
      start: z.union([z.literal(0), z.literal(1)]).default(0),
      end: z.number().int().min(5).max(10).default(10),
      leftLabel: z.string().max(40).optional(), centerLabel: z.string().max(40).optional(), rightLabel: z.string().max(40).optional(),
    }),
    defaults: () => ({ label: "How likely are you to recommend us?" }),
    answerSchema: (_q, c) => intRange(c.start, c.end),
    formatAnswer: v => str(v),
    sampleAnswer: (_q, c) => c.end,
  }),
  file_upload: define({
    type: "file_upload", label: "File upload", description: "Upload documents or files.", category: "upload",
    isContent: false, hasOptions: false, supportsPlaceholder: false, validationKeys: FILE_V,
    configSchema: Empty,
    defaults: () => ({ label: "Upload a file", validation: { maxFileSizeMb: 10, maxFiles: 1, allowedMimeTypes: [...DOCUMENT_MIME_TYPES] } }),
    answerSchema: q => filesAnswer(q, false),
    formatAnswer: v => formatFiles(v),
    sampleAnswer: q => [{ id: "file-1", name: "cv.pdf", size: 1000, mimeType: q.validation.allowedMimeTypes?.[0] ?? "application/pdf" }],
  }),
  image_upload: define({
    type: "image_upload", label: "Image upload", description: "Upload images.", category: "upload",
    isContent: false, hasOptions: false, supportsPlaceholder: false, validationKeys: FILE_V,
    configSchema: Empty,
    defaults: () => ({ label: "Upload an image", validation: { maxFileSizeMb: 5, maxFiles: 1, allowedMimeTypes: [...IMAGE_MIME_TYPES] } }),
    answerSchema: q => filesAnswer(q, true),
    formatAnswer: v => formatFiles(v),
    sampleAnswer: q => [{ id: "img-1", name: "photo.png", size: 1000, mimeType: q.validation.allowedMimeTypes?.[0] ?? "image/png" }],
  }),
  signature: define({
    type: "signature", label: "Signature", description: "Draw a signature.", category: "other",
    isContent: false, hasOptions: false, supportsPlaceholder: false, validationKeys: NONE,
    configSchema: z.object({ penColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#111827") }),
    defaults: () => ({ label: "Please sign below" }),
    // PNG data URL, size-capped (~220 KB). Phase 3 moves signatures to private storage.
    answerSchema: () => z.string().max(300_000, "Signature image is too large").regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, "Please sign in the box"),
    formatAnswer: v => typeof v === "string" && v ? "[signature]" : "",
    sampleAnswer: () => "data:image/png;base64,iVBORw0KGgo=",
  }),
  color_picker: define({
    type: "color_picker", label: "Color picker", description: "Choose a colour.", category: "other",
    isContent: false, hasOptions: false, supportsPlaceholder: false, validationKeys: NONE,
    configSchema: Empty,
    defaults: () => ({ label: "Pick a colour" }),
    answerSchema: () => z.string().regex(/^#[0-9a-fA-F]{6}$/, "Choose a valid colour"),
    formatAnswer: v => str(v),
    sampleAnswer: () => "#2563eb",
  }),
  heading: define({
    ...content, type: "heading", label: "Heading", description: "A title to structure the form.", category: "content",
    configSchema: z.object({ level: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2) }),
    defaults: () => ({ label: "Heading" }),
  }),
  description: define({
    ...content, type: "description", label: "Text block", description: "A paragraph of explanatory text.", category: "content",
    configSchema: Empty,
    defaults: () => ({ label: "", description: "Add some explanatory text here." }),
  }),
  image: define({
    ...content, type: "image", label: "Image", description: "Display an image from a URL.", category: "content",
    configSchema: z.object({
      url: z.url({ protocol: /^https$/, error: "Use an https:// image URL" }).max(2000).optional(),
      alt: z.string().max(300).default(""),
      size: z.enum(["small", "medium", "full"]).default("full"),
    }),
    defaults: () => ({ label: "" }),
  }),
  divider: define({
    ...content, type: "divider", label: "Divider", description: "A horizontal line.", category: "content",
    configSchema: Empty,
    defaults: () => ({ label: "" }),
  }),
};
