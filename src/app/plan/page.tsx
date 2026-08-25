import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { AppShell } from "@/components/AppShell";
import { SetupTabs } from "@/components/SetupTabs";
import { Badge, PageTitle } from "@/components/ui";

const phases = [
  {
    status: "done" as const,
    title: "Phase 1 — Foundation",
    items: [
      "Next.js app with Aspida look & feel",
      "PostgreSQL + Prisma multi-entity data model",
      "Auth roles (viewer / accountant / admin)",
      "Sample book (~10 instruments, majority funding agreements)",
    ],
  },
  {
    status: "done" as const,
    title: "Phase 2 — Core accounting",
    items: [
      "Floating-rate funding agreements (SOFR + spread, resets)",
      "Interest accrual, payments, schedules",
      "Effective interest method for issuance costs",
      "Revolver draws, repayments, bank true-ups",
      "Monthly process workflow + G/L CSV package",
    ],
  },
  {
    status: "done" as const,
    title: "Phase 3 — G/L coding & reporting",
    items: [
      "Chart of accounts + transaction mapping tool",
      "Journal dimensions: company, segment, cost center, product, IC, project",
      "Configurable reference rates (1M/3M SOFR, source URL, decimal precision)",
      "Upfront / issuance cost onboarding in monthly process",
      "In-app user training guide",
      "Month-scoped journals with month export",
      "Rollforward / maturity reports",
    ],
  },
  {
    status: "next" as const,
    title: "Phase 4 — Harden for production use",
    items: [
      "Replace seed with the live ~10 instruments",
      "Confirm day-count, SOFR conventions, and EIR policy on floating resets",
      "Finalize company/segment/cost-center codes to match corporate COA",
      "Wire GL export format to the actual ERP/GL import spec",
      "Hosted Postgres + SSO",
    ],
  },
  {
    status: "future" as const,
    title: "Phase 5 — Future state",
    items: [
      "Covenant compliance engine (definitions UI already stubbed)",
      "Market-data feed for index fixings",
      "Snowflake analytics feed (warehouse, not OLTP)",
      "Multi-currency / FX if needed",
    ],
  },
];

export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ entityId?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  const { entityId } = await searchParams;
  const entities = await prisma.entity.findMany({ orderBy: { code: "asc" } });

  return (
    <AppShell entityOptions={entities} entityId={entityId}>
      <PageTitle
        title="Implementation plan"
        subtitle="What is live today vs next hardening steps — same functionality, sequenced for a ~10-instrument book."
      />
      <SetupTabs active="plan" entityId={entityId} />

      <div className="mb-6 flex flex-wrap gap-2 text-xs">
        <Badge tone="teal">Done</Badge>
        <Badge tone="pink">Next</Badge>
        <Badge tone="navy">Future</Badge>
      </div>

      <div className="space-y-4">
        {phases.map((phase) => (
          <section key={phase.title} className="border border-border bg-white px-5 py-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge
                tone={
                  phase.status === "done" ? "teal" : phase.status === "next" ? "pink" : "navy"
                }
              >
                {phase.status}
              </Badge>
              <h2 className="font-display text-xl text-secondary">{phase.title}</h2>
            </div>
            <ul className="list-disc space-y-1 pl-5 text-sm text-body">
              {phase.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </AppShell>
  );
}
