import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { solveEffectiveYieldBps } from "../src/lib/effective-interest";
import { allInRateBps } from "../src/lib/floating-rate";
import { generateInterestSchedule } from "../src/lib/schedule";
import { accrueInterestCents } from "../src/lib/interest";
import { effectiveInterestPeriod } from "../src/lib/effective-interest";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://debt:debt@localhost:5432/debt_accounting?schema=public";
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

function usd(n: number) {
  return BigInt(Math.round(n * 100));
}

async function main() {
  await prisma.journalLine.deleteMany();
  await prisma.journalEntry.deleteMany();
  await prisma.glExportBatch.deleteMany();
  await prisma.monthlyCloseStep.deleteMany();
  await prisma.monthlyClose.deleteMany();
  await prisma.revolverActivity.deleteMany();
  await prisma.accrualRun.deleteMany();
  await prisma.amortizationRow.deleteMany();
  await prisma.cashEvent.deleteMany();
  await prisma.rateObservation.deleteMany();
  await prisma.rateTerm.deleteMany();
  await prisma.debtInstrument.deleteMany();
  await prisma.referenceRate.deleteMany();
  await prisma.glAccountMapping.deleteMany();
  await prisma.glAccount.deleteMany();
  await prisma.covenantTest.deleteMany();
  await prisma.covenantDefinition.deleteMany();
  await prisma.auditEvent.deleteMany();
  await prisma.entity.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash("password123", 10);
  await prisma.user.createMany({
    data: [
      { email: "admin@aspida.local", name: "Admin User", passwordHash, role: "ADMIN" },
      {
        email: "accountant@aspida.local",
        name: "Treasury Accountant",
        passwordHash,
        role: "ACCOUNTANT",
      },
      { email: "viewer@aspida.local", name: "FP&A Viewer", passwordHash, role: "VIEWER" },
    ],
  });

  const holdings = await prisma.entity.create({
    data: {
      code: "AHL",
      name: "Aspida Holdings Ltd.",
      companyCode: "AHL",
      segmentCode: "CORP",
    },
  });
  const life = await prisma.entity.create({
    data: {
      code: "ALIC",
      name: "Aspida Life Insurance Company",
      companyCode: "ALIC",
      segmentCode: "LIFE",
      parentId: holdings.id,
    },
  });
  const re = await prisma.entity.create({
    data: {
      code: "ARE",
      name: "Aspida Re (Bermuda) Ltd.",
      companyCode: "ARE",
      segmentCode: "RE",
      parentId: holdings.id,
    },
  });

  // Reference rates (public SOFR tenors)
  const sofr1m = await prisma.referenceRate.create({
    data: {
      code: "SOFR_1M",
      name: "1-Month Term SOFR",
      indexFamily: "SOFR",
      tenorLabel: "1M",
      sourceName: "CME Term SOFR",
      sourceUrl: "https://www.cmegroup.com/market-data/cme-group-benchmark-administration/term-sofr.html",
      decimalPlaces: 5,
      notes: "Monthly reset funding agreements typically reference 1M Term SOFR.",
    },
  });
  const sofr3m = await prisma.referenceRate.create({
    data: {
      code: "SOFR_3M",
      name: "3-Month Term SOFR",
      indexFamily: "SOFR",
      tenorLabel: "3M",
      sourceName: "CME Term SOFR",
      sourceUrl: "https://www.cmegroup.com/market-data/cme-group-benchmark-administration/term-sofr.html",
      decimalPlaces: 5,
      notes: "Quarterly reset facilities typically reference 3M Term SOFR.",
    },
  });
  const sofrOn = await prisma.referenceRate.create({
    data: {
      code: "SOFR_ON",
      name: "SOFR (Overnight)",
      indexFamily: "SOFR",
      tenorLabel: "ON",
      sourceName: "Federal Reserve Bank of New York",
      sourceUrl: "https://www.newyorkfed.org/markets/reference-rates/sofr",
      decimalPlaces: 2,
      notes: "Overnight SOFR as published by the New York Fed.",
    },
  });
  void sofrOn;

  // Chart of accounts
  const coa = [
    { code: "1000", name: "Cash — Operating", accountType: "ASSET" as const },
    { code: "1010", name: "Cash — Debt Service", accountType: "ASSET" as const },
    { code: "1450", name: "Unamortized Debt Issuance Costs", accountType: "ASSET" as const },
    { code: "2100", name: "Notes & Loans Payable", accountType: "LIABILITY" as const },
    { code: "2110", name: "Debt Premium / Discount", accountType: "LIABILITY" as const },
    { code: "2120", name: "Funding Agreements Payable", accountType: "LIABILITY" as const },
    { code: "2130", name: "Revolver Drawn", accountType: "LIABILITY" as const },
    { code: "2150", name: "Accrued Interest Payable", accountType: "LIABILITY" as const },
    { code: "7100", name: "Interest Expense — Debt", accountType: "EXPENSE" as const },
    { code: "7110", name: "Interest Expense — Funding Agreements", accountType: "EXPENSE" as const },
    { code: "7120", name: "Unused Commitment Fee Expense", accountType: "EXPENSE" as const },
  ];
  for (const a of coa) {
    await prisma.glAccount.create({ data: a });
  }
  const byCode = Object.fromEntries(
    (await prisma.glAccount.findMany()).map((a) => [a.code, a.id]),
  );

  const defaultMaps: {
    transactionType: string;
    label: string;
    debit: string;
    credit: string;
  }[] = [
    {
      transactionType: "INTEREST_ACCRUAL",
      label: "Interest accrual",
      debit: "7100",
      credit: "2150",
    },
    {
      transactionType: "INTEREST_PAYMENT",
      label: "Interest payment",
      debit: "2150",
      credit: "1010",
    },
    {
      transactionType: "PRINCIPAL_PAYMENT",
      label: "Principal payment",
      debit: "2100",
      credit: "1010",
    },
    {
      transactionType: "EIR_AMORTIZATION",
      label: "EIR amortization of issuance costs",
      debit: "7100",
      credit: "1450",
    },
    {
      transactionType: "UPFRONT_COSTS",
      label: "Capitalize upfront / issuance costs",
      debit: "1450",
      credit: "1000",
    },
    {
      transactionType: "REVOLVER_DRAW",
      label: "Revolver draw",
      debit: "1000",
      credit: "2130",
    },
    {
      transactionType: "REVOLVER_REPAY",
      label: "Revolver repayment",
      debit: "2130",
      credit: "1000",
    },
    {
      transactionType: "REVOLVER_TRUE_UP_INCREASE",
      label: "Revolver true-up increase",
      debit: "1000",
      credit: "2130",
    },
    {
      transactionType: "REVOLVER_TRUE_UP_DECREASE",
      label: "Revolver true-up decrease",
      debit: "2130",
      credit: "1000",
    },
  ];
  for (const m of defaultMaps) {
    await prisma.glAccountMapping.create({
      data: {
        transactionType: m.transactionType,
        label: m.label,
        entityKey: "*",
        debitAccountId: byCode[m.debit],
        creditAccountId: byCode[m.credit],
        costCenter: "TREASURY",
        notes: "Seed default mapping",
      },
    });
  }
  // Entity override example: life co FA interest to FA-specific expense
  await prisma.glAccountMapping.create({
    data: {
      transactionType: "INTEREST_ACCRUAL",
      label: "ALIC interest accrual (FA)",
      entityKey: life.id,
      debitAccountId: byCode["7110"],
      creditAccountId: byCode["2150"],
      companyCode: "ALIC",
      segmentCode: "LIFE",
      costCenter: "ALM",
      productLine: "FA",
      notes: "Entity override — funding agreement interest at Life",
    },
  });

  type Spec = {
    entityId: string;
    name: string;
    instrumentNumber: string;
    type:
      | "FUNDING_AGREEMENT"
      | "TERM_LOAN"
      | "REVOLVER"
      | "SENIOR_NOTES"
      | "PREFERRED"
      | "OTHER";
    counterparty: string;
    issueDate: Date;
    maturityDate: Date;
    principal: bigint;
    costs: bigint;
    floating?: {
      index: string;
      spread: number;
      fixing: number;
      floor?: number;
      referenceCode?: "SOFR_1M" | "SOFR_3M" | "SOFR_ON";
    };
    fixedBps?: number;
    paymentFrequency: "MONTHLY" | "QUARTERLY" | "SEMI_ANNUAL" | "ANNUAL";
    resetFrequency?: "MONTHLY" | "QUARTERLY" | "SEMI_ANNUAL" | "ANNUAL";
    commitment?: bigint;
    unusedFeeBps?: number;
  };

  const instruments: Spec[] = [
    {
      entityId: life.id,
      name: "Funding Agreement Series 2024-A",
      instrumentNumber: "FA-2024-A",
      type: "FUNDING_AGREEMENT",
      counterparty: "Institutional FA Counterparty A",
      issueDate: new Date("2024-01-15"),
      maturityDate: new Date("2029-01-15"),
      principal: usd(250_000_000),
      costs: usd(1_250_000),
      floating: { index: "SOFR", spread: 125, fixing: 432, referenceCode: "SOFR_3M" },
      paymentFrequency: "QUARTERLY",
      resetFrequency: "QUARTERLY",
    },
    {
      entityId: re.id,
      name: "Funding Agreement Series 2024-B",
      instrumentNumber: "FA-2024-B",
      type: "FUNDING_AGREEMENT",
      counterparty: "Institutional FA Counterparty B",
      issueDate: new Date("2024-03-01"),
      maturityDate: new Date("2028-03-01"),
      principal: usd(180_000_000),
      costs: usd(900_000),
      floating: { index: "SOFR", spread: 110, fixing: 432, referenceCode: "SOFR_3M" },
      paymentFrequency: "QUARTERLY",
      resetFrequency: "QUARTERLY",
    },
    {
      entityId: life.id,
      name: "Funding Agreement Series 2025-C",
      instrumentNumber: "FA-2025-C",
      type: "FUNDING_AGREEMENT",
      counterparty: "Institutional FA Counterparty C",
      issueDate: new Date("2025-06-01"),
      maturityDate: new Date("2030-06-01"),
      principal: usd(120_000_000),
      costs: usd(600_000),
      floating: { index: "SOFR", spread: 140, fixing: 450, floor: 200, referenceCode: "SOFR_3M" },
      paymentFrequency: "QUARTERLY",
      resetFrequency: "QUARTERLY",
    },
    {
      entityId: re.id,
      name: "Funding Agreement Series 2025-D",
      instrumentNumber: "FA-2025-D",
      type: "FUNDING_AGREEMENT",
      counterparty: "Institutional FA Counterparty D",
      issueDate: new Date("2025-09-15"),
      maturityDate: new Date("2031-09-15"),
      principal: usd(95_000_000),
      costs: usd(475_000),
      floating: { index: "SOFR", spread: 135, fixing: 448, referenceCode: "SOFR_3M" },
      paymentFrequency: "QUARTERLY",
      resetFrequency: "QUARTERLY",
    },
    {
      entityId: life.id,
      name: "Funding Agreement Series 2026-E",
      instrumentNumber: "FA-2026-E",
      type: "FUNDING_AGREEMENT",
      counterparty: "Institutional FA Counterparty E",
      issueDate: new Date("2026-02-01"),
      maturityDate: new Date("2029-02-01"),
      principal: usd(75_000_000),
      costs: usd(375_000),
      floating: { index: "SOFR", spread: 115, fixing: 455, referenceCode: "SOFR_1M" },
      paymentFrequency: "MONTHLY",
      resetFrequency: "MONTHLY",
    },
    {
      entityId: holdings.id,
      name: "Funding Agreement Series 2023-H",
      instrumentNumber: "FA-2023-H",
      type: "FUNDING_AGREEMENT",
      counterparty: "HoldCo FA Investor",
      issueDate: new Date("2023-11-01"),
      maturityDate: new Date("2027-11-01"),
      principal: usd(50_000_000),
      costs: usd(200_000),
      floating: { index: "SOFR", spread: 150, fixing: 420, referenceCode: "SOFR_1M" },
      paymentFrequency: "QUARTERLY",
      resetFrequency: "QUARTERLY",
    },
    {
      entityId: holdings.id,
      name: "Senior Unsecured Notes 2031",
      instrumentNumber: "SN-2031",
      type: "SENIOR_NOTES",
      counterparty: "Public Noteholders",
      issueDate: new Date("2023-09-15"),
      maturityDate: new Date("2031-09-15"),
      principal: usd(150_000_000),
      costs: usd(2_000_000),
      fixedBps: 575,
      paymentFrequency: "SEMI_ANNUAL",
    },
    {
      entityId: holdings.id,
      name: "Term Loan B",
      instrumentNumber: "TLB-2024",
      type: "TERM_LOAN",
      counterparty: "Bank Syndicate — Term B",
      issueDate: new Date("2024-06-30"),
      maturityDate: new Date("2030-06-30"),
      principal: usd(85_000_000),
      costs: usd(850_000),
      floating: { index: "SOFR", spread: 250, fixing: 432, referenceCode: "SOFR_3M" },
      paymentFrequency: "QUARTERLY",
      resetFrequency: "QUARTERLY",
    },
    {
      entityId: holdings.id,
      name: "Revolving Credit Facility",
      instrumentNumber: "RCF-2023",
      type: "REVOLVER",
      counterparty: "Bank Syndicate",
      issueDate: new Date("2023-01-01"),
      maturityDate: new Date("2028-01-01"),
      principal: usd(40_000_000),
      costs: usd(250_000),
      commitment: usd(250_000_000),
      unusedFeeBps: 25,
      floating: { index: "SOFR", spread: 175, fixing: 432, referenceCode: "SOFR_1M" },
      paymentFrequency: "QUARTERLY",
      resetFrequency: "QUARTERLY",
    },
    {
      entityId: holdings.id,
      name: "Series A Preferred Stock",
      instrumentNumber: "PREF-A",
      type: "PREFERRED",
      counterparty: "Ares / Preferred Holders",
      issueDate: new Date("2022-06-01"),
      maturityDate: new Date("2032-06-01"),
      principal: usd(100_000_000),
      costs: usd(500_000),
      fixedBps: 650,
      paymentFrequency: "QUARTERLY",
    },
  ];

  const createdIds: string[] = [];

  for (const spec of instruments) {
    const isFloating = Boolean(spec.floating);
    const couponBps = isFloating
      ? allInRateBps({
          indexFixingBps: spec.floating!.fixing,
          spreadBps: spec.floating!.spread,
          floorBps: spec.floating!.floor,
        })
      : spec.fixedBps!;

    const eir = solveEffectiveYieldBps({
      principalCents: spec.principal,
      issuanceCostsCents: spec.costs,
      premiumDiscountCents: BigInt(0),
      couponRateBps: couponBps,
      maturityDate: spec.maturityDate,
      issueDate: spec.issueDate,
      dayCount: "ACT_360",
    });

    const refCode = isFloating ? (spec.floating!.referenceCode ?? "SOFR_3M") : null;
    const referenceRateId =
      refCode === "SOFR_1M" ? sofr1m.id : refCode === "SOFR_ON" ? sofrOn.id : refCode ? sofr3m.id : null;

    const instrument = await prisma.debtInstrument.create({
      data: {
        entityId: spec.entityId,
        name: spec.name,
        instrumentNumber: spec.instrumentNumber,
        type: spec.type,
        status: "ACTIVE",
        counterparty: spec.counterparty,
        currency: "USD",
        issueDate: spec.issueDate,
        maturityDate: spec.maturityDate,
        originalPrincipal: spec.principal,
        currentPrincipal: spec.principal,
        issuanceCosts: spec.costs,
        unamortizedCosts: spec.costs,
        premiumDiscount: BigInt(0),
        commitment: spec.commitment ?? null,
        unusedFeeRateBps: spec.unusedFeeBps ?? null,
        dividendRateBps: spec.type === "PREFERRED" ? spec.fixedBps : null,
        cumulative: spec.type === "PREFERRED" ? true : null,
        covenantNotes: "Future state: covenant tests will attach here.",
        rateTerm: {
          create: {
            rateType: isFloating ? "FLOATING" : "FIXED",
            fixedRateBps: isFloating ? null : couponBps,
            referenceRateId,
            indexName: isFloating ? spec.floating!.index : null,
            spreadBps: isFloating ? spec.floating!.spread : null,
            resetFrequency: isFloating ? (spec.resetFrequency ?? null) : null,
            paymentFrequency: spec.paymentFrequency,
            dayCount: "ACT_360",
            floorBps: isFloating ? (spec.floating!.floor ?? null) : null,
            lookbackDays: 2,
            effectiveYieldBps: eir,
          },
        },
      },
    });
    createdIds.push(instrument.id);

    if (isFloating) {
      await prisma.rateObservation.create({
        data: {
          instrumentId: instrument.id,
          effectiveDate: spec.issueDate,
          endDate: new Date("2026-06-01"),
          indexFixingBps: spec.floating!.fixing,
          spreadBps: spec.floating!.spread,
          allInRateBps: couponBps,
          source: "manual",
          notes: "Initial fixing at issuance",
        },
      });
      const laterFix = spec.floating!.fixing + 18;
      const laterAllIn = allInRateBps({
        indexFixingBps: laterFix,
        spreadBps: spec.floating!.spread,
        floorBps: spec.floating!.floor,
      });
      await prisma.rateObservation.create({
        data: {
          instrumentId: instrument.id,
          effectiveDate: new Date("2026-06-01"),
          indexFixingBps: laterFix,
          spreadBps: spec.floating!.spread,
          allInRateBps: laterAllIn,
          source: "manual",
          notes: "Seed mid-2026 reset",
        },
      });
    }

    const schedule = generateInterestSchedule({
      principalCents: spec.principal,
      rateBps: couponBps,
      startDate: spec.issueDate,
      maturityDate: spec.maturityDate,
      paymentFrequency: spec.paymentFrequency,
      dayCount: "ACT_360",
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

    // Mark historical interest payments as paid (due before Aug 2026)
    const cutoff = new Date("2026-08-01");
    const pastInterest = await prisma.cashEvent.findMany({
      where: {
        instrumentId: instrument.id,
        type: "INTEREST",
        dueDate: { lt: cutoff },
        status: "PLANNED",
      },
      orderBy: { dueDate: "asc" },
    });
    for (const ev of pastInterest.slice(0, Math.min(2, pastInterest.length))) {
      await prisma.cashEvent.update({
        where: { id: ev.id },
        data: { status: "PAID", paidDate: ev.dueDate },
      });
    }

    // Sample accrual + EIR for July 2026 for every instrument
    const periodStart = new Date("2026-07-01");
    const periodEnd = new Date("2026-08-01");
    const rateForAccrual = isFloating
      ? allInRateBps({
          indexFixingBps: spec.floating!.fixing + 18,
          spreadBps: spec.floating!.spread,
          floorBps: spec.floating!.floor,
        })
      : couponBps;
    const { interestCents, days } = accrueInterestCents({
      principalCents: spec.principal,
      rateBps: rateForAccrual,
      start: periodStart,
      end: periodEnd,
      dayCount: "ACT_360",
    });

    const expenseCode = spec.entityId === life.id && spec.type === "FUNDING_AGREEMENT" ? "7110" : "7100";
    const entityMeta =
      spec.entityId === life.id
        ? { companyCode: "ALIC", segmentCode: "LIFE", costCenter: "ALM" }
        : spec.entityId === re.id
          ? { companyCode: "ARE", segmentCode: "RE", costCenter: "TREASURY" }
          : { companyCode: "AHL", segmentCode: "CORP", costCenter: "TREASURY" };
    const productLine =
      spec.type === "FUNDING_AGREEMENT"
        ? "FA"
        : spec.type === "REVOLVER"
          ? "RCF"
          : spec.type === "SENIOR_NOTES"
            ? "NOTES"
            : spec.type === "TERM_LOAN"
              ? "TERM"
              : spec.type === "PREFERRED"
                ? "PREF"
                : "DEBT";
    const dim = { ...entityMeta, productLine, intercompany: "", projectCode: "" };

    const accrualJournal = await prisma.journalEntry.create({
      data: {
        entityId: spec.entityId,
        instrumentId: instrument.id,
        entryDate: periodEnd,
        memo: `Seed accrual ${spec.instrumentNumber}`,
        source: "accrual",
        status: "POSTED",
        lines: {
          create: [
            {
              accountCode: expenseCode,
              accountName: expenseCode === "7110" ? "Interest Expense — Funding Agreements" : "Interest Expense — Debt",
              debitCents: interestCents,
              creditCents: BigInt(0),
              ...dim,
            },
            {
              accountCode: "2150",
              accountName: "Accrued Interest Payable",
              debitCents: BigInt(0),
              creditCents: interestCents,
              ...dim,
            },
          ],
        },
      },
    });
    await prisma.accrualRun.create({
      data: {
        instrumentId: instrument.id,
        periodStart,
        periodEnd,
        rateBpsUsed: rateForAccrual,
        dayCountUsed: "ACT_360",
        days,
        interestCents,
        status: "POSTED",
        journalEntryId: accrualJournal.id,
      },
    });

    const eirRow = effectiveInterestPeriod({
      principalCents: spec.principal,
      unamortizedCostsCents: spec.costs,
      premiumDiscountCents: BigInt(0),
      effectiveYieldBps: eir,
      cashCouponRateBps: rateForAccrual,
      start: periodStart,
      end: periodEnd,
      dayCount: "ACT_360",
    });
    let amortJournalId: string | undefined;
    if (eirRow.amortizationCents !== BigInt(0)) {
      const amt =
        eirRow.amortizationCents < BigInt(0)
          ? -eirRow.amortizationCents
          : eirRow.amortizationCents;
      const positive = eirRow.amortizationCents > BigInt(0);
      const j = await prisma.journalEntry.create({
        data: {
          entityId: spec.entityId,
          instrumentId: instrument.id,
          entryDate: periodEnd,
          memo: `Seed EIR amort ${spec.instrumentNumber}`,
          source: "amortization",
          status: "POSTED",
          lines: {
            create: positive
              ? [
                  {
                    accountCode: "7100",
                    accountName: "Interest Expense — Debt",
                    debitCents: amt,
                    creditCents: BigInt(0),
                    ...dim,
                  },
                  {
                    accountCode: "1450",
                    accountName: "Unamortized Debt Issuance Costs",
                    debitCents: BigInt(0),
                    creditCents: amt,
                    ...dim,
                  },
                ]
              : [
                  {
                    accountCode: "1450",
                    accountName: "Unamortized Debt Issuance Costs",
                    debitCents: amt,
                    creditCents: BigInt(0),
                    ...dim,
                  },
                  {
                    accountCode: "7100",
                    accountName: "Interest Expense — Debt",
                    debitCents: BigInt(0),
                    creditCents: amt,
                    ...dim,
                  },
                ],
          },
        },
      });
      amortJournalId = j.id;
    }
    await prisma.debtInstrument.update({
      where: { id: instrument.id },
      data: {
        unamortizedCosts: eirRow.closingUnamortizedCostsCents,
        premiumDiscount: eirRow.closingPremiumDiscountCents,
      },
    });
    await prisma.amortizationRow.create({
      data: {
        instrumentId: instrument.id,
        periodEnd,
        openingCarryingCents: eirRow.openingCarryingCents,
        cashInterestCents: eirRow.cashInterestCents,
        effectiveInterestCents: eirRow.effectiveInterestCents,
        amortizationCents: eirRow.amortizationCents,
        closingCarryingCents: eirRow.closingCarryingCents,
        effectiveYieldBps: eir,
        journalEntryId: amortJournalId,
      },
    });
  }

  // Revolver mid-month activity
  const rcf = await prisma.debtInstrument.findUniqueOrThrow({
    where: { instrumentNumber: "RCF-2023" },
  });
  const drawAmt = usd(5_000_000);
  await prisma.revolverActivity.create({
    data: {
      instrumentId: rcf.id,
      activityDate: new Date("2026-08-10"),
      type: "DRAW",
      amountCents: drawAmt,
      balanceAfterCents: rcf.currentPrincipal + drawAmt,
      ourBalanceBeforeCents: rcf.currentPrincipal,
      notes: "Seed mid-month draw",
    },
  });
  const afterDraw = rcf.currentPrincipal + drawAmt;
  await prisma.debtInstrument.update({
    where: { id: rcf.id },
    data: { currentPrincipal: afterDraw },
  });
  const trueUpDelta = usd(-250_000);
  await prisma.revolverActivity.create({
    data: {
      instrumentId: rcf.id,
      activityDate: new Date("2026-08-20"),
      type: "TRUE_UP",
      amountCents: trueUpDelta,
      ourBalanceBeforeCents: afterDraw,
      bankBalanceCents: afterDraw + trueUpDelta,
      balanceAfterCents: afterDraw + trueUpDelta,
      notes: "Seed true-up to bank statement",
    },
  });
  await prisma.debtInstrument.update({
    where: { id: rcf.id },
    data: { currentPrincipal: afterDraw + trueUpDelta },
  });

  const now = new Date();
  const periodLabel = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  await prisma.monthlyClose.create({
    data: {
      periodLabel,
      periodStart,
      periodEnd,
      status: "IN_PROGRESS",
      steps: {
        create: [
          { stepKey: "NEW_DEBT", sortOrder: 1, status: "IN_PROGRESS" },
          { stepKey: "UPFRONT_COSTS", sortOrder: 2, status: "PENDING" },
          { stepKey: "REVOLVER_ACTIVITY", sortOrder: 3, status: "PENDING" },
          { stepKey: "RATE_UPDATES", sortOrder: 4, status: "PENDING" },
          { stepKey: "PAYMENTS", sortOrder: 5, status: "PENDING" },
          { stepKey: "ACCRUALS", sortOrder: 6, status: "PENDING" },
          { stepKey: "GL_EXPORT", sortOrder: 7, status: "PENDING" },
        ],
      },
    },
  });

  await prisma.covenantDefinition.create({
    data: {
      name: "Holding Company Leverage",
      metricKey: "leverage",
      entityId: holdings.id,
      threshold: 0.35,
      operator: "lte",
      frequency: "quarterly",
      notes: "Placeholder for future covenant compliance engine",
    },
  });
  await prisma.covenantDefinition.create({
    data: {
      name: "Consolidated Interest Coverage",
      metricKey: "interest_coverage",
      entityId: null,
      threshold: 2.0,
      operator: "gte",
      frequency: "quarterly",
      notes: "Placeholder — engine not active in MVP",
    },
  });

  console.log(`Seeded ${instruments.length} instruments + COA (${coa.length} accounts) + GL mappings.`);
  console.log("Users: admin@aspida.local / accountant@aspida.local / viewer@aspida.local");
  console.log("Password: password123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
