// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import axe from "axe-core";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FormRenderer } from "@/features/renderer/FormRenderer";
import { FormSchema } from "@/schema/form";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      upsert: async () => ({ error: null }),
    }),
  },
}));

const { NotificationSettingsCard } = await import("@/features/notifications/NotificationSettingsCard");

// Colour contrast cannot be measured in jsdom (no layout or computed palette), so it is checked separately in the browser E2E run.
const RULES = { rules: { "color-contrast": { enabled: false } } };

async function violationsOf(container: HTMLElement): Promise<string[]> {
  const result = await axe.run(container, RULES);
  return result.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(" ")).join(", ")}`);
}

// Parsed through the real schema so defaults (theme, settings) are filled in exactly as in the app.
const form = FormSchema.parse({
  schemaVersion: 1,
  title: "Contact us",
  layout: "classic",
  sections: [{ id: "s1", title: "Contact" }],
  questions: [
    { id: "name", type: "short_text", sectionId: "s1", label: "Full name", required: true },
    { id: "email", type: "email", sectionId: "s1", label: "Email address", required: true },
    {
      id: "topic", type: "single_choice", sectionId: "s1", label: "Topic",
      options: [{ id: "o1", value: "Sales", label: "Sales" }, { id: "o2", value: "Support", label: "Support" }],
    },
  ],
});

describe("accessibility (axe-core, WCAG rules)", () => {
  it("public form renderer has no violations", async () => {
    const { container } = render(<MemoryRouter><FormRenderer form={form} onSubmit={() => undefined} /></MemoryRouter>);
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(await violationsOf(container)).toEqual([]);
  });

  it("notification settings card has no violations", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={qc}>
        <NotificationSettingsCard formId="f1" defaultRecipient="admin@example.com" />
      </QueryClientProvider>,
    );
    await screen.findByRole("switch");
    expect(await violationsOf(container)).toEqual([]);
  });
});
