"use client";

import { useId } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { formatPeriodLabel } from "@/lib/period";

export function MonthPicker({
  value,
  months,
}: {
  value: string;
  /** Optional suggested YYYY-MM labels (datalist) */
  months?: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const listId = useId();

  function setMonth(period: string) {
    if (!/^\d{4}-\d{2}$/.test(period)) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", period);
    router.push(`${pathname}?${params.toString()}`);
  }

  const suggestions = months?.length
    ? months.includes(value)
      ? months
      : [value, ...months]
    : undefined;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="text-nav text-body" htmlFor={listId}>
        Month
      </label>
      <input
        id={listId}
        type="month"
        className="border border-border bg-white px-2 py-1.5 text-sm text-secondary"
        value={value}
        list={suggestions ? `${listId}-opts` : undefined}
        onChange={(e) => setMonth(e.target.value)}
        aria-label={`Select month (${formatPeriodLabel(value)})`}
      />
      {suggestions ? (
        <datalist id={`${listId}-opts`}>
          {suggestions.map((m) => (
            <option key={m} value={m} label={formatPeriodLabel(m)} />
          ))}
        </datalist>
      ) : null}
    </div>
  );
}
