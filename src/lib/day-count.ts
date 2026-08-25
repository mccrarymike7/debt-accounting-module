import { differenceInCalendarDays, getDaysInMonth } from "date-fns";

export type DayCountConvention = "ACT_360" | "ACT_365" | "THIRTY_360";

export function yearFraction(
  start: Date,
  end: Date,
  convention: DayCountConvention,
): { days: number; yearFraction: number } {
  if (end <= start) return { days: 0, yearFraction: 0 };

  if (convention === "THIRTY_360") {
    const d1 = Math.min(start.getUTCDate(), 30);
    let d2 = end.getUTCDate();
    if (d1 === 30 || d1 === 31) d2 = Math.min(d2, 30);
    const days =
      360 * (end.getUTCFullYear() - start.getUTCFullYear()) +
      30 * (end.getUTCMonth() - start.getUTCMonth()) +
      (d2 - d1);
    return { days, yearFraction: days / 360 };
  }

  const days = differenceInCalendarDays(end, start);
  const denom = convention === "ACT_365" ? 365 : 360;
  return { days, yearFraction: days / denom };
}

export function addFrequency(date: Date, frequency: string): Date {
  const d = new Date(date);
  switch (frequency) {
    case "DAILY":
      d.setUTCDate(d.getUTCDate() + 1);
      break;
    case "MONTHLY":
      d.setUTCMonth(d.getUTCMonth() + 1);
      break;
    case "QUARTERLY":
      d.setUTCMonth(d.getUTCMonth() + 3);
      break;
    case "SEMI_ANNUAL":
      d.setUTCMonth(d.getUTCMonth() + 6);
      break;
    case "ANNUAL":
      d.setUTCFullYear(d.getUTCFullYear() + 1);
      break;
    default:
      d.setUTCMonth(d.getUTCMonth() + 3);
  }
  // Clamp day for month ends
  const dim = getDaysInMonth(d);
  if (d.getUTCDate() > dim) d.setUTCDate(dim);
  return d;
}
