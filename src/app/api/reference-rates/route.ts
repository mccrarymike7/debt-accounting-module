import { NextResponse } from "next/server";
import { auth, canWrite } from "@/auth";
import { prisma } from "@/lib/db";
import { jsonResponse } from "@/lib/json";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rates = await prisma.referenceRate.findMany({
    orderBy: [{ indexFamily: "asc" }, { tenorLabel: "asc" }],
    include: { _count: { select: { rateTerms: true } } },
  });
  return jsonResponse({ rates });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canWrite(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const action = body.action as string;

  try {
    if (action === "upsert") {
      const code = String(body.code ?? "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "_");
      if (!code) throw new Error("Code is required");
      const decimalPlaces = Math.max(0, Math.min(8, Number(body.decimalPlaces ?? 2)));
      const rate = await prisma.referenceRate.upsert({
        where: { code },
        create: {
          code,
          name: body.name,
          indexFamily: body.indexFamily || "SOFR",
          tenorLabel: body.tenorLabel || "3M",
          sourceName: body.sourceName,
          sourceUrl: body.sourceUrl,
          decimalPlaces,
          notes: body.notes ?? null,
          active: body.active ?? true,
        },
        update: {
          name: body.name,
          indexFamily: body.indexFamily || "SOFR",
          tenorLabel: body.tenorLabel || "3M",
          sourceName: body.sourceName,
          sourceUrl: body.sourceUrl,
          decimalPlaces,
          notes: body.notes ?? null,
          active: body.active ?? true,
        },
        include: { _count: { select: { rateTerms: true } } },
      });
      return jsonResponse({ ok: true, rate });
    }
    if (action === "delete") {
      const linked = await prisma.rateTerm.count({ where: { referenceRateId: body.id } });
      if (linked > 0) {
        throw new Error("Cannot delete a reference rate that is assigned to instruments");
      }
      await prisma.referenceRate.delete({ where: { id: body.id } });
      return jsonResponse({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Action failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
