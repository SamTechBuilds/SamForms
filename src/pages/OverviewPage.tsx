import { Link } from "react-router-dom";
import { AlertCircle, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useFormStats, useRecentFormActivity } from "@/features/forms/api";
import { describeAudit, timeAgo } from "@/lib/format";
import { PageHeader } from "./PageHeader";

function Stat({ label, value, loading, note }: { label: string; value: number | string; loading?: boolean; note?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardDescription>{label}</CardDescription></CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-8 w-16" /> : <p className="text-3xl font-semibold">{value}</p>}
        {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
      </CardContent>
    </Card>
  );
}

export function OverviewPage() {
  const stats = useFormStats();
  const activity = useRecentFormActivity();

  return (
    <>
      <PageHeader title="Overview" description="Your forms at a glance."
        actions={
          <Button asChild>
            <Link to="/forms/new"><PlusCircle className="h-4 w-4" aria-hidden="true" /> Create form</Link>
          </Button>
        } />

      {stats.isError && (
        <div role="alert" className="mb-4 flex items-center justify-between rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          <span className="flex items-center gap-2"><AlertCircle className="h-4 w-4" aria-hidden="true" /> Couldn’t load stats: {stats.error.message}</span>
          <Button size="sm" variant="outline" onClick={() => void stats.refetch()}>Retry</Button>
        </div>
      )}

      <section aria-label="Statistics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Total forms" value={stats.data?.total ?? "—"} loading={stats.isPending} />
        <Stat label="Published" value={stats.data?.published ?? "—"} loading={stats.isPending} />
        <Stat label="Drafts" value={stats.data?.draft ?? "—"} loading={stats.isPending} />
        <Stat label="Total submissions" value="—" note="Available once public forms ship (Phase 3)" />
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Recent submissions</CardTitle></CardHeader>
          <CardContent><p className="py-8 text-center text-sm text-muted-foreground">No submissions yet. Submissions are collected from Phase 3 onward.</p></CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Recent form activity</CardTitle></CardHeader>
          <CardContent>
            {activity.isPending && <div className="space-y-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-5 w-full" />)}</div>}
            {activity.isError && (
              <div role="alert" className="text-sm text-destructive">
                Couldn’t load activity: {activity.error.message}{" "}
                <button className="underline" onClick={() => void activity.refetch()}>Retry</button>
              </div>
            )}
            {activity.isSuccess && activity.data.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">No form activity yet.</p>
            )}
            {activity.isSuccess && activity.data.length > 0 && (
              <ul className="divide-y">
                {activity.data.map(a => (
                  <li key={a.id} className="flex items-center justify-between gap-4 py-2 text-sm">
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
