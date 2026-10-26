// pdfjs-dist 3.x ships its legacy (CommonJS) build without type declarations for these paths.
declare module "pdfjs-dist/legacy/build/pdf.js" {
  export interface PdfTextContentItem {
    str: string;
    transform: number[];
    width: number;
  }
  export interface PdfPage {
    getTextContent(): Promise<{ items: (PdfTextContentItem | { type: string })[] }>;
    cleanup(): void;
  }
  export interface PdfDocument {
    numPages: number;
    getPage(n: number): Promise<PdfPage>;
    destroy(): Promise<void>;
  }
  export function getDocument(params: Record<string, unknown>): { promise: Promise<PdfDocument>; destroy(): Promise<void> };
}

declare module "pdfjs-dist/legacy/build/pdf.worker.js" {
  export const WorkerMessageHandler: unknown;
}

declare module "@ungap/structured-clone" {
  const structuredClone: (value: unknown, options?: unknown) => unknown;
  export default structuredClone;
}
