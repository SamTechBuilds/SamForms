import { supabase } from "@/lib/supabase";
import { FormSchema, type FormDefinition } from "@/schema/form";
import { SubmissionRejected } from "@/features/renderer/errors";
import type { UploadedFile } from "@/fields/uploader";

// Public (respondent-facing) operations. These run as the anon role, so every call goes through a
// narrow SECURITY DEFINER function in migration 0003. No direct table access exists for anon.

export interface PublicForm { slug: string; title: string; schema: FormDefinition }

/** The published form for a slug, or null when it does not exist or is not published. */
export async function fetchPublicForm(slug: string): Promise<PublicForm | null> {
  const { data, error } = await supabase.rpc("get_public_form", { p_slug: slug });
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as { slug: string; title: string; schema: unknown };
  const parsed = FormSchema.safeParse(row.schema);
  if (!parsed.success) throw new Error("This form is not available right now.");
  return { slug: row.slug, title: row.title, schema: parsed.data };
}

/** Sends visible answers. The server re-validates everything; a rejection carries per-question messages. */
export async function submitPublicResponse(slug: string, answers: Record<string, unknown>): Promise<void> {
  const ua = typeof navigator === "undefined" ? null : navigator.userAgent.slice(0, 300);
  const { data, error } = await supabase.rpc("submit_response", { p_slug: slug, p_answers: answers, p_user_agent: ua });
  if (error) throw new Error(error.message);
  const r = data as { ok: boolean; errors?: Record<string, string> };
  if (!r.ok) throw new SubmissionRejected(r.errors ?? {});
}

/** Reserves an upload slot on the server, then streams the file into the private bucket. */
export async function uploadSubmissionFile(slug: string, questionId: string, file: File): Promise<UploadedFile> {
  const mimeType = file.type || "application/octet-stream";
  const { data, error } = await supabase.rpc("request_upload", {
    p_slug: slug, p_question_id: questionId, p_name: file.name, p_mime: mimeType, p_size: file.size,
  });
  if (error) throw new Error(error.message);
  const slot = data as { upload_id: string; path: string };
  const { error: storageError } = await supabase.storage.from("submissions").upload(slot.path, file, {
    contentType: mimeType, upsert: false,
  });
  if (storageError) throw new Error("The file could not be uploaded. Please try again.");
  return { id: slot.upload_id, name: file.name, size: file.size, mimeType };
}
