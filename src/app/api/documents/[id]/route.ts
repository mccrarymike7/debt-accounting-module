import { NextResponse } from "next/server";
import { auth, canWrite } from "@/auth";
import { prisma } from "@/lib/db";
import {
  analyzeAgreementDocument,
  approveAgreementDocument,
  rejectAgreementDocument,
  saveReviewedTerms,
} from "@/lib/agreement-documents";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const document = await prisma.agreementDocument.findUnique({
    where: { id },
    include: {
      debtInstrument: { select: { id: true, instrumentNumber: true, name: true } },
      covenantDefinition: { select: { id: true, name: true, metricKey: true } },
    },
  });
  if (!document) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ document });
}

export async function POST(request: Request, ctx: Ctx) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canWrite(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const body = await request.json();
  const action = body.action as string;

  try {
    if (action === "analyze") {
      const document = await analyzeAgreementDocument(id);
      return NextResponse.json({ ok: true, document });
    }
    if (action === "save_review") {
      const document = await saveReviewedTerms(id, body.terms, session.user.id);
      return NextResponse.json({ ok: true, document });
    }
    if (action === "approve") {
      if (body.terms) {
        await saveReviewedTerms(id, body.terms, session.user.id);
      }
      const document = await approveAgreementDocument(id, session.user.id);
      return NextResponse.json({ ok: true, document });
    }
    if (action === "reject") {
      const document = await rejectAgreementDocument(id, session.user.id);
      return NextResponse.json({ ok: true, document });
    }
    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Request failed" },
      { status: 400 },
    );
  }
}
