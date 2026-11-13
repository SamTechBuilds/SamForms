// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RequireAdmin } from "./RequireAdmin";
import { authValue, WithAuth } from "@/test/auth-test-utils";
import type { AuthState } from "./auth-context";

function renderAt(state: AuthState) {
  return render(
    <WithAuth value={authValue(state)}>
      <MemoryRouter initialEntries={["/forms"]}>
        <Routes>
          <Route path="/login" element={<p>LOGIN PAGE</p>} />
          <Route path="/unauthorized" element={<p>DENIED PAGE</p>} />
          <Route element={<RequireAdmin />}><Route path="/forms" element={<p>PROTECTED</p>} /></Route>
        </Routes>
      </MemoryRouter>
    </WithAuth>,
  );
}

describe("RequireAdmin", () => {
  it("shows a loading state while auth resolves, never the protected content", () => {
    renderAt({ status: "loading" });
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("PROTECTED")).not.toBeInTheDocument();
  });
  it("redirects signed-out visitors to /login", () => {
    renderAt({ status: "signed_out" });
    expect(screen.getByText("LOGIN PAGE")).toBeInTheDocument();
    expect(screen.queryByText("PROTECTED")).not.toBeInTheDocument();
  });
  it("redirects authenticated non-admins to /unauthorized", () => {
    renderAt({ status: "unauthorized", email: "x@y.z" });
    expect(screen.getByText("DENIED PAGE")).toBeInTheDocument();
    expect(screen.queryByText("PROTECTED")).not.toBeInTheDocument();
  });
  it("shows an error with retry (and no content) when authorization can't be verified", () => {
    renderAt({ status: "error", message: "network down" });
    expect(screen.getByRole("alert")).toHaveTextContent("network down");
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryByText("PROTECTED")).not.toBeInTheDocument();
  });
  it("renders protected routes for an authorized admin", () => {
    renderAt({ status: "authorized", admin: { id: "1", email: "a@b.c", role: "super_admin", is_active: true } });
    expect(screen.getByText("PROTECTED")).toBeInTheDocument();
  });
});
