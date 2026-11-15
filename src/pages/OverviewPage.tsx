import { Link } from "react-router-dom";
import { AlertCircle, ClipboardList, FileText, Inbox, PlusCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useForms, useFormStats, useRecentFormActivity } from "@/features/forms/api";
import { useSubmissionOverview } from "@/features/responses/api";
import { describeAudit, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageHeader } from "./PageHeader";

function Kpi({ label, value, loading, icon: Icon, tone }: { label: string; value: number | string; loading?: boolean; icon: typeof FileText; tone: string }) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
          {loading ? <Skeleton className="mt-2 h-9 w-20" /> : <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>}
        </div>
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", tone)} aria-hidden="true"><Icon className="h-5 w-5" /></span>
      </CardContent>
    </Card>
  );
}

const DAY = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

/** Vertical bars for the daily response series. Plain elements, so it needs no charting library. */
function ResponseBars({ data }: { data: { date: string; count: number }[] }) {
  const max = Math.max(1, ...data.map(d => d.count));
  const total = data.reduce((n, d) => n + d.count, 0);
  return (
    <div>
      <div role="img" aria-label={`${total} responses over the last ${data.length} days`} className="flex h-48 items-end gap-1.5">
        {data.map(d => (
          <div key={d.date} className="flex h-full flex-1 flex-col justify-end" title={`${DAY.format(new Date(`${d.date}T00:00:00`))}: ${d.count}`}>
            <div className="rounded-t-md bg-primary/80 transition-all" style={{ height: `${Math.max(d.count ? 6 : 2, (d.count / max) * 100)}%`, opacity: d.count ? 1 : 0.25 }} />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
        <span>{DAY.format(new Date(`${data[0]?.date ?? "2000-01-01"}T00:00:00`))}</span>
        <span>{DAY.format(new Date(`${data[data.length - 1]?.date ?? "2000-01-01"}T00:00:00`))}</span>
      </div>
    </div>
  );
}

const STATUS_STYLE = [
  { key: "published", label: "Published", bar: "bg-emerald-500" },
  { key: "draft", label: "Drafts", bar: "bg-primary" },
  { key: "archived", label: "Archived", bar: "bg-muted-foreground/40" },
] as const;

export function OverviewPage() {
  const stats = useFormStats();
  const forms = useForms();
  const overview = useSubmissionOverview(14);
  const activity = useRecentFormActivity();
  const titles = new Map((forms.data ?? []).map(f => [f.id, f.title]));
  const counts = { published: stats.data?.published ?? 0, draft: stats.data?.draft ?? 0, archived: Math.max(0, (stats.data?.total ?? 0) - (stats.data?.published ?? 0) - (stats.data?.draft ?? 0)) };
  const totalForms = stats.data?.total ?? 0;

  return (
    <>
      <PageHeader title="Dashboard" description="Your forms and responses at a glance."
        actions={<Button asChild><Link to="/forms/new"><PlusCircle className="h-4 w-4" aria-hidden="true" /> New form</Link></Button>} />

      {(stats.isError || overview.isError) && (
        <div role="alert" className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          <span className="flex items-center gap-2"><AlertCircle className="h-4 w-4" aria-hidden="true" /> Some dashboard data couldn’t be loaded.</span>
          <Button size="sm" variant="outline" onClick={() => { void stats.refetch(); void overview.refetch(); }}>Retry</Button>
        </div>
      )}

      <section aria-label="Key figures" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Total forms" value={stats.data?.total ?? "—"} loading={stats.isPending} icon={FileText} tone="bg-primary/10 text-primary" />
        <Kpi label="Published" value={stats.data?.published ?? "—"} loading={stats.isPending} icon={Send} tone="bg-emerald-500/10 text-emerald-600" />
        <Kpi label="Drafts" value={stats.data?.draft ?? "—"} loading={stats.isPending} icon={ClipboardList} tone="bg-amber-500/10 text-amber-600" />
        <Kpi label="Responses" value={overview.data?.total ?? "—"} loading={overview.isPending} icon={Inbox} tone="bg-sky-500/10 text-sky-600" />
      </section>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle>Responses</CardTitle>
              <CardDescription>Per day, last 14 days</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {overview.isPending && <Skeleton className="h-48 w-full" />}
            {overview.isSuccess && <ResponseBars data={overview.data.daily} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Forms by status</CardTitle>
            <CardDescription>{totalForms} in total</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {stats.isPending && <Skeleton className="h-24 w-full" />}
            {stats.isSuccess && totalForms === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No forms yet.</p>}
            {stats.isSuccess && totalForms > 0 && (
              <>
                <div role="img" aria-label={`Published ${counts.published}, drafts ${counts.draft}, archived ${counts.archived}`} className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
                  {STATUS_STYLE.map(s => <div key={s.key} className={s.bar} style={{ width: `${(counts[s.key] / totalForms) * 100}%` }} />)}
                </div>
                <ul className="space-y-2.5 text-sm">
                  {STATUS_STYLE.map(s => (
                    <li key={s.key} className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2"><span className={cn("h-2.5 w-2.5 rounded-full", s.bar)} aria-hidden="true" />{s.label}</span>
                      <span className="tabular-nums text-muted-foreground">{counts[s.key]} · {Math.round((counts[s.key] / totalForms) * 100)}%</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader><CardTitle>Recent responses</CardTitle></CardHeader>
          <CardContent>
            {overview.isPending && <div className="space-y-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-9 w-full" />)}</div>}
            {overview.isSuccess && overview.data.recent.length === 0 && (
              <p className="py-10 text-center text-sm text-muted-foreground">No responses yet. They will appear here once people start filling in your forms.</p>
            )}
            {overview.isSuccess && overview.data.recent.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th scope="col" className="py-2 pr-4 font-medium">Form</th>
                      <th scope="col" className="py-2 pr-4 font-medium">Answers</th>
                      <th scope="col" className="py-2 font-medium">Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.data.recent.map(r => (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="py-3 pr-4">
                          <Link to={`/forms/${r.form_id}/responses`} className="font-medium hover:underline">{titles.get(r.form_id) ?? "Untitled form"}</Link>
                        </td>
                        <td className="py-3 pr-4 tabular-nums">{r.answered}</td>
                        <td className="py-3"><time dateTime={r.submitted_at} className="text-muted-foreground">{timeAgo(r.submitted_at)}</time></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Recent activity</CardTitle></CardHeader>
          <CardContent>
            {activity.isPending && <div className="space-y-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-5 w-full" />)}</div>}
            {activity.isError && (
              <div role="alert" className="text-sm text-destructive">
                Couldn’t load activity: {activity.error.message}{" "}
                <button className="underline" onClick={() => void activity.refetch()}>Retry</button>
              </div>
            )}
            {activity.isSuccess && activity.data.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No form activity yet.</p>}
            {activity.isSuccess && activity.data.length > 0 && (
              <ul className="divide-y">
                {activity.data.map(a => (
                  <li key={a.id} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                    <span>{describeAudit(a.action, a.metadata)}</span>
                    <time dateTime={a.created_at} className="shrink-0 text-xs text-muted-foreground">{timeAgo(a.created_at)}</time>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
