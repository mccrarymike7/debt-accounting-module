import { NextResponse } from "next/server";
import { auth, canWrite } from "@/auth";
import {
  enterRateReset,
  recordPayment,
  rebuildSchedule,
  runAccrual,
  runEffectiveInterestAmortization,
} from "@/lib/accounting";
import { assertDateNotInLockedPeriod } from "@/lib/monthly-close";
import { jsonResponse } from "@/lib/json";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canWrite(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const body = await request.json();
  const action = body.action as string;

  try {
    if (action === "accrual") {
      const periodStart = new Date(body.periodStart);
      const periodEnd = new Date(body.periodEnd);
      await assertDateNotInLockedPeriod(periodEnd);
      const run = await runAccrual(id, periodStart, periodEnd);
      return jsonResponse({ ok: true, run });
    }
    if (action === "amortization") {
      const periodStart = new Date(body.periodStart);
      const periodEnd = new Date(body.periodEnd);
      await assertDateNotInLockedPeriod(periodEnd);
      const row = await runEffectiveInterestAmortization(id, periodStart, periodEnd);
      return jsonResponse({ ok: true, row });
    }
    if (action === "payment") {
      await assertDateNotInLockedPeriod(new Date(body.paidDate));
      const journal = await recordPayment(id, body.cashEventId, new Date(body.paidDate));
      return jsonResponse({ ok: true, journal });
    }
    if (action === "rate_reset") {
      await assertDateNotInLockedPeriod(new Date(body.effectiveDate));
      const obs = await enterRateReset({
        instrumentId: id,
        effectiveDate: new Date(body.effectiveDate),
        endDate: body.endDate ? new Date(body.endDate) : undefined,
        indexFixingBps: Number(body.indexFixingBps),
        notes: body.notes,
      });
      return jsonResponse({ ok: true, obs });
    }
    if (action === "rebuild_schedule") {
      const count = await rebuildSchedule(id);
      return jsonResponse({ ok: true, count });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Action failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
