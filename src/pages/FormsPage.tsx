import { useState } from "react";
import { AlertCircle, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useForms } from "@/features/forms/api";
import type { FormStatus } from "@/lib/database.types";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/format";
import { PageHeader } from "./PageHeader";

const FILTERS: { value: "all" | FormStatus; label: string }[] = [
  { value: "all", label: "All" }, { value: "draft", label: "Drafts" },
  { value: "published", label: "Published" }, { value: "archived", label: "Archived" },
];
const STATUS_BADGE = { draft: "secondary", published: "success", archived: "outline" } as const;

export function FormsPage() {
  const forms = useForms();
  const [filter, setFilter] = useState<"all" | FormStatus>("all");
  const rows = (forms.data ?? []).filter(f => filter === "all" || f.status === filter);

  return (
    <>
      <PageHeader title="My Forms" description="All forms you own."
        actions={<Button disabled title="The form builder arrives in Phase 2">New form <Badge variant="warning" className="ml-1">Phase 2</Badge></Button>} />

      <div role="tablist" aria-label="Filter forms by status" className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map(f => (
          <button key={f.value} role="tab" aria-selected={filter === f.value} onClick={() => setFilter(f.value)}
            className={cn("rounded-full border px-3 py-1 text-sm", filter === f.value ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent")}>
            {f.label}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {forms.isPending && <div className="space-y-3 p-6" aria-busy="true">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>}

          {forms.isError && (
            <div role="alert" className="flex flex-col items-center gap-3 p-10 text-center">
              <AlertCircle className="h-6 w-6 text-destructive" aria-hidden="true" />
              <p className="text-sm text-destructive">Couldn’t load your forms: {forms.error.message}</p>
              <Button variant="outline" size="sm" onClick={() => void forms.refetch()}>Try again</Button>
            </div>
          )}

          {forms.isSuccess && rows.length === 0 && (
            <div className="flex flex-col items-center gap-3 p-12 text-center">
              <FileText className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <p className="font-medium">{filter === "all" ? "No forms yet" : `No ${filter} forms`}</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                {filter === "all" ? "Forms you create will appear here. Creating forms becomes available with the builder in Phase 2." : "Try a different filter."}
              </p>
            </div>
          )}

          {forms.isSuccess && rows.length > 0 && (
            <ul className="divide-y">
              {rows.map(f => (
                <li key={f.id} className="flex items-center justify-between gap-4 px-6 py-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{f.title}</p>
                    <p className="truncate text-xs text-muted-foreground">/{f.slug}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Badge variant={STATUS_BADGE[f.status]}>{f.status}</Badge>
                    <time dateTime={f.updated_at} className="hidden text-xs text-muted-foreground sm:block">Updated {timeAgo(f.updated_at)}</time>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
