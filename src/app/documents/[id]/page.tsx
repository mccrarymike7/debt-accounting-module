import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { auth, canWrite } from "@/auth";
import { prisma } from "@/lib/db";
import { AppShell } from "@/components/AppShell";
import { DocumentReviewPanel } from "@/components/DocumentReviewPanel";
import { Badge, PageTitle } from "@/components/ui";

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  const { id } = await params;

  const document = await prisma.agreementDocument.findUnique({
    where: { id },
    include: {
      debtInstrument: { select: { id: true, instrumentNumber: true, name: true } },
      covenantDefinition: { select: { id: true, name: true, metricKey: true } },
    },
  });
  if (!document) notFound();

  const entities = await prisma.entity.findMany({ orderBy: { code: "asc" } });

  return (
    <AppShell entityOptions={entities} entityId={document.entityId ?? undefined}>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <Link href="/documents" className="text-nav text-body hover:text-primary">
          ← Agreements
        </Link>
        <Badge tone={document.kind === "DEBT_AGREEMENT" ? "pink" : "teal"}>
          {document.kind === "DEBT_AGREEMENT" ? "Debt agreement" : "Covenant agreement"}
        </Badge>
        <Badge tone="navy">{document.status.replaceAll("_", " ")}</Badge>
      </div>
      <PageTitle
        title={document.title}
        subtitle={`${document.originalFileName} · review extracted terms before approving`}
      />
      <DocumentReviewPanel
        document={{
          id: document.id,
          kind: document.kind,
          status: document.status,
          title: document.title,
          originalFileName: document.originalFileName,
          analysisNotes: document.analysisNotes,
          analysisMethod: document.analysisMethod,
          extractedTerms: document.extractedTerms,
          reviewedTerms: document.reviewedTerms,
          debtInstrument: document.debtInstrument,
          covenantDefinition: document.covenantDefinition,
        }}
        entities={entities}
        canWrite={canWrite(session.user.role)}
      />
    </AppShell>
  );
}
