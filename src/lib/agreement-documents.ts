import { mkdir, writeFile, readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { extractPdfText } from "@/lib/pdf-text";
import {
  analyzeCovenantAgreementText,
  analyzeDebtAgreementText,
} from "@/lib/agreement-extract";
import {
  emptyCovenantTerms,
  emptyDebtTerms,
  type CovenantTermsDraft,
  type DebtTermsDraft,
} from "@/lib/agreement-terms";
import { createDebtInstrument } from "@/lib/monthly-close";
import { dollarsToCentsFromBody } from "@/lib/monthly-close-api";
import type {
  AgreementDocumentKind,
  Prisma,
} from "@/generated/prisma/client";

const UPLOAD_ROOT = path.join(process.cwd(), "data", "uploads", "agreements");

export async function ensureUploadDir() {
  await mkdir(UPLOAD_ROOT, { recursive: true });
}

export function storagePathFor(id: string, originalFileName: string) {
  const safe = originalFileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  return path.join(UPLOAD_ROOT, `${id}-${safe}`);
}

export async function createAgreementUpload(input: {
  kind: AgreementDocumentKind;
  title: string;
  originalFileName: string;
  mimeType: string;
  buffer: Buffer;
  entityId?: string | null;
  uploadedById?: string | null;
}) {
  if (input.mimeType !== "application/pdf" && !input.originalFileName.toLowerCase().endsWith(".pdf")) {
    throw new Error("Only PDF agreements are supported.");
  }

  await ensureUploadDir();

  const doc = await prisma.agreementDocument.create({
    data: {
      kind: input.kind,
      title: input.title || input.originalFileName.replace(/\.pdf$/i, ""),
      originalFileName: input.originalFileName,
      mimeType: "application/pdf",
      storagePath: "pending",
      fileSizeBytes: input.buffer.length,
      entityId: input.entityId || null,
      uploadedById: input.uploadedById || null,
      status: "UPLOADED",
    },
  });

  const storagePath = storagePathFor(doc.id, input.originalFileName);
  await writeFile(storagePath, input.buffer);
  return prisma.agreementDocument.update({
    where: { id: doc.id },
    data: { storagePath },
  });
}

export async function analyzeAgreementDocument(id: string) {
  const doc = await prisma.agreementDocument.findUniqueOrThrow({ where: { id } });
  if (doc.status === "APPROVED") {
    throw new Error("Approved documents cannot be re-analyzed.");
  }

  await prisma.agreementDocument.update({
    where: { id },
    data: { status: "ANALYZING" },
  });

  try {
    const buffer = await readFile(doc.storagePath);
    const text = await extractPdfText(buffer);

    if (doc.kind === "DEBT_AGREEMENT") {
      const result = await analyzeDebtAgreementText(text);
      const terms: DebtTermsDraft = {
        ...result.terms,
        entityId: result.terms.entityId ?? doc.entityId ?? undefined,
      };
      return prisma.agreementDocument.update({
        where: { id },
        data: {
          status: "READY_FOR_REVIEW",
          extractedText: text,
          extractedTerms: terms as Prisma.InputJsonValue,
          reviewedTerms: terms as Prisma.InputJsonValue,
          analysisNotes: result.notes.join("\n"),
          analysisMethod: result.method,
          analyzedAt: new Date(),
        },
      });
    }

    const result = await analyzeCovenantAgreementText(text);
    const terms: CovenantTermsDraft = {
      ...result.terms,
      entityId: result.terms.entityId ?? doc.entityId ?? null,
      definitions: result.terms.definitions.map((d) => ({
        ...d,
        entityId: d.entityId ?? doc.entityId ?? null,
      })),
    };
    return prisma.agreementDocument.update({
      where: { id },
      data: {
        status: "READY_FOR_REVIEW",
        extractedText: text,
        extractedTerms: terms as Prisma.InputJsonValue,
        reviewedTerms: terms as Prisma.InputJsonValue,
        analysisNotes: result.notes.join("\n"),
        analysisMethod: result.method,
        analyzedAt: new Date(),
      },
    });
  } catch (e) {
    await prisma.agreementDocument.update({
      where: { id },
      data: {
        status: "UPLOADED",
        analysisNotes: e instanceof Error ? e.message : "Analysis failed",
      },
    });
    throw e;
  }
}

export async function saveReviewedTerms(
  id: string,
  reviewedTerms: DebtTermsDraft | CovenantTermsDraft,
  reviewedById?: string,
) {
  const doc = await prisma.agreementDocument.findUniqueOrThrow({ where: { id } });
  if (doc.status === "APPROVED") throw new Error("Document already approved.");
  if (doc.status === "REJECTED") throw new Error("Document was rejected.");

  return prisma.agreementDocument.update({
    where: { id },
    data: {
      reviewedTerms: reviewedTerms as Prisma.InputJsonValue,
      reviewedById: reviewedById ?? null,
      reviewedAt: new Date(),
      status: "READY_FOR_REVIEW",
    },
  });
}

export async function rejectAgreementDocument(id: string, reviewedById?: string) {
  return prisma.agreementDocument.update({
    where: { id },
    data: {
      status: "REJECTED",
      reviewedById: reviewedById ?? null,
      reviewedAt: new Date(),
    },
  });
}

function asDebtTerms(value: unknown): DebtTermsDraft {
  const base = emptyDebtTerms();
  if (!value || typeof value !== "object") return base;
  return { ...base, ...(value as DebtTermsDraft) };
}

function asCovenantTerms(value: unknown): CovenantTermsDraft {
  const base = emptyCovenantTerms();
  if (!value || typeof value !== "object") return base;
  const v = value as CovenantTermsDraft;
  return {
    ...base,
    ...v,
    definitions: Array.isArray(v.definitions) && v.definitions.length ? v.definitions : base.definitions,
  };
}

export async function approveAgreementDocument(id: string, reviewedById?: string) {
  const doc = await prisma.agreementDocument.findUniqueOrThrow({ where: { id } });
  if (doc.status === "APPROVED") throw new Error("Already approved.");
  if (doc.status === "REJECTED") throw new Error("Rejected documents cannot be approved.");
  if (doc.status !== "READY_FOR_REVIEW" && !doc.reviewedTerms) {
    throw new Error("Analyze and review terms before approving.");
  }

  const termsJson = doc.reviewedTerms ?? doc.extractedTerms;

  if (doc.kind === "DEBT_AGREEMENT") {
    const terms = asDebtTerms(termsJson);
    if (!terms.entityId) throw new Error("Entity is required to approve debt terms.");
    if (!terms.instrumentNumber?.trim()) throw new Error("Instrument number is required.");
    if (!terms.name?.trim()) throw new Error("Name is required.");
    if (!terms.counterparty?.trim()) throw new Error("Counterparty is required.");
    if (!terms.issueDate || !terms.maturityDate) throw new Error("Issue and maturity dates are required.");
    if (!terms.principalDollars) throw new Error("Principal is required.");
    if (!terms.rateType) throw new Error("Rate type is required.");

    const instrument = await createDebtInstrument({
      entityId: terms.entityId,
      name: terms.name.trim(),
      instrumentNumber: terms.instrumentNumber.trim(),
      type: terms.type ?? "FUNDING_AGREEMENT",
      counterparty: terms.counterparty.trim(),
      issueDate: new Date(terms.issueDate),
      maturityDate: new Date(terms.maturityDate),
      principalCents: dollarsToCentsFromBody(terms.principalDollars),
      issuanceCostsCents: terms.issuanceCostsDollars
        ? dollarsToCentsFromBody(terms.issuanceCostsDollars)
        : BigInt(0),
      commitmentCents: terms.commitmentDollars
        ? dollarsToCentsFromBody(terms.commitmentDollars)
        : undefined,
      unusedFeeRateBps: terms.unusedFeeRateBps ? Number(terms.unusedFeeRateBps) : undefined,
      rateType: terms.rateType,
      fixedRateBps: terms.fixedRateBps ? Number(terms.fixedRateBps) : undefined,
      indexName: terms.indexName,
      spreadBps: terms.spreadBps ? Number(terms.spreadBps) : undefined,
      indexFixingBps: terms.indexFixingBps ? Number(terms.indexFixingBps) : undefined,
      floorBps: terms.floorBps ? Number(terms.floorBps) : undefined,
      paymentFrequency: terms.paymentFrequency,
      resetFrequency: terms.resetFrequency,
      dayCount: terms.dayCount,
    });

    if (terms.covenantNotes) {
      await prisma.debtInstrument.update({
        where: { id: instrument.id },
        data: { covenantNotes: terms.covenantNotes },
      });
    }

    await prisma.auditEvent.create({
      data: {
        userId: reviewedById,
        action: "AGREEMENT_APPROVED",
        entityType: "AgreementDocument",
        entityId: id,
        detail: `Approved debt agreement → instrument ${instrument.instrumentNumber}`,
      },
    });

    return prisma.agreementDocument.update({
      where: { id },
      data: {
        status: "APPROVED",
        debtInstrumentId: instrument.id,
        reviewedById: reviewedById ?? null,
        reviewedAt: new Date(),
        approvedAt: new Date(),
        reviewedTerms: terms as Prisma.InputJsonValue,
      },
      include: { debtInstrument: true },
    });
  }

  const terms = asCovenantTerms(termsJson);
  const defs = terms.definitions.filter((d) => d.name?.trim() && d.threshold !== undefined && d.threshold !== "");
  if (!defs.length) throw new Error("At least one covenant definition with a threshold is required.");

  const created = [];
  for (const d of defs) {
    const row = await prisma.covenantDefinition.create({
      data: {
        name: d.name!.trim(),
        metricKey: (d.metricKey || "leverage").trim(),
        entityId: d.entityId || terms.entityId || null,
        threshold: Number(d.threshold),
        operator: d.operator || "lte",
        frequency: d.frequency || "quarterly",
        notes: [terms.packageName ? `From: ${terms.packageName}` : null, d.notes]
          .filter(Boolean)
          .join(" — ") || null,
      },
    });
    created.push(row);
  }

  await prisma.auditEvent.create({
    data: {
      userId: reviewedById,
      action: "AGREEMENT_APPROVED",
      entityType: "AgreementDocument",
      entityId: id,
      detail: `Approved covenant agreement → ${created.length} definition(s)`,
    },
  });

  return prisma.agreementDocument.update({
    where: { id },
    data: {
      status: "APPROVED",
      covenantDefinitionId: created[0]?.id ?? null,
      reviewedById: reviewedById ?? null,
      reviewedAt: new Date(),
      approvedAt: new Date(),
      reviewedTerms: terms as Prisma.InputJsonValue,
    },
    include: { covenantDefinition: true },
  });
}

export async function readAgreementFile(id: string) {
  const doc = await prisma.agreementDocument.findUniqueOrThrow({ where: { id } });
  const buffer = await readFile(doc.storagePath);
  return { doc, buffer };
}
