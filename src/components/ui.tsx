import { formatMoney, formatMoneyPrecise } from "@/lib/money";

export function PageTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-8">
      <h1 className="font-display text-4xl text-secondary md:text-5xl">{title}</h1>
      {subtitle ? <p className="mt-2 max-w-2xl text-body">{subtitle}</p> : null}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="border-t-4 border-primary bg-white px-5 py-4">
      <div className="text-nav text-body">{label}</div>
      <div className="mt-2 text-2xl font-bold text-secondary">{value}</div>
      {hint ? <div className="mt-1 text-xs text-body">{hint}</div> : null}
    </div>
  );
}

export function Money({ cents, precise = false }: { cents: bigint | number; precise?: boolean }) {
  return <span>{precise ? formatMoneyPrecise(cents) : formatMoney(cents)}</span>;
}

export function Badge({ children, tone = "pink" }: { children: React.ReactNode; tone?: "pink" | "navy" | "teal" }) {
  const colors =
    tone === "teal"
      ? "bg-teal/15 text-secondary"
      : tone === "navy"
        ? "bg-secondary text-white"
        : "bg-primary/10 text-primary";
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-[11px] font-bold tracking-wide uppercase ${colors}`}>
      {children}
    </span>
  );
}

export function DataTable({
  headers,
  children,
}: {
  headers: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto border border-border bg-white">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-light-gray">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-4 py-3 text-nav text-secondary">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border text-body">{children}</tbody>
      </table>
    </div>
  );
}
