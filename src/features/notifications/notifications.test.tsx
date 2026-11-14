// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { validateNotificationInput } from "./api";

const upsert = vi.fn<(row: unknown, opts: unknown) => Promise<{ error: null }>>(async () => ({ error: null }));
const maybeSingle = vi.fn(async () => ({ data: { form_id: "f1", enabled: false, recipient: null }, error: null }));
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle }) }),
      upsert: (row: unknown, opts: unknown) => upsert(row, opts),
    }),
  },
}));

const { NotificationSettingsCard } = await import("./NotificationSettingsCard");

describe("validateNotificationInput", () => {
  it("allows switched-off settings without a recipient", () => {
    expect(validateNotificationInput({ enabled: false, recipient: "" })).toBeNull();
  });
  it("requires a recipient when notifications are on", () => {
    expect(validateNotificationInput({ enabled: true, recipient: "  " })).toMatch(/Enter an email address/);
  });
  it("rejects malformed and overlong addresses", () => {
    expect(validateNotificationInput({ enabled: false, recipient: "not-an-email" })).toMatch(/valid email/);
    expect(validateNotificationInput({ enabled: false, recipient: `${"a".repeat(250)}@b.co` })).toMatch(/too long/);
  });
  it("accepts a normal address", () => {
    expect(validateNotificationInput({ enabled: true, recipient: "owner@example.com" })).toBeNull();
  });
});

describe("NotificationSettingsCard", () => {
  it("saves the switch state and the trimmed recipient for this form", async () => {
    upsert.mockClear();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <NotificationSettingsCard formId="f1" defaultRecipient="admin@example.com" />
      </QueryClientProvider>,
    );
    const toggle = await screen.findByRole("switch", { name: /email me when a response arrives/i });
    await userEvent.click(toggle);
    await userEvent.click(screen.getByRole("button", { name: /save notification settings/i }));
    await waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
    expect(upsert.mock.calls[0]![0]).toEqual({ form_id: "f1", enabled: true, recipient: "admin@example.com" });
    expect(upsert.mock.calls[0]![1]).toEqual({ onConflict: "form_id" });
  });

  it("shows a validation message and does not save an invalid recipient", async () => {
    upsert.mockClear();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <NotificationSettingsCard formId="f1" defaultRecipient="" />
      </QueryClientProvider>,
    );
    await userEvent.click(await screen.findByRole("switch", { name: /email me when a response arrives/i }));
    await userEvent.click(screen.getByRole("button", { name: /save notification settings/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Enter an email address/);
    expect(upsert).not.toHaveBeenCalled();
  });
});
