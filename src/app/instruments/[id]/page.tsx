import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { auth, canWrite } from "@/auth";
import { prisma } from "@/lib/db";
import { AppShell } from "@/components/AppShell";
import { InstrumentActions } from "@/components/InstrumentActions";
import { RevolverPanel } from "@/components/RevolverPanel";
import { DetailTabs } from "@/components/DetailTabs";
import { Badge, DataTable, Money, PageTitle } from "@/components/ui";
import { getInstrumentBundle } from "@/lib/accounting";
import { carryingValueCents, formatMoneyPrecise } from "@/lib/money";

export default async function InstrumentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  const { id } = await params;
  const { tab: tabParam } = await searchParams;
  const tab = tabParam === "history" ? "history" : "work";

  let instrument;
  try {
    instrument = await getInstrumentBundle(id);
  } catch {
    notFound();
  }

  const entities = await prisma.entity.findMany({ orderBy: { code: "asc" } });
  const carrying = carryingValueCents(
    instrument.currentPrincipal,
    instrument.unamortizedCosts,
    instrument.premiumDiscount,
  );
  const planned = instrument.cashEvents
    .filter((e) => e.status === "PLANNED")
    .slice(0, 40)
    .map((e) => ({
      id: e.id,
      label: `${format(e.dueDate, "yyyy-MM-dd")} ${e.type} ${formatMoneyPrecise(e.amountCents)}`,
    }));

  return (
    <AppShell entityOptions={entities} entityId={instrument.entityId}>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <Link href="/instruments" className="text-nav text-body hover:text-primary">
          ← Debt
        </Link>
        <Badge tone={instrument.type === "FUNDING_AGREEMENT" ? "pink" : "navy"}>
          {instrument.type.replaceAll("_", " ")}
        </Badge>
        <Badge tone="teal">{instrument.status}</Badge>
      </div>
      <PageTitle
        title={instrument.instrumentNumber}
        subtitle={`${instrument.name} · ${instrument.entity.code}`}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat label="Principal" value={<Money cents={instrument.currentPrincipal} />} />
        <MiniStat label="Carrying" value={<Money cents={carrying} />} />
        <MiniStat label="Unamort. costs" value={<Money cents={instrument.unamortizedCosts} precise />} />
        <MiniStat
          label="EIR"
          value={`${((instrument.rateTerm?.effectiveYieldBps ?? 0) / 100).toFixed(3)}%`}
        />
      </div>

      <DetailTabs instrumentId={instrument.id} tab={tab} />

      {tab === "work" ? (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="border border-border bg-white p-5">
              <h3 className="mb-3 font-display text-xl text-secondary">Terms</h3>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-nav text-body">Maturity</dt>
                  <dd>{format(instrument.maturityDate, "MMM d, yyyy")}</dd>
                </div>
                <div>
                  <dt className="text-nav text-body">Counterparty</dt>
                  <dd>{instrument.counterparty}</dd>
                </div>
                <div>
                  <dt className="text-nav text-body">Rate</dt>
                  <dd>
                    {instrument.rateTerm?.rateType === "FLOATING"
                      ? `${instrument.rateTerm.indexName}+${((instrument.rateTerm.spreadBps ?? 0) / 100).toFixed(2)}%`
                      : `${((instrument.rateTerm?.fixedRateBps ?? 0) / 100).toFixed(2)}% fixed`}
                  </dd>
                </div>
                <div>
                  <dt className="text-nav text-body">Day count</dt>
                  <dd>{instrument.rateTerm?.dayCount}</dd>
                </div>
                {instrument.commitment != null ? (
                  <div>
                    <dt className="text-nav text-body">Commitment</dt>
                    <dd>
                      <Money cents={instrument.commitment} />
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>
            <InstrumentActions
              instrumentId={instrument.id}
              canWrite={canWrite(session.user.role)}
              plannedEvents={planned}
              isFloating={instrument.rateTerm?.rateType === "FLOATING"}
            />
          </div>

          {instrument.type === "REVOLVER" ? (
            <div className="grid gap-6 lg:grid-cols-2">
              <RevolverPanel
                instrumentId={instrument.id}
                canWrite={canWrite(session.user.role)}
                drawnCents={instrument.currentPrincipal.toString()}
                commitmentCents={instrument.commitment?.toString() ?? null}
              />
              <div>
                <h3 className="mb-3 font-display text-xl text-secondary">Recent revolver activity</h3>
                <DataTable headers={["Date", "Type", "Amount", "After"]}>
                  {instrument.revolverActivities.slice(0, 8).map((a) => (
                    <tr key={a.id}>
                      <td className="px-4 py-3">{format(a.activityDate, "yyyy-MM-dd")}</td>
                      <td className="px-4 py-3">
                        <Badge tone="teal">{a.type}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Money cents={a.amountCents} precise />
                      </td>
                      <td className="px-4 py-3">
                        <Money cents={a.balanceAfterCents} />
                      </td>
                    </tr>
                  ))}
                </DataTable>
              </div>
            </div>
          ) : null}

          <section>
            <h3 className="mb-3 font-display text-xl text-secondary">Upcoming schedule</h3>
            <DataTable headers={["Due", "Type", "Status", "Amount"]}>
              {instrument.cashEvents
                .filter((e) => e.status === "PLANNED")
                .slice(0, 12)
                .map((e) => (
                  <tr key={e.id}>
                    <td className="px-4 py-3">{format(e.dueDate, "yyyy-MM-dd")}</td>
                    <td className="px-4 py-3">
                      <Badge>{e.type}</Badge>
                    </td>
                    <td className="px-4 py-3">{e.status}</td>
                    <td className="px-4 py-3">
                      <Money cents={e.amountCents} precise />
                    </td>
                  </tr>
                ))}
            </DataTable>
          </section>
        </div>
      ) : (
        <div className="space-y-8">
          <section>
            <h3 className="mb-3 font-display text-xl text-secondary">Rate observations</h3>
            <DataTable headers={["Effective", "End", "Index", "Spread", "All-in"]}>
              {instrument.rateObservations.map((o) => (
                <tr key={o.id}>
                  <td className="px-4 py-3">{format(o.effectiveDate, "yyyy-MM-dd")}</td>
                  <td className="px-4 py-3">{o.endDate ? format(o.endDate, "yyyy-MM-dd") : "—"}</td>
                  <td className="px-4 py-3">{o.indexFixingBps}</td>
                  <td className="px-4 py-3">{o.spreadBps}</td>
                  <td className="px-4 py-3 font-semibold">{(o.allInRateBps / 100).toFixed(2)}%</td>
                </tr>
              ))}
            </DataTable>
          </section>

          <section>
            <h3 className="mb-3 font-display text-xl text-secondary">Full payment schedule</h3>
            <DataTable headers={["Due", "Type", "Status", "Interest", "Principal", "Total"]}>
              {instrument.cashEvents.slice(0, 40).map((e) => (
                <tr key={e.id}>
                  <td className="px-4 py-3">{format(e.dueDate, "yyyy-MM-dd")}</td>
                  <td className="px-4 py-3">
                    <Badge>{e.type}</Badge>
                  </td>
                  <td className="px-4 py-3">{e.status}</td>
                  <td className="px-4 py-3">
                    <Money cents={e.interestCents} precise />
                  </td>
                  <td className="px-4 py-3">
                    <Money cents={e.principalCents} precise />
                  </td>
                  <td className="px-4 py-3">
                    <Money cents={e.amountCents} precise />
                  </td>
                </tr>
              ))}
            </DataTable>
          </section>

          <section>
            <h3 className="mb-3 font-display text-xl text-secondary">EIR amortization</h3>
            <DataTable headers={["Period", "Cash", "Effective", "Amort.", "Closing CV"]}>
              {instrument.amortizationRows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3">{format(r.periodEnd, "yyyy-MM-dd")}</td>
                  <td className="px-4 py-3">
                    <Money cents={r.cashInterestCents} precise />
                  </td>
                  <td className="px-4 py-3">
                    <Money cents={r.effectiveInterestCents} precise />
                  </td>
                  <td className="px-4 py-3">
                    <Money cents={r.amortizationCents} precise />
                  </td>
                  <td className="px-4 py-3">
                    <Money cents={r.closingCarryingCents} precise />
                  </td>
                </tr>
              ))}
            </DataTable>
          </section>

          <section>
            <h3 className="mb-3 font-display text-xl text-secondary">Journals</h3>
            <DataTable headers={["Date", "Source", "Memo"]}>
              {instrument.journalEntries.map((j) => (
                <tr key={j.id}>
                  <td className="px-4 py-3">{format(j.entryDate, "yyyy-MM-dd")}</td>
                  <td className="px-4 py-3">
                    <Badge tone="teal">{j.source}</Badge>
                  </td>
                  <td className="px-4 py-3">{j.memo}</td>
                </tr>
              ))}
            </DataTable>
          </section>
        </div>
      )}
    </AppShell>
  );
}

function MiniStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border-t-2 border-primary bg-white px-3 py-3">
      <div className="text-nav text-body">{label}</div>
      <div className="mt-1 text-lg font-bold text-secondary">{value}</div>
    </div>
  );
}
