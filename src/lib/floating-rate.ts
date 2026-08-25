/**
 * Floating-rate helpers: index + spread with optional floor/cap.
 * All rates in basis points (1% = 100 bps).
 */

export function allInRateBps(params: {
  indexFixingBps: number;
  spreadBps: number;
  floorBps?: number | null;
  capBps?: number | null;
}): number {
  let allIn = params.indexFixingBps + params.spreadBps;
  if (params.floorBps != null) allIn = Math.max(allIn, params.floorBps);
  if (params.capBps != null) allIn = Math.min(allIn, params.capBps);
  return allIn;
}

export function findActiveObservation<
  T extends { effectiveDate: Date; endDate: Date | null },
>(observations: T[], asOf: Date): T | null {
  const sorted = [...observations].sort(
    (a, b) => a.effectiveDate.getTime() - b.effectiveDate.getTime(),
  );
  let active: T | null = null;
  for (const obs of sorted) {
    if (obs.effectiveDate <= asOf && (!obs.endDate || obs.endDate > asOf)) {
      active = obs;
    }
  }
  return active;
}
