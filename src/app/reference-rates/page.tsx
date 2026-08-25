import { redirect } from "next/navigation";
import { auth, canWrite } from "@/auth";
import { prisma } from "@/lib/db";
import { AppShell } from "@/components/AppShell";
import { PageTitle } from "@/components/ui";
import { SetupTabs } from "@/components/SetupTabs";
import { ReferenceRateAdmin } from "@/components/ReferenceRateAdmin";

export default async function ReferenceRatesPage({
  searchParams,
}: {
  searchParams: Promise<{ entityId?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  const { entityId } = await searchParams;
  const entities = await prisma.entity.findMany({ orderBy: { code: "asc" } });
  const rates = await prisma.referenceRate.findMany({
    orderBy: [{ indexFamily: "asc" }, { tenorLabel: "asc" }],
    include: { _count: { select: { rateTerms: true } } },
  });

  return (
    <AppShell entityOptions={entities} entityId={entityId}>
      <PageTitle
        title="Reference rates"
        subtitle="Configure SOFR tenors, public source websites, and decimal precision for fixings."
      />
      <SetupTabs active="reference-rates" entityId={entityId} />
      <ReferenceRateAdmin initialRates={rates} canWrite={canWrite(session.user.role)} />
    </AppShell>
  );
}
