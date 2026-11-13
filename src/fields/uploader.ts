import { createContext } from "react";

/** A file the server has accepted for this respondent (reference only; bytes live in private storage). */
export interface UploadedFile { id: string; name: string; size: number; mimeType: string }

/** Uploads one file for one question. Provided by the public form page; absent in the builder preview. */
export type FileUploader = (questionId: string, file: File) => Promise<UploadedFile>;

export const FileUploaderContext = createContext<FileUploader | null>(null);
