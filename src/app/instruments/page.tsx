import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { AppShell } from "@/components/AppShell";
import { Badge, DataTable, Money, PageTitle } from "@/components/ui";
import { format } from "date-fns";

export default async function InstrumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ entityId?: string; type?: string; rate?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  const { entityId, type, rate } = await searchParams;
  const entities = await prisma.entity.findMany({ orderBy: { code: "asc" } });

  const instruments = await prisma.debtInstrument.findMany({
    where: {
      status: "ACTIVE",
      ...(entityId ? { entityId } : {}),
      ...(type ? { type: type as never } : {}),
      ...(rate ? { rateTerm: { rateType: rate as never } } : {}),
    },
    include: { entity: true, rateTerm: true },
    orderBy: { instrumentNumber: "asc" },
  });

  const allActive = type || rate
    ? await prisma.debtInstrument.findMany({
        where: { status: "ACTIVE", ...(entityId ? { entityId } : {}) },
        include: { rateTerm: true },
      })
    : instruments;

  const totalPrincipal = allActive.reduce((s, i) => s + i.currentPrincipal, BigInt(0));
  const faPrincipal = allActive
    .filter((i) => i.type === "FUNDING_AGREEMENT")
    .reduce((s, i) => s + i.currentPrincipal, BigInt(0));
  const floatingPrincipal = allActive
    .filter((i) => i.rateTerm?.rateType === "FLOATING")
    .reduce((s, i) => s + i.currentPrincipal, BigInt(0));

  const q = new URLSearchParams();
  if (entityId) q.set("entityId", entityId);
  const qStr = q.toString();

  return (
    <AppShell entityOptions={entities} entityId={entityId}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <PageTitle
          title="Debt book"
          subtitle={`${allActive.length} active instruments`}
        />
        <Link
          href={entityId ? `/monthly?entityId=${entityId}` : "/monthly"}
          className="bg-primary px-4 py-2 text-nav text-white hover:opacity-90"
        >
          Monthly process
        </Link>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Summary label="Outstanding" value={<Money cents={totalPrincipal} />} />
        <Summary
          label="Funding agreements"
          value={`${totalPrincipal > BigInt(0) ? ((Number(faPrincipal) / Number(totalPrincipal)) * 100).toFixed(0) : 0}%`}
        />
        <Summary
          label="Floating"
          value={`${totalPrincipal > BigInt(0) ? ((Number(floatingPrincipal) / Number(totalPrincipal)) * 100).toFixed(0) : 0}%`}
        />
        <Summary label="Shown" value={String(instruments.length)} />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {[
          { label: "All", href: `/instruments${qStr ? `?${qStr}` : ""}` },
          {
            label: "FAs",
            href: `/instruments?${new URLSearchParams({ ...Object.fromEntries(q), type: "FUNDING_AGREEMENT" })}`,
          },
          {
            label: "Floating",
            href: `/instruments?${new URLSearchParams({ ...Object.fromEntries(q), rate: "FLOATING" })}`,
          },
          {
            label: "Fixed",
            href: `/instruments?${new URLSearchParams({ ...Object.fromEntries(q), rate: "FIXED" })}`,
          },
        ].map((f) => (
          <Link
            key={f.label}
            href={f.href}
            className="border border-border bg-white px-3 py-1 text-nav text-secondary hover:border-primary hover:text-primary"
          >
            {f.label}
          </Link>
        ))}
      </div>

      <DataTable headers={["Instrument", "Entity", "Type", "Rate", "Principal", "Maturity", ""]}>
        {instruments.map((i) => (
          <tr key={i.id}>
            <td className="px-4 py-3">
              <div className="font-semibold text-secondary">{i.instrumentNumber}</div>
              <div className="text-xs text-body">{i.name}</div>
            </td>
            <td className="px-4 py-3">{i.entity.code}</td>
            <td className="px-4 py-3">
              <Badge tone={i.type === "FUNDING_AGREEMENT" ? "pink" : "navy"}>
                {i.type.replaceAll("_", " ")}
              </Badge>
            </td>
            <td className="px-4 py-3 text-sm">
              {i.rateTerm?.rateType === "FLOATING"
                ? `${i.rateTerm.indexName}+${((i.rateTerm.spreadBps ?? 0) / 100).toFixed(2)}%`
                : `${((i.rateTerm?.fixedRateBps ?? 0) / 100).toFixed(2)}%`}
            </td>
            <td className="px-4 py-3">
              <Money cents={i.currentPrincipal} />
            </td>
            <td className="px-4 py-3">{format(i.maturityDate, "MMM yyyy")}</td>
            <td className="px-4 py-3">
              <Link href={`/instruments/${i.id}`} className="text-nav text-primary">
                Open
              </Link>
            </td>
          </tr>
        ))}
      </DataTable>
    </AppShell>
  );
}

function Summary({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border-t-2 border-primary bg-white px-3 py-3">
      <div className="text-nav text-body">{label}</div>
      <div className="mt-1 text-lg font-bold text-secondary">{value}</div>
    </div>
  );
}
