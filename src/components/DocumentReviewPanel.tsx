"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { CovenantTermsDraft, DebtTermsDraft } from "@/lib/agreement-terms";

type Entity = { id: string; code: string; name: string };

type DocPayload = {
  id: string;
  kind: "DEBT_AGREEMENT" | "COVENANT_AGREEMENT";
  status: string;
  title: string;
  originalFileName: string;
  analysisNotes: string | null;
  analysisMethod: string | null;
  extractedTerms: unknown;
  reviewedTerms: unknown;
  debtInstrument?: { id: string; instrumentNumber: string; name: string } | null;
  covenantDefinition?: { id: string; name: string; metricKey: string } | null;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-sm">
      <span className="text-nav text-body">{label}</span>
      {children}
    </label>
  );
}

const inputClass = "mt-1 w-full border border-border px-2 py-1.5";

export function DocumentReviewPanel({
  document: initial,
  entities,
  canWrite,
}: {
  document: DocPayload;
  entities: Entity[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const isDebt = initial.kind === "DEBT_AGREEMENT";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState(initial.status);

  const [debt, setDebt] = useState<DebtTermsDraft>(() => {
    const src = (initial.reviewedTerms ?? initial.extractedTerms ?? {}) as DebtTermsDraft;
    return {
      type: "FUNDING_AGREEMENT",
      rateType: "FLOATING",
      indexName: "SOFR",
      paymentFrequency: "QUARTERLY",
      resetFrequency: "QUARTERLY",
      dayCount: "ACT_360",
      issuanceCostsDollars: "0",
      indexFixingBps: "0",
      ...src,
      entityId: src.entityId || entities[0]?.id,
    };
  });

  const [covenant, setCovenant] = useState<CovenantTermsDraft>(() => {
    const src = (initial.reviewedTerms ?? initial.extractedTerms ?? {}) as CovenantTermsDraft;
    return {
      packageName: src.packageName ?? initial.title,
      entityId: src.entityId ?? null,
      definitions:
        Array.isArray(src.definitions) && src.definitions.length
          ? src.definitions
          : [
              {
                name: "",
                metricKey: "leverage",
                operator: "lte",
                threshold: "",
                frequency: "quarterly",
              },
            ],
    };
  });

  const readOnly = !canWrite || status === "APPROVED" || status === "REJECTED";

  const notes = useMemo(
    () => (initial.analysisNotes ? initial.analysisNotes.split("\n").filter(Boolean) : []),
    [initial.analysisNotes],
  );

  async function postAction(action: string, terms?: DebtTermsDraft | CovenantTermsDraft) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/documents/${initial.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, terms }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setStatus(data.document.status);
      if (action === "approve") {
        setMessage(
          isDebt
            ? `Approved — instrument ${data.document.debtInstrument?.instrumentNumber ?? ""} created.`
            : "Approved — covenant definition(s) created.",
        );
      } else if (action === "save_review") {
        setMessage("Draft terms saved.");
      } else if (action === "analyze") {
        const next = data.document.reviewedTerms ?? data.document.extractedTerms;
        if (isDebt) {
          setDebt((prev) => ({ ...prev, ...(next as DebtTermsDraft) }));
        } else {
          setCovenant((prev) => ({
            ...prev,
            ...(next as CovenantTermsDraft),
            definitions:
              Array.isArray((next as CovenantTermsDraft)?.definitions) &&
              (next as CovenantTermsDraft).definitions.length
                ? (next as CovenantTermsDraft).definitions
                : prev.definitions,
          }));
        }
        setMessage("Re-analysis complete — review updated fields.");
      } else if (action === "reject") {
        setMessage("Document rejected.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3 border border-border bg-white p-5">
        <div>
          <h3 className="font-display text-xl text-secondary">Analysis</h3>
          <p className="mt-1 text-sm text-body">
            Method: {initial.analysisMethod ?? "—"} · Status: {status.replaceAll("_", " ")}
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-body">
            {notes.length ? notes.map((n) => <li key={n}>{n}</li>) : <li>No analysis notes yet.</li>}
          </ul>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={`/api/documents/${initial.id}/file`}
            target="_blank"
            rel="noreferrer"
            className="border border-border px-3 py-1.5 text-nav text-secondary hover:border-primary hover:text-primary"
          >
            Open PDF
          </a>
          {canWrite && status !== "APPROVED" && status !== "REJECTED" ? (
            <button
              type="button"
              disabled={busy}
              className="border border-border px-3 py-1.5 text-nav text-secondary disabled:opacity-50"
              onClick={() => postAction("analyze")}
            >
              Re-analyze
            </button>
          ) : null}
        </div>
      </div>

      {isDebt ? (
        <form
          className="space-y-4 border border-border bg-white p-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!readOnly) void postAction("save_review", debt);
          }}
        >
          <h3 className="font-display text-xl text-secondary">Debt terms template</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Entity">
              <select
                className={inputClass}
                disabled={readOnly}
                value={debt.entityId ?? ""}
                onChange={(e) => setDebt({ ...debt, entityId: e.target.value })}
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
                className={inputClass}
                disabled={readOnly}
                value={debt.type}
                onChange={(e) => setDebt({ ...debt, type: e.target.value as DebtTermsDraft["type"] })}
              >
                <option value="FUNDING_AGREEMENT">Funding agreement</option>
                <option value="REVOLVER">Revolver</option>
                <option value="TERM_LOAN">Term loan</option>
                <option value="SENIOR_NOTES">Senior notes</option>
                <option value="PREFERRED">Preferred</option>
                <option value="OTHER">Other</option>
              </select>
            </Field>
            <Field label="Instrument #">
              <input
                className={inputClass}
                required
                disabled={readOnly}
                value={debt.instrumentNumber ?? ""}
                onChange={(e) => setDebt({ ...debt, instrumentNumber: e.target.value })}
              />
            </Field>
            <Field label="Name">
              <input
                className={inputClass}
                required
                disabled={readOnly}
                value={debt.name ?? ""}
                onChange={(e) => setDebt({ ...debt, name: e.target.value })}
              />
            </Field>
            <Field label="Counterparty">
              <input
                className={inputClass}
                required
                disabled={readOnly}
                value={debt.counterparty ?? ""}
                onChange={(e) => setDebt({ ...debt, counterparty: e.target.value })}
              />
            </Field>
            <Field label="Principal ($)">
              <input
                className={inputClass}
                required
                disabled={readOnly}
                value={debt.principalDollars ?? ""}
                onChange={(e) => setDebt({ ...debt, principalDollars: e.target.value })}
              />
            </Field>
            <Field label="Issue date">
              <input
                type="date"
                className={inputClass}
                required
                disabled={readOnly}
                value={debt.issueDate ?? ""}
                onChange={(e) => setDebt({ ...debt, issueDate: e.target.value })}
              />
            </Field>
            <Field label="Maturity">
              <input
                type="date"
                className={inputClass}
                required
                disabled={readOnly}
                value={debt.maturityDate ?? ""}
                onChange={(e) => setDebt({ ...debt, maturityDate: e.target.value })}
              />
            </Field>
            <Field label="Rate type">
              <select
                className={inputClass}
                disabled={readOnly}
                value={debt.rateType}
                onChange={(e) =>
                  setDebt({ ...debt, rateType: e.target.value as DebtTermsDraft["rateType"] })
                }
              >
                <option value="FLOATING">Floating</option>
                <option value="FIXED">Fixed</option>
              </select>
            </Field>
            <Field label="Day count">
              <select
                className={inputClass}
                disabled={readOnly}
                value={debt.dayCount}
                onChange={(e) =>
                  setDebt({ ...debt, dayCount: e.target.value as DebtTermsDraft["dayCount"] })
                }
              >
                <option value="ACT_360">ACT/360</option>
                <option value="ACT_365">ACT/365</option>
                <option value="THIRTY_360">30/360</option>
              </select>
            </Field>
            <Field label="Payment frequency">
              <select
                className={inputClass}
                disabled={readOnly}
                value={debt.paymentFrequency}
                onChange={(e) =>
                  setDebt({
                    ...debt,
                    paymentFrequency: e.target.value as DebtTermsDraft["paymentFrequency"],
                  })
                }
              >
                <option value="MONTHLY">Monthly</option>
                <option value="QUARTERLY">Quarterly</option>
                <option value="SEMI_ANNUAL">Semi-annual</option>
                <option value="ANNUAL">Annual</option>
              </select>
            </Field>
            {debt.rateType === "FLOATING" ? (
              <>
                <Field label="Index">
                  <input
                    className={inputClass}
                    disabled={readOnly}
                    value={debt.indexName ?? "SOFR"}
                    onChange={(e) => setDebt({ ...debt, indexName: e.target.value })}
                  />
                </Field>
                <Field label="Spread (bps)">
                  <input
                    className={inputClass}
                    disabled={readOnly}
                    value={debt.spreadBps ?? ""}
                    onChange={(e) => setDebt({ ...debt, spreadBps: e.target.value })}
                  />
                </Field>
                <Field label="Index fixing (bps)">
                  <input
                    className={inputClass}
                    disabled={readOnly}
                    value={debt.indexFixingBps ?? "0"}
                    onChange={(e) => setDebt({ ...debt, indexFixingBps: e.target.value })}
                  />
                </Field>
                <Field label="Floor (bps)">
                  <input
                    className={inputClass}
                    disabled={readOnly}
                    value={debt.floorBps ?? ""}
                    onChange={(e) => setDebt({ ...debt, floorBps: e.target.value })}
                  />
                </Field>
                <Field label="Reset frequency">
                  <select
                    className={inputClass}
                    disabled={readOnly}
                    value={debt.resetFrequency}
                    onChange={(e) =>
                      setDebt({
                        ...debt,
                        resetFrequency: e.target.value as DebtTermsDraft["resetFrequency"],
                      })
                    }
                  >
                    <option value="MONTHLY">Monthly</option>
                    <option value="QUARTERLY">Quarterly</option>
                    <option value="SEMI_ANNUAL">Semi-annual</option>
                    <option value="ANNUAL">Annual</option>
                  </select>
                </Field>
              </>
            ) : (
              <Field label="Fixed rate (bps)">
                <input
                  className={inputClass}
                  disabled={readOnly}
                  value={debt.fixedRateBps ?? ""}
                  onChange={(e) => setDebt({ ...debt, fixedRateBps: e.target.value })}
                />
              </Field>
            )}
            {debt.type === "REVOLVER" ? (
              <>
                <Field label="Commitment ($)">
                  <input
                    className={inputClass}
                    disabled={readOnly}
                    value={debt.commitmentDollars ?? ""}
                    onChange={(e) => setDebt({ ...debt, commitmentDollars: e.target.value })}
                  />
                </Field>
                <Field label="Unused fee (bps)">
                  <input
                    className={inputClass}
                    disabled={readOnly}
                    value={debt.unusedFeeRateBps ?? ""}
                    onChange={(e) => setDebt({ ...debt, unusedFeeRateBps: e.target.value })}
                  />
                </Field>
              </>
            ) : null}
            <Field label="Issuance costs ($)">
              <input
                className={inputClass}
                disabled={readOnly}
                value={debt.issuanceCostsDollars ?? "0"}
                onChange={(e) => setDebt({ ...debt, issuanceCostsDollars: e.target.value })}
              />
            </Field>
            <label className="text-sm sm:col-span-2">
              <span className="text-nav text-body">Covenant notes</span>
              <textarea
                className={`${inputClass} min-h-20`}
                disabled={readOnly}
                value={debt.covenantNotes ?? ""}
                onChange={(e) => setDebt({ ...debt, covenantNotes: e.target.value })}
              />
            </label>
          </div>
          {!readOnly ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={busy}
                className="border border-border px-4 py-2 text-nav text-secondary disabled:opacity-50"
              >
                Save draft
              </button>
              <button
                type="button"
                disabled={busy}
                className="bg-primary px-4 py-2 text-nav text-white disabled:opacity-50"
                onClick={() => postAction("approve", debt)}
              >
                Approve & create instrument
              </button>
              <button
                type="button"
                disabled={busy}
                className="border border-primary px-4 py-2 text-nav text-primary disabled:opacity-50"
                onClick={() => postAction("reject")}
              >
                Reject
              </button>
            </div>
          ) : null}
          {status === "APPROVED" && initial.debtInstrument ? (
            <p className="text-sm text-body">
              Linked instrument:{" "}
              <Link
                className="text-primary underline"
                href={`/instruments/${initial.debtInstrument.id}`}
              >
                {initial.debtInstrument.instrumentNumber}
              </Link>
            </p>
          ) : null}
        </form>
      ) : (
        <form
          className="space-y-4 border border-border bg-white p-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!readOnly) void postAction("save_review", covenant);
          }}
        >
          <h3 className="font-display text-xl text-secondary">Covenant terms template</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Package name">
              <input
                className={inputClass}
                disabled={readOnly}
                value={covenant.packageName ?? ""}
                onChange={(e) => setCovenant({ ...covenant, packageName: e.target.value })}
              />
            </Field>
            <Field label="Default entity scope">
              <select
                className={inputClass}
                disabled={readOnly}
                value={covenant.entityId ?? ""}
                onChange={(e) =>
                  setCovenant({ ...covenant, entityId: e.target.value || null })
                }
              >
                <option value="">Consolidated</option>
                {entities.map((ent) => (
                  <option key={ent.id} value={ent.id}>
                    {ent.code}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="space-y-4">
            {covenant.definitions.map((def, idx) => (
              <div key={idx} className="border border-border bg-light-gray/40 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-nav text-secondary">Definition {idx + 1}</span>
                  {!readOnly && covenant.definitions.length > 1 ? (
                    <button
                      type="button"
                      className="text-xs text-primary"
                      onClick={() =>
                        setCovenant({
                          ...covenant,
                          definitions: covenant.definitions.filter((_, i) => i !== idx),
                        })
                      }
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Name">
                    <input
                      className={inputClass}
                      disabled={readOnly}
                      value={def.name ?? ""}
                      onChange={(e) => {
                        const definitions = [...covenant.definitions];
                        definitions[idx] = { ...def, name: e.target.value };
                        setCovenant({ ...covenant, definitions });
                      }}
                    />
                  </Field>
                  <Field label="Metric key">
                    <select
                      className={inputClass}
                      disabled={readOnly}
                      value={def.metricKey ?? "leverage"}
                      onChange={(e) => {
                        const definitions = [...covenant.definitions];
                        definitions[idx] = { ...def, metricKey: e.target.value };
                        setCovenant({ ...covenant, definitions });
                      }}
                    >
                      <option value="leverage">leverage</option>
                      <option value="interest_coverage">interest_coverage</option>
                      <option value="debt_to_capital">debt_to_capital</option>
                    </select>
                  </Field>
                  <Field label="Operator">
                    <select
                      className={inputClass}
                      disabled={readOnly}
                      value={def.operator ?? "lte"}
                      onChange={(e) => {
                        const definitions = [...covenant.definitions];
                        definitions[idx] = {
                          ...def,
                          operator: e.target.value as "lte" | "gte",
                        };
                        setCovenant({ ...covenant, definitions });
                      }}
                    >
                      <option value="lte">lte (max)</option>
                      <option value="gte">gte (min)</option>
                    </select>
                  </Field>
                  <Field label="Threshold">
                    <input
                      className={inputClass}
                      disabled={readOnly}
                      value={def.threshold ?? ""}
                      onChange={(e) => {
                        const definitions = [...covenant.definitions];
                        definitions[idx] = { ...def, threshold: e.target.value };
                        setCovenant({ ...covenant, definitions });
                      }}
                    />
                  </Field>
                  <Field label="Frequency">
                    <input
                      className={inputClass}
                      disabled={readOnly}
                      value={def.frequency ?? "quarterly"}
                      onChange={(e) => {
                        const definitions = [...covenant.definitions];
                        definitions[idx] = { ...def, frequency: e.target.value };
                        setCovenant({ ...covenant, definitions });
                      }}
                    />
                  </Field>
                  <Field label="Notes">
                    <input
                      className={inputClass}
                      disabled={readOnly}
                      value={def.notes ?? ""}
                      onChange={(e) => {
                        const definitions = [...covenant.definitions];
                        definitions[idx] = { ...def, notes: e.target.value };
                        setCovenant({ ...covenant, definitions });
                      }}
                    />
                  </Field>
                </div>
              </div>
            ))}
          </div>

          {!readOnly ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="border border-border px-3 py-1.5 text-nav text-secondary"
                onClick={() =>
                  setCovenant({
                    ...covenant,
                    definitions: [
                      ...covenant.definitions,
                      {
                        name: "",
                        metricKey: "leverage",
                        operator: "lte",
                        threshold: "",
                        frequency: "quarterly",
                      },
                    ],
                  })
                }
              >
                Add definition
              </button>
              <button
                type="submit"
                disabled={busy}
                className="border border-border px-4 py-2 text-nav text-secondary disabled:opacity-50"
              >
                Save draft
              </button>
              <button
                type="button"
                disabled={busy}
                className="bg-primary px-4 py-2 text-nav text-white disabled:opacity-50"
                onClick={() => postAction("approve", covenant)}
              >
                Approve & create covenants
              </button>
              <button
                type="button"
                disabled={busy}
                className="border border-primary px-4 py-2 text-nav text-primary disabled:opacity-50"
                onClick={() => postAction("reject")}
              >
                Reject
              </button>
            </div>
          ) : null}

          {status === "APPROVED" ? (
            <p className="text-sm text-body">
              Covenant definitions created.{" "}
              <Link className="text-primary underline" href="/covenants">
                View covenants
              </Link>
            </p>
          ) : null}
        </form>
      )}

      {error ? <p className="text-sm text-primary">{error}</p> : null}
      {message ? <p className="text-sm text-secondary">{message}</p> : null}
    </div>
  );
}
