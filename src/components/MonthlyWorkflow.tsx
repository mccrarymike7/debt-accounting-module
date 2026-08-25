"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Step = {
  id: string;
  stepKey: string;
  status: string;
  sortOrder: number;
  notes: string | null;
};

type Close = {
  id: string;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  completedAt?: string | null;
  steps: Step[];
  glExports: { id: string; label: string; lineCount: number; status: string }[];
};

type Entity = { id: string; code: string; name: string };
type ReferenceRateInfo = {
  id: string;
  code: string;
  name: string;
  tenorLabel: string;
  sourceName: string;
  sourceUrl: string;
  decimalPlaces: number;
  indexFamily?: string;
};

type Instrument = {
  id: string;
  instrumentNumber: string;
  name: string;
  type: string;
  currentPrincipal: string;
  unamortizedCosts?: string;
  issuanceCosts?: string;
  rateTerm: {
    rateType: string;
    indexName: string | null;
    spreadBps: number | null;
    floorBps?: number | null;
    referenceRateId?: string | null;
    referenceRate?: ReferenceRateInfo | null;
  } | null;
  suggestedIndexFixingBps?: number | null;
  lastAllInRateBps?: number | null;
};
type CashEvent = {
  id: string;
  instrumentId: string;
  type: string;
  dueDate: string;
  amountCents: string;
  instrument: { instrumentNumber: string };
};

const STEP_TITLES: Record<string, string> = {
  NEW_DEBT: "New debt",
  UPFRONT_COSTS: "Upfront costs",
  REVOLVER_ACTIVITY: "Revolver",
  RATE_UPDATES: "Rate updates",
  PAYMENTS: "Payments",
  ACCRUALS: "Accruals",
  GL_EXPORT: "G/L export",
};

const STEP_HELP: Record<string, string> = {
  NEW_DEBT: "Onboard any facilities or funding agreements issued in the period.",
  UPFRONT_COSTS:
    "Capitalize origination, legal, and other upfront fees — increases unamortized costs and refreshes EIR.",
  REVOLVER_ACTIVITY: "Record draws, repayments, and bank balance true-ups for the RCF.",
  RATE_UPDATES:
    "Approve each public reference rate (e.g. 1M vs 3M SOFR) from its published source; one approval updates all linked instruments.",
  PAYMENTS: "Mark planned interest/principal cash events as paid.",
  ACCRUALS: "Post month-end interest accruals and effective-interest amortization.",
  GL_EXPORT: "Package journals into a CSV for posting to the general ledger.",
};

function isStepDone(status: string) {
  return status === "COMPLETE" || status === "SKIPPED";
}

function firstOpenStep(steps: Step[]) {
  const sorted = [...steps].sort((a, b) => a.sortOrder - b.sortOrder);
  return (
    sorted.find((s) => s.status === "IN_PROGRESS") ??
    sorted.find((s) => !isStepDone(s.status)) ??
    sorted[sorted.length - 1]
  );
}

function normalizeClose(raw: Close): Close {
  return {
    ...raw,
    periodStart:
      typeof raw.periodStart === "string"
        ? raw.periodStart
        : new Date(raw.periodStart as unknown as string).toISOString(),
    periodEnd:
      typeof raw.periodEnd === "string"
        ? raw.periodEnd
        : new Date(raw.periodEnd as unknown as string).toISOString(),
    steps: raw.steps ?? [],
    glExports: raw.glExports ?? [],
  };
}

function advanceAfterComplete(steps: Step[], completedKey: string) {
  const sorted = [...steps].sort((a, b) => a.sortOrder - b.sortOrder);
  const idx = sorted.findIndex((s) => s.stepKey === completedKey);
  const next = sorted.slice(idx + 1).find((s) => !isStepDone(s.status));
  return next?.stepKey ?? sorted[sorted.length - 1]?.stepKey ?? completedKey;
}

export function MonthlyWorkflow({
  initialClose,
  entities,
  instruments,
  referenceRates = [],
  plannedPayments,
  canWrite,
}: {
  initialClose: Close;
  entities: Entity[];
  instruments: Instrument[];
  referenceRates?: ReferenceRateInfo[];
  plannedPayments: CashEvent[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [close, setClose] = useState(() => normalizeClose(initialClose));
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeStep, setActiveStep] = useState(
    () => firstOpenStep(initialClose.steps)?.stepKey ?? "NEW_DEBT",
  );

  useEffect(() => {
    const next = normalizeClose(initialClose);
    setClose(next);
    setActiveStep(firstOpenStep(next.steps)?.stepKey ?? "NEW_DEBT");
    setMessage(null);
  }, [initialClose.id]);

  const locked = close.status === "LOCKED";
  const editable = canWrite && !locked;
  const steps = useMemo(
    () => [...close.steps].sort((a, b) => a.sortOrder - b.sortOrder),
    [close.steps],
  );
  const doneCount = steps.filter((s) => isStepDone(s.status)).length;
  const allDone = steps.length > 0 && doneCount === steps.length;
  const activeMeta = steps.find((s) => s.stepKey === activeStep);
  const activeIndex = steps.findIndex((s) => s.stepKey === activeStep);

  const floating = useMemo(
    () => instruments.filter((i) => i.rateTerm?.rateType === "FLOATING"),
    [instruments],
  );
  const revolvers = useMemo(() => instruments.filter((i) => i.type === "REVOLVER"), [instruments]);

  const periodStart = close.periodStart.slice(0, 10);
  const periodEnd = close.periodEnd.slice(0, 10);

  async function api(action: string, payload: Record<string, unknown> = {}) {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/monthly", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, monthlyCloseId: close.id, ...payload }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMessage(data.error ?? "Failed");
      return null;
    }
    if (data.close) setClose(normalizeClose(data.close));
    router.refresh();
    return data;
  }

  async function completeStep(stepKey: string, notes?: string) {
    const data = await api("complete_step", { stepKey, notes });
    if (!data?.close) return;
    const normalized = normalizeClose(data.close);
    const nextKey = advanceAfterComplete(normalized.steps, stepKey);
    setActiveStep(nextKey);
    if (nextKey !== stepKey && !isStepDone(normalized.steps.find((s) => s.stepKey === nextKey)?.status ?? "")) {
      setMessage(`Done — next: ${STEP_TITLES[nextKey] ?? nextKey}`);
    } else if (normalized.steps.every((s) => isStepDone(s.status))) {
      setMessage("All tasks complete. Close the month when ready.");
    } else {
      setMessage("Step marked complete.");
    }
  }

  async function reopenStep(stepKey: string) {
    const data = await api("reopen_step", { stepKey });
    if (!data?.close) return;
    setActiveStep(stepKey);
    setMessage(`Reopened ${STEP_TITLES[stepKey] ?? stepKey} — add more, then complete again.`);
  }

  const stepDone = activeMeta ? isStepDone(activeMeta.status) : false;
  const canWorkStep = editable && !stepDone;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border border-border bg-white px-5 py-4">
        <div>
          <div className="text-nav text-body">Period workflow</div>
          <div className="text-xl font-bold text-secondary">{close.periodLabel}</div>
          <div className="text-xs text-body">
            {periodStart} → {periodEnd} · {locked ? "Closed" : close.status.replaceAll("_", " ")}
            {" · "}
            {doneCount}/{steps.length} tasks done
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!locked && (close.status === "READY_TO_POST" || close.status === "POSTED") ? (
            <button
              disabled={busy || !canWrite || close.status === "POSTED"}
              className="border border-border bg-white px-4 py-2 text-nav text-secondary disabled:opacity-50"
              onClick={() => api("mark_posted")}
            >
              {close.status === "POSTED" ? "GL posted" : "Mark GL posted"}
            </button>
          ) : null}
          {canWrite && !locked ? (
            <button
              disabled={busy || (!allDone && close.status !== "READY_TO_POST" && close.status !== "POSTED")}
              title={!allDone ? "Finish all tasks before closing" : undefined}
              className="bg-primary px-4 py-2 text-nav text-white disabled:opacity-50"
              onClick={() => {
                if (
                  !window.confirm(
                    `Close ${close.periodLabel}? No further edits will be permitted for this month.`,
                  )
                ) {
                  return;
                }
                void api("close_period");
              }}
            >
              Close month
            </button>
          ) : null}
          {locked ? (
            <span className="border border-border bg-light-gray px-4 py-2 text-nav text-body">
              Month closed
            </span>
          ) : null}
        </div>
      </div>

      {locked ? (
        <p className="border border-border bg-light-gray px-4 py-3 text-sm text-secondary">
          This month is closed. You can review tasks and exports; edits are blocked.
        </p>
      ) : null}

      <div className="overflow-hidden border border-border bg-white lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="border-b border-border bg-secondary text-white lg:border-b-0 lg:border-r lg:border-border">
          <div className="border-b border-white/10 px-4 py-3">
            <div className="text-nav text-teal">Tasks</div>
            <div className="mt-1 h-1.5 overflow-hidden bg-white/10">
              <div
                className="h-full bg-teal transition-all duration-500"
                style={{ width: `${steps.length ? (doneCount / steps.length) * 100 : 0}%` }}
              />
            </div>
          </div>
          <ol className="relative py-2">
            {steps.map((step, i) => {
              const done = isStepDone(step.status);
              const current = step.stepKey === activeStep;
              const title = STEP_TITLES[step.stepKey] ?? step.stepKey;
              return (
                <li key={step.id} className="relative">
                  {i < steps.length - 1 ? (
                    <span
                      aria-hidden
                      className={`absolute left-[1.65rem] top-10 h-[calc(100%-0.5rem)] w-px ${
                        done ? "bg-teal/60" : "bg-white/15"
                      }`}
                    />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setActiveStep(step.stepKey)}
                    className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors ${
                      current ? "bg-white/10" : "hover:bg-white/5"
                    }`}
                  >
                    <span
                      className={`relative z-10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center text-xs font-bold ${
                        done
                          ? "bg-teal text-secondary"
                          : current
                            ? "bg-primary text-white"
                            : "border border-white/30 text-white/70"
                      }`}
                    >
                      {done ? "✓" : step.sortOrder}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block text-sm font-semibold ${
                          current || done ? "text-white" : "text-white/70"
                        }`}
                      >
                        {title}
                      </span>
                      <span className="text-[10px] uppercase tracking-wide text-white/50">
                        {done ? (locked ? "Done" : "Done · can reopen") : current ? "In progress" : "Up next"}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>

        <section className="flex min-h-[28rem] flex-col">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <div className="text-nav text-body">
                Step {activeIndex >= 0 ? activeIndex + 1 : "—"} of {steps.length}
              </div>
              <h2 className="font-display text-2xl text-secondary">
                {STEP_TITLES[activeStep] ?? activeStep}
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-body">{STEP_HELP[activeStep]}</p>
            </div>
            {activeMeta && isStepDone(activeMeta.status) ? (
              <span className="border border-teal bg-teal/15 px-3 py-1.5 text-nav text-secondary">
                Completed
              </span>
            ) : null}
          </div>

          <div className="flex-1 px-5 py-5">
            {message ? (
              <p className="mb-4 border-l-2 border-teal bg-light-gray px-3 py-2 text-sm text-secondary">
                {message}
              </p>
            ) : null}
            {!canWrite ? (
              <p className="mb-4 text-sm text-body">
                View-only — accountants/admins can run the monthly process.
              </p>
            ) : null}

            {stepDone && editable ? (
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border border-border bg-light-gray px-4 py-3">
                <p className="text-sm text-secondary">
                  This task is marked done
                  {activeMeta?.notes ? ` (${activeMeta.notes})` : ""}. Reopen it to add or change
                  activity, then complete again.
                </p>
                <button
                  type="button"
                  disabled={busy}
                  className="bg-primary px-4 py-2 text-nav text-white disabled:opacity-50"
                  onClick={() => reopenStep(activeStep)}
                >
                  Reopen task
                </button>
              </div>
            ) : null}

            {stepDone && !editable ? (
              <p className="mb-4 text-sm text-body">
                This task is complete
                {activeMeta?.notes ? `: ${activeMeta.notes}` : "."}
                {locked ? " The month is closed, so it cannot be reopened." : ""}
              </p>
            ) : null}

            {activeStep === "NEW_DEBT" && canWorkStep ? (
              <NewDebtForm
                entities={entities}
                referenceRates={referenceRates}
                disabled={!editable || busy}
                onSubmit={async (payload) => {
                  const data = await api("add_debt", payload);
                  if (data) {
                    setMessage(
                      `Saved ${payload.instrumentNumber}. Add another, or complete when finished.`,
                    );
                    return true;
                  }
                  return false;
                }}
                onComplete={(summary) => completeStep("NEW_DEBT", summary)}
                onSkip={() => completeStep("NEW_DEBT", "No new debt this period")}
              />
            ) : null}

            {activeStep === "UPFRONT_COSTS" && canWorkStep ? (
              <UpfrontCostsForm
                instruments={instruments}
                periodEnd={periodEnd}
                disabled={!editable || busy}
                onSave={async (payload) => {
                  const data = await api("upfront_costs", payload);
                  if (data) {
                    setMessage("Costs capitalized. Add another, or complete when finished.");
                    return true;
                  }
                  return false;
                }}
                onComplete={(summary) => completeStep("UPFRONT_COSTS", summary)}
                onSkip={() => completeStep("UPFRONT_COSTS", "No upfront costs this period")}
              />
            ) : null}

            {activeStep === "REVOLVER_ACTIVITY" && canWorkStep ? (
              <RevolverForm
                revolvers={revolvers}
                periodEnd={periodEnd}
                disabled={!editable || busy}
                onAction={async (action, payload) => {
                  await api(action, payload);
                  setMessage("Activity saved — continue when revolver work is finished.");
                }}
                onComplete={() => completeStep("REVOLVER_ACTIVITY")}
              />
            ) : null}

            {activeStep === "RATE_UPDATES" && canWorkStep ? (
              <RateUpdatesForm
                floating={floating}
                referenceRates={referenceRates}
                periodEnd={periodEnd}
                disabled={!editable || busy}
                onApproveReference={async (payload) => {
                  const data = await api("rate_reset_reference", {
                    ...payload,
                    effectiveDate: periodEnd,
                  });
                  return Boolean(data);
                }}
                onComplete={() => completeStep("RATE_UPDATES")}
              />
            ) : null}

            {activeStep === "PAYMENTS" && canWorkStep ? (
              <PaymentsForm
                events={plannedPayments}
                periodEnd={periodEnd}
                disabled={!editable || busy}
                onPay={async (instrumentId, cashEventId) => {
                  await api("payment", { instrumentId, cashEventId, paidDate: periodEnd });
                  setMessage("Payment recorded.");
                }}
                onComplete={() => completeStep("PAYMENTS")}
              />
            ) : null}

            {activeStep === "ACCRUALS" && canWorkStep ? (
              <div className="space-y-5">
                <p className="text-sm text-body">
                  Posts interest accrual and effective-interest amortization for all active
                  instruments from {periodStart} through {periodEnd}.
                </p>
                <button
                  disabled={!editable || busy}
                  className="bg-primary px-4 py-2 text-nav text-white disabled:opacity-50"
                  onClick={async () => {
                    const data = await api("run_period_accruals", { periodStart, periodEnd });
                    if (data) await completeStep("ACCRUALS", "Accruals + EIR posted");
                  }}
                >
                  Run accruals & continue
                </button>
              </div>
            ) : null}

            {activeStep === "GL_EXPORT" && canWorkStep ? (
              <div className="space-y-5">
                <p className="text-sm text-body">
                  Collects journals in the period into a CSV batch for your general ledger.
                </p>
                <button
                  disabled={!editable || busy}
                  className="bg-primary px-4 py-2 text-nav text-white disabled:opacity-50"
                  onClick={async () => {
                    const data = await api("generate_gl");
                    if (data?.close) {
                      const normalized = normalizeClose(data.close);
                      setClose(normalized);
                      if (normalized.steps.every((s) => isStepDone(s.status))) {
                        setMessage("All tasks complete. Download the file, then close the month.");
                      }
                    }
                    if (data?.batch?.id) {
                      window.location.href = `/api/export/gl/${data.batch.id}`;
                    }
                  }}
                >
                  Generate & download GL CSV
                </button>
                {close.glExports?.length ? (
                  <ul className="text-sm text-body">
                    {close.glExports.map((b) => (
                      <li key={b.id}>
                        <Link className="text-primary hover:underline" href={`/api/export/gl/${b.id}`}>
                          {b.label}
                        </Link>{" "}
                        — {b.lineCount} lines ({b.status})
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            {activeStep === "GL_EXPORT" && stepDone && close.glExports?.length ? (
              <ul className="mt-4 text-sm text-body">
                {close.glExports.map((b) => (
                  <li key={b.id}>
                    <Link className="text-primary hover:underline" href={`/api/export/gl/${b.id}`}>
                      {b.label}
                    </Link>{" "}
                    — {b.lineCount} lines ({b.status})
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border bg-light-gray px-5 py-3">
            <button
              type="button"
              disabled={activeIndex <= 0}
              className="text-nav text-secondary disabled:opacity-40"
              onClick={() => {
                if (activeIndex > 0) setActiveStep(steps[activeIndex - 1].stepKey);
              }}
            >
              ← Previous
            </button>
            <button
              type="button"
              disabled={activeIndex < 0 || activeIndex >= steps.length - 1}
              className="text-nav text-primary disabled:opacity-40"
              onClick={() => {
                if (activeIndex >= 0 && activeIndex < steps.length - 1) {
                  setActiveStep(steps[activeIndex + 1].stepKey);
                }
              }}
            >
              Next →
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function NewDebtForm({
  entities,
  referenceRates,
  disabled,
  onSubmit,
  onComplete,
  onSkip,
}: {
  entities: Entity[];
  referenceRates: ReferenceRateInfo[];
  disabled: boolean;
  onSubmit: (payload: Record<string, unknown>) => Promise<boolean>;
  onComplete: (summary: string) => void;
  onSkip: () => void;
}) {
  const defaultRef = referenceRates.find((r) => r.code === "SOFR_3M") ?? referenceRates[0];
  const emptyForm = {
    entityId: entities[0]?.id ?? "",
    name: "",
    instrumentNumber: "",
    type: "FUNDING_AGREEMENT",
    counterparty: "",
    issueDate: new Date().toISOString().slice(0, 10),
    maturityDate: "",
    principalDollars: "",
    issuanceCostsDollars: "0",
    commitmentDollars: "",
    rateType: "FLOATING",
    fixedRateBps: "500",
    referenceRateId: defaultRef?.id ?? "",
    indexName: defaultRef?.indexFamily ?? "SOFR",
    spreadBps: "125",
    indexFixingBps: "450",
  };
  const [form, setForm] = useState(emptyForm);
  const [added, setAdded] = useState<{ instrumentNumber: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);

  return (
    <div className="space-y-5">
      {added.length > 0 ? (
        <div className="border border-border bg-light-gray px-4 py-3">
          <div className="text-nav text-body">Added this step ({added.length})</div>
          <ul className="mt-2 space-y-1 text-sm text-secondary">
            {added.map((row) => (
              <li key={row.instrumentNumber}>
                <span className="font-semibold">{row.instrumentNumber}</span> — {row.name}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-body">
          Add one or more instruments, then complete the step when finished.
        </p>
      )}

      <form
        className="space-y-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          const ok = await onSubmit(form);
          setSaving(false);
          if (!ok) return;
          setAdded((prev) => [
            ...prev,
            { instrumentNumber: form.instrumentNumber, name: form.name },
          ]);
          setForm({
            ...emptyForm,
            entityId: form.entityId,
            type: form.type,
            rateType: form.rateType,
            issueDate: form.issueDate,
          });
        }}
      >
        <h3 className="font-display text-xl text-secondary">
          {added.length ? "Add another instrument" : "Add new debt"}
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Entity">
            <select
              className="mt-1 w-full border border-border px-2 py-1.5"
              value={form.entityId}
              onChange={(e) => setForm({ ...form, entityId: e.target.value })}
            >
              {entities.map((ent) => (
                <option key={ent.id} value={ent.id}>
                  {ent.code}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Type">
            <select
              className="mt-1 w-full border border-border px-2 py-1.5"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              <option value="FUNDING_AGREEMENT">Funding agreement</option>
              <option value="REVOLVER">Revolver</option>
              <option value="TERM_LOAN">Term loan</option>
              <option value="SENIOR_NOTES">Senior notes</option>
              <option value="OTHER">Other</option>
            </select>
          </Field>
          <Field label="Instrument #">
            <input
              className="mt-1 w-full border border-border px-2 py-1.5"
              required
              value={form.instrumentNumber}
              onChange={(e) => setForm({ ...form, instrumentNumber: e.target.value })}
            />
          </Field>
          <Field label="Name">
            <input
              className="mt-1 w-full border border-border px-2 py-1.5"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Counterparty">
            <input
              className="mt-1 w-full border border-border px-2 py-1.5"
              required
              value={form.counterparty}
              onChange={(e) => setForm({ ...form, counterparty: e.target.value })}
            />
          </Field>
          <Field label="Principal ($)">
            <input
              className="mt-1 w-full border border-border px-2 py-1.5"
              required
              value={form.principalDollars}
              onChange={(e) => setForm({ ...form, principalDollars: e.target.value })}
            />
          </Field>
          <Field label="Upfront / issuance costs ($)">
            <input
              className="mt-1 w-full border border-border px-2 py-1.5"
              value={form.issuanceCostsDollars}
              onChange={(e) => setForm({ ...form, issuanceCostsDollars: e.target.value })}
              placeholder="0.00"
            />
          </Field>
          <Field label="Issue date">
            <input
              type="date"
              className="mt-1 w-full border border-border px-2 py-1.5"
              required
              value={form.issueDate}
              onChange={(e) => setForm({ ...form, issueDate: e.target.value })}
            />
          </Field>
          <Field label="Maturity">
            <input
              type="date"
              className="mt-1 w-full border border-border px-2 py-1.5"
              required
              value={form.maturityDate}
              onChange={(e) => setForm({ ...form, maturityDate: e.target.value })}
            />
          </Field>
          <Field label="Rate type">
            <select
              className="mt-1 w-full border border-border px-2 py-1.5"
              value={form.rateType}
              onChange={(e) => setForm({ ...form, rateType: e.target.value })}
            >
              <option value="FLOATING">Floating</option>
              <option value="FIXED">Fixed</option>
            </select>
          </Field>
          {form.rateType === "FLOATING" ? (
            <>
              <Field label="Reference rate">
                <select
                  className="mt-1 w-full border border-border px-2 py-1.5"
                  value={form.referenceRateId}
                  onChange={(e) => {
                    const ref = referenceRates.find((r) => r.id === e.target.value);
                    setForm({
                      ...form,
                      referenceRateId: e.target.value,
                      indexName: ref?.indexFamily ?? form.indexName,
                    });
                  }}
                >
                  {referenceRates.length === 0 ? (
                    <option value="">Configure rates under Setup → Rates</option>
                  ) : (
                    referenceRates.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.code} — {r.name} ({r.decimalPlaces} dp)
                      </option>
                    ))
                  )}
                </select>
              </Field>
              <Field label="Spread (bps)">
                <input
                  className="mt-1 w-full border border-border px-2 py-1.5"
                  value={form.spreadBps}
                  onChange={(e) => setForm({ ...form, spreadBps: e.target.value })}
                />
              </Field>
              <Field label="Initial index fixing (bps)">
                <input
                  className="mt-1 w-full border border-border px-2 py-1.5"
                  value={form.indexFixingBps}
                  onChange={(e) => setForm({ ...form, indexFixingBps: e.target.value })}
                />
              </Field>
              {form.referenceRateId ? (
                <p className="sm:col-span-2 text-xs text-body">
                  Source:{" "}
                  {(() => {
                    const ref = referenceRates.find((r) => r.id === form.referenceRateId);
                    if (!ref) return "—";
                    return (
                      <a
                        href={ref.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline"
                      >
                        {ref.sourceName}
                      </a>
                    );
                  })()}
                </p>
              ) : null}
            </>
          ) : (
            <Field label="Fixed rate (bps)">
              <input
                className="mt-1 w-full border border-border px-2 py-1.5"
                value={form.fixedRateBps}
                onChange={(e) => setForm({ ...form, fixedRateBps: e.target.value })}
              />
            </Field>
          )}
          {form.type === "REVOLVER" ? (
            <Field label="Commitment ($)">
              <input
                className="mt-1 w-full border border-border px-2 py-1.5"
                value={form.commitmentDollars}
                onChange={(e) => setForm({ ...form, commitmentDollars: e.target.value })}
              />
            </Field>
          ) : null}
        </div>
        <button
          type="submit"
          disabled={disabled || saving}
          className="bg-primary px-4 py-2 text-nav text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Add instrument"}
        </button>
      </form>

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        <button
          type="button"
          disabled={disabled || added.length === 0}
          className="bg-secondary px-4 py-2 text-nav text-white disabled:opacity-50"
          onClick={() =>
            onComplete(
              `Added ${added.length}: ${added.map((a) => a.instrumentNumber).join(", ")}`,
            )
          }
        >
          Complete & continue ({added.length})
        </button>
        {added.length === 0 ? (
          <button
            type="button"
            disabled={disabled}
            className="border border-border px-4 py-2 text-nav text-secondary"
            onClick={onSkip}
          >
            Skip — none this period
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-sm">
      <span className="text-nav text-body">{label}</span>
      {children}
    </label>
  );
}

function UpfrontCostsForm({
  instruments,
  periodEnd,
  disabled,
  onSave,
  onComplete,
  onSkip,
}: {
  instruments: Instrument[];
  periodEnd: string;
  disabled: boolean;
  onSave: (payload: Record<string, unknown>) => Promise<boolean>;
  onComplete: (summary: string) => void;
  onSkip: () => void;
}) {
  const [instrumentId, setInstrumentId] = useState(instruments[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("Origination / legal fees");
  const [date, setDate] = useState(periodEnd);
  const [saving, setSaving] = useState(false);
  const [added, setAdded] = useState<
    { instrumentNumber: string; amountDollars: string; description: string }[]
  >([]);

  const selected = instruments.find((i) => i.id === instrumentId);

  return (
    <div className="space-y-5">
      {added.length > 0 ? (
        <div className="border border-border bg-light-gray px-4 py-3">
          <div className="text-nav text-body">Added this step ({added.length})</div>
          <ul className="mt-2 space-y-1 text-sm text-secondary">
            {added.map((row, i) => (
              <li key={`${row.instrumentNumber}-${i}`}>
                <span className="font-semibold">{row.instrumentNumber}</span> — $
                {Number(row.amountDollars).toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
                ({row.description || "fees"})
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-body">
          Capitalize one or more fee entries, then complete the step when finished.
        </p>
      )}

      <h3 className="font-display text-xl text-secondary">
        {added.length ? "Add another cost entry" : "Onboard upfront costs"}
      </h3>
      <p className="text-sm text-body">
        Posts Dr Unamortized issuance costs / Cr Cash and prospectively refreshes EIR.
      </p>
      {!instruments.length ? (
        <p className="text-sm text-body">No active instruments — add debt first, or skip this step.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Instrument">
            <select
              className="mt-1 w-full border border-border px-2 py-1.5"
              value={instrumentId}
              onChange={(e) => setInstrumentId(e.target.value)}
            >
              {instruments.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.instrumentNumber} — {i.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Activity date">
            <input
              type="date"
              className="mt-1 w-full border border-border px-2 py-1.5"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label="Amount ($)">
            <input
              className="mt-1 w-full border border-border px-2 py-1.5"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="25000.00"
              required
            />
          </Field>
          <Field label="Description">
            <input
              className="mt-1 w-full border border-border px-2 py-1.5"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Origination fee, legal, etc."
            />
          </Field>
        </div>
      )}
      {selected ? (
        <p className="text-xs text-body">
          Current unamortized costs: $
          {(Number(selected.unamortizedCosts ?? "0") / 100).toLocaleString(undefined, {
            minimumFractionDigits: 2,
          })}{" "}
          · lifetime capitalized: $
          {(Number(selected.issuanceCosts ?? "0") / 100).toLocaleString(undefined, {
            minimumFractionDigits: 2,
          })}
        </p>
      ) : null}

      <button
        type="button"
        disabled={disabled || saving || !instruments.length || !amount}
        className="bg-primary px-4 py-2 text-nav text-white disabled:opacity-50"
        onClick={async () => {
          const inst = instruments.find((i) => i.id === instrumentId);
          setSaving(true);
          const ok = await onSave({
            instrumentId,
            activityDate: date,
            amountDollars: amount,
            description,
          });
          setSaving(false);
          if (!ok) return;
          setAdded((prev) => [
            ...prev,
            {
              instrumentNumber: inst?.instrumentNumber ?? instrumentId,
              amountDollars: amount,
              description,
            },
          ]);
          setAmount("");
        }}
      >
        {saving ? "Saving…" : "Add cost entry"}
      </button>

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        <button
          type="button"
          disabled={disabled || added.length === 0}
          className="bg-secondary px-4 py-2 text-nav text-white disabled:opacity-50"
          onClick={() => onComplete(`Capitalized ${added.length} cost entr${added.length === 1 ? "y" : "ies"}`)}
        >
          Complete & continue ({added.length})
        </button>
        {added.length === 0 ? (
          <button
            type="button"
            disabled={disabled}
            className="border border-border px-4 py-2 text-nav text-secondary disabled:opacity-50"
            onClick={onSkip}
          >
            Skip — none this period
          </button>
        ) : null}
      </div>
    </div>
  );
}

function RevolverForm({
  revolvers,
  periodEnd,
  disabled,
  onAction,
  onComplete,
}: {
  revolvers: Instrument[];
  periodEnd: string;
  disabled: boolean;
  onAction: (action: string, payload: Record<string, unknown>) => Promise<void>;
  onComplete: () => void;
}) {
  const [instrumentId, setInstrumentId] = useState(revolvers[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [bankBalance, setBankBalance] = useState("");
  const [date, setDate] = useState(periodEnd);

  if (!revolvers.length) {
    return (
      <div className="text-sm text-body">
        No revolving facilities on the books.{" "}
        <button className="text-primary" type="button" onClick={onComplete}>
          Complete & continue
        </button>
      </div>
    );
  }

  const selected = revolvers.find((r) => r.id === instrumentId);

  return (
    <div className="space-y-5">
      <h3 className="font-display text-xl text-secondary">Revolver activity & bank true-up</h3>
      <Field label="Facility">
        <select
          className="mt-1 w-full border border-border px-2 py-1.5"
          value={instrumentId}
          onChange={(e) => setInstrumentId(e.target.value)}
        >
          {revolvers.map((r) => (
            <option key={r.id} value={r.id}>
              {r.instrumentNumber} — drawn ${(Number(r.currentPrincipal) / 100).toLocaleString()}
            </option>
          ))}
        </select>
      </Field>
      {selected ? (
        <p className="text-xs text-body">
          Current drawn: ${(Number(selected.currentPrincipal) / 100).toLocaleString()} ·{" "}
          <Link className="text-primary" href={`/instruments/${selected.id}`}>
            Open facility
          </Link>
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Activity date">
          <input
            type="date"
            className="mt-1 w-full border border-border px-2 py-1.5"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label="Draw / repay amount ($)">
          <input
            className="mt-1 w-full border border-border px-2 py-1.5"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field label="Bank balance for true-up ($)">
          <input
            className="mt-1 w-full border border-border px-2 py-1.5"
            value={bankBalance}
            onChange={(e) => setBankBalance(e.target.value)}
          />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          disabled={disabled || !amount}
          className="bg-secondary px-4 py-2 text-nav text-white disabled:opacity-50"
          onClick={() =>
            onAction("revolver_draw", {
              instrumentId,
              activityDate: date,
              amountDollars: amount,
            })
          }
        >
          Record draw
        </button>
        <button
          disabled={disabled || !amount}
          className="border border-secondary px-4 py-2 text-nav text-secondary disabled:opacity-50"
          onClick={() =>
            onAction("revolver_repay", {
              instrumentId,
              activityDate: date,
              amountDollars: amount,
            })
          }
        >
          Record repay
        </button>
        <button
          disabled={disabled || !bankBalance}
          className="bg-teal px-4 py-2 text-nav text-secondary disabled:opacity-50"
          onClick={() =>
            onAction("revolver_true_up", {
              instrumentId,
              activityDate: date,
              bankBalanceDollars: bankBalance,
            })
          }
        >
          True-up to bank
        </button>
        <button
          disabled={disabled}
          className="border border-primary px-4 py-2 text-nav text-primary"
          onClick={onComplete}
        >
          Complete & continue
        </button>
      </div>
    </div>
  );
}

function RateUpdatesForm({
  floating,
  referenceRates,
  periodEnd,
  disabled,
  onApproveReference,
  onComplete,
}: {
  floating: Instrument[];
  referenceRates: ReferenceRateInfo[];
  periodEnd: string;
  disabled: boolean;
  onApproveReference: (payload: {
    referenceRateId: string;
    indexFixingPercent: string;
  }) => Promise<boolean>;
  onComplete: () => void;
}) {
  const groups = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        reference: ReferenceRateInfo | null;
        instruments: Instrument[];
        suggestedBps: number | null;
      }
    >();
    for (const inst of floating) {
      const ref = inst.rateTerm?.referenceRate ?? null;
      const key = ref?.id ?? `legacy:${inst.rateTerm?.indexName ?? "UNKNOWN"}`;
      const existing = map.get(key);
      if (existing) {
        existing.instruments.push(inst);
        if (existing.suggestedBps == null && inst.suggestedIndexFixingBps != null) {
          existing.suggestedBps = inst.suggestedIndexFixingBps;
        }
      } else {
        const catalog = ref ?? referenceRates.find((r) => r.id === inst.rateTerm?.referenceRateId) ?? null;
        map.set(key, {
          key,
          reference: catalog,
          instruments: [inst],
          suggestedBps: inst.suggestedIndexFixingBps ?? null,
        });
      }
    }
    return [...map.values()].sort((a, b) =>
      (a.reference?.code ?? a.key).localeCompare(b.reference?.code ?? b.key),
    );
  }, [floating, referenceRates]);

  const [percents, setPercents] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const g of groups) {
      const places = g.reference?.decimalPlaces ?? 2;
      if (g.suggestedBps != null) {
        initial[g.key] = (g.suggestedBps / 100).toFixed(places);
      }
    }
    return initial;
  });
  const [approved, setApproved] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const allApproved = groups.length === 0 || groups.every((g) => approved[g.key] != null);

  return (
    <div className="space-y-5">
      <h3 className="font-display text-xl text-secondary">Reference rate updates</h3>
      <p className="text-sm text-body">
        Approve each public reference rate once for the period (effective {periodEnd}). The approved
        fixing applies to every floating instrument that uses that rate. Open the source site to look
        up the published value, then enter it to the configured decimal precision.
      </p>
      {groups.length === 0 ? (
        <p className="text-sm text-body">No floating-rate instruments on the books.</p>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => {
            const places = g.reference?.decimalPlaces ?? 2;
            const pct = percents[g.key] ?? "";
            const isApproved = approved[g.key] != null;
            return (
              <div key={g.key} className="border border-border bg-light-gray/40 px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-secondary">
                      {g.reference?.name ?? g.instruments[0]?.rateTerm?.indexName ?? "Reference rate"}
                    </div>
                    <div className="text-xs text-body">
                      {g.reference ? (
                        <>
                          {g.reference.code} · tenor {g.reference.tenorLabel} · {places} decimal
                          places ·{" "}
                          <a
                            href={g.reference.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary hover:underline"
                          >
                            {g.reference.sourceName}
                          </a>
                        </>
                      ) : (
                        "Legacy index (assign a reference rate under Setup → Rates)"
                      )}
                    </div>
                    <div className="mt-1 text-xs text-body">
                      Applies to:{" "}
                      {g.instruments.map((i) => i.instrumentNumber).join(", ")}
                    </div>
                  </div>
                  {isApproved ? (
                    <span className="border border-teal bg-teal/15 px-3 py-2 text-nav text-secondary">
                      Approved {approved[g.key]}%
                    </span>
                  ) : null}
                </div>
                {!isApproved ? (
                  <div className="mt-3 flex flex-wrap items-end gap-3">
                    <label className="text-sm">
                      <span className="text-nav text-body">
                        Published rate (%) · {places} dp
                      </span>
                      <input
                        className="mt-1 w-40 border border-border bg-white px-2 py-1.5"
                        value={pct}
                        disabled={disabled || !g.reference}
                        onChange={(e) => setPercents({ ...percents, [g.key]: e.target.value })}
                        placeholder={(g.suggestedBps != null
                          ? g.suggestedBps / 100
                          : 4.32
                        ).toFixed(places)}
                      />
                    </label>
                    <button
                      type="button"
                      disabled={disabled || busyKey === g.key || !g.reference || !pct}
                      className="bg-primary px-3 py-2 text-nav text-white disabled:opacity-50"
                      onClick={async () => {
                        if (!g.reference) return;
                        const label = `${pct}% ${g.reference.code} → ${g.instruments.length} instrument(s)`;
                        if (
                          !window.confirm(
                            `Approve reference rate?\n\n${label}\nSource: ${g.reference.sourceName}\nEffective ${periodEnd}`,
                          )
                        ) {
                          return;
                        }
                        setBusyKey(g.key);
                        const ok = await onApproveReference({
                          referenceRateId: g.reference.id,
                          indexFixingPercent: pct,
                        });
                        setBusyKey(null);
                        if (ok) {
                          setApproved((prev) => ({ ...prev, [g.key]: pct }));
                        }
                      }}
                    >
                      {busyKey === g.key ? "Saving…" : "Approve rate"}
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        <button
          disabled={disabled || (groups.length > 0 && !allApproved)}
          className="bg-secondary px-4 py-2 text-nav text-white disabled:opacity-50"
          onClick={onComplete}
        >
          Complete & continue
          {groups.length > 0
            ? ` (${Object.keys(approved).length}/${groups.length})`
            : ""}
        </button>
        {groups.length > 0 && !allApproved ? (
          <p className="w-full text-xs text-body">
            Approve every reference rate group before completing this step.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function PaymentsForm({
  events,
  periodEnd,
  disabled,
  onPay,
  onComplete,
}: {
  events: CashEvent[];
  periodEnd: string;
  disabled: boolean;
  onPay: (instrumentId: string, cashEventId: string) => Promise<void>;
  onComplete: () => void;
}) {
  const due = events.filter((e) => e.dueDate.slice(0, 10) <= periodEnd);

  return (
    <div className="space-y-5">
      <h3 className="font-display text-xl text-secondary">Process payments</h3>
      {due.length === 0 ? (
        <p className="text-sm text-body">No planned payments due on or before period end.</p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {due.map((ev) => (
            <li key={ev.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <div className="font-semibold text-secondary">{ev.instrument.instrumentNumber}</div>
                <div className="text-xs text-body">
                  {ev.dueDate.slice(0, 10)} · {ev.type} · $
                  {(Number(ev.amountCents) / 100).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                  })}
                </div>
              </div>
              <button
                disabled={disabled}
                className="border border-teal px-3 py-1.5 text-nav text-secondary disabled:opacity-50"
                onClick={() => onPay(ev.instrumentId, ev.id)}
              >
                Mark paid
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        disabled={disabled}
        className="bg-primary px-4 py-2 text-nav text-white disabled:opacity-50"
        onClick={onComplete}
      >
        Complete & continue
      </button>
    </div>
  );
}
