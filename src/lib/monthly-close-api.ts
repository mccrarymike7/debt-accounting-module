/**
 * Thin re-exports so the monthly API route stays readable.
 */
export {
  assertDateNotInLockedPeriod,
  assertMonthlyCloseWritable,
  closeMonthlyPeriod,
  completeMonthlyStep,
  createDebtInstrument,
  generateGlExportBatch,
  getOrCreateMonthlyClose,
  isMonthlyPeriodLocked,
  markMonthlyPosted,
  reopenMonthlyStep,
} from "./monthly-close";

import Decimal from "decimal.js";

export function dollarsToCentsFromBody(value: string | number): bigint {
  return BigInt(new Decimal(value).mul(100).toFixed(0));
}
