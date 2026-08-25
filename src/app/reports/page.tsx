import { redirect } from "next/navigation";
import { format } from "date-fns";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { AppShell } from "@/components/AppShell";
import { SetupTabs } from "@/components/SetupTabs";
import { DataTable, Money, PageTitle } from "@/components/ui";
import { carryingValueCents } from "@/lib/money";
import Link from "next/link";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ entityId?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  const { entityId } = await searchParams;
  const entities = await prisma.entity.findMany({ orderBy: { code: "asc" } });

  const instruments = await prisma.debtInstrument.findMany({
    where: {
      status: "ACTIVE",
      ...(entityId ? { entityId } : {}),
    },
    include: { entity: true, rateTerm: true },
    orderBy: { maturityDate: "asc" },
  });

  const opening = instruments.reduce((s, i) => s + i.originalPrincipal, BigInt(0));
  const outstanding = instruments.reduce((s, i) => s + i.currentPrincipal, BigInt(0));
  const carrying = instruments.reduce(
    (s, i) => s + carryingValueCents(i.currentPrincipal, i.unamortizedCosts, i.premiumDiscount),
    BigInt(0),
  );
  const costs = instruments.reduce((s, i) => s + i.unamortizedCosts, BigInt(0));

  const byYear = new Map<number, bigint>();
  for (const i of instruments) {
    const y = i.maturityDate.getUTCFullYear();
    byYear.set(y, (byYear.get(y) ?? BigInt(0)) + i.currentPrincipal);
  }

  const expenseByType = new Map<string, bigint>();
  for (const i of instruments) {
    const key = i.type;
    expenseByType.set(key, (expenseByType.get(key) ?? BigInt(0)) + i.currentPrincipal);
  }

  return (
    <AppShell entityOptions={entities} entityId={entityId}>
      <div className="mb-6 flex items-end justify-between gap-4">
        <PageTitle
          title="Reports"
          subtitle="Debt rollforward, maturity ladder, and composition by instrument type."
        />
        <Link
          href={`/api/export/rollforward${entityId ? `?entityId=${entityId}` : ""}`}
          className="border border-primary px-4 py-2 text-nav text-primary hover:bg-primary hover:text-white"
        >
          Export rollforward CSV
        </Link>
      </div>
      <SetupTabs active="reports" entityId={entityId} />

      <section className="mb-10">
        <h2 className="mb-4 font-display text-2xl text-secondary">Debt rollforward</h2>
        <div className="mb-4 grid gap-4 sm:grid-cols-4">
          <div className="border-t-4 border-primary bg-white px-4 py-3">
            <div className="text-nav text-body">Original / issued</div>
            <div className="text-lg font-bold">
              <Money cents={opening} />
            </div>
          </div>
          <div className="border-t-4 border-primary bg-white px-4 py-3">
            <div className="text-nav text-body">Outstanding</div>
            <div className="text-lg font-bold">
              <Money cents={outstanding} />
            </div>
          </div>
          <div className="border-t-4 border-primary bg-white px-4 py-3">
            <div className="text-nav text-body">Carrying value</div>
            <div className="text-lg font-bold">
              <Money cents={carrying} />
            </div>
          </div>
          <div className="border-t-4 border-primary bg-white px-4 py-3">
            <div className="text-nav text-body">Unamortized costs</div>
            <div className="text-lg font-bold">
              <Money cents={costs} precise />
            </div>
          </div>
        </div>
        <DataTable
          headers={["Instrument", "Entity", "Type", "Original", "Current", "Carrying", "Maturity"]}
        >
          {instruments.map((i) => (
            <tr key={i.id}>
              <td className="px-4 py-3">
                <Link href={`/instruments/${i.id}`} className="hover:text-primary">
                  {i.instrumentNumber}
                </Link>
              </td>
              <td className="px-4 py-3">{i.entity.code}</td>
              <td className="px-4 py-3">{i.type}</td>
              <td className="px-4 py-3">
                <Money cents={i.originalPrincipal} />
              </td>
              <td className="px-4 py-3">
                <Money cents={i.currentPrincipal} />
              </td>
              <td className="px-4 py-3">
                <Money
                  cents={carryingValueCents(i.currentPrincipal, i.unamortizedCosts, i.premiumDiscount)}
                />
              </td>
              <td className="px-4 py-3">{format(i.maturityDate, "yyyy-MM-dd")}</td>
            </tr>
          ))}
        </DataTable>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-4 font-display text-2xl text-secondary">Maturity ladder</h2>
          <DataTable headers={["Year", "Principal maturing"]}>
            {[...byYear.entries()]
              .sort((a, b) => a[0] - b[0])
              .map(([year, amt]) => (
                <tr key={year}>
                  <td className="px-4 py-3 font-semibold">{year}</td>
                  <td className="px-4 py-3">
                    <Money cents={amt} />
                  </td>
                </tr>
              ))}
          </DataTable>
        </section>
        <section>
          <h2 className="mb-4 font-display text-2xl text-secondary">Composition by type</h2>
          <DataTable headers={["Type", "Outstanding"]}>
            {[...expenseByType.entries()].map(([type, amt]) => (
              <tr key={type}>
                <td className="px-4 py-3">{type.replaceAll("_", " ")}</td>
                <td className="px-4 py-3">
                  <Money cents={amt} />
                </td>
              </tr>
            ))}
          </DataTable>
        </section>
      </div>
    </AppShell>
  );
}
