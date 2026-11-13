import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchPublicForm, submitPublicResponse, uploadSubmissionFile } from "@/features/forms/public-api";
import { FormRenderer } from "@/features/renderer/FormRenderer";
import { FileUploaderContext, type FileUploader } from "@/fields/uploader";

/** Route: /f/:slug — the respondent-facing form. Public: no sign-in, no admin chrome. */
export function PublicFormPage() {
  const { slug = "" } = useParams();
  const query = useQuery({
    queryKey: ["public-form", slug],
    queryFn: () => fetchPublicForm(slug),
    retry: false,
    staleTime: 60_000,
  });
  const uploader = useMemo<FileUploader>(() => (questionId, file) => uploadSubmissionFile(slug, questionId, file), [slug]);

  if (query.isPending) return <div className="mx-auto max-w-2xl p-8"><Skeleton className="h-[60vh] w-full" /></div>;
  if (query.isError) return <Notice title="This form can't be opened" message={query.error.message} />;
  if (!query.data) return <Notice title="Form not available" message="This form doesn't exist or is no longer accepting responses." />;

  return (
    <div className="min-h-screen">
      <FileUploaderContext.Provider value={uploader}>
        <FormRenderer form={query.data.schema} onSubmit={answers => submitPublicResponse(slug, answers)} />
      </FileUploaderContext.Provider>
    </div>
  );
}

function Notice({ title, message }: { title: string; message: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 text-center">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-3 text-muted-foreground">{message}</p>
    </main>
  );
}
