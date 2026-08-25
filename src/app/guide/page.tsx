import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { AppShell } from "@/components/AppShell";
import { SetupTabs } from "@/components/SetupTabs";
import { PageTitle } from "@/components/ui";
import { TrainingGuideContent } from "@/components/TrainingGuideContent";

export default async function GuidePage({
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
        title="Training guide"
        subtitle="End-to-end handbook for accountants and reviewers using the Debt Accounting Module."
      />
      <SetupTabs active="guide" entityId={entityId} />
      <TrainingGuideContent />
    </AppShell>
  );
}
