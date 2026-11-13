import { FIELD_TYPES, type FieldType, type Question } from "@/schema/form";
import { FIELD_DEFINITIONS } from "./definitions";
import { FIELD_CATEGORIES, type FieldCategory, type FieldConfig, type FieldDefinition } from "./types";

/**
 * The field registry: one pure definition per canonical FieldType.
 * Typed as Record<FieldType, …> so adding a type to the canonical schema without
 * a definition is a compile error (and tests assert completeness at runtime too).
 */
export const fieldRegistry: Readonly<Record<FieldType, FieldDefinition>> = FIELD_DEFINITIONS;

export function getField(type: FieldType): FieldDefinition {
  return fieldRegistry[type];
}

export const fieldsByCategory: { id: FieldCategory; label: string; fields: FieldDefinition[] }[] =
  FIELD_CATEGORIES.map(c => ({ ...c, fields: FIELD_TYPES.map(t => fieldRegistry[t]).filter(f => f.category === c.id) }));

/** Parse a question's config through its type's schema, filling defaults. Falls back to defaults when invalid. */
export function resolveConfig(q: Pick<Question, "type" | "config">): FieldConfig {
  const def = getField(q.type);
  const parsed = def.configSchema.safeParse(q.config ?? {});
  return parsed.success ? parsed.data : def.configSchema.parse({});
}

export const isInputQuestion = (q: Pick<Question, "type">) => !getField(q.type).isContent;
