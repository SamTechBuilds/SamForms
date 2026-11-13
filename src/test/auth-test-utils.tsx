import type { ReactNode } from "react";
import { AuthContext, type AuthContextValue, type AuthState } from "@/features/auth/auth-context";

export function authValue(state: AuthState, overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    state, recoveryActive: false,
    signIn: async () => ({ error: null }), signOut: async () => {},
    requestPasswordReset: async () => ({ error: null }), updatePassword: async () => ({ error: null }),
    retry: () => {}, ...overrides,
  };
}
export function WithAuth({ value, children }: { value: AuthContextValue; children: ReactNode }) {
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
