/** Calendar-month bounds in UTC for a YYYY-MM label. */
export function periodBounds(periodLabel: string): {
  periodStart: Date;
  /** Exclusive end (first day of next month) for range queries */
  periodEndExclusive: Date;
  periodLastDay: Date;
} {
  const [y, m] = periodLabel.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) {
    throw new Error("Period must be YYYY-MM");
  }
  const periodStart = new Date(Date.UTC(y, m - 1, 1));
  const periodEndExclusive = new Date(Date.UTC(y, m, 1));
  const periodLastDay = new Date(Date.UTC(y, m, 0));
  return { periodStart, periodEndExclusive, periodLastDay };
}

export function currentPeriodLabel(asOf = new Date()): string {
  return `${asOf.getUTCFullYear()}-${String(asOf.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function toPeriodLabel(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function formatPeriodLabel(period: string) {
  const [y, m] = period.split("-").map(Number);
  if (!y || !m) return period;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Build a list of YYYY-MM from a set of dates, plus current month, newest first. */
export function collectPeriodOptions(dates: Date[], extras: string[] = []): string[] {
  const set = new Set<string>([...extras, currentPeriodLabel()]);
  for (const d of dates) set.add(toPeriodLabel(d));
  return [...set].sort((a, b) => b.localeCompare(a));
}
