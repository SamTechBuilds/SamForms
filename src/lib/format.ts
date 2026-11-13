export function timeAgo(iso: string, now: Date = new Date()): string {
  const diffSec = Math.round((new Date(iso).getTime() - now.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [["day", 86400], ["hour", 3600], ["minute", 60]];
  for (const [unit, secs] of steps) if (Math.abs(diffSec) >= secs) return rtf.format(Math.round(diffSec / secs), unit);
  return "just now";
}

export function describeAudit(action: string, metadata: Record<string, unknown>): string {
  const title = typeof metadata.title === "string" ? `“${metadata.title}”` : "a form";
  switch (action) {
    case "form.created": return `Created ${title}`;
    case "form.deleted": return `Deleted ${title}`;
    case "form.status_changed": return `Form status changed from ${String(metadata.from)} to ${String(metadata.to)}`;
    case "auth.login": return "Signed in";
    case "auth.logout": return "Signed out";
    default: return action;
  }
}
