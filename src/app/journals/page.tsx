import { redirect } from "next/navigation";
import { Suspense } from "react";
import { format } from "date-fns";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { AppShell } from "@/components/AppShell";
import { Badge, DataTable, Money, PageTitle } from "@/components/ui";
import { MonthPicker } from "@/components/MonthPicker";
import {
  collectPeriodOptions,
  currentPeriodLabel,
  formatPeriodLabel,
  periodBounds,
} from "@/lib/period";
import Link from "next/link";

export default async function JournalsPage({
  searchParams,
}: {
  searchParams: Promise<{ entityId?: string; period?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  const { entityId, period: periodParam } = await searchParams;

  const entities = await prisma.entity.findMany({ orderBy: { code: "asc" } });

  const dateRows = await prisma.journalEntry.findMany({
    where: entityId ? { entityId } : undefined,
    select: { entryDate: true },
    distinct: ["entryDate"],
    orderBy: { entryDate: "desc" },
  });
  const months = collectPeriodOptions(dateRows.map((r) => r.entryDate));
  const period = periodParam && /^\d{4}-\d{2}$/.test(periodParam) ? periodParam : currentPeriodLabel();
  const { periodStart, periodEndExclusive, periodLastDay } = periodBounds(period);

  const journals = await prisma.journalEntry.findMany({
    where: {
      ...(entityId ? { entityId } : {}),
      entryDate: { gte: periodStart, lt: periodEndExclusive },
    },
    include: {
      entity: true,
      instrument: true,
      lines: true,
    },
    orderBy: [{ entryDate: "asc" }, { createdAt: "asc" }],
  });

  const bySource = new Map<string, { count: number; debit: bigint }>();
  let monthDebit = BigInt(0);
  for (const j of journals) {
    const debit = j.lines.reduce((s, l) => s + l.debitCents, BigInt(0));
    monthDebit += debit;
    const cur = bySource.get(j.source) ?? { count: 0, debit: BigInt(0) };
    cur.count += 1;
    cur.debit += debit;
    bySource.set(j.source, cur);
  }

  const exportQs = new URLSearchParams({ period });
  if (entityId) exportQs.set("entityId", entityId);

  return (
    <AppShell entityOptions={entities} entityId={entityId}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <PageTitle
          title="Journals"
          subtitle={`Monthly activity for ${formatPeriodLabel(period)} (${format(periodStart, "MMM d")} – ${format(periodLastDay, "MMM d, yyyy")}).`}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Suspense fallback={null}>
            <MonthPicker value={period} months={months} />
          </Suspense>
          <Link
            href={`/api/export/journals?${exportQs.toString()}`}
            className="border border-primary px-4 py-2 text-nav text-primary hover:bg-primary hover:text-white"
          >
            Export {formatPeriodLabel(period)} CSV
          </Link>
        </div>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="border-t-2 border-primary bg-white px-4 py-3">
          <div className="text-nav text-body">Entries</div>
          <div className="mt-1 text-xl font-bold text-secondary">{journals.length}</div>
        </div>
        <div className="border-t-2 border-primary bg-white px-4 py-3">
          <div className="text-nav text-body">Month debit activity</div>
          <div className="mt-1 text-xl font-bold text-secondary">
            <Money cents={monthDebit} precise />
          </div>
        </div>
        {[...bySource.entries()].slice(0, 2).map(([source, v]) => (
          <div key={source} className="border-t-2 border-primary bg-white px-4 py-3">
            <div className="text-nav text-body">{source}</div>
            <div className="mt-1 text-xl font-bold text-secondary">{v.count}</div>
            <div className="text-xs text-body">
              <Money cents={v.debit} precise />
            </div>
          </div>
        ))}
      </div>

      {journals.length === 0 ? (
        <p className="border border-border bg-white px-5 py-8 text-sm text-body">
          No journal activity in {formatPeriodLabel(period)}. Pick another month, or run accruals /
          payments from Monthly process.
        </p>
      ) : (
        <DataTable headers={["Date", "Entity", "Instrument", "Source", "Memo", "Debit", "Credit"]}>
          {journals.map((j) => {
            const debit = j.lines.reduce((s, l) => s + l.debitCents, BigInt(0));
            const credit = j.lines.reduce((s, l) => s + l.creditCents, BigInt(0));
            return (
              <tr key={j.id}>
                <td className="px-4 py-3">{format(j.entryDate, "yyyy-MM-dd")}</td>
                <td className="px-4 py-3">{j.entity.code}</td>
                <td className="px-4 py-3">
                  {j.instrument ? (
                    <Link href={`/instruments/${j.instrumentId}`} className="hover:text-primary">
                      {j.instrument.instrumentNumber}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3">
                  <Badge tone="teal">{j.source}</Badge>
                </td>
                <td className="px-4 py-3">{j.memo}</td>
                <td className="px-4 py-3">
                  <Money cents={debit} precise />
                </td>
                <td className="px-4 py-3">
                  <Money cents={credit} precise />
                </td>
              </tr>
            );
          })}
        </DataTable>
      )}

      {journals.length > 0 ? (
        <details className="mt-8 border border-border bg-white">
          <summary className="cursor-pointer px-4 py-3 text-nav text-secondary">
            Line detail (account + company / segment / dimensions)
          </summary>
          <div className="border-t border-border">
            <DataTable
              headers={[
                "Date",
                "Instrument",
                "Company",
                "Segment",
                "CC",
                "Product",
                "IC",
                "Project",
                "Account",
                "Debit",
                "Credit",
              ]}
            >
              {journals.flatMap((j) =>
                j.lines.map((line) => (
                  <tr key={line.id}>
                    <td className="px-4 py-3">{format(j.entryDate, "yyyy-MM-dd")}</td>
                    <td className="px-4 py-3">
                      {j.instrument?.instrumentNumber ?? "—"}
                    </td>
                    <td className="px-4 py-3">{line.companyCode || "—"}</td>
                    <td className="px-4 py-3">{line.segmentCode || "—"}</td>
                    <td className="px-4 py-3">{line.costCenter || "—"}</td>
                    <td className="px-4 py-3">{line.productLine || "—"}</td>
                    <td className="px-4 py-3">{line.intercompany || "—"}</td>
                    <td className="px-4 py-3">{line.projectCode || "—"}</td>
                    <td className="px-4 py-3 font-semibold">
                      {line.accountCode}
                      <div className="text-xs font-normal text-body">{line.accountName}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Money cents={line.debitCents} precise />
                    </td>
                    <td className="px-4 py-3">
                      <Money cents={line.creditCents} precise />
                    </td>
                  </tr>
                )),
              )}
            </DataTable>
          </div>
        </details>
      ) : null}
    </AppShell>
  );
}
