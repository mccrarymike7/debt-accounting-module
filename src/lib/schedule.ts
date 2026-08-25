import { addFrequency } from "./day-count";
import { accrueInterestCents } from "./interest";
import type { DayCountConvention } from "./day-count";

export type ScheduleItem = {
  dueDate: Date;
  type: "INTEREST" | "PRINCIPAL";
  interestCents: bigint;
  principalCents: bigint;
  amountCents: bigint;
};

export function generateInterestSchedule(params: {
  principalCents: bigint;
  rateBps: number;
  startDate: Date;
  maturityDate: Date;
  paymentFrequency: "MONTHLY" | "QUARTERLY" | "SEMI_ANNUAL" | "ANNUAL";
  dayCount: DayCountConvention;
  bulletPrincipal?: boolean;
}): ScheduleItem[] {
  const items: ScheduleItem[] = [];
  let cursor = new Date(params.startDate);
  const maturity = new Date(params.maturityDate);

  while (cursor < maturity) {
    const next = addFrequency(cursor, params.paymentFrequency);
    const end = next > maturity ? maturity : next;
    const { interestCents } = accrueInterestCents({
      principalCents: params.principalCents,
      rateBps: params.rateBps,
      start: cursor,
      end,
      dayCount: params.dayCount,
    });
    items.push({
      dueDate: end,
      type: "INTEREST",
      interestCents,
      principalCents: BigInt(0),
      amountCents: interestCents,
    });
    cursor = end;
    if (end.getTime() === maturity.getTime()) break;
  }

  if (params.bulletPrincipal !== false) {
    items.push({
      dueDate: maturity,
      type: "PRINCIPAL",
      interestCents: BigInt(0),
      principalCents: params.principalCents,
      amountCents: params.principalCents,
    });
  }

  return items;
}
