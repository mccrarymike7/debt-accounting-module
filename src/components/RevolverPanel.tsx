"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RevolverPanel({
  instrumentId,
  canWrite,
  drawnCents,
  commitmentCents,
}: {
  instrumentId: string;
  canWrite: boolean;
  drawnCents: string;
  commitmentCents: string | null;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [bankBalance, setBankBalance] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: string, payload: Record<string, unknown>) {
    if (!canWrite) return;
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/monthly", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, instrumentId, activityDate: date, ...payload }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMessage(data.error ?? "Failed");
      return;
    }
    setMessage("Updated");
    router.refresh();
  }

  return (
    <div className="border border-border bg-white p-5">
      <h3 className="mb-2 font-display text-xl text-secondary">Revolver balances</h3>
      <p className="mb-4 text-sm text-body">
        Drawn ${(Number(drawnCents) / 100).toLocaleString()}
        {commitmentCents
          ? ` of $${(Number(commitmentCents) / 100).toLocaleString()} commitment`
          : ""}
        . Record mid-month draws/repays or true-up to the bank’s balance.
      </p>
      {!canWrite ? (
        <p className="text-sm text-body">View-only role.</p>
      ) : (
        <>
          <div className="mb-3 grid gap-3 sm:grid-cols-3">
            <label className="text-sm">
              <span className="text-nav text-body">Date</span>
              <input
                type="date"
                className="mt-1 w-full border border-border px-2 py-1.5"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="text-nav text-body">Draw / repay ($)</span>
              <input
                className="mt-1 w-full border border-border px-2 py-1.5"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="text-nav text-body">Bank balance ($)</span>
              <input
                className="mt-1 w-full border border-border px-2 py-1.5"
                value={bankBalance}
                onChange={(e) => setBankBalance(e.target.value)}
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              disabled={busy || !amount}
              className="bg-secondary px-3 py-2 text-nav text-white disabled:opacity-50"
              onClick={() => run("revolver_draw", { amountDollars: amount })}
            >
              Draw
            </button>
            <button
              disabled={busy || !amount}
              className="border border-secondary px-3 py-2 text-nav text-secondary disabled:opacity-50"
              onClick={() => run("revolver_repay", { amountDollars: amount })}
            >
              Repay
            </button>
            <button
              disabled={busy || !bankBalance}
              className="bg-teal px-3 py-2 text-nav text-secondary disabled:opacity-50"
              onClick={() => run("revolver_true_up", { bankBalanceDollars: bankBalance })}
            >
              True-up to bank
            </button>
          </div>
          {message ? <p className="mt-2 text-sm text-secondary">{message}</p> : null}
        </>
      )}
    </div>
  );
}
