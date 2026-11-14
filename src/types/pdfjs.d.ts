// Minimal typings for the subset of pdf.js used by features/ai/extract.ts.
declare module "pdfjs-dist/build/pdf.mjs" {
  export const GlobalWorkerOptions: { workerSrc: string };
  interface TextItem { str: string }
  interface PdfPage { getTextContent(): Promise<{ items: (TextItem | { type: string })[] }> }
  interface PdfDocument { numPages: number; getPage(n: number): Promise<PdfPage>; destroy(): Promise<void> }
  export function getDocument(opts: { data: Uint8Array; isEvalSupported?: boolean }): { promise: Promise<PdfDocument> };
}
