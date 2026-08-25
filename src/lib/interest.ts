import { Decimal, bpsToDecimal } from "./money";
import { yearFraction, type DayCountConvention } from "./day-count";

/** Simple interest for a period: principal * rate * yearFraction */
export function accrueInterestCents(params: {
  principalCents: bigint;
  rateBps: number;
  start: Date;
  end: Date;
  dayCount: DayCountConvention;
}): { interestCents: bigint; days: number; yearFraction: number } {
  const { days, yearFraction: yf } = yearFraction(params.start, params.end, params.dayCount);
  const interest = new Decimal(params.principalCents.toString())
    .mul(bpsToDecimal(params.rateBps))
    .mul(yf)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  return { interestCents: BigInt(interest.toFixed(0)), days, yearFraction: yf };
}
