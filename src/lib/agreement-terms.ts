/**
 * Terms templates for agreement PDF review / approval.
 * These shapes prepopulate the review forms and feed create APIs on approve.
 */

export type DebtInstrumentType =
  | "FUNDING_AGREEMENT"
  | "TERM_LOAN"
  | "REVOLVER"
  | "SENIOR_NOTES"
  | "PREFERRED"
  | "OTHER";

export type DebtTermsDraft = {
  entityId?: string;
  name?: string;
  instrumentNumber?: string;
  type?: DebtInstrumentType;
  counterparty?: string;
  issueDate?: string; // yyyy-MM-dd
  maturityDate?: string;
  principalDollars?: string;
  issuanceCostsDollars?: string;
  commitmentDollars?: string;
  unusedFeeRateBps?: string;
  rateType?: "FIXED" | "FLOATING";
  fixedRateBps?: string;
  indexName?: string;
  spreadBps?: string;
  indexFixingBps?: string;
  floorBps?: string;
  paymentFrequency?: "MONTHLY" | "QUARTERLY" | "SEMI_ANNUAL" | "ANNUAL";
  resetFrequency?: "MONTHLY" | "QUARTERLY" | "SEMI_ANNUAL" | "ANNUAL";
  dayCount?: "ACT_360" | "ACT_365" | "THIRTY_360";
  covenantNotes?: string;
};

export type CovenantDefinitionDraft = {
  name?: string;
  metricKey?: string;
  entityId?: string | null;
  threshold?: string;
  operator?: "lte" | "gte";
  frequency?: string;
  notes?: string;
};

export type CovenantTermsDraft = {
  packageName?: string;
  entityId?: string | null;
  definitions: CovenantDefinitionDraft[];
};

export type FieldConfidence = Record<string, number>;

export type ExtractionResult<T> = {
  terms: T;
  confidence: FieldConfidence;
  notes: string[];
  method: "heuristic" | "llm" | "heuristic+llm";
};

export const emptyDebtTerms = (): DebtTermsDraft => ({
  type: "FUNDING_AGREEMENT",
  rateType: "FLOATING",
  indexName: "SOFR",
  paymentFrequency: "QUARTERLY",
  resetFrequency: "QUARTERLY",
  dayCount: "ACT_360",
  issuanceCostsDollars: "0",
  indexFixingBps: "0",
});

export const emptyCovenantTerms = (): CovenantTermsDraft => ({
  definitions: [
    {
      name: "",
      metricKey: "leverage",
      operator: "lte",
      threshold: "",
      frequency: "quarterly",
    },
  ],
});

export function mergeDebtTerms(
  base: DebtTermsDraft,
  overlay: Partial<DebtTermsDraft>,
): DebtTermsDraft {
  return { ...base, ...overlay };
}
