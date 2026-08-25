import { redirect } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { auth, canWrite } from "@/auth";
import { prisma } from "@/lib/db";
import { AppShell } from "@/components/AppShell";
import { DocumentUploadForm } from "@/components/DocumentUploadForm";
import { Badge, DataTable, PageTitle } from "@/components/ui";

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ entityId?: string; kind?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  const { entityId, kind } = await searchParams;
  const entities = await prisma.entity.findMany({ orderBy: { code: "asc" } });

  const documents = await prisma.agreementDocument.findMany({
    where: {
      ...(kind === "DEBT_AGREEMENT" || kind === "COVENANT_AGREEMENT" ? { kind } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      debtInstrument: { select: { id: true, instrumentNumber: true } },
      covenantDefinition: { select: { id: true, name: true } },
    },
  });

  const write = canWrite(session.user.role);

  return (
    <AppShell entityOptions={entities} entityId={entityId}>
      <PageTitle
        title="Agreements"
        subtitle="Repository for debt and covenant agreement PDFs — analyze, review terms, then approve into the ledger."
      />

      <div className="mb-6 flex flex-wrap gap-2 text-sm">
        <FilterLink href="/documents" active={!kind} entityId={entityId}>
          All
        </FilterLink>
        <FilterLink
          href="/documents?kind=DEBT_AGREEMENT"
          active={kind === "DEBT_AGREEMENT"}
          entityId={entityId}
        >
          Debt
        </FilterLink>
        <FilterLink
          href="/documents?kind=COVENANT_AGREEMENT"
          active={kind === "COVENANT_AGREEMENT"}
          entityId={entityId}
        >
          Covenants
        </FilterLink>
      </div>

      {write ? (
        <div className="mb-10">
          <DocumentUploadForm entities={entities} defaultEntityId={entityId} />
        </div>
      ) : (
        <p className="mb-8 text-sm text-body">View-only — accountants can upload and approve.</p>
      )}

      <h2 className="mb-4 font-display text-2xl text-secondary">On file</h2>
      <DataTable headers={["Title", "Type", "Status", "Uploaded", "Linked", ""]}>
        {documents.length === 0 ? (
          <tr>
            <td colSpan={6} className="px-4 py-6 text-sm text-body">
              No agreements uploaded yet.
            </td>
          </tr>
        ) : (
          documents.map((doc) => (
            <tr key={doc.id}>
              <td className="px-4 py-3 font-semibold text-secondary">{doc.title}</td>
              <td className="px-4 py-3">
                <Badge tone={doc.kind === "DEBT_AGREEMENT" ? "pink" : "teal"}>
                  {doc.kind === "DEBT_AGREEMENT" ? "Debt" : "Covenant"}
                </Badge>
              </td>
              <td className="px-4 py-3 text-xs uppercase tracking-wide">
                {doc.status.replaceAll("_", " ")}
              </td>
              <td className="px-4 py-3 text-sm">
                {format(doc.createdAt, "MMM d, yyyy HH:mm")}
              </td>
              <td className="px-4 py-3 text-sm">
                {doc.debtInstrument
                  ? doc.debtInstrument.instrumentNumber
                  : doc.covenantDefinition
                    ? doc.covenantDefinition.name
                    : "—"}
              </td>
              <td className="px-4 py-3 text-right">
                <Link className="text-nav text-primary" href={`/documents/${doc.id}`}>
                  Review →
                </Link>
              </td>
            </tr>
          ))
        )}
      </DataTable>
    </AppShell>
  );
}

function FilterLink({
  href,
  active,
  entityId,
  children,
}: {
  href: string;
  active: boolean;
  entityId?: string;
  children: React.ReactNode;
}) {
  const url = entityId
    ? `${href}${href.includes("?") ? "&" : "?"}entityId=${entityId}`
    : href;
  return (
    <Link
      href={url}
      className={
        active
          ? "border-b-2 border-primary px-1 pb-0.5 font-semibold text-primary"
          : "px-1 pb-0.5 text-body hover:text-primary"
      }
    >
      {children}
    </Link>
  );
}
