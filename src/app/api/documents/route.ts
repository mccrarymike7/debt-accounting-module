import { NextResponse } from "next/server";
import { auth, canWrite } from "@/auth";
import { prisma } from "@/lib/db";
import {
  analyzeAgreementDocument,
  createAgreementUpload,
} from "@/lib/agreement-documents";
import type { AgreementDocumentKind } from "@/generated/prisma/client";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const kind = searchParams.get("kind") as AgreementDocumentKind | null;
  const status = searchParams.get("status");

  const documents = await prisma.agreementDocument.findMany({
    where: {
      ...(kind ? { kind } : {}),
      ...(status ? { status: status as never } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      debtInstrument: { select: { id: true, instrumentNumber: true, name: true } },
      covenantDefinition: { select: { id: true, name: true, metricKey: true } },
    },
  });

  return NextResponse.json({ documents });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canWrite(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const form = await request.formData();
    const file = form.get("file");
    const kind = String(form.get("kind") || "") as AgreementDocumentKind;
    const title = String(form.get("title") || "");
    const entityId = form.get("entityId") ? String(form.get("entityId")) : null;
    const analyzeNow = String(form.get("analyze") || "true") !== "false";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "PDF file is required" }, { status: 400 });
    }
    if (kind !== "DEBT_AGREEMENT" && kind !== "COVENANT_AGREEMENT") {
      return NextResponse.json({ error: "Invalid document kind" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length > 25 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 25MB)" }, { status: 400 });
    }

    let doc = await createAgreementUpload({
      kind,
      title: title || file.name,
      originalFileName: file.name,
      mimeType: file.type || "application/pdf",
      buffer,
      entityId,
      uploadedById: session.user.id,
    });

    if (analyzeNow) {
      doc = await analyzeAgreementDocument(doc.id);
    }

    return NextResponse.json({ ok: true, document: doc });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Upload failed" },
      { status: 400 },
    );
  }
}
