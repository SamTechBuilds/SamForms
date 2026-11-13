import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { AdminUserRow } from "@/lib/database.types";
import { AuthContext, type AuthContextValue, type AuthState } from "./auth-context";

type AdminLookup = { kind: "pending" } | { kind: "found"; admin: AdminUserRow } | { kind: "denied" } | { kind: "error"; message: string };

/**
 * Authorization comes from the database (admin_users, behind RLS), never from JWT metadata
 * or client-side flags. The same table backs is_admin() used by every RLS policy.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  // undefined = auth not yet initialised, null = no session
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [lookup, setLookup] = useState<AdminLookup>({ kind: "pending" });
  const [recoveryActive, setRecoveryActive] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // INITIAL_SESSION fires on subscribe, so no separate getSession() call is needed.
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === "PASSWORD_RECOVERY") setRecoveryActive(true);
      if (event === "SIGNED_OUT") setRecoveryActive(false);
      setSession(next);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("admin_users").select("id,email,role,is_active").eq("id", userId).maybeSingle();
      if (cancelled) return;
      if (error) setLookup({ kind: "error", message: error.message });
      else if (!data || !data.is_active) setLookup({ kind: "denied" });
      else setLookup({ kind: "found", admin: data as AdminUserRow });
    })();
    return () => { cancelled = true; };
  }, [userId, attempt]);

  const state: AuthState = useMemo(() => {
    if (session === undefined) return { status: "loading" };
    if (session === null) return { status: "signed_out" };
    switch (lookup.kind) {
      case "pending": return { status: "loading" };
      case "denied": return { status: "unauthorized", email: session.user.email };
      case "error": return { status: "error", message: lookup.message };
      case "found": return { status: "authorized", admin: lookup.admin };
    }
  }, [session, lookup]);

  const signIn = useCallback<AuthContextValue["signIn"]>(async (email, password) => {
    setLookup({ kind: "pending" });
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    // Generic message: never reveal whether the email exists.
    if (error) return { error: "Invalid email or password." };
    // Server-side audit entry; silently rejected by the database if the user is not an admin.
    void supabase.rpc("log_audit", { p_action: "auth.login", p_entity_type: "session" });
    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.rpc("log_audit", { p_action: "auth.logout", p_entity_type: "session" });
    await supabase.auth.signOut();
    setLookup({ kind: "pending" });
  }, []);

  const requestPasswordReset = useCallback<AuthContextValue["requestPasswordReset"]>(async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
    return { error: error && error.status === 429 ? "Too many requests. Please wait a few minutes and try again." : null };
  }, []);

  const updatePassword = useCallback<AuthContextValue["updatePassword"]>(async (password) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (!error) setRecoveryActive(false);
    return { error: error?.message ?? null };
  }, []);

  const retry = useCallback(() => { setLookup({ kind: "pending" }); setAttempt(a => a + 1); }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ state, recoveryActive, signIn, signOut, requestPasswordReset, updatePassword, retry }),
    [state, recoveryActive, signIn, signOut, requestPasswordReset, updatePassword, retry],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
