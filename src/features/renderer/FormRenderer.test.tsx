// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormRenderer } from "./FormRenderer";
import { blankForm, createQuestion } from "@/features/builder/factory";
import type { FormDefinition } from "@/schema/form";

function build(): FormDefinition {
  const f = blankForm("Intake");
  const s = f.sections[0]!.id;
  const name = { ...createQuestion("short_text", s), id: "name", label: "Your name", required: true };
  const wants = { ...createQuestion("yes_no", s), id: "wants", label: "Want a call?" };
  const phone = { ...createQuestion("phone", s), id: "phone", label: "Phone", required: true, rules: [{ id: "r", combinator: "and" as const, conditions: [{ questionId: "wants", operator: "equals" as const, value: true }], action: { type: "show" as const } }] };
  f.questions = [name, wants, phone];
  f.welcomeScreen = { title: "Welcome!", buttonLabel: "Begin" };
  return f;
}

describe("FormRenderer (conversational)", () => {
  it("walks through welcome, validation, conditional question and submission", async () => {
    const onSubmit = vi.fn(async () => {});
    render(<FormRenderer form={build()} onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole("button", { name: /begin/i }));

    // Required name: empty answer is blocked with an accessible error.
    await userEvent.click(screen.getByRole("button", { name: /^ok$/i }));
    expect(screen.getByRole("alert")).toHaveTextContent("This question is required");

    await userEvent.type(screen.getByLabelText(/your name/i), "Asif");
    await userEvent.click(screen.getByRole("button", { name: /^ok$/i }));

    // Conditional question: answer "no", so the phone question is skipped and the form submits.
    expect(screen.getByRole("radio", { name: /yes/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: /no/i }));
    await userEvent.click(screen.getByRole("button", { name: /submit/i }));

    expect(onSubmit).toHaveBeenCalledWith({ name: "Asif", wants: false });
    expect(await screen.findByText("Thank you!")).toBeInTheDocument();
  });

  it("shows the conditional question when the trigger matches", async () => {
    const onSubmit = vi.fn(async () => {});
    render(<FormRenderer form={build()} onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole("button", { name: /begin/i }));
    await userEvent.type(screen.getByLabelText(/your name/i), "Asif");
    await userEvent.click(screen.getByRole("button", { name: /^ok$/i }));
    await userEvent.click(screen.getByRole("radio", { name: /yes/i }));
    await userEvent.click(screen.getByRole("button", { name: /^ok$/i }));
    const phone = screen.getByLabelText(/phone/i);
    await userEvent.type(phone, "+1 555 123 4567");
    await userEvent.click(screen.getByRole("button", { name: /submit/i }));
    expect(onSubmit).toHaveBeenCalledWith({ name: "Asif", wants: true, phone: "+1 555 123 4567" });
  });

  it("classic layout shows every visible question on one page and reports errors on submit", async () => {
    const f = build();
    f.layout = "classic";
    delete f.welcomeScreen;
    render(<FormRenderer form={f} onSubmit={vi.fn()} />);
    const main = screen.getByRole("heading", { name: "Intake" }).closest("form")!;
    expect(within(main).getByLabelText(/your name/i)).toBeInTheDocument();
    await userEvent.click(within(main).getByRole("button", { name: /submit/i }));
    expect(within(main).getByRole("alert")).toHaveTextContent("This question is required");
  });
});
