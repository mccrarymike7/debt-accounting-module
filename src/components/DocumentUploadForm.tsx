"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DocumentUploadForm({
  entities,
  defaultEntityId,
}: {
  entities: { id: string; code: string; name: string }[];
  defaultEntityId?: string;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<"DEBT_AGREEMENT" | "COVENANT_AGREEMENT">("DEBT_AGREEMENT");
  const [title, setTitle] = useState("");
  const [entityId, setEntityId] = useState(defaultEntityId ?? entities[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-4 border border-border bg-white p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        const form = e.currentTarget;
        const fileInput = form.elements.namedItem("file") as HTMLInputElement;
        const file = fileInput.files?.[0];
        if (!file) {
          setError("Choose a PDF file.");
          return;
        }
        setBusy(true);
        try {
          const body = new FormData();
          body.set("file", file);
          body.set("kind", kind);
          body.set("title", title || file.name);
          if (entityId) body.set("entityId", entityId);
          body.set("analyze", "true");

          const res = await fetch("/api/documents", { method: "POST", body });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Upload failed");
          router.push(`/documents/${data.document.id}`);
          router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Upload failed");
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3 className="font-display text-xl text-secondary">Upload agreement PDF</h3>
      <p className="text-sm text-body">
        We extract text and prepopulate the terms template. You review and approve before anything
        hits the debt book or covenant register.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="text-nav text-body">Agreement type</span>
          <select
            className="mt-1 w-full border border-border px-2 py-1.5"
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
          >
            <option value="DEBT_AGREEMENT">Debt / funding agreement</option>
            <option value="COVENANT_AGREEMENT">Covenant agreement</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="text-nav text-body">Entity (optional default)</span>
          <select
            className="mt-1 w-full border border-border px-2 py-1.5"
            value={entityId}
            onChange={(e) => setEntityId(e.target.value)}
          >
            <option value="">—</option>
            {entities.map((ent) => (
              <option key={ent.id} value={ent.id}>
                {ent.code} — {ent.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="text-nav text-body">Title</span>
          <input
            className="mt-1 w-full border border-border px-2 py-1.5"
            placeholder="e.g. ALIC Funding Agreement 2026-01"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="text-nav text-body">PDF file</span>
          <input
            name="file"
            type="file"
            accept="application/pdf,.pdf"
            required
            className="mt-1 w-full border border-border px-2 py-1.5 text-sm"
          />
        </label>
      </div>
      {error ? <p className="text-sm text-primary">{error}</p> : null}
      <button
        type="submit"
        disabled={busy}
        className="bg-primary px-4 py-2 text-nav text-white disabled:opacity-50"
      >
        {busy ? "Uploading & analyzing…" : "Upload & analyze"}
      </button>
    </form>
  );
}
