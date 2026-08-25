import { prisma } from "./db";
import { postMappedJournal } from "./journal";

/**
 * Revolving credit facility: mid-month draws/repayments and bank true-ups.
 */

export async function recordRevolverDraw(params: {
  instrumentId: string;
  activityDate: Date;
  amountCents: bigint;
  notes?: string;
  monthlyCloseId?: string;
}) {
  const instrument = await prisma.debtInstrument.findUniqueOrThrow({
    where: { id: params.instrumentId },
  });
  if (instrument.type !== "REVOLVER") {
    throw new Error("Draws are only supported on revolving credit facilities");
  }
  if (params.amountCents <= BigInt(0)) throw new Error("Draw amount must be positive");

  const commitment = instrument.commitment ?? BigInt(0);
  const next = instrument.currentPrincipal + params.amountCents;
  if (commitment > BigInt(0) && next > commitment) {
    throw new Error(
      `Draw would exceed commitment (${commitment} cents). Requested balance ${next} cents.`,
    );
  }

  const journal = await postMappedJournal({
    entityId: instrument.entityId,
    instrumentId: instrument.id,
    entryDate: params.activityDate,
    memo: `Revolver draw ${instrument.instrumentNumber}`,
    source: "draw",
    transactionType: "REVOLVER_DRAW",
    amountCents: params.amountCents,
    monthlyCloseId: params.monthlyCloseId,
  });

  await prisma.debtInstrument.update({
    where: { id: instrument.id },
    data: { currentPrincipal: next },
  });

  const activity = await prisma.revolverActivity.create({
    data: {
      instrumentId: instrument.id,
      activityDate: params.activityDate,
      type: "DRAW",
      amountCents: params.amountCents,
      balanceAfterCents: next,
      ourBalanceBeforeCents: instrument.currentPrincipal,
      notes: params.notes,
      journalEntryId: journal.id,
    },
  });

  await prisma.auditEvent.create({
    data: {
      action: "REVOLVER_DRAW",
      entityType: "DebtInstrument",
      entityId: instrument.id,
      detail: `Drew ${params.amountCents} cents; balance now ${next}`,
    },
  });

  return activity;
}

export async function recordRevolverRepay(params: {
  instrumentId: string;
  activityDate: Date;
  amountCents: bigint;
  notes?: string;
  monthlyCloseId?: string;
}) {
  const instrument = await prisma.debtInstrument.findUniqueOrThrow({
    where: { id: params.instrumentId },
  });
  if (instrument.type !== "REVOLVER") {
    throw new Error("Repayments are only supported on revolving credit facilities");
  }
  if (params.amountCents <= BigInt(0)) throw new Error("Repay amount must be positive");
  if (params.amountCents > instrument.currentPrincipal) {
    throw new Error("Repayment exceeds drawn balance");
  }

  const next = instrument.currentPrincipal - params.amountCents;

  const journal = await postMappedJournal({
    entityId: instrument.entityId,
    instrumentId: instrument.id,
    entryDate: params.activityDate,
    memo: `Revolver repay ${instrument.instrumentNumber}`,
    source: "repay",
    transactionType: "REVOLVER_REPAY",
    amountCents: params.amountCents,
    monthlyCloseId: params.monthlyCloseId,
  });

  await prisma.debtInstrument.update({
    where: { id: instrument.id },
    data: { currentPrincipal: next },
  });

  const activity = await prisma.revolverActivity.create({
    data: {
      instrumentId: instrument.id,
      activityDate: params.activityDate,
      type: "REPAY",
      amountCents: params.amountCents,
      balanceAfterCents: next,
      ourBalanceBeforeCents: instrument.currentPrincipal,
      notes: params.notes,
      journalEntryId: journal.id,
    },
  });

  await prisma.auditEvent.create({
    data: {
      action: "REVOLVER_REPAY",
      entityType: "DebtInstrument",
      entityId: instrument.id,
      detail: `Repaid ${params.amountCents} cents; balance now ${next}`,
    },
  });

  return activity;
}

export async function trueUpRevolverToBank(params: {
  instrumentId: string;
  activityDate: Date;
  bankBalanceCents: bigint;
  notes?: string;
  monthlyCloseId?: string;
}) {
  const instrument = await prisma.debtInstrument.findUniqueOrThrow({
    where: { id: params.instrumentId },
  });
  if (instrument.type !== "REVOLVER") {
    throw new Error("True-up is only supported on revolving credit facilities");
  }

  const before = instrument.currentPrincipal;
  const bank = params.bankBalanceCents;
  const delta = bank - before;

  if (delta === BigInt(0)) {
    return prisma.revolverActivity.create({
      data: {
        instrumentId: instrument.id,
        activityDate: params.activityDate,
        type: "TRUE_UP",
        amountCents: BigInt(0),
        balanceAfterCents: before,
        bankBalanceCents: bank,
        ourBalanceBeforeCents: before,
        notes: params.notes ?? "Already matches bank balance",
      },
    });
  }

  const abs = delta < BigInt(0) ? -delta : delta;
  const journal = await postMappedJournal({
    entityId: instrument.entityId,
    instrumentId: instrument.id,
    entryDate: params.activityDate,
    memo: `Revolver bank true-up ${instrument.instrumentNumber}`,
    source: "true_up",
    transactionType:
      delta > BigInt(0) ? "REVOLVER_TRUE_UP_INCREASE" : "REVOLVER_TRUE_UP_DECREASE",
    amountCents: abs,
    monthlyCloseId: params.monthlyCloseId,
  });

  await prisma.debtInstrument.update({
    where: { id: instrument.id },
    data: { currentPrincipal: bank },
  });

  const activity = await prisma.revolverActivity.create({
    data: {
      instrumentId: instrument.id,
      activityDate: params.activityDate,
      type: "TRUE_UP",
      amountCents: delta,
      balanceAfterCents: bank,
      bankBalanceCents: bank,
      ourBalanceBeforeCents: before,
      notes: params.notes ?? `True-up from ${before} to bank ${bank}`,
      journalEntryId: journal.id,
    },
  });

  await prisma.auditEvent.create({
    data: {
      action: "REVOLVER_TRUE_UP",
      entityType: "DebtInstrument",
      entityId: instrument.id,
      detail: `True-up ${before} → ${bank} (delta ${delta})`,
    },
  });

  return activity;
}
