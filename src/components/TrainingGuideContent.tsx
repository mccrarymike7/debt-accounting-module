import Link from "next/link";

const toc = [
  { id: "overview", label: "1. Overview" },
  { id: "access", label: "2. Access & roles" },
  { id: "entities", label: "3. Entities" },
  { id: "debt", label: "4. Debt book" },
  { id: "agreements", label: "5. Agreements" },
  { id: "monthly", label: "6. Monthly process" },
  { id: "journals", label: "7. Journals & dimensions" },
  { id: "gl", label: "8. G/L mapping" },
  { id: "reports", label: "9. Reports" },
  { id: "close", label: "10. Closing a month" },
  { id: "glossary", label: "11. Glossary" },
  { id: "checklist", label: "12. Month-end checklist" },
];

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6 border border-border bg-white px-5 py-5">
      <h2 className="font-display text-2xl text-secondary">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-body">{children}</div>
    </section>
  );
}

function Sub({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-nav text-secondary">{title}</h3>
      <div className="mt-2 space-y-2">{children}</div>
    </div>
  );
}

export function TrainingGuideContent() {
  return (
    <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
      <nav className="h-fit border border-border bg-white p-4 lg:sticky lg:top-4">
        <div className="text-nav text-body">Contents</div>
        <ol className="mt-3 space-y-2">
          {toc.map((item) => (
            <li key={item.id}>
              <a href={`#${item.id}`} className="text-sm text-secondary hover:text-primary">
                {item.label}
              </a>
            </li>
          ))}
        </ol>
        <div className="mt-4 border-t border-border pt-3 text-xs text-body">
          Tip: keep this guide open in a second tab while you run a practice month.
        </div>
      </nav>

      <div className="space-y-4">
        <Section id="overview" title="1. Overview">
          <p>
            The Debt Accounting Module is the operational ledger for <strong>company borrowings</strong>{" "}
            (funding agreements, revolvers, notes, and similar facilities)—not investment securities.
          </p>
          <p>It helps you:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Maintain a multi-entity debt book with floating and fixed rates</li>
            <li>Run a structured monthly close: new debt, fees, rates, payments, accruals, G/L export</li>
            <li>Capitalize upfront costs and amortize them with the <strong>effective interest</strong> method</li>
            <li>Post coded journals (company, segment, cost center, and more) for ERP import</li>
          </ul>
          <p>
            Primary navigation: <strong>Debt</strong> · <strong>Agreements</strong> ·{" "}
            <strong>Monthly</strong> · <strong>Journals</strong> · <strong>Setup</strong>.
          </p>
        </Section>

        <Section id="access" title="2. Access & roles">
          <Sub title="Demo logins (local)">
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <code className="text-secondary">admin@aspida.local</code> — full setup and admin
              </li>
              <li>
                <code className="text-secondary">accountant@aspida.local</code> — run monthly process &amp;
                post activity
              </li>
              <li>
                <code className="text-secondary">viewer@aspida.local</code> — read-only
              </li>
            </ul>
            <p>
              Password for all demo users: <code className="text-secondary">password123</code>
            </p>
          </Sub>
          <Sub title="What each role can do">
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>Viewer</strong> — browse instruments, journals, reports, and the monthly
                checklist; cannot post or close
              </li>
              <li>
                <strong>Accountant</strong> — all viewer access plus monthly workflow actions, rate
                approvals, payments, accruals, G/L export, and month close
              </li>
              <li>
                <strong>Admin</strong> — accountant access plus G/L map maintenance and admin entity
                views
              </li>
            </ul>
          </Sub>
        </Section>

        <Section id="entities" title="3. Entities">
          <p>
            Use the entity switcher in the header to scope lists and exports. Legal entities carry{" "}
            <strong>company</strong> and <strong>segment</strong> codes that flow into journal lines
            when you post.
          </p>
          <p>
            Example seed entities: holding company (CORP), life co (LIFE), reinsurance (RE). Confirm
            your live codes under Setup → Admin before first production close.
          </p>
        </Section>

        <Section id="debt" title="4. Debt book">
          <Sub title="Debt list">
            <p>
              Open <Link className="text-primary hover:underline" href="/instruments">Debt</Link> to
              see active instruments, principals, and types. Funding agreements are expected to be
              the majority of the book; many are floating-rate (e.g. SOFR + spread).
            </p>
          </Sub>
          <Sub title="Instrument detail">
            <p>From an instrument you can review:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Principal, unamortized issuance costs, carrying concepts</li>
              <li>Rate terms (fixed vs floating, index, spread, day count)</li>
              <li>Rate observations / fixings history</li>
              <li>Cash schedule, accruals, amortization rows, revolver activity</li>
              <li>Related journals</li>
            </ul>
            <p>
              Prefer the <strong>Monthly</strong> workflow for period activity so work is tracked
              against the close checklist. Instrument-level actions still respect locked months.
            </p>
          </Sub>
        </Section>

        <Section id="agreements" title="5. Agreements">
          <p>
            Under <Link className="text-primary hover:underline" href="/documents">Agreements</Link>,
            upload debt or covenant PDFs, review extracted terms, and approve to create instruments
            or covenant stubs. Always verify extracted rates, dates, and fees before approving—the
            review screen is the control point.
          </p>
          <p>
            Covenant compliance testing is <strong>future state</strong>; definitions may appear as
            stubs under Setup → Covenants.
          </p>
        </Section>

        <Section id="monthly" title="6. Monthly process (core workflow)">
          <p>
            Open <Link className="text-primary hover:underline" href="/monthly">Monthly</Link>, pick
            the accounting month, then work left-to-right through the task rail. Completing a task
            marks it done and advances you; you can always select a prior task and{" "}
            <strong>Reopen</strong> it (until the month is closed) to add more.
          </p>

          <Sub title="Task 1 — New debt">
            <ul className="list-disc space-y-1 pl-5">
              <li>Add each facility issued in the period (funding agreement, revolver, notes, etc.)</li>
              <li>Include principal, dates, rate terms, and any upfront/issuance costs on the form</li>
              <li>You may add <strong>multiple</strong> instruments, then Complete &amp; continue</li>
              <li>Skip if nothing new this month</li>
            </ul>
          </Sub>

          <Sub title="Task 2 — Upfront costs">
            <ul className="list-disc space-y-1 pl-5">
              <li>
                Capitalize origination, legal, or other fees not already entered at issuance
              </li>
              <li>
                Each entry increases unamortized costs, refreshes effective yield, and posts Dr
                Unamortized issuance costs / Cr Cash (per G/L map)
              </li>
              <li>Add multiple cost entries, then Complete &amp; continue</li>
            </ul>
          </Sub>

          <Sub title="Task 3 — Revolver">
            <ul className="list-disc space-y-1 pl-5">
              <li>Record draws and repayments</li>
              <li>True-up drawn balance to the bank statement when needed</li>
              <li>Complete when revolver activity for the month is finished</li>
            </ul>
          </Sub>

          <Sub title="Task 4 — Rate updates">
            <ul className="list-disc space-y-1 pl-5">
              <li>
                Instruments are grouped by <strong>reference rate</strong> (e.g. 1-Month Term SOFR vs
                3-Month Term SOFR)
              </li>
              <li>
                Open the configured public source site, enter the published percent to the rate&apos;s
                decimal precision, and <strong>Approve rate</strong>
              </li>
              <li>One approval posts the fixing to every floating instrument on that reference</li>
              <li>Configure tenors, sources, and decimals under Setup → Rates</li>
            </ul>
          </Sub>

          <Sub title="Task 5 — Payments">
            <ul className="list-disc space-y-1 pl-5">
              <li>Mark planned interest/principal cash events as paid through period end</li>
              <li>Complete when payment processing for the month is done</li>
            </ul>
          </Sub>

          <Sub title="Task 6 — Accruals">
            <ul className="list-disc space-y-1 pl-5">
              <li>
                Run period interest accruals and effective-interest amortization for all active
                instruments
              </li>
              <li>This posts journals and advances the checklist when successful</li>
            </ul>
          </Sub>

          <Sub title="Task 7 — G/L export">
            <ul className="list-disc space-y-1 pl-5">
              <li>Generate the CSV posting package for the period</li>
              <li>Download and deliver to your ERP/GL import process</li>
              <li>Prior export batches remain downloadable from the step</li>
            </ul>
          </Sub>
        </Section>

        <Section id="journals" title="7. Journals & dimensions">
          <p>
            <Link className="text-primary hover:underline" href="/journals">Journals</Link> shows
            activity for a selected month. Expand line detail to see coding:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Company</strong> / <strong>Segment</strong> — usually from the legal entity
            </li>
            <li>
              <strong>Cost center</strong>, <strong>product</strong>, <strong>intercompany</strong>,{" "}
              <strong>project</strong> — from mapping defaults or overrides
            </li>
          </ul>
          <p>Export the month’s CSV from the Journals page when you need a line-level extract.</p>
        </Section>

        <Section id="gl" title="8. G/L mapping">
          <p>
            Under Setup →{" "}
            <Link className="text-primary hover:underline" href="/gl-mapping">G/L Map</Link>,
            maintain the chart of accounts and how each transaction type posts (debit/credit
            accounts and optional dimension overrides).
          </p>
          <p>Common transaction types include:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Interest accrual / payment</li>
            <li>Principal payment</li>
            <li>Upfront / issuance cost capitalization</li>
            <li>EIR amortization</li>
            <li>Revolver draw, repay, and true-up</li>
          </ul>
          <p>
            Blank dimension fields on a mapping inherit from the entity (and instrument product
            where applicable). Align codes with corporate COA before go-live.
          </p>
        </Section>

        <Section id="reports" title="9. Reports">
          <p>
            Setup → <Link className="text-primary hover:underline" href="/reports">Reports</Link>{" "}
            provides rollforward / maturity-oriented views of the book. Use these for management
            review alongside the monthly journal package—not as a substitute for the close checklist.
          </p>
        </Section>

        <Section id="close" title="10. Closing a month">
          <ul className="list-disc space-y-1 pl-5">
            <li>Finish all monthly tasks (or reopen and finish any gaps)</li>
            <li>Optionally mark G/L posted after the ERP import succeeds</li>
            <li>
              Click <strong>Close month</strong> — the period becomes <strong>LOCKED</strong>
            </li>
            <li>
              Locked months block further edits (including instrument actions dated in that month)
            </li>
            <li>You can still view checklists, journals, and download prior exports</li>
          </ul>
          <p>Closing is intentional and should follow your team’s sign-off policy.</p>
        </Section>

        <Section id="glossary" title="11. Glossary">
          <dl className="space-y-3">
            <div>
              <dt className="font-semibold text-secondary">Funding agreement</dt>
              <dd>Primary borrowing product in this module; often floating-rate.</dd>
            </div>
            <div>
              <dt className="font-semibold text-secondary">Index fixing (bps)</dt>
              <dd>
                Reference rate in basis points (100 bps = 1%). Example: SOFR 4.32% → 432 bps.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-secondary">All-in rate</dt>
              <dd>Index fixing + contractual spread (subject to floor/cap if configured).</dd>
            </div>
            <div>
              <dt className="font-semibold text-secondary">Effective interest (EIR)</dt>
              <dd>
                Method used to amortize issuance/upfront costs so interest expense reflects the
                effective yield on carrying amount—not straight-line.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-secondary">Unamortized issuance costs</dt>
              <dd>
                Remaining deferred financing costs on the balance sheet; reduced each period via EIR
                amortization.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-secondary">True-up</dt>
              <dd>
                Revolver adjustment that aligns the system drawn balance to the bank statement.
              </dd>
            </div>
          </dl>
        </Section>

        <Section id="checklist" title="12. Month-end checklist">
          <ol className="list-decimal space-y-2 pl-5">
            <li>Select the correct month on Monthly</li>
            <li>Onboard any new debt (or skip)</li>
            <li>Capitalize remaining upfront costs (or skip)</li>
            <li>Post revolver draws / repayments / true-ups</li>
            <li>Approve final all-in rates for every floating instrument</li>
            <li>Process payments due through period end</li>
            <li>Run accruals &amp; EIR amortization</li>
            <li>Generate G/L CSV; import to ERP; resolve rejects</li>
            <li>Spot-check Journals dimensions for the month</li>
            <li>Close the month when sign-off is complete</li>
          </ol>
          <p className="pt-2">
            Questions on policy (day-count, SOFR lookback, fee capitalization) should be confirmed
            with Accounting before changing production mappings or yields.
          </p>
        </Section>
      </div>
    </div>
  );
}
