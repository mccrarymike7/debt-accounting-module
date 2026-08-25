/**
 * Future-state debt covenant compliance.
 *
 * MVP stores CovenantDefinition / CovenantTest rows and free-text notes on instruments.
 * This module documents the intended API surface for a later engine — it does not
 * compute pass/fail in production yet.
 */

export type CovenantMetricKey = "leverage" | "interest_coverage" | "debt_to_capital" | string;

export type CovenantInputs = {
  totalDebtCents: bigint;
  totalCapitalCents?: bigint;
  ebitdaCents?: bigint;
  interestExpenseCents?: bigint;
};

export function evaluateCovenantStub(params: {
  metricKey: CovenantMetricKey;
  operator: "lte" | "gte" | string;
  threshold: number;
  inputs: CovenantInputs;
}): { status: "PENDING" | "PASS" | "FAIL" | "WATCH"; actualValue: number | null; note: string } {
  // Intentionally incomplete — wires metrics for future implementation.
  void params;
  return {
    status: "PENDING",
    actualValue: null,
    note: "Covenant compliance engine is a future-state capability.",
  };
}
