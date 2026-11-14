// Pure logic for send-notifications. Emails never include answers: only the form name, the time and a link.

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function buildNotificationEmail(input: { formTitle: string; submittedAt: string; responsesUrl: string }) {
  const title = input.formTitle.replace(/[\r\n]+/g, " ").slice(0, 150);
  const when = new Date(input.submittedAt).toUTCString();
  const text = `A new response was submitted to "${title}" at ${when}.\n\nView it here: ${input.responsesUrl}\n`;
  const html = `<p>A new response was submitted to <strong>${escapeHtml(title)}</strong> at ${escapeHtml(when)}.</p>` +
    `<p><a href="${escapeHtml(input.responsesUrl)}">View the response</a></p>`;
  return { subject: `New response: ${title}`, text, html };
}

/** Constant-time string comparison for shared secrets. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
