import { createContext, useContext } from "react";
import type { FieldType, FormDefinition } from "@/schema/form";
import type { BuilderAction } from "./state";

export interface BuilderContextValue {
  form: FormDefinition;
  dispatch: (a: BuilderAction) => void;
  selectedId: string | null;
  select: (id: string | null) => void;
  /** Add a question of `type` after the selection (or at the end of the selected/last section) and select it. */
  addQuestion: (type: FieldType, sectionId?: string, index?: number) => void;
}
export const BuilderContext = createContext<BuilderContextValue | null>(null);
export function useBuilder(): BuilderContextValue {
  const v = useContext(BuilderContext);
  if (!v) throw new Error("useBuilder must be used inside <BuilderContext.Provider>");
  return v;
}
