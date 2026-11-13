// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { LoginPage } from "./LoginPage";
import { authValue, WithAuth } from "@/test/auth-test-utils";

const setup = (signIn = vi.fn(async () => ({ error: null as string | null }))) => {
  render(<WithAuth value={authValue({ status: "signed_out" }, { signIn })}><MemoryRouter><LoginPage /></MemoryRouter></WithAuth>);
  return { signIn, user: userEvent.setup() };
};

describe("LoginPage", () => {
  it("validates input client-side and does not call the server", async () => {
    const { signIn, user } = setup();
    await user.type(screen.getByLabelText("Email"), "not-an-email");
    await user.type(screen.getByLabelText("Password"), "x");
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/valid email/i);
    expect(signIn).not.toHaveBeenCalled();
  });
  it("submits trimmed credentials", async () => {
    const { signIn, user } = setup();
    await user.type(screen.getByLabelText("Email"), "  admin@example.com ");
    await user.type(screen.getByLabelText("Password"), "Secret-pass-123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => expect(signIn).toHaveBeenCalledWith("admin@example.com", "Secret-pass-123"));
  });
  it("shows the server's generic error", async () => {
    const { user } = setup(vi.fn(async () => ({ error: "Invalid email or password." })));
    await user.type(screen.getByLabelText("Email"), "a@b.co");
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password.");
  });
});
