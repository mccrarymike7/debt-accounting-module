import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { currentPeriodLabel, formatPeriodLabel, periodBounds } from "@/lib/period";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const entityId = searchParams.get("entityId") ?? undefined;
  const periodParam = searchParams.get("period");
  const period =
    periodParam && /^\d{4}-\d{2}$/.test(periodParam) ? periodParam : currentPeriodLabel();

  let periodStart: Date;
  let periodEndExclusive: Date;
  try {
    ({ periodStart, periodEndExclusive } = periodBounds(period));
  } catch {
    return NextResponse.json({ error: "Invalid period; use YYYY-MM" }, { status: 400 });
  }

  const journals = await prisma.journalEntry.findMany({
    where: {
      ...(entityId ? { entityId } : {}),
      entryDate: { gte: periodStart, lt: periodEndExclusive },
    },
    include: { entity: true, instrument: true, lines: true },
    orderBy: [{ entryDate: "asc" }, { createdAt: "asc" }],
  });

  const header = [
    "period",
    "entryDate",
    "entity",
    "instrument",
    "source",
    "memo",
    "companyCode",
    "segmentCode",
    "costCenter",
    "productLine",
    "intercompany",
    "projectCode",
    "accountCode",
    "accountName",
    "debitCents",
    "creditCents",
  ];
  const rows: string[] = [header.join(",")];
  for (const j of journals) {
    for (const line of j.lines) {
      rows.push(
        [
          period,
          j.entryDate.toISOString().slice(0, 10),
          j.entity.code,
          j.instrument?.instrumentNumber ?? "",
          j.source,
          JSON.stringify(j.memo),
          line.companyCode,
          line.segmentCode,
          line.costCenter,
          line.productLine,
          line.intercompany,
          line.projectCode,
          line.accountCode,
          JSON.stringify(line.accountName),
          line.debitCents.toString(),
          line.creditCents.toString(),
        ].join(","),
      );
    }
  }

  const filename = `journals-${period}.csv`;
  return new NextResponse(rows.join("\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Period-Label": formatPeriodLabel(period),
    },
  });
}
