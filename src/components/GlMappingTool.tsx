"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Account = {
  id: string;
  code: string;
  name: string;
  accountType: string;
  active: boolean;
  description: string | null;
};

type Mapping = {
  id: string;
  transactionType: string;
  label: string;
  entityKey: string;
  debitAccountId: string;
  creditAccountId: string;
  companyCode: string;
  segmentCode: string;
  costCenter: string;
  productLine: string;
  intercompany: string;
  projectCode: string;
  notes: string | null;
  active: boolean;
  debitAccount: Account;
  creditAccount: Account;
};

type TxType = { type: string; label: string; description: string };
type Entity = { id: string; code: string; name: string };

export function GlMappingTool({
  accounts: initialAccounts,
  mappings: initialMappings,
  transactionTypes,
  entities,
  canWrite,
}: {
  accounts: Account[];
  mappings: Mapping[];
  transactionTypes: TxType[];
  entities: Entity[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [accounts, setAccounts] = useState(initialAccounts);
  const [mappings, setMappings] = useState(initialMappings);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [acctForm, setAcctForm] = useState({
    code: "",
    name: "",
    accountType: "LIABILITY",
    description: "",
  });

  const [mapForm, setMapForm] = useState({
    transactionType: transactionTypes[0]?.type ?? "INTEREST_ACCRUAL",
    label: transactionTypes[0]?.label ?? "",
    entityKey: "*",
    debitAccountId: initialAccounts[0]?.id ?? "",
    creditAccountId: initialAccounts[1]?.id ?? "",
    companyCode: "",
    segmentCode: "",
    costCenter: "TREASURY",
    productLine: "",
    intercompany: "",
    projectCode: "",
    notes: "",
  });

  async function api(action: string, payload: Record<string, unknown>) {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/gl-mapping", {
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
    router.refresh();
    return data;
  }

  return (
    <div className="space-y-10">
      {message ? <p className="text-sm text-secondary">{message}</p> : null}

      <section>
        <h2 className="mb-2 font-display text-2xl text-secondary">Chart of accounts</h2>
        <p className="mb-4 text-sm text-body">
          Maintain the G/L accounts used when debt transactions are posted.
        </p>
        <div className="overflow-x-auto border border-border bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-light-gray">
              <tr>
                {["Code", "Name", "Type", "Status"].map((h) => (
                  <th key={h} className="px-4 py-3 text-nav text-secondary">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-3 font-semibold text-secondary">{a.code}</td>
                  <td className="px-4 py-3">{a.name}</td>
                  <td className="px-4 py-3">{a.accountType}</td>
                  <td className="px-4 py-3">{a.active ? "Active" : "Inactive"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {canWrite ? (
          <form
            className="mt-4 grid gap-3 border border-border bg-white p-4 sm:grid-cols-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const data = await api("upsert_account", acctForm);
              if (data?.account) {
                setAccounts((prev) => {
                  const rest = prev.filter((a) => a.code !== data.account.code);
                  return [...rest, data.account].sort((x, y) =>
                    x.code.localeCompare(y.code),
                  );
                });
                setAcctForm({ code: "", name: "", accountType: "LIABILITY", description: "" });
              }
            }}
          >
            <label className="text-sm">
              <span className="text-nav text-body">Code</span>
              <input
                required
                className="mt-1 w-full border border-border px-2 py-1.5"
                value={acctForm.code}
                onChange={(e) => setAcctForm({ ...acctForm, code: e.target.value })}
              />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="text-nav text-body">Name</span>
              <input
                required
                className="mt-1 w-full border border-border px-2 py-1.5"
                value={acctForm.name}
                onChange={(e) => setAcctForm({ ...acctForm, name: e.target.value })}
              />
            </label>
            <label className="text-sm">
              <span className="text-nav text-body">Type</span>
              <select
                className="mt-1 w-full border border-border px-2 py-1.5"
                value={acctForm.accountType}
                onChange={(e) => setAcctForm({ ...acctForm, accountType: e.target.value })}
              >
                {["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"].map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <button
              disabled={busy}
              className="bg-primary px-4 py-2 text-nav text-white disabled:opacity-50 sm:col-span-4 sm:w-fit"
            >
              Add / update account
            </button>
          </form>
        ) : null}
      </section>

      <section>
        <h2 className="mb-2 font-display text-2xl text-secondary">Transaction mappings</h2>
        <p className="mb-4 text-sm text-body">
          Map each debt transaction type to debit and credit accounts. Use entity{" "}
          <span className="font-semibold">*</span> for the default; override per legal entity when
          needed (e.g. ALIC funding-agreement interest).
        </p>
        <div className="overflow-x-auto border border-border bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-light-gray">
              <tr>
                {["Transaction", "Scope", "Debit", "Credit", "Dimensions", ""].map((h) => (
                  <th key={h || "a"} className="px-4 py-3 text-nav text-secondary">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {mappings.map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-secondary">{m.label}</div>
                    <div className="text-xs text-body">{m.transactionType}</div>
                  </td>
                  <td className="px-4 py-3">
                    {m.entityKey === "*"
                      ? "All entities"
                      : entities.find((e) => e.id === m.entityKey)?.code ?? m.entityKey}
                  </td>
                  <td className="px-4 py-3">
                    {m.debitAccount.code} — {m.debitAccount.name}
                  </td>
                  <td className="px-4 py-3">
                    {m.creditAccount.code} — {m.creditAccount.name}
                  </td>
                  <td className="px-4 py-3 text-xs text-body">
                    {[
                      m.companyCode && `Co ${m.companyCode}`,
                      m.segmentCode && `Seg ${m.segmentCode}`,
                      m.costCenter && `CC ${m.costCenter}`,
                      m.productLine && `Prod ${m.productLine}`,
                      m.intercompany && `IC ${m.intercompany}`,
                      m.projectCode && `Proj ${m.projectCode}`,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Inherit from entity"}
                  </td>
                  <td className="px-4 py-3">
                    {canWrite && m.entityKey !== "*" ? (
                      <button
                        disabled={busy}
                        className="text-nav text-primary"
                        onClick={async () => {
                          await api("delete_mapping", { id: m.id });
                          setMappings((prev) => prev.filter((x) => x.id !== m.id));
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
            className="mt-4 space-y-3 border border-border bg-white p-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const tx = transactionTypes.find((t) => t.type === mapForm.transactionType);
              const data = await api("upsert_mapping", {
                ...mapForm,
                label: mapForm.label || tx?.label,
              });
              if (data?.mapping) {
                setMappings((prev) => {
                  const rest = prev.filter(
                    (m) =>
                      !(
                        m.transactionType === data.mapping.transactionType &&
                        m.entityKey === data.mapping.entityKey
                      ),
                  );
                  return [...rest, data.mapping].sort((a, b) =>
                    a.transactionType.localeCompare(b.transactionType),
                  );
                });
              }
            }}
          >
            <h3 className="font-display text-xl text-secondary">Add / update mapping</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="text-nav text-body">Transaction type</span>
                <select
                  className="mt-1 w-full border border-border px-2 py-1.5"
                  value={mapForm.transactionType}
                  onChange={(e) => {
                    const tx = transactionTypes.find((t) => t.type === e.target.value);
                    setMapForm({
                      ...mapForm,
                      transactionType: e.target.value,
                      label: tx?.label ?? mapForm.label,
                    });
                  }}
                >
                  {transactionTypes.map((t) => (
                    <option key={t.type} value={t.type}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="text-nav text-body">Entity scope</span>
                <select
                  className="mt-1 w-full border border-border px-2 py-1.5"
                  value={mapForm.entityKey}
                  onChange={(e) => setMapForm({ ...mapForm, entityKey: e.target.value })}
                >
                  <option value="*">All entities (default)</option>
                  {entities.map((ent) => (
                    <option key={ent.id} value={ent.id}>
                      {ent.code} — {ent.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="text-nav text-body">Debit account</span>
                <select
                  className="mt-1 w-full border border-border px-2 py-1.5"
                  value={mapForm.debitAccountId}
                  onChange={(e) => setMapForm({ ...mapForm, debitAccountId: e.target.value })}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="text-nav text-body">Credit account</span>
                <select
                  className="mt-1 w-full border border-border px-2 py-1.5"
                  value={mapForm.creditAccountId}
                  onChange={(e) => setMapForm({ ...mapForm, creditAccountId: e.target.value })}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </select>
              </label>
              {(
                [
                  ["companyCode", "Company"],
                  ["segmentCode", "Segment"],
                  ["costCenter", "Cost center"],
                  ["productLine", "Product line"],
                  ["intercompany", "Intercompany"],
                  ["projectCode", "Project"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="text-sm">
                  <span className="text-nav text-body">{label}</span>
                  <input
                    className="mt-1 w-full border border-border px-2 py-1.5"
                    value={mapForm[key]}
                    onChange={(e) => setMapForm({ ...mapForm, [key]: e.target.value })}
                    placeholder="Optional override"
                  />
                </label>
              ))}
            </div>
            <p className="text-xs text-body">
              {transactionTypes.find((t) => t.type === mapForm.transactionType)?.description} Blank
              dimensions inherit from the legal entity (company / segment) and instrument product.
            </p>
            <button
              disabled={busy}
              className="bg-primary px-4 py-2 text-nav text-white disabled:opacity-50"
            >
              Save mapping
            </button>
          </form>
        ) : null}
      </section>
    </div>
  );
}
