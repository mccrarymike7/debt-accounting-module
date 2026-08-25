import Decimal from "decimal.js";

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export function cents(n: number | string | Decimal | bigint): bigint {
  if (typeof n === "bigint") return n;
  return BigInt(new Decimal(n).toFixed(0));
}

export function dollarsToCents(dollars: number | string): bigint {
  return BigInt(new Decimal(dollars).mul(100).toFixed(0));
}

export function formatMoney(centsValue: bigint | number, currency = "USD"): string {
  const n = Number(centsValue) / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(n);
}

export function formatMoneyPrecise(centsValue: bigint | number, currency = "USD"): string {
  const n = Number(centsValue) / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function bpsToDecimal(bps: number): Decimal {
  return new Decimal(bps).div(10_000);
}

export function carryingValueCents(
  principalCents: bigint,
  unamortizedCostsCents: bigint,
  premiumDiscountCents: bigint,
): bigint {
  // Carrying = principal - unamortized issuance costs + remaining premium (- discount)
  return principalCents - unamortizedCostsCents + premiumDiscountCents;
}

export { Decimal };
