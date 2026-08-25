import { prisma } from "./db";
import type { MonthlyCloseStatus, MonthlyStepKey } from "@/generated/prisma/client";
import { toPeriodLabel } from "./period";

export function isMonthlyPeriodLocked(status: MonthlyCloseStatus | string) {
  return status === "LOCKED";
}

export async function assertMonthlyCloseWritable(monthlyCloseId: string) {
  const close = await prisma.monthlyClose.findUniqueOrThrow({
    where: { id: monthlyCloseId },
  });
  if (isMonthlyPeriodLocked(close.status)) {
    throw new Error(`Period ${close.periodLabel} is closed — no further edits are permitted.`);
  }
  return close;
}

/** Block instrument/journal mutations dated in a locked calendar month. */
export async function assertDateNotInLockedPeriod(date: Date) {
  const periodLabel = toPeriodLabel(date);
  const close = await prisma.monthlyClose.findUnique({ where: { periodLabel } });
  if (close && isMonthlyPeriodLocked(close.status)) {
    throw new Error(`Period ${periodLabel} is closed — no further edits are permitted.`);
  }
  return periodLabel;
}

const STEP_ORDER: { stepKey: MonthlyStepKey; sortOrder: number; label: string }[] = [
  { stepKey: "NEW_DEBT", sortOrder: 1, label: "Add new debt" },
  { stepKey: "UPFRONT_COSTS", sortOrder: 2, label: "Onboard upfront costs" },
  { stepKey: "REVOLVER_ACTIVITY", sortOrder: 3, label: "Revolver draws / true-ups" },
  { stepKey: "RATE_UPDATES", sortOrder: 4, label: "Update reference rates" },
  { stepKey: "PAYMENTS", sortOrder: 5, label: "Process payments" },
  { stepKey: "ACCRUALS", sortOrder: 6, label: "Run accruals & amortization" },
  { stepKey: "GL_EXPORT", sortOrder: 7, label: "Generate GL posting package" },
];

/** Ensure existing period checklists pick up new step keys (e.g. UPFRONT_COSTS). */
export async function syncMonthlyCloseSteps(monthlyCloseId: string) {
  const existing = await prisma.monthlyCloseStep.findMany({ where: { monthlyCloseId } });
  const have = new Set(existing.map((s) => s.stepKey));
  for (const s of STEP_ORDER) {
    if (!have.has(s.stepKey)) {
      await prisma.monthlyCloseStep.create({
        data: {
          monthlyCloseId,
          stepKey: s.stepKey,
          sortOrder: s.sortOrder,
          status: "PENDING",
        },
      });
    } else {
      await prisma.monthlyCloseStep.updateMany({
        where: { monthlyCloseId, stepKey: s.stepKey },
        data: { sortOrder: s.sortOrder },
      });
    }
  }
}

export function monthlyStepLabel(key: MonthlyStepKey) {
  return STEP_ORDER.find((s) => s.stepKey === key)?.label ?? key;
}

export function periodBounds(periodLabel: string) {
  const [y, m] = periodLabel.split("-").map(Number);
  if (!y || !m) throw new Error("Period must be YYYY-MM");
  const periodStart = new Date(Date.UTC(y, m - 1, 1));
  const periodEnd = new Date(Date.UTC(y, m, 0)); // last day of month
  return { periodStart, periodEnd };
}

export async function getOrCreateMonthlyClose(periodLabel: string, createdById?: string) {
  const existing = await prisma.monthlyClose.findUnique({
    where: { periodLabel },
    include: { steps: { orderBy: { sortOrder: "asc" } }, glExports: true },
  });
  if (existing) {
    await syncMonthlyCloseSteps(existing.id);
    return prisma.monthlyClose.findUniqueOrThrow({
      where: { id: existing.id },
      include: { steps: { orderBy: { sortOrder: "asc" } }, glExports: true },
    });
  }

  const { periodStart, periodEnd } = periodBounds(periodLabel);
  return prisma.monthlyClose.create({
    data: {
      periodLabel,
      periodStart,
      periodEnd,
      status: "IN_PROGRESS",
      createdById,
      steps: {
        create: STEP_ORDER.map((s) => ({
          stepKey: s.stepKey,
          sortOrder: s.sortOrder,
          status: s.sortOrder === 1 ? "IN_PROGRESS" : "PENDING",
        })),
      },
    },
    include: { steps: { orderBy: { sortOrder: "asc" } }, glExports: true },
  });
}

export async function listMonthlyCloses() {
  return prisma.monthlyClose.findMany({
    orderBy: { periodLabel: "desc" },
    include: { steps: { orderBy: { sortOrder: "asc" } }, glExports: true },
  });
}

export async function closeMonthlyPeriod(monthlyCloseId: string) {
  await assertMonthlyCloseWritable(monthlyCloseId);

  await prisma.monthlyClose.update({
    where: { id: monthlyCloseId },
    data: { status: "LOCKED", completedAt: new Date() },
  });

  await prisma.auditEvent.create({
    data: {
      action: "MONTHLY_PERIOD_CLOSED",
      entityType: "MonthlyClose",
      entityId: monthlyCloseId,
      detail: "Period locked — no further edits permitted",
    },
  });

  return prisma.monthlyClose.findUniqueOrThrow({
    where: { id: monthlyCloseId },
    include: { steps: { orderBy: { sortOrder: "asc" } }, glExports: true },
  });
}

export async function reopenMonthlyStep(
  monthlyCloseId: string,
  stepKey: MonthlyStepKey,
) {
  await assertMonthlyCloseWritable(monthlyCloseId);

  const step = await prisma.monthlyCloseStep.findFirst({
    where: { monthlyCloseId, stepKey },
  });
  if (!step) throw new Error(`Step ${stepKey} not found`);
  if (step.status !== "COMPLETE" && step.status !== "SKIPPED") {
    return prisma.monthlyClose.findUniqueOrThrow({
      where: { id: monthlyCloseId },
      include: { steps: { orderBy: { sortOrder: "asc" } }, glExports: true },
    });
  }

  // Only one step should be IN_PROGRESS at a time — park other in-progress as PENDING
  await prisma.monthlyCloseStep.updateMany({
    where: { monthlyCloseId, status: "IN_PROGRESS" },
    data: { status: "PENDING" },
  });

  await prisma.monthlyCloseStep.update({
    where: { id: step.id },
    data: { status: "IN_PROGRESS", completedAt: null },
  });

  await prisma.monthlyClose.update({
    where: { id: monthlyCloseId },
    data: { status: "IN_PROGRESS" },
  });

  await prisma.auditEvent.create({
    data: {
      action: "MONTHLY_STEP_REOPENED",
      entityType: "MonthlyClose",
      entityId: monthlyCloseId,
      detail: stepKey,
    },
  });

  return prisma.monthlyClose.findUniqueOrThrow({
    where: { id: monthlyCloseId },
    include: { steps: { orderBy: { sortOrder: "asc" } }, glExports: true },
  });
}

export async function completeMonthlyStep(
  monthlyCloseId: string,
  stepKey: MonthlyStepKey,
  notes?: string,
) {
  await assertMonthlyCloseWritable(monthlyCloseId);
  const close = await prisma.monthlyClose.findUniqueOrThrow({
    where: { id: monthlyCloseId },
    include: { steps: { orderBy: { sortOrder: "asc" } } },
  });

  await prisma.monthlyCloseStep.updateMany({
    where: { monthlyCloseId, stepKey },
    data: { status: "COMPLETE", completedAt: new Date(), notes },
  });

  const steps = await prisma.monthlyCloseStep.findMany({
    where: { monthlyCloseId },
    orderBy: { sortOrder: "asc" },
  });

  const next = steps.find((s) => s.status === "PENDING");
  if (next) {
    await prisma.monthlyCloseStep.update({
      where: { id: next.id },
      data: { status: "IN_PROGRESS" },
    });
    await prisma.monthlyClose.update({
      where: { id: monthlyCloseId },
      data: { status: "IN_PROGRESS" },
    });
  } else {
    const allDone = steps.every((s) => s.status === "COMPLETE" || s.status === "SKIPPED");
    await prisma.monthlyClose.update({
      where: { id: monthlyCloseId },
      data: {
        status: allDone ? "READY_TO_POST" : close.status,
      },
    });
  }

  await prisma.auditEvent.create({
    data: {
      action: "MONTHLY_STEP_COMPLETE",
      entityType: "MonthlyClose",
      entityId: monthlyCloseId,
      detail: `${stepKey}${notes ? `: ${notes}` : ""}`,
    },
  });

  return prisma.monthlyClose.findUniqueOrThrow({
    where: { id: monthlyCloseId },
    include: { steps: { orderBy: { sortOrder: "asc" } }, glExports: true },
  });
}

export async function markMonthlyPosted(monthlyCloseId: string) {
  await assertMonthlyCloseWritable(monthlyCloseId);
  return prisma.monthlyClose.update({
    where: { id: monthlyCloseId },
    data: { status: "POSTED", completedAt: new Date() },
  });
}

export async function generateGlExportBatch(monthlyCloseId: string) {
  const close = await assertMonthlyCloseWritable(monthlyCloseId);

  const journals = await prisma.journalEntry.findMany({
    where: {
      entryDate: { gte: close.periodStart, lte: close.periodEnd },
      OR: [{ monthlyCloseId: null }, { monthlyCloseId }],
      glExportBatchId: null,
    },
    include: { lines: true, entity: true, instrument: true },
    orderBy: { entryDate: "asc" },
  });

  let debit = BigInt(0);
  let credit = BigInt(0);
  let lineCount = 0;
  for (const j of journals) {
    for (const l of j.lines) {
      debit += l.debitCents;
      credit += l.creditCents;
      lineCount += 1;
    }
  }

  const batch = await prisma.glExportBatch.create({
    data: {
      monthlyCloseId,
      label: `GL ${close.periodLabel}`,
      periodStart: close.periodStart,
      periodEnd: close.periodEnd,
      status: "GENERATED",
      lineCount,
      debitTotalCents: debit,
      creditTotalCents: credit,
    },
  });

  if (journals.length > 0) {
    await prisma.journalEntry.updateMany({
      where: { id: { in: journals.map((j) => j.id) } },
      data: { monthlyCloseId, glExportBatchId: batch.id },
    });
  }

  await completeMonthlyStep(monthlyCloseId, "GL_EXPORT", `Batch ${batch.id} (${lineCount} lines)`);

  return { batch, journals };
}

export async function createDebtInstrument(input: {
  entityId: string;
  name: string;
  instrumentNumber: string;
  type: "FUNDING_AGREEMENT" | "TERM_LOAN" | "REVOLVER" | "SENIOR_NOTES" | "PREFERRED" | "OTHER";
  counterparty: string;
  issueDate: Date;
  maturityDate: Date;
  principalCents: bigint;
  issuanceCostsCents?: bigint;
  commitmentCents?: bigint;
  unusedFeeRateBps?: number;
  rateType: "FIXED" | "FLOATING";
  fixedRateBps?: number;
  indexName?: string;
  referenceRateId?: string;
  spreadBps?: number;
  paymentFrequency?: "MONTHLY" | "QUARTERLY" | "SEMI_ANNUAL" | "ANNUAL";
  resetFrequency?: "MONTHLY" | "QUARTERLY" | "SEMI_ANNUAL" | "ANNUAL";
  dayCount?: "ACT_360" | "ACT_365" | "THIRTY_360";
  indexFixingBps?: number;
  floorBps?: number;
  monthlyCloseId?: string;
}) {
  const costs = input.issuanceCostsCents ?? BigInt(0);
  const paymentFrequency = input.paymentFrequency ?? "QUARTERLY";
  const dayCount = input.dayCount ?? "ACT_360";
  const isFloating = input.rateType === "FLOATING";
  const couponBps = isFloating
    ? (input.indexFixingBps ?? 0) + (input.spreadBps ?? 0)
    : (input.fixedRateBps ?? 0);

  const { solveEffectiveYieldBps } = await import("./effective-interest");
  const { generateInterestSchedule } = await import("./schedule");
  const { allInRateBps } = await import("./floating-rate");

  const allIn = isFloating
    ? allInRateBps({
        indexFixingBps: input.indexFixingBps ?? 0,
        spreadBps: input.spreadBps ?? 0,
        floorBps: input.floorBps,
      })
    : couponBps;

  const eir = solveEffectiveYieldBps({
    principalCents: input.principalCents,
    issuanceCostsCents: costs,
    premiumDiscountCents: BigInt(0),
    couponRateBps: allIn,
    maturityDate: input.maturityDate,
    issueDate: input.issueDate,
    dayCount,
  });

  let referenceRateId = input.referenceRateId ?? null;
  let indexName = input.indexName ?? null;
  if (isFloating && referenceRateId) {
    const ref = await prisma.referenceRate.findUnique({ where: { id: referenceRateId } });
    if (ref) indexName = ref.indexFamily;
  } else if (isFloating && !indexName) {
    indexName = "SOFR";
  }

  const instrument = await prisma.debtInstrument.create({
    data: {
      entityId: input.entityId,
      name: input.name,
      instrumentNumber: input.instrumentNumber,
      type: input.type,
      status: "ACTIVE",
      counterparty: input.counterparty,
      currency: "USD",
      issueDate: input.issueDate,
      maturityDate: input.maturityDate,
      originalPrincipal: input.principalCents,
      currentPrincipal: input.principalCents,
      issuanceCosts: costs,
      unamortizedCosts: costs,
      commitment: input.commitmentCents ?? null,
      unusedFeeRateBps: input.unusedFeeRateBps ?? null,
      covenantNotes: "Future state: covenant tests attach here.",
      rateTerm: {
        create: {
          rateType: input.rateType,
          fixedRateBps: isFloating ? null : allIn,
          referenceRateId,
          indexName: isFloating ? indexName : null,
          spreadBps: isFloating ? (input.spreadBps ?? 0) : null,
          resetFrequency: isFloating ? (input.resetFrequency ?? "QUARTERLY") : null,
          paymentFrequency,
          dayCount,
          floorBps: input.floorBps ?? null,
          lookbackDays: 2,
          effectiveYieldBps: eir,
        },
      },
    },
  });

  if (isFloating) {
    await prisma.rateObservation.create({
      data: {
        instrumentId: instrument.id,
        effectiveDate: input.issueDate,
        indexFixingBps: input.indexFixingBps ?? 0,
        spreadBps: input.spreadBps ?? 0,
        allInRateBps: allIn,
        source: "manual",
        notes: "Initial fixing at issuance",
      },
    });
  }

  const schedule = generateInterestSchedule({
    principalCents: input.principalCents,
    rateBps: allIn,
    startDate: input.issueDate,
    maturityDate: input.maturityDate,
    paymentFrequency,
    dayCount,
  });

  await prisma.cashEvent.createMany({
    data: schedule.map((item) => ({
      instrumentId: instrument.id,
      type: item.type,
      status: "PLANNED" as const,
      dueDate: item.dueDate,
      amountCents: item.amountCents,
      interestCents: item.interestCents,
      principalCents: item.principalCents,
    })),
  });

  if (costs > BigInt(0)) {
    const { postMappedJournal } = await import("./journal");
    await postMappedJournal({
      entityId: input.entityId,
      instrumentId: instrument.id,
      entryDate: input.issueDate,
      memo: `Upfront costs at issuance — ${instrument.instrumentNumber}`,
      source: "upfront_costs",
      transactionType: "UPFRONT_COSTS",
      amountCents: costs,
      monthlyCloseId: input.monthlyCloseId,
    });
  }

  if (input.monthlyCloseId) {
    await prisma.auditEvent.create({
      data: {
        action: "NEW_DEBT_ADDED",
        entityType: "DebtInstrument",
        entityId: instrument.id,
        detail: `Added in monthly close; instrument ${instrument.instrumentNumber}`,
      },
    });
  }

  return instrument;
}
