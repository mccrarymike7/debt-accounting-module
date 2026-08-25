"use client";

import Link from "next/link";

export function DetailTabs({
  instrumentId,
  tab,
}: {
  instrumentId: string;
  tab: "work" | "history";
}) {
  const items = [
    { id: "work" as const, label: "Work" },
    { id: "history" as const, label: "History" },
  ];
  return (
    <div className="mb-6 flex gap-2 border-b border-border">
      {items.map((item) => (
        <Link
          key={item.id}
          href={`/instruments/${instrumentId}?tab=${item.id}`}
          className={`px-3 py-2 text-nav ${
            tab === item.id
              ? "border-b-2 border-primary text-primary"
              : "text-body hover:text-secondary"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}
