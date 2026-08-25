import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { AppShell } from "@/components/AppShell";
import { SetupTabs } from "@/components/SetupTabs";
import { Badge, DataTable, PageTitle } from "@/components/ui";
import { evaluateCovenantStub } from "@/lib/covenants";

export default async function CovenantsPage({
  searchParams,
}: {
  searchParams: Promise<{ entityId?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  const { entityId } = await searchParams;
  const entities = await prisma.entity.findMany({ orderBy: { code: "asc" } });

  const definitions = await prisma.covenantDefinition.findMany({
    include: { tests: { orderBy: { testDate: "desc" }, take: 5 } },
    orderBy: { name: "asc" },
  });

  const preview = definitions.map((d) => ({
    definition: d,
    preview: evaluateCovenantStub({
      metricKey: d.metricKey,
      operator: d.operator,
      threshold: d.threshold,
      inputs: {
        totalDebtCents: BigInt(0),
        totalCapitalCents: BigInt(0),
        ebitdaCents: BigInt(0),
        interestExpenseCents: BigInt(0),
      },
    }),
  }));

  return (
    <AppShell entityOptions={entities} entityId={entityId}>
      <div className="mb-6 border-l-4 border-teal bg-white px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="teal">Future state</Badge>
          <span className="text-nav text-secondary">Covenant compliance engine</span>
        </div>
        <p className="mt-2 max-w-3xl text-sm text-body">
          This view is visible so the team can see planned covenant coverage, but calculations are
          not active yet. Definitions and test history are stored; pass/fail scoring, breach alerts,
          and consolidated vs entity tests ship in a later release.
        </p>
      </div>

      <PageTitle
        title="Covenants"
        subtitle="Planned leverage, coverage, and other debt covenant tests — engine coming later."
      />
      <SetupTabs active="covenants" entityId={entityId} />

      <section className="mb-10">
        <h2 className="mb-4 font-display text-2xl text-secondary">Definitions on file</h2>
        <DataTable
          headers={["Name", "Metric", "Scope", "Test", "Frequency", "Engine status", "Recent tests"]}
        >
          {preview.map(({ definition: d, preview: p }) => (
            <tr key={d.id} className="opacity-90">
              <td className="px-4 py-3 font-semibold text-secondary">{d.name}</td>
              <td className="px-4 py-3">{d.metricKey}</td>
              <td className="px-4 py-3">
                {d.entityId
                  ? entities.find((e) => e.id === d.entityId)?.code ?? "Entity"
                  : "Consolidated"}
              </td>
              <td className="px-4 py-3">
                {d.operator} {d.threshold}
              </td>
              <td className="px-4 py-3">{d.frequency}</td>
              <td className="px-4 py-3">
                <Badge tone="teal">{p.status}</Badge>
              </td>
              <td className="px-4 py-3 text-xs text-body">{d.tests.length || "None yet"}</td>
            </tr>
          ))}
        </DataTable>
      </section>

      <section className="border border-dashed border-border bg-light-gray/60 p-6">
        <h2 className="font-display text-2xl text-secondary">Coming in the covenant engine</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-body">
          <li>Automated metric pulls from this module and the GL</li>
          <li>Quarterly / monthly test runs with PASS / FAIL / WATCH</li>
          <li>Entity-level and consolidated holding-company tests</li>
          <li>Breach notifications and remediation tracking</li>
          <li>Link from instrument covenant notes to live tests</li>
        </ul>
        <p className="mt-4 text-xs text-body">{preview[0]?.preview.note}</p>
      </section>
    </AppShell>
  );
}
