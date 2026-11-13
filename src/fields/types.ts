import type { z } from "zod";
import type { FieldType, Question } from "@/schema/form";

/** Pure (DOM-free) field definition. React editors/renderers live in src/fields/ui and are keyed by the same FieldType. */
export const FIELD_CATEGORIES = [
  { id: "text", label: "Text" },
  { id: "contact", label: "Contact" },
  { id: "numeric", label: "Numeric" },
  { id: "choice", label: "Choice" },
  { id: "boolean", label: "Yes / No" },
  { id: "date", label: "Date & time" },
  { id: "rating", label: "Rating" },
  { id: "upload", label: "Upload" },
  { id: "other", label: "Other" },
  { id: "content", label: "Content" },
] as const;
export type FieldCategory = (typeof FIELD_CATEGORIES)[number]["id"];

export type ValidationKey = keyof Question["validation"];
export type FieldConfig = Record<string, unknown>;

export interface FieldDefinition {
  type: FieldType;
  label: string;
  description: string;
  category: FieldCategory;
  /** Content blocks display information and never collect an answer. */
  isContent: boolean;
  /** Uses question.options (choice fields). */
  hasOptions: boolean;
  supportsPlaceholder: boolean;
  /** Which question.validation settings apply to this type (drives the settings UI and deep validation). */
  validationKeys: readonly ValidationKey[];
  /** Zod schema for question.config. Parsing {} yields the full default config. */
  configSchema: z.ZodType<FieldConfig>;
  /** Defaults for a newly added question of this type (id/sectionId are assigned by the builder). */
  defaults: () => Pick<Question, "label"> & Partial<Pick<Question, "placeholder" | "description" | "options" | "validation">>;
  /** Zod schema for a respondent's answer (non-empty values only; "required" is handled by validateAnswer). */
  answerSchema: (q: Question, config: FieldConfig) => z.ZodType | null;
  /** Human-readable value for exports and the response viewer. */
  formatAnswer: (value: unknown, q: Question, config: FieldConfig) => string;
  /** A valid example answer (used by tests and the preview's "fill sample" helper). */
  sampleAnswer: (q: Question, config: FieldConfig) => unknown;
}
