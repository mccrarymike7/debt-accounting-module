"use client";

import { useState } from "react";

export type ReferenceRateRow = {
  id: string;
  code: string;
  name: string;
  indexFamily: string;
  tenorLabel: string;
  sourceName: string;
  sourceUrl: string;
  decimalPlaces: number;
  active: boolean;
  notes: string | null;
  _count?: { rateTerms: number };
};

export function ReferenceRateAdmin({
  initialRates,
  canWrite,
}: {
  initialRates: ReferenceRateRow[];
  canWrite: boolean;
}) {
  const [rates, setRates] = useState(initialRates);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: "",
    name: "",
    indexFamily: "SOFR",
    tenorLabel: "3M",
    sourceName: "",
    sourceUrl: "",
    decimalPlaces: "5",
    notes: "",
  });

  async function api(action: string, payload: Record<string, unknown> = {}) {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/reference-rates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMessage(data.error ?? "Failed");
      return null;
    }
    setMessage("Saved");
    return data;
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-body">
        Define the public reference rates your facilities use (for example 1-month vs 3-month Term
        SOFR). Each rate stores the publisher site and the decimal precision to use when entering
        fixings. Instruments point at one of these rates; monthly approvals apply by reference rate.
      </p>
      {message ? <p className="text-sm text-secondary">{message}</p> : null}

      <div className="overflow-x-auto border border-border bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-light-gray text-nav text-secondary">
            <tr>
              {["Code", "Name", "Tenor", "Source", "Decimals", "Instruments", ""].map((h) => (
                <th key={h || "x"} className="px-4 py-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rates.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 font-semibold text-secondary">{r.code}</td>
                <td className="px-4 py-3">{r.name}</td>
                <td className="px-4 py-3">{r.tenorLabel}</td>
                <td className="px-4 py-3">
                  <a
                    href={r.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline"
                  >
                    {r.sourceName}
                  </a>
                </td>
                <td className="px-4 py-3">{r.decimalPlaces}</td>
                <td className="px-4 py-3">{r._count?.rateTerms ?? 0}</td>
                <td className="px-4 py-3">
                  {canWrite && (r._count?.rateTerms ?? 0) === 0 ? (
                    <button
                      disabled={busy}
                      className="text-nav text-primary"
                      onClick={async () => {
                        const data = await api("delete", { id: r.id });
                        if (data) setRates((prev) => prev.filter((x) => x.id !== r.id));
                      }}
                    >
                      Remove
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canWrite ? (
        <form
          className="space-y-3 border border-border bg-white p-5"
          onSubmit={async (e) => {
            e.preventDefault();
            const data = await api("upsert", {
              ...form,
              decimalPlaces: Number(form.decimalPlaces),
            });
            if (data?.rate) {
              setRates((prev) => {
                const rest = prev.filter((r) => r.code !== data.rate.code);
                return [...rest, data.rate].sort((a, b) => a.code.localeCompare(b.code));
              });
              setForm({
                code: "",
                name: "",
                indexFamily: "SOFR",
                tenorLabel: "3M",
                sourceName: "",
                sourceUrl: "",
                decimalPlaces: "5",
                notes: "",
              });
            }
          }}
        >
          <h3 className="font-display text-xl text-secondary">Add / update reference rate</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["code", "Code (e.g. SOFR_1M)"],
                ["name", "Display name"],
                ["indexFamily", "Index family"],
                ["tenorLabel", "Tenor (1M / 3M / ON)"],
                ["sourceName", "Public source name"],
                ["sourceUrl", "Public source URL"],
                ["decimalPlaces", "Decimal places (percent)"],
                ["notes", "Notes"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="text-sm">
                <span className="text-nav text-body">{label}</span>
                <input
                  className="mt-1 w-full border border-border px-2 py-1.5"
                  required={key !== "notes"}
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                />
              </label>
            ))}
          </div>
          <p className="text-xs text-body">
            Decimal places control how fixings are entered and displayed (e.g. 5 → 4.32100%). Internal
            accruals still use basis points.
          </p>
          <button
            disabled={busy}
            className="bg-primary px-4 py-2 text-nav text-white disabled:opacity-50"
          >
            Save reference rate
          </button>
        </form>
      ) : null}
    </div>
  );
}
