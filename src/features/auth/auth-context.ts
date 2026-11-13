import { createContext, useContext } from "react";
import type { AdminUserRow } from "@/lib/database.types";

export type AuthState =
  | { status: "loading" }
  | { status: "signed_out" }
  | { status: "unauthorized"; email: string | undefined }
  | { status: "error"; message: string }
  | { status: "authorized"; admin: AdminUserRow };

export interface AuthContextValue {
  state: AuthState;
  /** True after a PASSWORD_RECOVERY link was opened in this browser session. */
  recoveryActive: boolean;
  signIn(email: string, password: string): Promise<{ error: string | null }>;
  signOut(): Promise<void>;
  requestPasswordReset(email: string): Promise<{ error: string | null }>;
  updatePassword(password: string): Promise<{ error: string | null }>;
  retry(): void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
