import { prisma } from "./db";
import { accrueInterestCents } from "./interest";
import { findActiveObservation } from "./floating-rate";
import { effectiveInterestPeriod, prospectiveEffectiveYieldBps } from "./effective-interest";
import { yearFraction, type DayCountConvention } from "./day-count";
import { generateInterestSchedule } from "./schedule";
import { postBalancedJournal, postMappedJournal, resolveGlMapping } from "./journal";
import { carryingValueCents } from "./money";

function asDayCount(v: string): DayCountConvention {
  if (v === "ACT_365" || v === "THIRTY_360") return v;
  return "ACT_360";
}

export async function getInstrumentBundle(id: string) {
  return prisma.debtInstrument.findUniqueOrThrow({
    where: { id },
    include: {
      entity: true,
      rateTerm: true,
      rateObservations: { orderBy: { effectiveDate: "asc" } },
      cashEvents: { orderBy: { dueDate: "asc" } },
      accrualRuns: { orderBy: { periodEnd: "desc" }, take: 20 },
      amortizationRows: { orderBy: { periodEnd: "asc" } },
      revolverActivities: { orderBy: { activityDate: "desc" }, take: 40 },
      journalEntries: {
        orderBy: { entryDate: "desc" },
        take: 50,
        include: { lines: true },
      },
    },
  });
}

export function resolveCouponRateBps(
  instrument: Awaited<ReturnType<typeof getInstrumentBundle>>,
  asOf: Date,
): number {
  const term = instrument.rateTerm;
  if (!term) return 0;
  if (term.rateType === "FIXED") return term.fixedRateBps ?? 0;
  const obs = findActiveObservation(instrument.rateObservations, asOf);
  if (obs) return obs.allInRateBps;
  // Fall back to latest observation
  const last = instrument.rateObservations[instrument.rateObservations.length - 1];
  return last?.allInRateBps ?? (term.spreadBps ?? 0);
}

export async function rebuildSchedule(instrumentId: string) {
  const instrument = await getInstrumentBundle(instrumentId);
  const term = instrument.rateTerm;
  if (!term) throw new Error("Missing rate term");

  await prisma.cashEvent.deleteMany({
    where: { instrumentId, status: "PLANNED" },
  });

  const rateBps = resolveCouponRateBps(instrument, instrument.issueDate);
  const items = generateInterestSchedule({
    principalCents: instrument.currentPrincipal,
    rateBps,
    startDate: instrument.issueDate,
    maturityDate: instrument.maturityDate,
    paymentFrequency: term.paymentFrequency as "MONTHLY" | "QUARTERLY" | "SEMI_ANNUAL" | "ANNUAL",
    dayCount: asDayCount(term.dayCount),
  });

  await prisma.cashEvent.createMany({
    data: items.map((item) => ({
      instrumentId,
      type: item.type,
      status: "PLANNED" as const,
      dueDate: item.dueDate,
      amountCents: item.amountCents,
      interestCents: item.interestCents,
      principalCents: item.principalCents,
    })),
  });

  return items.length;
}

export async function runAccrual(instrumentId: string, periodStart: Date, periodEnd: Date) {
  const instrument = await getInstrumentBundle(instrumentId);
  const term = instrument.rateTerm;
  if (!term) throw new Error("Missing rate term");

  const rateBps = resolveCouponRateBps(instrument, periodStart);
  const dayCount = asDayCount(term.dayCount);
  const { interestCents, days } = accrueInterestCents({
    principalCents: instrument.currentPrincipal,
    rateBps,
    start: periodStart,
    end: periodEnd,
    dayCount,
  });

  const journal = await postMappedJournal({
    entityId: instrument.entityId,
    instrumentId,
    entryDate: periodEnd,
    memo: `Interest accrual ${instrument.instrumentNumber} (${rateBps} bps)`,
    source: "accrual",
    transactionType: "INTEREST_ACCRUAL",
    amountCents: interestCents,
  });

  const run = await prisma.accrualRun.create({
    data: {
      instrumentId,
      periodStart,
      periodEnd,
      rateBpsUsed: rateBps,
      dayCountUsed: term.dayCount,
      days,
      interestCents,
      status: "POSTED",
      journalEntryId: journal.id,
    },
  });

  await prisma.auditEvent.create({
    data: {
      action: "ACCRUAL_POSTED",
      entityType: "DebtInstrument",
      entityId: instrumentId,
      detail: `Accrued ${interestCents} cents for ${days} days at ${rateBps} bps`,
    },
  });

  return run;
}

export async function recordPayment(
  instrumentId: string,
  cashEventId: string,
  paidDate: Date,
) {
  const instrument = await getInstrumentBundle(instrumentId);
  const event = await prisma.cashEvent.findUniqueOrThrow({ where: { id: cashEventId } });

  const lines: {
    accountCode: string;
    accountName: string;
    debitCents: bigint;
    creditCents: bigint;
  }[] = [];

  if (event.interestCents > BigInt(0)) {
    const m = await resolveGlMapping("INTEREST_PAYMENT", instrument.entityId, instrumentId);
    lines.push({
      accountCode: m.debit.code,
      accountName: m.debit.name,
      debitCents: event.interestCents,
      creditCents: BigInt(0),
      ...m.dimensions,
    });
  }
  if (event.principalCents > BigInt(0)) {
    const m = await resolveGlMapping("PRINCIPAL_PAYMENT", instrument.entityId, instrumentId);
    lines.push({
      accountCode: m.debit.code,
      accountName: m.debit.name,
      debitCents: event.principalCents,
      creditCents: BigInt(0),
      ...m.dimensions,
    });
  }

  const cashMap =
    event.interestCents > BigInt(0)
      ? await resolveGlMapping("INTEREST_PAYMENT", instrument.entityId, instrumentId)
      : await resolveGlMapping("PRINCIPAL_PAYMENT", instrument.entityId, instrumentId);
  lines.push({
    accountCode: cashMap.credit.code,
    accountName: cashMap.credit.name,
    debitCents: BigInt(0),
    creditCents: event.amountCents,
    ...cashMap.dimensions,
  });

  const journal = await postBalancedJournal({
    entityId: instrument.entityId,
    instrumentId,
    entryDate: paidDate,
    memo: `Payment ${event.type} ${instrument.instrumentNumber}`,
    source: "payment",
    defaultDimensions: cashMap.dimensions,
    lines,
  });

  await prisma.cashEvent.update({
    where: { id: cashEventId },
    data: { status: "PAID", paidDate },
  });

  if (event.principalCents > BigInt(0)) {
    await prisma.debtInstrument.update({
      where: { id: instrumentId },
      data: {
        currentPrincipal: instrument.currentPrincipal - event.principalCents,
        status:
          instrument.currentPrincipal - event.principalCents <= BigInt(0) ? "REPAID" : instrument.status,
      },
    });
  }

  await prisma.auditEvent.create({
    data: {
      action: "PAYMENT_RECORDED",
      entityType: "CashEvent",
      entityId: cashEventId,
      detail: `Paid ${event.amountCents} cents; journal ${journal.id}`,
    },
  });

  return journal;
}

export async function enterRateReset(params: {
  instrumentId: string;
  effectiveDate: Date;
  endDate?: Date;
  indexFixingBps: number;
  source?: string;
  notes?: string;
}) {
  const instrument = await getInstrumentBundle(params.instrumentId);
  const term = instrument.rateTerm;
  if (!term || term.rateType !== "FLOATING") {
    throw new Error("Rate reset requires a floating-rate instrument");
  }

  const spread = term.spreadBps ?? 0;
  let allIn = params.indexFixingBps + spread;
  if (term.floorBps != null) allIn = Math.max(allIn, term.floorBps);
  if (term.capBps != null) allIn = Math.min(allIn, term.capBps);

  // Close prior open observation
  const open = instrument.rateObservations.filter((o) => !o.endDate);
  for (const o of open) {
    if (o.effectiveDate < params.effectiveDate) {
      await prisma.rateObservation.update({
        where: { id: o.id },
        data: { endDate: params.effectiveDate },
      });
    }
  }

  const obs = await prisma.rateObservation.create({
    data: {
      instrumentId: params.instrumentId,
      effectiveDate: params.effectiveDate,
      endDate: params.endDate ?? null,
      indexFixingBps: params.indexFixingBps,
      spreadBps: spread,
      allInRateBps: allIn,
      source: params.source ?? "manual",
      notes: params.notes,
    },
  });

  // Prospective effective yield update
  const remaining = yearFraction(
    params.effectiveDate,
    instrument.maturityDate,
    asDayCount(term.dayCount),
  ).yearFraction;
  const carrying = carryingValueCents(
    instrument.currentPrincipal,
    instrument.unamortizedCosts,
    instrument.premiumDiscount,
  );
  const newYield = prospectiveEffectiveYieldBps({
    currentCarryingCents: carrying,
    principalCents: instrument.currentPrincipal,
    newCouponRateBps: allIn,
    remainingYears: remaining,
  });

  await prisma.rateTerm.update({
    where: { instrumentId: params.instrumentId },
    data: { effectiveYieldBps: newYield },
  });

  await rebuildSchedule(params.instrumentId);

  await prisma.auditEvent.create({
    data: {
      action: "RATE_RESET",
      entityType: "DebtInstrument",
      entityId: params.instrumentId,
      detail: `Index ${params.indexFixingBps} + spread ${spread} = ${allIn} bps; EIR ${newYield} bps`,
    },
  });

  return obs;
}

/** Apply one public index fixing to every floating instrument on a reference rate. */
export async function enterRateResetForReference(params: {
  referenceRateId: string;
  effectiveDate: Date;
  indexFixingBps: number;
  notes?: string;
  source?: string;
}) {
  const ref = await prisma.referenceRate.findUniqueOrThrow({
    where: { id: params.referenceRateId },
  });
  const terms = await prisma.rateTerm.findMany({
    where: { referenceRateId: params.referenceRateId, rateType: "FLOATING" },
    select: { instrumentId: true },
  });
  if (terms.length === 0) {
    throw new Error(`No floating instruments use reference rate ${ref.code}`);
  }

  const results = [];
  for (const term of terms) {
    const obs = await enterRateReset({
      instrumentId: term.instrumentId,
      effectiveDate: params.effectiveDate,
      indexFixingBps: params.indexFixingBps,
      notes: params.notes ?? `Approved ${ref.code} from ${ref.sourceName}`,
      source: params.source ?? ref.sourceName,
    });
    results.push({ instrumentId: term.instrumentId, observationId: obs.id });
  }

  await prisma.auditEvent.create({
    data: {
      action: "REFERENCE_RATE_RESET",
      entityType: "ReferenceRate",
      entityId: params.referenceRateId,
      detail: `${ref.code} → ${params.indexFixingBps} bps on ${params.effectiveDate.toISOString().slice(0, 10)}; ${results.length} instruments`,
    },
  });

  return { referenceRate: ref, results };
}

export async function runEffectiveInterestAmortization(
  instrumentId: string,
  periodStart: Date,
  periodEnd: Date,
) {
  const instrument = await getInstrumentBundle(instrumentId);
  const term = instrument.rateTerm;
  if (!term) throw new Error("Missing rate term");

  const coupon = resolveCouponRateBps(instrument, periodStart);
  const yieldBps = term.effectiveYieldBps ?? coupon;
  const dayCount = asDayCount(term.dayCount);

  const result = effectiveInterestPeriod({
    principalCents: instrument.currentPrincipal,
    unamortizedCostsCents: instrument.unamortizedCosts,
    premiumDiscountCents: instrument.premiumDiscount,
    effectiveYieldBps: yieldBps,
    cashCouponRateBps: coupon,
    start: periodStart,
    end: periodEnd,
    dayCount,
  });

  const amort = result.amortizationCents;
  let journalId: string | undefined;
  if (amort !== BigInt(0)) {
    const journal = await postMappedJournal({
      entityId: instrument.entityId,
      instrumentId,
      entryDate: periodEnd,
      memo: `Effective interest amortization ${instrument.instrumentNumber}`,
      source: "amortization",
      transactionType: "EIR_AMORTIZATION",
      amountCents: amort < BigInt(0) ? -amort : amort,
      reverse: amort < BigInt(0),
    });
    journalId = journal.id;
  }

  await prisma.debtInstrument.update({
    where: { id: instrumentId },
    data: {
      unamortizedCosts: result.closingUnamortizedCostsCents,
      premiumDiscount: result.closingPremiumDiscountCents,
    },
  });

  const row = await prisma.amortizationRow.create({
    data: {
      instrumentId,
      periodEnd,
      openingCarryingCents: result.openingCarryingCents,
      cashInterestCents: result.cashInterestCents,
      effectiveInterestCents: result.effectiveInterestCents,
      amortizationCents: result.amortizationCents,
      closingCarryingCents: result.closingCarryingCents,
      effectiveYieldBps: yieldBps,
      journalEntryId: journalId,
    },
  });

  return row;
}

/**
 * Capitalize upfront / issuance costs onto an instrument:
 * increases deferred cost balances, recalculates EIR, posts Dr Unamortized costs / Cr Cash.
 */
export async function recordUpfrontCosts(params: {
  instrumentId: string;
  activityDate: Date;
  amountCents: bigint;
  description?: string;
  monthlyCloseId?: string;
}) {
  if (params.amountCents <= BigInt(0)) {
    throw new Error("Upfront cost amount must be greater than zero");
  }

  const instrument = await getInstrumentBundle(params.instrumentId);
  const term = instrument.rateTerm;
  if (!term) throw new Error("Missing rate term");

  const newIssuanceCosts = instrument.issuanceCosts + params.amountCents;
  const newUnamortized = instrument.unamortizedCosts + params.amountCents;
  const dayCount = asDayCount(term.dayCount);
  const coupon = resolveCouponRateBps(instrument, params.activityDate);
  const remaining = yearFraction(
    params.activityDate,
    instrument.maturityDate,
    dayCount,
  ).yearFraction;
  const newCarrying = carryingValueCents(
    instrument.currentPrincipal,
    newUnamortized,
    instrument.premiumDiscount,
  );
  const newYield = prospectiveEffectiveYieldBps({
    currentCarryingCents: newCarrying,
    principalCents: instrument.currentPrincipal,
    newCouponRateBps: coupon,
    remainingYears: remaining,
  });

  const memoDetail = params.description?.trim() || "issuance / upfront fees";
  const journal = await postMappedJournal({
    entityId: instrument.entityId,
    instrumentId: instrument.id,
    entryDate: params.activityDate,
    memo: `Upfront costs — ${instrument.instrumentNumber}: ${memoDetail}`,
    source: "upfront_costs",
    transactionType: "UPFRONT_COSTS",
    amountCents: params.amountCents,
    monthlyCloseId: params.monthlyCloseId,
  });

  await prisma.debtInstrument.update({
    where: { id: instrument.id },
    data: {
      issuanceCosts: newIssuanceCosts,
      unamortizedCosts: newUnamortized,
    },
  });

  await prisma.rateTerm.update({
    where: { instrumentId: instrument.id },
    data: { effectiveYieldBps: newYield },
  });

  await prisma.auditEvent.create({
    data: {
      action: "UPFRONT_COSTS",
      entityType: "DebtInstrument",
      entityId: instrument.id,
      detail: `${memoDetail}; +${params.amountCents} cents; EIR → ${newYield} bps; journal ${journal.id}`,
    },
  });

  return {
    instrumentId: instrument.id,
    journalId: journal.id,
    issuanceCostsCents: newIssuanceCosts,
    unamortizedCostsCents: newUnamortized,
    effectiveYieldBps: newYield,
  };
}
