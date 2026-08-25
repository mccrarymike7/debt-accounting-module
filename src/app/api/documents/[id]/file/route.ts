import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { readAgreementFile } from "@/lib/agreement-documents";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  try {
    const { doc, buffer } = await readAgreementFile(id);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": doc.mimeType || "application/pdf",
        "Content-Disposition": `inline; filename="${doc.originalFileName.replace(/"/g, "")}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
