// Kept apart from readPdf.ts so screens can recognise the error without loading the PDF reader.

// kind "needed": the PDF is locked and no saved password was given. "wrong": none of them opened it.
export class PdfPasswordError extends Error {
  constructor(readonly kind: "needed" | "wrong") {
    super(
      kind === "needed"
        ? "This PDF is password protected. Add its password under Config > Statement passwords, then try again."
        : "None of your saved statement passwords opened this PDF. Check them under Config > Statement passwords.",
    );
  }
}
