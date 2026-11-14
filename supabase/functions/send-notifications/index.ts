// Edge Function: sends queued "new response" emails. Call it on a schedule (see docs/DEPLOY.md).
// Secrets: NOTIFY_CRON_SECRET (shared with the scheduler), EMAIL_PROVIDER_API_KEY, NOTIFY_FROM, NOTIFY_APP_URL.
// The service-role key is provided by the platform and used only here, for the queue functions.
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildNotificationEmail, safeEqual } from "../_shared/notify.ts";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async req => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed." });
  const secret = Deno.env.get("NOTIFY_CRON_SECRET");
  const given = req.headers.get("x-cron-secret") ?? "";
  if (!secret || !safeEqual(given, secret)) return json(401, { error: "Unauthorised." });

  const emailKey = Deno.env.get("EMAIL_PROVIDER_API_KEY");
  const from = Deno.env.get("NOTIFY_FROM");
  const appUrl = Deno.env.get("NOTIFY_APP_URL");
  if (!emailKey || !from || !appUrl) return json(500, { error: "Email sending is not configured." });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: items, error } = await admin.rpc("claim_notifications", { p_limit: 20 });
  if (error) return json(500, { error: "Could not read the notification queue." });

  let sent = 0;
  for (const item of (items ?? []) as { id: number; recipient: string; form_title: string; form_id: string; submitted_at: string }[]) {
    const email = buildNotificationEmail({
      formTitle: item.form_title,
      submittedAt: item.submitted_at,
      responsesUrl: `${appUrl.replace(/\/$/, "")}/forms/${item.form_id}/responses`,
    });
    let ok = false;
    let reason: string | null = null;
    try {
      // Resend-compatible API. To use another provider, change this request only.
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${emailKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: item.recipient, subject: email.subject, text: email.text, html: email.html }),
      });
      ok = res.ok;
      if (!ok) reason = `Provider responded ${res.status}`;
    } catch {
      reason = "Network error contacting the email provider";
    }
    await admin.rpc("complete_notification", { p_id: item.id, p_ok: ok, p_error: reason });
    if (ok) sent++;
  }
  return json(200, { processed: (items ?? []).length, sent });
});
