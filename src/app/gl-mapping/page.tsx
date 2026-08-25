import { redirect } from "next/navigation";
import { auth, canWrite } from "@/auth";
import { prisma } from "@/lib/db";
import { AppShell } from "@/components/AppShell";
import { PageTitle } from "@/components/ui";
import { GlMappingTool } from "@/components/GlMappingTool";
import { SetupTabs } from "@/components/SetupTabs";
import { TRANSACTION_TYPES } from "@/lib/gl-mapping";

export default async function GlMappingPage({
  searchParams,
}: {
  searchParams: Promise<{ entityId?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  const { entityId } = await searchParams;

  const entities = await prisma.entity.findMany({ orderBy: { code: "asc" } });
  const accounts = await prisma.glAccount.findMany({ orderBy: { code: "asc" } });
  const mappings = await prisma.glAccountMapping.findMany({
    include: { debitAccount: true, creditAccount: true },
    orderBy: [{ transactionType: "asc" }, { entityKey: "asc" }],
  });

  return (
    <AppShell entityOptions={entities} entityId={entityId}>
      <PageTitle
        title="G/L mapping"
        subtitle="Map debt transaction types to chart of accounts and coding dimensions (company, segment, etc.)."
      />
      <SetupTabs active="gl-mapping" entityId={entityId} />
      <GlMappingTool
        accounts={accounts}
        mappings={mappings}
        transactionTypes={[...TRANSACTION_TYPES]}
        entities={entities}
        canWrite={canWrite(session.user.role)}
      />
    </AppShell>
  );
}
