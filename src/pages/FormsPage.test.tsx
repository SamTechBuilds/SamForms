// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { FormsPage } from "./FormsPage";

const h = vi.hoisted(() => ({
  result: {} as Record<string, unknown>,
  setFormStatus: () => Promise.resolve(),
  deleteForm: () => Promise.resolve(),
}));
vi.mock("@/features/forms/api", () => ({
  useForms: () => h.result,
  setFormStatus: (...a: unknown[]) => h.setFormStatus(...(a as [])),
  deleteForm: (...a: unknown[]) => h.deleteForm(...(a as [])),
  duplicateForm: vi.fn(),
  renameForm: vi.fn(),
}));

const row = (id: string, status: string, title: string, publishedVersionId: string | null = null) =>
  ({ id, title, slug: `slug-${id}`, status, created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-02T00:00:00Z", published_version_id: publishedVersionId });
beforeEach(() => {
  h.result = {};
  h.setFormStatus = vi.fn(() => Promise.resolve());
  h.deleteForm = vi.fn(() => Promise.resolve());
});
const renderPage = () => render(
  <QueryClientProvider client={new QueryClient()}><MemoryRouter><FormsPage /></MemoryRouter></QueryClientProvider>,
);

describe("FormsPage states", () => {
  it("loading", () => {
    h.result = { isPending: true, isError: false, isSuccess: false };
    renderPage();
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
  });
  it("error with retry", async () => {
    const refetch = vi.fn();
    h.result = { isPending: false, isError: true, isSuccess: false, error: new Error("denied"), refetch };
    renderPage();
    expect(screen.getByRole("alert")).toHaveTextContent("denied");
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(refetch).toHaveBeenCalled();
  });
  it("empty state offers a real create action that links to the create page", () => {
    h.result = { isPending: false, isError: false, isSuccess: true, data: [] };
    renderPage();
    expect(screen.getByText("No forms yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /create a form/i })).toHaveAttribute("href", "/forms/new");
  });
  it("lists forms and filters by status", async () => {
    h.result = { isPending: false, isError: false, isSuccess: true, data: [row("1", "draft", "Alpha"), row("2", "archived", "Beta")] };
    renderPage();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Archived" }));
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });

  it("filters by the search box, matching title or slug", async () => {
    h.result = { isPending: false, isError: false, isSuccess: true, data: [row("1", "draft", "Job application"), row("2", "draft", "Event signup")] };
    renderPage();
    await userEvent.type(screen.getByRole("searchbox", { name: /search forms/i }), "event");
    expect(screen.queryByText("Job application")).not.toBeInTheDocument();
    expect(screen.getByText("Event signup")).toBeInTheDocument();
  });

  it("sorts by title", async () => {
    h.result = { isPending: false, isError: false, isSuccess: true, data: [row("1", "draft", "Zebra"), row("2", "draft", "Alpha")] };
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: /last updated/i }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Title (A–Z)" }));
    const titles = screen.getAllByRole("button", { name: /^(Zebra|Alpha)$/ }).map(el => el.textContent);
    expect(titles).toEqual(["Alpha", "Zebra"]);
  });

  it("selects rows and archives them in bulk", async () => {
    h.result = { isPending: false, isError: false, isSuccess: true, data: [row("1", "draft", "Alpha"), row("2", "draft", "Beta")] };
    renderPage();
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Alpha" }));
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^archive$/i }));
    expect(h.setFormStatus).toHaveBeenCalledWith("1", "archive");
  });

  it("excludes published forms from the bulk-delete count", async () => {
    h.result = { isPending: false, isError: false, isSuccess: true, data: [row("1", "draft", "Alpha"), row("2", "published", "Beta", "v1")] };
    renderPage();
    await userEvent.click(screen.getByRole("checkbox", { name: "Select all forms" }));
    expect(screen.getByRole("button", { name: /delete \(1\)/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /delete \(1\)/i }));
    await userEvent.click(screen.getByRole("button", { name: /delete drafts/i }));
    expect(h.deleteForm).toHaveBeenCalledWith("1");
    expect(h.deleteForm).not.toHaveBeenCalledWith("2");
  });
});
