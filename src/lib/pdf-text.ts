import { PDFParse } from "pdf-parse";

const MAX_CHARS = 120_000;

/**
 * Extract plain text from a PDF buffer for term analysis.
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    const text = (result.text ?? "").replace(/\u0000/g, " ").trim();
    if (!text) {
      throw new Error("No extractable text found in PDF (scanned images need OCR).");
    }
    return text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}\n…[truncated]` : text;
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}
