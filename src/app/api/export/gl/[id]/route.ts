import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const batch = await prisma.glExportBatch.findUniqueOrThrow({
    where: { id },
    include: {
      journalEntries: {
        include: { lines: true, entity: true, instrument: true },
        orderBy: { entryDate: "asc" },
      },
    },
  });

  const header = [
    "batchId",
    "entryDate",
    "entity",
    "instrument",
    "source",
    "memo",
    "accountCode",
    "accountName",
    "debitCents",
    "creditCents",
  ];
  const rows = [header.join(",")];
  for (const j of batch.journalEntries) {
    for (const line of j.lines) {
      rows.push(
        [
          batch.id,
          j.entryDate.toISOString().slice(0, 10),
          j.entity.code,
          j.instrument?.instrumentNumber ?? "",
          j.source,
          JSON.stringify(j.memo),
          line.accountCode,
          JSON.stringify(line.accountName),
          line.debitCents.toString(),
          line.creditCents.toString(),
        ].join(","),
      );
    }
  }

  await prisma.glExportBatch.update({
    where: { id },
    data: { status: "DOWNLOADED" },
  });

  return new NextResponse(rows.join("\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="gl-${batch.label.replace(/\s+/g, "-").toLowerCase()}.csv"`,
    },
  });
}
