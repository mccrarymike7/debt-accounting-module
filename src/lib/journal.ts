import { prisma } from "./db";
import { postMappedJournal, resolveGlMapping, Accounts } from "./gl-mapping";
import type { GlDimensions } from "./dimensions";
import { EMPTY_DIMENSIONS } from "./dimensions";

export { postMappedJournal, resolveGlMapping, Accounts };

export type JournalLineInput = {
  accountCode: string;
  accountName: string;
  debitCents: bigint;
  creditCents: bigint;
} & Partial<GlDimensions>;

/** Low-level balanced journal when mappings are already resolved into lines. */
export async function postBalancedJournal(params: {
  entityId: string;
  instrumentId?: string;
  entryDate: Date;
  memo: string;
  source: string;
  monthlyCloseId?: string;
  defaultDimensions?: Partial<GlDimensions>;
  lines: JournalLineInput[];
}) {
  const debits = params.lines.reduce((s, l) => s + l.debitCents, BigInt(0));
  const credits = params.lines.reduce((s, l) => s + l.creditCents, BigInt(0));
  if (debits !== credits) {
    throw new Error(`Unbalanced journal: debits ${debits} != credits ${credits}`);
  }

  const base = { ...EMPTY_DIMENSIONS, ...params.defaultDimensions };

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
        create: params.lines.map((l) => ({
          accountCode: l.accountCode,
          accountName: l.accountName,
          debitCents: l.debitCents,
          creditCents: l.creditCents,
          companyCode: l.companyCode ?? base.companyCode,
          segmentCode: l.segmentCode ?? base.segmentCode,
          costCenter: l.costCenter ?? base.costCenter,
          productLine: l.productLine ?? base.productLine,
          intercompany: l.intercompany ?? base.intercompany,
          projectCode: l.projectCode ?? base.projectCode,
        })),
      },
    },
    include: { lines: true },
  });
}
