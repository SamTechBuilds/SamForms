import { Link, useParams } from "react-router-dom";
import { FormSchema } from "@/schema/form";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useForm } from "@/features/forms/api";
import { FormRenderer } from "@/features/renderer/FormRenderer";
import { ErrorCard } from "./BuilderPage";

/** Route: /forms/:id/preview — full-screen preview of the saved draft. Nothing is submitted. */
export function PreviewPage() {
  const { id = "" } = useParams();
  const detail = useForm(id);
  if (detail.isPending) return <Skeleton className="h-[60vh] w-full" />;
  if (detail.isError) return <ErrorCard message={detail.error.message} />;
  const parsed = FormSchema.safeParse(detail.data.draft_schema);
  if (!parsed.success) return <ErrorCard message="This draft can't be previewed because it is not valid. Open the editor to see the issues." />;
  return (
    <div className="-m-4 min-h-[calc(100vh-3.5rem)] md:-m-8">
      <div className="flex items-center justify-between border-b bg-card px-4 py-2">
        <span className="text-sm text-muted-foreground">Preview · nothing is submitted</span>
        <Button asChild variant="outline" size="sm"><Link to={`/forms/${id}/edit`}>Back to editor</Link></Button>
      </div>
      <FormRenderer form={parsed.data} previewNotice="Preview only" />
    </div>
  );
}
