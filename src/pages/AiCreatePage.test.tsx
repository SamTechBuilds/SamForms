// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const requestDraft = vi.fn();
const createForm = vi.fn<(input: { title: string; schema: { questions: unknown[] } }) => Promise<{ id: string }>>(async () => ({ id: "new-id" }));
vi.mock("@/features/ai/client", () => ({ requestDraft: (...a: unknown[]) => requestDraft(...a) }));
vi.mock("@/features/forms/api", () => ({ createForm: (arg: Parameters<typeof createForm>[0]) => createForm(arg) }));

const { AiCreatePage } = await import("./AiCreatePage");

describe("AiCreatePage", () => {
  beforeEach(() => {
    requestDraft.mockReset();
    createForm.mockClear();
  });

  it("generates a draft from a description, reviews it and saves it as a draft", async () => {
    requestDraft.mockResolvedValue({
      title: "Job application",
      questions: [
        { type: "name", label: "Full name", required: true },
        { type: "email", label: "Email address", required: true },
      ],
    });
    render(<MemoryRouter><AiCreatePage /></MemoryRouter>);
    await userEvent.type(screen.getByLabelText(/what should the form collect/i), "A job application for a barista");
    await userEvent.click(screen.getByRole("button", { name: /generate draft/i }));

    expect(await screen.findByRole("heading", { name: "Review the AI draft" })).toBeInTheDocument();
    expect(requestDraft).toHaveBeenCalledWith(expect.objectContaining({ mode: "prompt", prompt: "A job application for a barista" }));
    expect(screen.getByText("Full name *")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /remove email address/i }));
    expect(screen.queryByText("Email address *")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /save as draft/i }));
    await waitFor(() => expect(createForm).toHaveBeenCalledTimes(1));
    const arg = createForm.mock.calls[0]![0];
    expect(arg.title).toBe("Job application");
    expect(arg.schema.questions).toHaveLength(1);
  });

  it("generates a draft from a link", async () => {
    requestDraft.mockResolvedValue({
      title: "Event registration",
      questions: [{ type: "name", label: "Full name", required: true }],
    });
    render(<MemoryRouter><AiCreatePage /></MemoryRouter>);
    await userEvent.click(screen.getByRole("tab", { name: "From a link" }));
    await userEvent.type(screen.getByLabelText(/link to an existing form/i), "https://example.com/rsvp");
    await userEvent.click(screen.getByRole("button", { name: /generate draft/i }));

    expect(await screen.findByRole("heading", { name: "Review the AI draft" })).toBeInTheDocument();
    expect(requestDraft).toHaveBeenCalledWith(expect.objectContaining({ mode: "url", url: "https://example.com/rsvp" }));
  });

  it("rejects an invalid link before calling the server", async () => {
    render(<MemoryRouter><AiCreatePage /></MemoryRouter>);
    await userEvent.click(screen.getByRole("tab", { name: "From a link" }));
    await userEvent.type(screen.getByLabelText(/link to an existing form/i), "not a link");
    await userEvent.click(screen.getByRole("button", { name: /generate draft/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/valid web address/i);
    expect(requestDraft).not.toHaveBeenCalled();
  });

  it("shows the server's message when generation is refused", async () => {
    requestDraft.mockRejectedValue(new Error("You have reached the hourly AI limit. Try again later."));
    render(<MemoryRouter><AiCreatePage /></MemoryRouter>);
    await userEvent.type(screen.getByLabelText(/what should the form collect/i), "Event signup");
    await userEvent.click(screen.getByRole("button", { name: /generate draft/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/hourly AI limit/);
    expect(createForm).not.toHaveBeenCalled();
  });
});
