import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth, canWrite } from "@/auth";
import { prisma } from "@/lib/db";
import { AppShell } from "@/components/AppShell";
import { MonthPicker } from "@/components/MonthPicker";
import { Badge, PageTitle } from "@/components/ui";
import { MonthlyWorkflow } from "@/components/MonthlyWorkflow";
import { getOrCreateMonthlyClose, listMonthlyCloses } from "@/lib/monthly-close";
import {
  collectPeriodOptions,
  currentPeriodLabel,
  formatPeriodLabel,
  periodBounds,
} from "@/lib/period";

export default async function MonthlyPage({
  searchParams,
}: {
  searchParams: Promise<{ entityId?: string; period?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const { entityId, period: periodParam } = await searchParams;
  const periodLabel =
    periodParam && /^\d{4}-\d{2}$/.test(periodParam) ? periodParam : currentPeriodLabel();
  const entities = await prisma.entity.findMany({ orderBy: { code: "asc" } });
  const close = await getOrCreateMonthlyClose(periodLabel, session.user.id);
  const history = await listMonthlyCloses();
  const { periodStart, periodLastDay } = periodBounds(periodLabel);

  const months = collectPeriodOptions(
    history.map((h) => h.periodStart),
    history.map((h) => h.periodLabel),
  );

  const instruments = await prisma.debtInstrument.findMany({
    where: { status: "ACTIVE" },
    include: {
      rateTerm: { include: { referenceRate: true } },
      rateObservations: { orderBy: { effectiveDate: "desc" }, take: 1 },
    },
    orderBy: { instrumentNumber: "asc" },
  });

  const referenceRates = await prisma.referenceRate.findMany({
    where: { active: true },
    orderBy: [{ indexFamily: "asc" }, { tenorLabel: "asc" }],
  });

  const plannedPayments = await prisma.cashEvent.findMany({
    where: {
      status: "PLANNED",
      dueDate: { lte: close.periodEnd },
    },
    include: { instrument: true },
    orderBy: { dueDate: "asc" },
    take: 50,
  });

  const serializedClose = {
    id: close.id,
    periodLabel: close.periodLabel,
    periodStart: close.periodStart.toISOString(),
    periodEnd: close.periodEnd.toISOString(),
    status: close.status,
    completedAt: close.completedAt?.toISOString() ?? null,
    steps: close.steps.map((s) => ({
      id: s.id,
      stepKey: s.stepKey,
      status: s.status,
      sortOrder: s.sortOrder,
      notes: s.notes,
    })),
    glExports: close.glExports.map((g) => ({
      id: g.id,
      label: g.label,
      lineCount: g.lineCount,
      status: g.status,
    })),
  };

  const serializedInstruments = instruments.map((i) => {
    const latest = i.rateObservations[0];
    const ref = i.rateTerm?.referenceRate;
    return {
      id: i.id,
      instrumentNumber: i.instrumentNumber,
      name: i.name,
      type: i.type,
      currentPrincipal: i.currentPrincipal.toString(),
      unamortizedCosts: i.unamortizedCosts.toString(),
      issuanceCosts: i.issuanceCosts.toString(),
      rateTerm: i.rateTerm
        ? {
            rateType: i.rateTerm.rateType,
            indexName: i.rateTerm.indexName,
            spreadBps: i.rateTerm.spreadBps,
            floorBps: i.rateTerm.floorBps,
            referenceRateId: i.rateTerm.referenceRateId,
            referenceRate: ref
              ? {
                  id: ref.id,
                  code: ref.code,
                  name: ref.name,
                  tenorLabel: ref.tenorLabel,
                  sourceName: ref.sourceName,
                  sourceUrl: ref.sourceUrl,
                  decimalPlaces: ref.decimalPlaces,
                  indexFamily: ref.indexFamily,
                }
              : null,
          }
        : null,
      suggestedIndexFixingBps: latest?.indexFixingBps ?? null,
      lastAllInRateBps: latest?.allInRateBps ?? null,
    };
  });

  const serializedReferenceRates = referenceRates.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    tenorLabel: r.tenorLabel,
    sourceName: r.sourceName,
    sourceUrl: r.sourceUrl,
    decimalPlaces: r.decimalPlaces,
    indexFamily: r.indexFamily,
  }));

  const serializedPayments = plannedPayments.map((p) => ({
    id: p.id,
    instrumentId: p.instrumentId,
    type: p.type,
    dueDate: p.dueDate.toISOString(),
    amountCents: p.amountCents.toString(),
    instrument: { instrumentNumber: p.instrument.instrumentNumber },
  }));

  const locked = close.status === "LOCKED";

  return (
    <AppShell entityOptions={entities} entityId={entityId}>
      <PageTitle
        title="Monthly process"
        subtitle={`Checklist for ${formatPeriodLabel(periodLabel)} (${periodStart.toISOString().slice(0, 10)} – ${periodLastDay.toISOString().slice(0, 10)}).`}
      />

      <div className="mb-6 flex flex-wrap items-center gap-4">
        <Suspense fallback={null}>
          <MonthPicker value={periodLabel} months={months} />
        </Suspense>
        {locked ? <Badge tone="navy">Closed</Badge> : <Badge tone="teal">{close.status}</Badge>}
      </div>

      <MonthlyWorkflow
        initialClose={serializedClose}
        entities={entities}
        instruments={serializedInstruments}
        referenceRates={serializedReferenceRates}
        plannedPayments={serializedPayments}
        canWrite={canWrite(session.user.role)}
      />
    </AppShell>
  );
}
