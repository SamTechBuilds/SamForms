import { describe, it, expect } from "vitest";
import { PasswordPolicy } from "./ResetPasswordPage";

describe("PasswordPolicy (mirrors supabase/config.toml)", () => {
  it("accepts strong passwords", () => expect(PasswordPolicy.safeParse("Abcdefghij12").success).toBe(true));
  it.each(["short1A", "alllowercase123", "ALLUPPERCASE123", "NoDigitsHereAtAll"])("rejects %s", (p) =>
    expect(PasswordPolicy.safeParse(p).success).toBe(false));
});
