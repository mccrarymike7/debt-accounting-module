/**
 * Reference-rate display / entry helpers.
 * Internal calculations continue to use integer basis points (1% = 100 bps).
 * `decimalPlaces` controls how percent values are shown and parsed from public sources.
 */

export function percentFromBps(bps: number, decimalPlaces = 2): string {
  const pct = bps / 100;
  return pct.toFixed(Math.max(0, Math.min(8, decimalPlaces)));
}

/** Parse a percent string (e.g. "4.32100") into integer bps, rounded to nearest bp. */
export function bpsFromPercentInput(value: string, decimalPlaces = 2): number {
  const cleaned = value.trim().replace(/%/g, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) throw new Error("Invalid rate percent");
  const factor = 10 ** Math.max(0, Math.min(8, decimalPlaces));
  const roundedPct = Math.round(n * factor) / factor;
  return Math.round(roundedPct * 100);
}

export function formatBpsAsPercentLabel(bps: number, decimalPlaces = 2): string {
  return `${percentFromBps(bps, decimalPlaces)}%`;
}
