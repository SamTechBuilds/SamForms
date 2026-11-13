// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { FormsPage } from "./FormsPage";

const h = vi.hoisted(() => ({ result: {} as Record<string, unknown> }));
vi.mock("@/features/forms/api", () => ({ useForms: () => h.result }));

const row = (id: string, status: string, title: string) => ({ id, title, slug: `slug-${id}`, status, created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-02T00:00:00Z" });
beforeEach(() => { h.result = {}; });
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
});
