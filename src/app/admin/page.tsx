import { redirect } from "next/navigation";
import { auth, canAdmin } from "@/auth";
import { prisma } from "@/lib/db";
import { AppShell } from "@/components/AppShell";
import { SetupTabs } from "@/components/SetupTabs";
import { Badge, DataTable, PageTitle } from "@/components/ui";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ entityId?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  const { entityId } = await searchParams;
  const entities = await prisma.entity.findMany({
    orderBy: { code: "asc" },
    include: { parent: true, _count: { select: { instruments: true } } },
  });
  const users = await prisma.user.findMany({ orderBy: { email: "asc" } });
  const covenants = await prisma.covenantDefinition.findMany({
    include: { tests: true },
    orderBy: { name: "asc" },
  });
  const audits = await prisma.auditEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 25,
    include: { user: true },
  });

  return (
    <AppShell entityOptions={entities} entityId={entityId}>
      <PageTitle
        title="Admin"
        subtitle="Legal entities, users/roles, covenant definition hooks, and audit trail."
      />
      <SetupTabs active="admin" entityId={entityId} />

      {!canAdmin(session.user.role) ? (
        <p className="mb-6 text-sm text-body">
          You are signed in as {session.user.role}. Entity and user administration is visible; only
          ADMIN can change production config in a future release.
        </p>
      ) : null}

      <section className="mb-10">
        <h2 className="mb-4 font-display text-2xl text-secondary">Legal entities</h2>
        <DataTable headers={["Code", "Company", "Segment", "Name", "Parent", "Instruments"]}>
          {entities.map((e) => (
            <tr key={e.id}>
              <td className="px-4 py-3 font-semibold">{e.code}</td>
              <td className="px-4 py-3">{e.companyCode || e.code}</td>
              <td className="px-4 py-3">{e.segmentCode || "—"}</td>
              <td className="px-4 py-3">{e.name}</td>
              <td className="px-4 py-3">{e.parent?.code ?? "—"}</td>
              <td className="px-4 py-3">{e._count.instruments}</td>
            </tr>
          ))}
        </DataTable>
      </section>

      <section className="mb-10">
        <h2 className="mb-4 font-display text-2xl text-secondary">Users & roles</h2>
        <DataTable headers={["Name", "Email", "Role"]}>
          {users.map((u) => (
            <tr key={u.id}>
              <td className="px-4 py-3">{u.name}</td>
              <td className="px-4 py-3">{u.email}</td>
              <td className="px-4 py-3">
                <Badge tone={u.role === "ADMIN" ? "pink" : u.role === "ACCOUNTANT" ? "teal" : "navy"}>
                  {u.role}
                </Badge>
              </td>
            </tr>
          ))}
        </DataTable>
      </section>

      <section className="mb-10">
        <h2 className="mb-4 font-display text-2xl text-secondary">
          Covenants <Badge tone="teal">Future state</Badge>
        </h2>
        <p className="mb-3 text-sm text-body">
          Covenant definitions are visible on the dedicated{" "}
          <a href="/covenants" className="text-primary hover:underline">
            Covenants
          </a>{" "}
          page. The compliance calculation engine is not active yet.
        </p>
        <DataTable headers={["Name", "Metric", "Operator", "Threshold", "Frequency"]}>
          {covenants.map((c) => (
            <tr key={c.id}>
              <td className="px-4 py-3">{c.name}</td>
              <td className="px-4 py-3">{c.metricKey}</td>
              <td className="px-4 py-3">{c.operator}</td>
              <td className="px-4 py-3">{c.threshold}</td>
              <td className="px-4 py-3">{c.frequency}</td>
            </tr>
          ))}
        </DataTable>
      </section>

      <section>
        <h2 className="mb-4 font-display text-2xl text-secondary">Audit trail</h2>
        <DataTable headers={["When", "Action", "Type", "Detail"]}>
          {audits.map((a) => (
            <tr key={a.id}>
              <td className="px-4 py-3 text-xs">{a.createdAt.toISOString()}</td>
              <td className="px-4 py-3">{a.action}</td>
              <td className="px-4 py-3">{a.entityType}</td>
              <td className="px-4 py-3 text-xs">{a.detail}</td>
            </tr>
          ))}
        </DataTable>
      </section>
    </AppShell>
  );
}
