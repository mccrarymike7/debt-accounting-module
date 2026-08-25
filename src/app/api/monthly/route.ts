import { NextResponse } from "next/server";
import { auth, canWrite } from "@/auth";
import {
  assertDateNotInLockedPeriod,
  assertMonthlyCloseWritable,
  closeMonthlyPeriod,
  completeMonthlyStep,
  createDebtInstrument,
  generateGlExportBatch,
  getOrCreateMonthlyClose,
  markMonthlyPosted,
  reopenMonthlyStep,
  dollarsToCentsFromBody,
} from "@/lib/monthly-close-api";
import {
  enterRateReset,
  enterRateResetForReference,
  recordPayment,
  recordUpfrontCosts,
  runAccrual,
  runEffectiveInterestAmortization,
} from "@/lib/accounting";
import { bpsFromPercentInput } from "@/lib/reference-rates";
import {
  recordRevolverDraw,
  recordRevolverRepay,
  trueUpRevolverToBank,
} from "@/lib/revolver";
import { prisma } from "@/lib/db";
import { jsonResponse } from "@/lib/json";
import type { MonthlyStepKey } from "@/generated/prisma/client";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const periodLabel = searchParams.get("period");
  if (!periodLabel) {
    const list = await prisma.monthlyClose.findMany({
      orderBy: { periodLabel: "desc" },
      include: { steps: { orderBy: { sortOrder: "asc" } }, glExports: true },
    });
    return jsonResponse({ closes: list });
  }

  const close = await getOrCreateMonthlyClose(periodLabel, session.user.id);
  return jsonResponse({ close });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canWrite(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const action = body.action as string;

  try {
    if (action === "open_period") {
      const close = await getOrCreateMonthlyClose(body.periodLabel, session.user.id);
      return jsonResponse({ ok: true, close });
    }
    if (action === "close_period") {
      const close = await closeMonthlyPeriod(body.monthlyCloseId);
      return jsonResponse({ ok: true, close });
    }
    if (action === "reopen_step") {
      const close = await reopenMonthlyStep(
        body.monthlyCloseId,
        body.stepKey as MonthlyStepKey,
      );
      return jsonResponse({ ok: true, close });
    }

    // All other mutations require an open (non-locked) monthly close
    if (body.monthlyCloseId) {
      await assertMonthlyCloseWritable(body.monthlyCloseId);
    }

    if (action === "complete_step") {
      const close = await completeMonthlyStep(
        body.monthlyCloseId,
        body.stepKey as MonthlyStepKey,
        body.notes,
      );
      return jsonResponse({ ok: true, close });
    }
    if (action === "add_debt") {
      const principalCents = dollarsToCentsFromBody(body.principalDollars);
      const instrument = await createDebtInstrument({
        entityId: body.entityId,
        name: body.name,
        instrumentNumber: body.instrumentNumber,
        type: body.type,
        counterparty: body.counterparty,
        issueDate: new Date(body.issueDate),
        maturityDate: new Date(body.maturityDate),
        principalCents,
        issuanceCostsCents: body.issuanceCostsDollars
          ? dollarsToCentsFromBody(body.issuanceCostsDollars)
          : BigInt(0),
        commitmentCents: body.commitmentDollars
          ? dollarsToCentsFromBody(body.commitmentDollars)
          : undefined,
        unusedFeeRateBps: body.unusedFeeRateBps ? Number(body.unusedFeeRateBps) : undefined,
        rateType: body.rateType,
        fixedRateBps: body.fixedRateBps ? Number(body.fixedRateBps) : undefined,
        indexName: body.indexName,
        referenceRateId: body.referenceRateId,
        spreadBps: body.spreadBps ? Number(body.spreadBps) : undefined,
        indexFixingBps: body.indexFixingBps ? Number(body.indexFixingBps) : undefined,
        floorBps: body.floorBps ? Number(body.floorBps) : undefined,
        paymentFrequency: body.paymentFrequency,
        resetFrequency: body.resetFrequency,
        monthlyCloseId: body.monthlyCloseId,
      });
      return jsonResponse({ ok: true, instrument });
    }
    if (action === "upfront_costs") {
      await assertDateNotInLockedPeriod(new Date(body.activityDate));
      const result = await recordUpfrontCosts({
        instrumentId: body.instrumentId,
        activityDate: new Date(body.activityDate),
        amountCents: dollarsToCentsFromBody(body.amountDollars),
        description: body.description,
        monthlyCloseId: body.monthlyCloseId,
      });
      return jsonResponse({ ok: true, ...result });
    }
    if (action === "rate_reset") {
      await assertDateNotInLockedPeriod(new Date(body.effectiveDate));
      const obs = await enterRateReset({
        instrumentId: body.instrumentId,
        effectiveDate: new Date(body.effectiveDate),
        indexFixingBps: Number(body.indexFixingBps),
        notes: body.notes,
      });
      return jsonResponse({ ok: true, obs });
    }
    if (action === "rate_reset_reference") {
      await assertDateNotInLockedPeriod(new Date(body.effectiveDate));
      let indexFixingBps: number;
      if (body.indexFixingPercent != null && body.indexFixingPercent !== "") {
        const ref = await prisma.referenceRate.findUniqueOrThrow({
          where: { id: body.referenceRateId },
        });
        indexFixingBps = bpsFromPercentInput(
          String(body.indexFixingPercent),
          ref.decimalPlaces,
        );
      } else {
        indexFixingBps = Number(body.indexFixingBps);
      }
      const result = await enterRateResetForReference({
        referenceRateId: body.referenceRateId,
        effectiveDate: new Date(body.effectiveDate),
        indexFixingBps,
        notes: body.notes,
      });
      return jsonResponse({ ok: true, ...result });
    }
    if (action === "payment") {
      await assertDateNotInLockedPeriod(new Date(body.paidDate));
      const journal = await recordPayment(
        body.instrumentId,
        body.cashEventId,
        new Date(body.paidDate),
      );
      if (body.monthlyCloseId) {
        await prisma.journalEntry.update({
          where: { id: journal.id },
          data: { monthlyCloseId: body.monthlyCloseId },
        });
      }
      return jsonResponse({ ok: true, journal });
    }
    if (action === "run_period_accruals") {
      const instruments = await prisma.debtInstrument.findMany({
        where: { status: "ACTIVE" },
        select: { id: true },
      });
      const periodStart = new Date(body.periodStart);
      const periodEnd = new Date(body.periodEnd);
      await assertDateNotInLockedPeriod(periodEnd);
      const results = [];
      for (const inst of instruments) {
        const accrual = await runAccrual(inst.id, periodStart, periodEnd);
        const amort = await runEffectiveInterestAmortization(inst.id, periodStart, periodEnd);
        if (body.monthlyCloseId && accrual.journalEntryId) {
          await prisma.journalEntry.update({
            where: { id: accrual.journalEntryId },
            data: { monthlyCloseId: body.monthlyCloseId },
          });
        }
        if (body.monthlyCloseId && amort.journalEntryId) {
          await prisma.journalEntry.update({
            where: { id: amort.journalEntryId },
            data: { monthlyCloseId: body.monthlyCloseId },
          });
        }
        results.push({ instrumentId: inst.id, accrualId: accrual.id, amortId: amort.id });
      }
      return jsonResponse({ ok: true, results });
    }
    if (action === "revolver_draw") {
      await assertDateNotInLockedPeriod(new Date(body.activityDate));
      const activity = await recordRevolverDraw({
        instrumentId: body.instrumentId,
        activityDate: new Date(body.activityDate),
        amountCents: dollarsToCentsFromBody(body.amountDollars),
        notes: body.notes,
        monthlyCloseId: body.monthlyCloseId,
      });
      return jsonResponse({ ok: true, activity });
    }
    if (action === "revolver_repay") {
      await assertDateNotInLockedPeriod(new Date(body.activityDate));
      const activity = await recordRevolverRepay({
        instrumentId: body.instrumentId,
        activityDate: new Date(body.activityDate),
        amountCents: dollarsToCentsFromBody(body.amountDollars),
        notes: body.notes,
        monthlyCloseId: body.monthlyCloseId,
      });
      return jsonResponse({ ok: true, activity });
    }
    if (action === "revolver_true_up") {
      await assertDateNotInLockedPeriod(new Date(body.activityDate));
      const activity = await trueUpRevolverToBank({
        instrumentId: body.instrumentId,
        activityDate: new Date(body.activityDate),
        bankBalanceCents: dollarsToCentsFromBody(body.bankBalanceDollars),
        notes: body.notes,
        monthlyCloseId: body.monthlyCloseId,
      });
      return jsonResponse({ ok: true, activity });
    }
    if (action === "generate_gl") {
      const { batch, journals } = await generateGlExportBatch(body.monthlyCloseId);
      const close = await prisma.monthlyClose.findUniqueOrThrow({
        where: { id: body.monthlyCloseId },
        include: { steps: { orderBy: { sortOrder: "asc" } }, glExports: true },
      });
      return jsonResponse({
        ok: true,
        batch,
        journalCount: journals.length,
        close,
      });
    }
    if (action === "mark_posted") {
      const close = await markMonthlyPosted(body.monthlyCloseId);
      return jsonResponse({ ok: true, close });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Action failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
