// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("@/features/forms/api", () => ({ useForm: () => ({ data: { title: "Intake" } }) }));
// Notification settings have their own tests; here only the responses page itself is under test.
vi.mock("@/features/notifications/NotificationSettingsCard", () => ({ NotificationSettingsCard: () => null }));
vi.mock("@/features/auth/auth-context", () => ({ useAuth: () => ({ state: { status: "loading" } }) }));
vi.mock("@/features/responses/api", async (orig) => {
  const actual = await orig<typeof import("@/features/responses/api")>();
  return {
    ...actual,
    useVersionSchemas: () => ({ data: [{ id: "v1", version: 1, schema: {
      schemaVersion: 1, title: "Intake", layout: "classic", sections: [{ id: "s1", title: "Main", pageBreakAfter: false }],
      questions: [{ id: "name", type: "short_text", sectionId: "s1", label: "Name", required: false, config: {}, validation: {}, rules: [] }],
    } }] }),
    useResponseStats: () => ({ isPending: false, isError: false, data: {
      total: 1, last_7_days: 1, last_30_days: 1,
      per_day: [{ day: "2026-11-14", count: 1 }],
      questions: [{ id: "name", label: "Name", type: "short_text", answered: 1, breakdown: null }],
    } }),
    useResponses: () => ({ isPending: false, isError: false, data: { total: 1, rows: [{
      id: "r1", submitted_at: new Date().toISOString(), answers: { name: "Ana" }, user_agent: null,
      form_version_id: "v1", submission_files: [],
    }] } }),
  };
});

const { ResponsesPage } = await import("./ResponsesPage");

describe("ResponsesPage", () => {
  it("shows statistics, the response list and an answer preview", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/forms/f1/responses"]}>
          <Routes><Route path="/forms/:id/responses" element={<ResponsesPage />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByRole("heading", { name: "Intake: responses" })).toBeInTheDocument();
    expect(screen.getByText("Total responses")).toBeInTheDocument();
    expect(screen.getByText("Name: Ana")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete response" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Responses per day/ })).toBeInTheDocument();
  });
});
