import { prisma } from "./db";
import {
  EMPTY_DIMENSIONS,
  mergeDimensions,
  productLineForInstrumentType,
  type GlDimensions,
} from "./dimensions";

export const TRANSACTION_TYPES = [
  {
    type: "INTEREST_ACCRUAL",
    label: "Interest accrual",
    description: "Dr Interest expense / Cr Accrued interest payable",
  },
  {
    type: "INTEREST_PAYMENT",
    label: "Interest payment",
    description: "Dr Accrued interest payable / Cr Cash",
  },
  {
    type: "PRINCIPAL_PAYMENT",
    label: "Principal payment",
    description: "Dr Debt payable / Cr Cash",
  },
  {
    type: "EIR_AMORTIZATION",
    label: "Effective interest amortization",
    description: "Dr Interest expense / Cr Unamortized issuance costs (typical)",
  },
  {
    type: "UPFRONT_COSTS",
    label: "Upfront / issuance costs",
    description: "Dr Unamortized debt issuance costs / Cr Cash (capitalize fees paid)",
  },
  {
    type: "REVOLVER_DRAW",
    label: "Revolver draw",
    description: "Dr Cash / Cr Debt payable",
  },
  {
    type: "REVOLVER_REPAY",
    label: "Revolver repayment",
    description: "Dr Debt payable / Cr Cash",
  },
  {
    type: "REVOLVER_TRUE_UP_INCREASE",
    label: "Revolver true-up (increase)",
    description: "Dr Cash / Cr Debt payable when bank balance is higher",
  },
  {
    type: "REVOLVER_TRUE_UP_DECREASE",
    label: "Revolver true-up (decrease)",
    description: "Dr Debt payable / Cr Cash when bank balance is lower",
  },
] as const;

export type TransactionType = (typeof TRANSACTION_TYPES)[number]["type"];

export type ResolvedGlSide = {
  code: string;
  name: string;
};

export async function resolveGlMapping(
  transactionType: string,
  entityId?: string,
  instrumentId?: string,
): Promise<{
  debit: ResolvedGlSide;
  credit: ResolvedGlSide;
  mappingId: string;
  dimensions: GlDimensions;
}> {
  const entityKey = entityId ?? "*";
  const mapping =
    (await prisma.glAccountMapping.findFirst({
      where: { transactionType, entityKey, active: true },
      include: { debitAccount: true, creditAccount: true },
    })) ??
    (await prisma.glAccountMapping.findFirst({
      where: { transactionType, entityKey: "*", active: true },
      include: { debitAccount: true, creditAccount: true },
    }));

  if (!mapping) {
    throw new Error(
      `No GL mapping for transaction type "${transactionType}". Configure it under GL Mapping.`,
    );
  }

  const entity = entityId
    ? await prisma.entity.findUnique({ where: { id: entityId } })
    : null;
  const instrument = instrumentId
    ? await prisma.debtInstrument.findUnique({ where: { id: instrumentId } })
    : null;

  const dimensions = mergeDimensions(
    {
      companyCode: entity?.companyCode || entity?.code || "",
      segmentCode: entity?.segmentCode || "",
      productLine: instrument ? productLineForInstrumentType(instrument.type) : "",
    },
    {
      companyCode: mapping.companyCode,
      segmentCode: mapping.segmentCode,
      costCenter: mapping.costCenter,
      productLine: mapping.productLine,
      intercompany: mapping.intercompany,
      projectCode: mapping.projectCode,
    },
  );

  return {
    mappingId: mapping.id,
    debit: { code: mapping.debitAccount.code, name: mapping.debitAccount.name },
    credit: {
      code: mapping.creditAccount.code,
      name: mapping.creditAccount.name,
    },
    dimensions,
  };
}

export async function postMappedJournal(params: {
  entityId: string;
  instrumentId?: string;
  entryDate: Date;
  memo: string;
  source: string;
  transactionType: string;
  amountCents: bigint;
  reverse?: boolean;
  monthlyCloseId?: string;
  dimensionOverrides?: Partial<GlDimensions>;
}) {
  if (params.amountCents === BigInt(0)) {
    throw new Error("Cannot post a zero-amount journal");
  }
  const amount =
    params.amountCents < BigInt(0) ? -params.amountCents : params.amountCents;
  const mapping = await resolveGlMapping(
    params.transactionType,
    params.entityId,
    params.instrumentId,
  );
  const dims = mergeDimensions(mapping.dimensions, params.dimensionOverrides);
  const debit = params.reverse ? mapping.credit : mapping.debit;
  const credit = params.reverse ? mapping.debit : mapping.credit;

  return prisma.journalEntry.create({
    data: {
      entityId: params.entityId,
      instrumentId: params.instrumentId,
      monthlyCloseId: params.monthlyCloseId,
      entryDate: params.entryDate,
      memo: params.memo,
      source: params.source,
      status: "POSTED",
      lines: {
        create: [
          {
            accountCode: debit.code,
            accountName: debit.name,
            debitCents: amount,
            creditCents: BigInt(0),
            ...dims,
          },
          {
            accountCode: credit.code,
            accountName: credit.name,
            debitCents: BigInt(0),
            creditCents: amount,
            ...dims,
          },
        ],
      },
    },
    include: { lines: true },
  });
}

export const Accounts = {
  INTEREST_EXPENSE: { code: "7100", name: "Interest Expense — Debt" },
  ACCRUED_INTEREST: { code: "2150", name: "Accrued Interest Payable" },
  DEBT_LIABILITY: { code: "2100", name: "Notes & Loans Payable" },
  CASH: { code: "1000", name: "Cash — Operating" },
  DEBT_ISSUANCE_COSTS: { code: "1450", name: "Unamortized Debt Issuance Costs" },
  PREMIUM_DISCOUNT: { code: "2110", name: "Debt Premium / Discount" },
} as const;

export { EMPTY_DIMENSIONS };
