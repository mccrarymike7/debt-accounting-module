import Decimal from "decimal.js";
import { bpsToDecimal, carryingValueCents } from "./money";
import { yearFraction, type DayCountConvention } from "./day-count";

/**
 * Effective interest method:
 * Interest expense = carrying amount × effective yield × year fraction
 * Amortization of costs/discount = effective interest − cash coupon
 * (sign flips for premium)
 */

export function solveEffectiveYieldBps(params: {
  principalCents: bigint;
  issuanceCostsCents: bigint;
  premiumDiscountCents: bigint; // + premium, − discount at issuance
  couponRateBps: number;
  maturityDate: Date;
  issueDate: Date;
  dayCount: DayCountConvention;
}): number {
  const n = yearFraction(params.issueDate, params.maturityDate, params.dayCount).yearFraction;
  if (n <= 0) return params.couponRateBps;

  const face = new Decimal(params.principalCents.toString());
  const proceeds = face
    .minus(params.issuanceCostsCents.toString())
    .plus(params.premiumDiscountCents.toString());

  if (proceeds.lte(0)) return params.couponRateBps;

  // Approximate constant yield: solve (1+y)^n = face/proceeds adjusted for coupons via IRR-lite
  // For MVP use closed-form when interest-only bullet: y ≈ coupon + (face-proceeds)/(proceeds*n)
  const couponAnnual = face.mul(bpsToDecimal(params.couponRateBps));
  const avgCapital = proceeds;
  const accretion = face.minus(proceeds).div(n);
  const y = couponAnnual.plus(accretion).div(avgCapital);
  return Math.round(y.mul(10_000).toNumber());
}

export function effectiveInterestPeriod(params: {
  principalCents: bigint;
  unamortizedCostsCents: bigint;
  premiumDiscountCents: bigint;
  effectiveYieldBps: number;
  cashCouponRateBps: number;
  start: Date;
  end: Date;
  dayCount: DayCountConvention;
}): {
  openingCarryingCents: bigint;
  cashInterestCents: bigint;
  effectiveInterestCents: bigint;
  amortizationCents: bigint;
  closingCarryingCents: bigint;
  closingUnamortizedCostsCents: bigint;
  closingPremiumDiscountCents: bigint;
} {
  const opening = carryingValueCents(
    params.principalCents,
    params.unamortizedCostsCents,
    params.premiumDiscountCents,
  );
  const { yearFraction: yf } = yearFraction(params.start, params.end, params.dayCount);

  const effectiveInterest = new Decimal(opening.toString())
    .mul(bpsToDecimal(params.effectiveYieldBps))
    .mul(yf)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

  const cashInterest = new Decimal(params.principalCents.toString())
    .mul(bpsToDecimal(params.cashCouponRateBps))
    .mul(yf)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

  const amortization = BigInt(effectiveInterest.toFixed(0)) - BigInt(cashInterest.toFixed(0));

  // Amortization reduces unamortized costs (when costs > 0) or adjusts premium/discount
  let costs = params.unamortizedCostsCents;
  let prem = params.premiumDiscountCents;

  if (costs > BigInt(0)) {
    const apply = amortization > BigInt(0) ? amortization : BigInt(0);
    const used = apply > costs ? costs : apply;
    costs -= used;
    // residual amortization (e.g. discount) applied to premiumDiscount
    const residual = amortization - used;
    prem += residual;
  } else {
    prem += amortization;
  }

  const closing = carryingValueCents(params.principalCents, costs, prem);

  return {
    openingCarryingCents: opening,
    cashInterestCents: BigInt(cashInterest.toFixed(0)),
    effectiveInterestCents: BigInt(effectiveInterest.toFixed(0)),
    amortizationCents: amortization,
    closingCarryingCents: closing,
    closingUnamortizedCostsCents: costs,
    closingPremiumDiscountCents: prem,
  };
}

/** Prospectively update effective yield after a floating coupon reset */
export function prospectiveEffectiveYieldBps(params: {
  currentCarryingCents: bigint;
  principalCents: bigint;
  newCouponRateBps: number;
  remainingYears: number;
}): number {
  if (params.remainingYears <= 0 || params.currentCarryingCents <= BigInt(0)) {
    return params.newCouponRateBps;
  }
  const face = new Decimal(params.principalCents.toString());
  const carrying = new Decimal(params.currentCarryingCents.toString());
  const couponAnnual = face.mul(bpsToDecimal(params.newCouponRateBps));
  const accretion = face.minus(carrying).div(params.remainingYears);
  const y = couponAnnual.plus(accretion).div(carrying);
  return Math.round(y.mul(10_000).toNumber());
}
