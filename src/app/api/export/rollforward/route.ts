import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { carryingValueCents } from "@/lib/money";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const entityId = searchParams.get("entityId") ?? undefined;

  const instruments = await prisma.debtInstrument.findMany({
    where: { status: "ACTIVE", ...(entityId ? { entityId } : {}) },
    include: { entity: true, rateTerm: true },
    orderBy: { instrumentNumber: "asc" },
  });

  const header = [
    "instrumentNumber",
    "name",
    "entity",
    "type",
    "rateType",
    "originalPrincipalCents",
    "currentPrincipalCents",
    "carryingValueCents",
    "unamortizedCostsCents",
    "maturityDate",
  ];
  const rows = [header.join(",")];
  for (const i of instruments) {
    rows.push(
      [
        i.instrumentNumber,
        JSON.stringify(i.name),
        i.entity.code,
        i.type,
        i.rateTerm?.rateType ?? "",
        i.originalPrincipal.toString(),
        i.currentPrincipal.toString(),
        carryingValueCents(i.currentPrincipal, i.unamortizedCosts, i.premiumDiscount).toString(),
        i.unamortizedCosts.toString(),
        i.maturityDate.toISOString().slice(0, 10),
      ].join(","),
    );
  }

  return new NextResponse(rows.join("\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="debt-rollforward.csv"',
    },
  });
}
