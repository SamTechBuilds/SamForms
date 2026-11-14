import { test, expect, type Route } from "@playwright/test";

const SUPABASE = "https://example.supabase.co/rest/v1/rpc";

const schema = {
  schemaVersion: 1,
  title: "Contact us",
  layout: "classic",
  sections: [{ id: "s1", title: "Contact" }],
  questions: [
    { id: "name", type: "short_text", sectionId: "s1", label: "Full name", required: true },
    { id: "email", type: "email", sectionId: "s1", label: "Email address", required: true },
  ],
};

async function mockRpc(route: Route, body: unknown) {
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
}

test.describe("public form", () => {
  test("respondent fills and submits a published form", async ({ page }) => {
    const submitted: unknown[] = [];
    await page.route(`${SUPABASE}/get_public_form`, route =>
      mockRpc(route, { slug: "contact", title: "Contact us", schema }));
    await page.route(`${SUPABASE}/submit_response`, async route => {
      submitted.push(route.request().postDataJSON());
      await mockRpc(route, { ok: true });
    });

    await page.goto("/f/contact");
    await expect(page.getByRole("heading", { name: "Contact us" })).toBeVisible();
    await page.getByLabel(/full name/i).fill("Ada Lovelace");
    await page.getByLabel(/email address/i).fill("ada@example.com");
    await page.getByRole("button", { name: /submit/i }).click();

    await expect(page.getByText("Thank you!")).toBeVisible();
    expect(submitted).toHaveLength(1);
    expect(JSON.stringify(submitted[0])).toContain("ada@example.com");
  });

  test("unknown slug shows a not-found message", async ({ page }) => {
    await page.route(`${SUPABASE}/get_public_form`, route => mockRpc(route, null));
    await page.goto("/f/missing");
    await expect(page.getByText(/not available|not found|no longer/i).first()).toBeVisible();
  });
});
