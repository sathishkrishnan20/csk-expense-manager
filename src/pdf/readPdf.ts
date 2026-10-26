import "./polyfills";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.js";
import { WorkerMessageHandler } from "pdfjs-dist/legacy/build/pdf.worker.js";
import type { PdfTextItem } from "../domain/pdfStatement";
import { PdfPasswordError } from "./errors";

export { PdfPasswordError };

// No real Worker in React Native: run pdf.js's worker code on the main thread.
(globalThis as Record<string, unknown>).pdfjsWorker = { WorkerMessageHandler };

// pdf.js error codes for password failures (PasswordResponses): 1 = needed, 2 = incorrect.
const isPasswordError = (e: unknown): e is { code: number } =>
  typeof e === "object" && e !== null && (e as { name?: string }).name === "PasswordException";

async function open(bytes: Uint8Array, password: string | undefined) {
  return pdfjs.getDocument({
    data: bytes.slice(), // pdf.js takes ownership of the buffer
    password,
    isEvalSupported: false, // never run code from a PDF
    useSystemFonts: false,
    disableFontFace: true,
    verbosity: 0,
  }).promise;
}

// Reads every page's text with positions. Tries no password first (an unlocked PDF), then each saved one.
export async function readPdfPages(bytes: Uint8Array, passwords: string[]): Promise<PdfTextItem[][]> {
  let doc: Awaited<ReturnType<typeof open>> | null = null;
  for (const password of [undefined, ...passwords]) {
    try {
      doc = await open(bytes, password);
      break;
    } catch (err) {
      if (!isPasswordError(err)) throw err;
    }
  }
  if (!doc) throw new PdfPasswordError(passwords.length > 0 ? "wrong" : "needed");

  try {
    const pages: PdfTextItem[][] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      pages.push(
        content.items
          .filter((i): i is { str: string; transform: number[]; width: number } => "str" in i && i.str.trim() !== "")
          .map((i) => ({ text: i.str, x: i.transform[4], y: i.transform[5], width: i.width })),
      );
      page.cleanup();
    }
    return pages;
  } finally {
    await doc.destroy();
  }
}
