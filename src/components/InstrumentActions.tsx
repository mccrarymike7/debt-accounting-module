"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function InstrumentActions({
  instrumentId,
  canWrite,
  plannedEvents,
  isFloating,
}: {
  instrumentId: string;
  canWrite: boolean;
  plannedEvents: { id: string; label: string }[];
  isFloating: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [periodStart, setPeriodStart] = useState(() => {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
  });
  const [periodEnd, setPeriodEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [indexFixing, setIndexFixing] = useState("450");
  const [cashEventId, setCashEventId] = useState(plannedEvents[0]?.id ?? "");

  async function run(action: string, payload: Record<string, unknown> = {}) {
    if (!canWrite) return;
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/instruments/${instrumentId}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMessage(data.error ?? "Failed");
      return;
    }
    setMessage(`Success: ${action}`);
    router.refresh();
  }

  if (!canWrite) {
    return (
      <p className="text-sm text-body">View-only role — ask an accountant to post accruals or payments.</p>
    );
  }

  return (
    <div className="space-y-4 border border-border bg-white p-5">
      <h3 className="font-display text-xl text-secondary">Actions</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="text-nav text-body">Period start</span>
          <input
            type="date"
            className="mt-1 w-full border border-border px-2 py-1.5"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
          />
        </label>
        <label className="text-sm">
          <span className="text-nav text-body">Period end</span>
          <input
            type="date"
            className="mt-1 w-full border border-border px-2 py-1.5"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          disabled={busy}
          className="bg-primary px-4 py-2 text-nav text-white disabled:opacity-50"
          onClick={() => run("accrual", { periodStart, periodEnd })}
        >
          Run accrual
        </button>
        <button
          disabled={busy}
          className="border border-primary px-4 py-2 text-nav text-primary disabled:opacity-50"
          onClick={() => run("amortization", { periodStart, periodEnd })}
        >
          Effective interest amort.
        </button>
        <button
          disabled={busy}
          className="border border-border px-4 py-2 text-nav text-secondary disabled:opacity-50"
          onClick={() => run("rebuild_schedule")}
        >
          Rebuild schedule
        </button>
      </div>

      {isFloating ? (
        <div className="flex flex-wrap items-end gap-2 border-t border-border pt-4">
          <label className="text-sm">
            <span className="text-nav text-body">Index fixing (bps)</span>
            <input
              className="mt-1 block w-32 border border-border px-2 py-1.5"
              value={indexFixing}
              onChange={(e) => setIndexFixing(e.target.value)}
            />
          </label>
          <button
            disabled={busy}
            className="bg-secondary px-4 py-2 text-nav text-white disabled:opacity-50"
            onClick={() =>
              run("rate_reset", {
                effectiveDate: periodEnd,
                indexFixingBps: Number(indexFixing),
              })
            }
          >
            Enter rate reset
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-2 border-t border-border pt-4">
        <label className="text-sm">
          <span className="text-nav text-body">Planned cash event</span>
          <select
            className="mt-1 block min-w-64 border border-border px-2 py-1.5"
            value={cashEventId}
            onChange={(e) => setCashEventId(e.target.value)}
          >
            {plannedEvents.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.label}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={busy || !cashEventId}
          className="bg-teal px-4 py-2 text-nav text-secondary disabled:opacity-50"
          onClick={() =>
            run("payment", {
              cashEventId,
              paidDate: periodEnd,
            })
          }
        >
          Record payment
        </button>
      </div>
      {message ? <p className="text-sm text-secondary">{message}</p> : null}
    </div>
  );
}
