import { describe, it, expect } from "vitest";
import { FormSchema as BrowserSchema } from "@/schema/form";
import { normalizeGeneratedForm as browserNormalize } from "@/features/ai/normalize";
import { FormSchema as ServerSchema } from "../../supabase/functions/_shared/form-schema.ts";
import { normalizeGeneratedForm as serverNormalize } from "../../supabase/functions/_shared/normalize-form.ts";

// The browser and the Edge Function must use exactly one schema definition.
describe("shared canonical schema", () => {
  it("the browser and the server import the same schema and normaliser objects", () => {
    expect(BrowserSchema).toBe(ServerSchema);
    expect(browserNormalize).toBe(serverNormalize);
  });

  const valid = {
    schemaVersion: 1,
    title: "Customer feedback",
    layout: "classic",
    sections: [{ id: "s1", title: "Questions", pageBreakAfter: false }],
    questions: [
      { id: "name", type: "short_text", sectionId: "s1", label: "Name", required: true, config: {}, validation: {}, rules: [] },
      { id: "rating", type: "single_choice", sectionId: "s1", label: "Rate us", required: false, config: {}, validation: {}, rules: [],
        options: [{ id: "o1", label: "Good", value: "good" }, { id: "o2", label: "Poor", value: "poor" }] },
    ],
  };

  it("accepts a valid form", () => {
    expect(ServerSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects duplicate question ids", () => {
    const bad = { ...valid, questions: [valid.questions[0], valid.questions[0]] };
    expect(ServerSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a question that points at an unknown section", () => {
    const bad = { ...valid, questions: [{ ...valid.questions[0], sectionId: "missing" }] };
    expect(ServerSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a choice question with no options", () => {
    const bad = { ...valid, questions: [{ ...valid.questions[1], options: undefined }] };
    expect(ServerSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a conditional rule that references an unknown question", () => {
    const bad = {
      ...valid,
      questions: [{ ...valid.questions[0], rules: [{ conditions: [{ questionId: "ghost", operator: "is_answered", value: null }], action: "show" }] }],
    };
    expect(ServerSchema.safeParse(bad).success).toBe(false);
  });

  it("the normaliser returns a schema that always passes the canonical validation", () => {
    const { schema, warnings } = serverNormalize({ title: "Feedback", questions: [{ label: "Name", type: "bogus_type" }, { label: "Pick", type: "dropdown", options: ["Only one"] }] }, "fallback");
    expect(ServerSchema.safeParse(schema).success).toBe(true);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("the normaliser rejects drafts that cannot be used", () => {
    expect(() => serverNormalize("not an object", "x")).toThrow();
    expect(() => serverNormalize({ title: "Empty", questions: [] }, "x")).toThrow(/no questions/);
  });
});
