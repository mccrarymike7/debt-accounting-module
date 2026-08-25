import { NextResponse } from "next/server";
import { auth, canAdmin, canWrite } from "@/auth";
import { prisma } from "@/lib/db";
import { TRANSACTION_TYPES } from "@/lib/gl-mapping";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [accounts, mappings] = await Promise.all([
    prisma.glAccount.findMany({ orderBy: { code: "asc" } }),
    prisma.glAccountMapping.findMany({
      include: { debitAccount: true, creditAccount: true },
      orderBy: [{ transactionType: "asc" }, { entityKey: "asc" }],
    }),
  ]);

  return NextResponse.json({
    accounts,
    mappings,
    transactionTypes: TRANSACTION_TYPES,
  });
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
    if (action === "upsert_account") {
      if (!canAdmin(session.user.role) && !canWrite(session.user.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const account = await prisma.glAccount.upsert({
        where: { code: body.code },
        create: {
          code: body.code,
          name: body.name,
          accountType: body.accountType,
          description: body.description ?? null,
          active: body.active ?? true,
        },
        update: {
          name: body.name,
          accountType: body.accountType,
          description: body.description ?? null,
          active: body.active ?? true,
        },
      });
      return NextResponse.json({ ok: true, account });
    }

    if (action === "upsert_mapping") {
      const entityKey = body.entityKey || "*";
      const mapping = await prisma.glAccountMapping.upsert({
        where: {
          transactionType_entityKey: {
            transactionType: body.transactionType,
            entityKey,
          },
        },
        create: {
          transactionType: body.transactionType,
          label: body.label,
          entityKey,
          debitAccountId: body.debitAccountId,
          creditAccountId: body.creditAccountId,
          companyCode: body.companyCode ?? "",
          segmentCode: body.segmentCode ?? "",
          costCenter: body.costCenter ?? "",
          productLine: body.productLine ?? "",
          intercompany: body.intercompany ?? "",
          projectCode: body.projectCode ?? "",
          notes: body.notes ?? null,
          active: true,
        },
        update: {
          label: body.label,
          debitAccountId: body.debitAccountId,
          creditAccountId: body.creditAccountId,
          companyCode: body.companyCode ?? "",
          segmentCode: body.segmentCode ?? "",
          costCenter: body.costCenter ?? "",
          productLine: body.productLine ?? "",
          intercompany: body.intercompany ?? "",
          projectCode: body.projectCode ?? "",
          notes: body.notes ?? null,
          active: body.active ?? true,
        },
        include: { debitAccount: true, creditAccount: true },
      });
      return NextResponse.json({ ok: true, mapping });
    }

    if (action === "delete_mapping") {
      await prisma.glAccountMapping.delete({ where: { id: body.id } });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
