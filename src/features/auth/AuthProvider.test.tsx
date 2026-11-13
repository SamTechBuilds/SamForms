// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AuthProvider } from "./AuthProvider";
import { useAuth } from "./auth-context";

type Listener = (event: string, session: unknown) => void;
const h = vi.hoisted(() => ({ listener: null as null | ((e: string, s: unknown) => void), adminRow: null as unknown, adminError: null as unknown }));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: Listener) => { h.listener = cb; return { data: { subscription: { unsubscribe: () => {} } } }; },
      signInWithPassword: vi.fn(), signOut: vi.fn(async () => ({})), resetPasswordForEmail: vi.fn(), updateUser: vi.fn(),
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: h.adminRow, error: h.adminError }) }) }) }),
    rpc: vi.fn(async () => ({})),
  },
}));

function Probe() { const { state } = useAuth(); return <p data-testid="status">{state.status}</p>; }
const session = { user: { id: "u1", email: "a@b.co" } };
const mount = () => { render(<AuthProvider><Probe /></AuthProvider>); };
const emit = (event: string, s: unknown) => waitFor(() => { expect(h.listener).toBeTruthy(); }).then(() => h.listener!(event, s));

beforeEach(() => { h.listener = null; h.adminRow = null; h.adminError = null; });

describe("AuthProvider authorization", () => {
  it("is loading until the initial session event", () => {
    mount();
    expect(screen.getByTestId("status")).toHaveTextContent("loading");
  });
  it("signed_out when there is no session", async () => {
    mount(); await emit("INITIAL_SESSION", null);
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("signed_out"));
  });
  it("authorized only when an active admin_users row exists", async () => {
    h.adminRow = { id: "u1", email: "a@b.co", role: "super_admin", is_active: true };
    mount(); await emit("INITIAL_SESSION", session);
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authorized"));
  });
  it("unauthorized when a valid session has no admin row (e.g. unexpected signup)", async () => {
    h.adminRow = null;
    mount(); await emit("INITIAL_SESSION", session);
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("unauthorized"));
  });
  it("unauthorized when the admin row is deactivated", async () => {
    h.adminRow = { id: "u1", email: "a@b.co", role: "super_admin", is_active: false };
    mount(); await emit("INITIAL_SESSION", session);
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("unauthorized"));
  });
  it("error (not authorized) when the lookup fails", async () => {
    h.adminError = { message: "boom" };
    mount(); await emit("INITIAL_SESSION", session);
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("error"));
  });
  it("returns to signed_out on SIGNED_OUT (session expiry / logout)", async () => {
    h.adminRow = { id: "u1", email: "a@b.co", role: "super_admin", is_active: true };
    mount(); await emit("INITIAL_SESSION", session);
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authorized"));
    h.listener!("SIGNED_OUT", null);
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("signed_out"));
  });
});
