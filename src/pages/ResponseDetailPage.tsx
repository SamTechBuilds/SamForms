import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toaster";
import { fetchVersion, useForm } from "@/features/forms/api";
import { createFileUrl, deleteResponse, fetchResponse } from "@/features/responses/api";
import { formatAnswer } from "@/fields/answers";
import { isInputQuestion } from "@/fields/registry";
import { FormSchema } from "@/schema/form";
import { PageHeader } from "./PageHeader";

export function ResponseDetailPage() {
  const { id = "", sid = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const form = useForm(id);
  const response = useQuery({ queryKey: ["responses", "detail", sid], queryFn: () => fetchResponse(sid) });
  const version = useQuery({
    queryKey: ["responses", "version", response.data?.form_version_id],
    enabled: Boolean(response.data),
    staleTime: Infinity,
    queryFn: () => fetchVersion(response.data!.form_version_id),
  });
  const [confirming, setConfirming] = useState(false);

  if (response.isPending || version.isPending) return <Skeleton className="h-96 w-full" />;
  if (response.isError || version.isError) {
    return <p role="alert" className="text-sm text-destructive">{(response.error ?? version.error)?.message}</p>;
  }

  const r = response.data;
  const parsed = FormSchema.safeParse(version.data.schema);
  const questions = parsed.success ? parsed.data.questions.filter(isInputQuestion) : [];

  async function open(path: string) {
    try { window.open(await createFileUrl(path), "_blank", "noopener,noreferrer"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "The file could not be opened."); }
  }

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2"><Link to={`/forms/${id}/responses`}><ChevronLeft className="mr-1 h-4 w-4" />All responses</Link></Button>
      <PageHeader
        title={`Response from ${new Date(r.submitted_at).toLocaleString()}`}
        description={`${form.data?.title ?? "Form"} · version ${version.data.version}`}
        actions={<Button variant="destructive" onClick={() => setConfirming(true)}><Trash2 className="mr-2 h-4 w-4" />Delete</Button>}
      />

      <Card>
        <CardContent className="divide-y p-0">
          {questions.length === 0 && <p className="p-4 text-sm text-muted-foreground">This version has no questions to show.</p>}
          {questions.map(q => {
            const isFile = q.type === "file_upload" || q.type === "image_upload";
            const files = r.submission_files.filter(f => f.question_id === q.id);
            const text = formatAnswer(q, r.answers[q.id]);
            return (
              <section key={q.id} className="grid gap-2 p-4 sm:grid-cols-[14rem_1fr]">
                <h2 className="text-sm font-medium text-muted-foreground">{q.label}</h2>
                <div className="text-sm">
                  {isFile ? (
                    files.length === 0 ? <span className="text-muted-foreground">No files</span> : (
                      <ul className="space-y-2">
                        {files.map(f => (
                          <li key={f.id} className="flex flex-wrap items-center gap-2">
                            <span>{f.original_name}</span>
                            <span className="text-muted-foreground">({Math.max(1, Math.round(f.size_bytes / 1024))} KB, {f.mime_type})</span>
                            <Button size="sm" variant="outline" onClick={() => void open(f.storage_path)}><Download className="mr-1 h-3 w-3" />Open</Button>
                          </li>
                        ))}
                      </ul>
                    )
                  ) : text ? <span className="whitespace-pre-wrap">{text}</span> : <span className="text-muted-foreground">Not answered</span>}
                </div>
              </section>
            );
          })}
        </CardContent>
      </Card>

      <p className="mt-4 break-all text-xs text-muted-foreground">Response ID {r.id}{r.user_agent ? ` · ${r.user_agent}` : ""}</p>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Delete this response?"
        description="The answers and any uploaded files are permanently removed. This cannot be undone."
        confirmLabel="Delete response"
        destructive
        onConfirm={async () => {
          const result = await deleteResponse(r.id);
          await qc.invalidateQueries({ queryKey: ["responses"] });
          toast.success("Response deleted");
          if (result.filesRemaining > 0) toast.warning(`${result.filesRemaining} file(s) could not be removed yet and will be retried.`);
          navigate(`/forms/${id}/responses`);
        }}
      />
    </>
  );
}
