// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormRenderer, safeHttpUrl } from "./FormRenderer";
import { SubmissionRejected } from "./errors";
import { blankForm, createQuestion } from "@/features/builder/factory";
import type { FormDefinition } from "@/schema/form";

function nameForm(): FormDefinition {
  const f = blankForm("Intake");
  const s = f.sections[0]!.id;
  f.questions = [{ ...createQuestion("short_text", s), id: "name", label: "Your name", required: true }];
  return f;
}

describe("FormRenderer handles server-side rejection", () => {
  it("shows the server's message next to the question and does not show the thank-you screen", async () => {
    const onSubmit = vi.fn(async () => { throw new SubmissionRejected({ name: "Name is already on the list" }); });
    render(<FormRenderer form={nameForm()} onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText(/your name/i), "Asif");
    await userEvent.click(screen.getByRole("button", { name: /submit/i }));
    expect(await screen.findByText("Name is already on the list")).toBeInTheDocument();
    expect(screen.getByText(/some answers need attention/i)).toBeInTheDocument();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("shows other failures as plain text and keeps the answers", async () => {
    const onSubmit = vi.fn(async () => { throw new Error("Too many submissions from your network. Please try again in a few minutes."); });
    render(<FormRenderer form={nameForm()} onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText(/your name/i), "Asif");
    await userEvent.click(screen.getByRole("button", { name: /submit/i }));
    expect(await screen.findByText(/too many submissions/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/your name/i)).toHaveValue("Asif");
  });
});

describe("safeHttpUrl", () => {
  it("allows only http and https links", () => {
    expect(safeHttpUrl("https://example.com/thanks")).toBe("https://example.com/thanks");
    expect(safeHttpUrl("http://example.com")).toBe("http://example.com/");
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("data:text/html,hi")).toBeNull();
    expect(safeHttpUrl("not a url")).toBeNull();
    expect(safeHttpUrl(undefined)).toBeNull();
  });
});
