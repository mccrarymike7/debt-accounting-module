"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

export function EntitySwitcher({
  entities,
  value,
}: {
  entities: { id: string; code: string; name: string }[];
  value?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <div className="flex items-center gap-2">
      <label className="text-nav text-body">Entity</label>
      <select
        className="rounded border border-border bg-white px-2 py-1 text-sm text-secondary"
        value={value ?? ""}
        onChange={(e) => {
          const params = new URLSearchParams(searchParams.toString());
          if (e.target.value) params.set("entityId", e.target.value);
          else params.delete("entityId");
          router.push(`${pathname}?${params.toString()}`);
        }}
      >
        <option value="">All entities</option>
        {entities.map((ent) => (
          <option key={ent.id} value={ent.id}>
            {ent.code} — {ent.name}
          </option>
        ))}
      </select>
    </div>
  );
}
