import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertCircle } from "lucide-react";
import { FormSchema, type FormDefinition } from "@/schema/form";
import type { FormRow } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useForm } from "@/features/forms/api";
import { BuilderWorkspace } from "@/features/builder/BuilderWorkspace";

/** Route: /forms/:id/edit */
export function BuilderPage() {
  const { id = "" } = useParams();
  const detail = useForm(id);
  if (detail.isPending) return <div className="space-y-4" aria-busy="true"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-[60vh] w-full" /></div>;
  if (detail.isError) return <ErrorCard message={detail.error.message} />;
  return <Editor key={detail.data.id} row={detail.data} />;
}

function Editor({ row }: { row: FormRow }) {
  // Parse the stored draft once per mounted editor; later refetches must not reset in-progress edits.
  const [initial] = useState<FormDefinition | null>(() => {
    const r = FormSchema.safeParse(row.draft_schema);
    return r.success ? r.data : null;
  });
  if (!initial) return <ErrorCard message="This draft is stored in a format the builder can't read. It was not changed." />;
  return <BuilderWorkspace row={row} initial={initial} />;
}

function ErrorCard({ message }: { message: string }) {
  return (
    <Card role="alert"><CardContent className="flex flex-col items-center gap-3 p-10 text-center">
      <AlertCircle className="h-6 w-6 text-destructive" aria-hidden="true" />
      <p className="text-sm text-destructive">{message}</p>
      <Button asChild variant="outline" size="sm"><Link to="/forms">Back to My forms</Link></Button>
    </CardContent></Card>
  );
}

export { ErrorCard };
