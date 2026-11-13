// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormsPage } from "./FormsPage";

const h = vi.hoisted(() => ({ result: {} as Record<string, unknown> }));
vi.mock("@/features/forms/api", () => ({ useForms: () => h.result }));

const row = (id: string, status: string, title: string) => ({ id, title, slug: `slug-${id}`, status, created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-02T00:00:00Z" });
beforeEach(() => { h.result = {}; });

describe("FormsPage states", () => {
  it("loading", () => {
    h.result = { isPending: true, isError: false, isSuccess: false };
    render(<FormsPage />);
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
  });
  it("error with retry", async () => {
    const refetch = vi.fn();
    h.result = { isPending: false, isError: true, isSuccess: false, error: new Error("denied"), refetch };
    render(<FormsPage />);
    expect(screen.getByRole("alert")).toHaveTextContent("denied");
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(refetch).toHaveBeenCalled();
  });
  it("empty state does not offer a fake create action", () => {
    h.result = { isPending: false, isError: false, isSuccess: true, data: [] };
    render(<FormsPage />);
    expect(screen.getByText("No forms yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /new form/i })).toBeDisabled();
  });
  it("lists forms and filters by status", async () => {
    h.result = { isPending: false, isError: false, isSuccess: true, data: [row("1", "draft", "Alpha"), row("2", "archived", "Beta")] };
    render(<FormsPage />);
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Archived" }));
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });
});
