import { z } from "zod";

export const SCHEMA_VERSION = 1 as const;

/** Single source of truth for field types (the field registry builds on this). */
export const FIELD_TYPES = [
  "short_text","long_text",
  "name","email","phone","url",
  "number","currency",
  "single_choice","multiple_choice","dropdown",
  "yes_no","toggle",
  "date","time","date_range",
  "star_rating","linear_scale","opinion_scale",
  "file_upload","image_upload",
  "signature","color_picker",
  "heading","description","image","divider",
] as const;
export const FieldType = z.enum(FIELD_TYPES);
export type FieldType = z.infer<typeof FieldType>;

export const CONTENT_FIELD_TYPES: readonly FieldType[] = ["heading","description","image","divider"];

const Id = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);

export const OptionSchema = z.object({
  id: Id,
  label: z.string().min(1).max(200),
  value: z.string().min(1).max(200),
});

export const ValidationSchema = z.object({
  minLength: z.number().int().nonnegative().optional(),
  maxLength: z.number().int().positive().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  pattern: z.string().max(300).optional(), // regex source; evaluated safely, never code
  patternMessage: z.string().max(200).optional(),
  minSelections: z.number().int().nonnegative().optional(),
  maxSelections: z.number().int().positive().optional(),
  allowedMimeTypes: z.array(z.string()).optional(),
  maxFileSizeMb: z.number().positive().max(50).optional(),
  maxFiles: z.number().int().positive().max(10).optional(),
}).strict();

/** Condition engine: data only, never executable code. */
export const OPERATORS = ["equals","not_equals","contains","greater_than","less_than","is_answered","is_empty"] as const;
export const ConditionSchema = z.object({
  questionId: Id,
  operator: z.enum(OPERATORS),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
});
export const RuleSchema = z.object({
  id: Id,
  combinator: z.enum(["and","or"]),
  conditions: z.array(ConditionSchema).min(1).max(20),
  action: z.discriminatedUnion("type", [
    z.object({ type: z.literal("show") }),
    z.object({ type: z.literal("hide") }),
    z.object({ type: z.literal("goto_section"), sectionId: Id }),
  ]),
});
export type Rule = z.infer<typeof RuleSchema>;

export const QuestionSchema = z.object({
  id: Id,
  type: FieldType,
  sectionId: Id,
  label: z.string().max(500),
  description: z.string().max(2000).optional(),
  placeholder: z.string().max(200).optional(),
  required: z.boolean().default(false),
  options: z.array(OptionSchema).max(200).optional(),
  config: z.record(z.string(), z.unknown()).default({}), // per-type config, validated by the field registry
  validation: ValidationSchema.default({}),
  rules: z.array(RuleSchema).default([]),
  aiNotes: z.string().max(500).optional(), // warnings on uncertain AI interpretation
});
export type Question = z.infer<typeof QuestionSchema>;

export const SectionSchema = z.object({
  id: Id,
  title: z.string().max(200),
  description: z.string().max(2000).optional(),
  pageBreakAfter: z.boolean().default(false),
});

const Color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const ThemeSchema = z.object({
  preset: z.string().default("classic"),
  background: Color.default("#ffffff"),
  primary: Color.default("#2563eb"),
  secondary: Color.default("#64748b"),
  fontFamily: z.enum(["inter","serif","mono","rounded"]).default("inter"),
  buttonStyle: z.enum(["solid","outline","pill"]).default("solid"),
  inputStyle: z.enum(["underline","outlined","filled"]).default("underline"),
  borderRadius: z.number().min(0).max(32).default(8),
  progress: z.enum(["bar","steps","percent","none"]).default("bar"),
});

export const ScreenSchema = z.object({
  title: z.string().max(200),
  message: z.string().max(2000).optional(),
  buttonLabel: z.string().max(60).optional(),
  redirectUrl: z.string().url().optional(),
});

export const FormSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  layout: z.enum(["conversational","classic"]).default("conversational"),
  sections: z.array(SectionSchema).min(1),
  questions: z.array(QuestionSchema).max(500),
  theme: ThemeSchema.default({} as never),
  welcomeScreen: ScreenSchema.optional(),
  completionScreen: ScreenSchema.default({ title: "Thank you!" }),
}).superRefine((f, ctx) => {
  const qIds = new Set<string>(), sIds = new Set(f.sections.map(s => s.id));
  f.questions.forEach((q, i) => {
    if (qIds.has(q.id)) ctx.addIssue({ code: "custom", path: ["questions", i, "id"], message: "duplicate question id" });
    qIds.add(q.id);
    if (!sIds.has(q.sectionId)) ctx.addIssue({ code: "custom", path: ["questions", i, "sectionId"], message: "unknown section" });
  });
  f.questions.forEach((q, i) => q.rules.forEach(r => {
    r.conditions.forEach(c => { if (!qIds.has(c.questionId)) ctx.addIssue({ code: "custom", path: ["questions", i, "rules"], message: `condition references unknown question ${c.questionId}` }); });
    if (r.action.type === "goto_section" && !sIds.has(r.action.sectionId)) ctx.addIssue({ code: "custom", path: ["questions", i, "rules"], message: "goto unknown section" });
  }));
  const choice = ["single_choice","multiple_choice","dropdown"];
  f.questions.forEach((q, i) => { if (choice.includes(q.type) && !(q.options && q.options.length)) ctx.addIssue({ code: "custom", path: ["questions", i, "options"], message: "choice question needs options" }); });
});
export type FormDefinition = z.infer<typeof FormSchema>;
