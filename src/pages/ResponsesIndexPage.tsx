import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useForms } from "@/features/forms/api";
import { PageHeader } from "./PageHeader";

/** Top-level Responses: pick a form. Only forms that have been published can receive responses. */
export function ResponsesIndexPage() {
  const forms = useForms();
  if (forms.isPending) return <Skeleton className="h-64 w-full" />;
  if (forms.isError) return <p role="alert" className="text-sm text-destructive">{forms.error.message}</p>;
  const published = forms.data.filter(f => f.published_version_id);
  return (
    <>
      <PageHeader title="Responses" description="Choose a form to see its responses, statistics and exports." />
      {published.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          No form has been published yet. <Link className="underline" to="/forms">Go to My Forms</Link> to publish one.
        </CardContent></Card>
      ) : (
        <ul className="divide-y rounded-md border">
          {published.map(f => (
            <li key={f.id} className="flex items-center justify-between gap-4 p-4">
              <div>
                <p className="font-medium">{f.title}</p>
                <p className="text-sm text-muted-foreground">/f/{f.slug} · {f.status}</p>
              </div>
              <Button asChild variant="outline" size="sm"><Link to={`/forms/${f.id}/responses`}>View responses</Link></Button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
