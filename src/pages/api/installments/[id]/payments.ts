import type { APIRoute } from "astro";
import { json, requireAuth, requireWrite, db, nowMs, todayIso } from "../../../../lib/api";
import { listInstallmentPayments } from "../../../../lib/finance";

export const prerender = false;

export const GET: APIRoute = async ({ request, params }) => {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.res;
  const planId = Number(params.id);
  if (!planId) return json(400, { ok: false, error: "bad_id" });
  const payments = await listInstallmentPayments(planId);
  return json(200, { ok: true, payments });
};

export const POST: APIRoute = async ({ request, params }) => {
  const auth = await requireWrite(request);
  if (!auth.ok) return auth.res;
  const planId = Number(params.id);
  if (!planId) return json(400, { ok: false, error: "bad_id" });

  const body = (await request.json().catch(() => null)) as {
    amount?: number;
    months_covered?: number;
    date?: string;
    account_id?: number | null;
    notes?: string | null;
  } | null;

  if (!body || typeof body.amount !== "number") {
    return json(400, { ok: false, error: "missing_fields" });
  }
  const plan = await db()
    .prepare("SELECT id, concept, creditor, total_amount, months_total FROM installment_plans WHERE id=?")
    .bind(planId).first<{ id: number; concept: string; creditor: string; total_amount: number; months_total: number }>();
  if (!plan) return json(404, { ok: false, error: "plan_not_found" });

  const date = body.date ?? todayIso();
  const months = Math.max(1, Math.floor(body.months_covered ?? 1));
  const now = nowMs();

  // Si se eligio cuenta: crear movement de gasto (kind='expense') y bajar balance
  let movementId: number | null = null;
  if (body.account_id) {
    const desc = `Mensualidad ${plan.concept} → ${plan.creditor}${months > 1 ? ` (${months} meses)` : ""}`;
    const mres = await db()
      .prepare(
        `INSERT INTO movements (date,account_id,kind,amount,category,counterparty,description,notes,reconciled,related_receivable_id,related_account_id,created_at)
         VALUES (?,?, 'expense', ?, 'mensualidades', ?, ?, NULL, 1, NULL, NULL, ?)`
      )
      .bind(date, body.account_id, body.amount, plan.creditor, desc, now)
      .run();
    movementId = Number(mres.meta.last_row_id);
    await db()
      .prepare("UPDATE accounts SET balance = balance - ?, updated_at = ? WHERE id = ?")
      .bind(body.amount, now, body.account_id)
      .run();
  }

  const res = await db()
    .prepare(
      `INSERT INTO installment_payments (plan_id,date,amount,months_covered,account_id,movement_id,notes,created_at)
       VALUES (?,?,?,?,?,?,?,?)`
    )
    .bind(planId, date, body.amount, months, body.account_id ?? null, movementId, body.notes ?? null, now)
    .run();
  const paymentId = Number(res.meta.last_row_id);

  // Si con este pago se completa el plan, marcarlo paid
  const sum = await db()
    .prepare("SELECT COALESCE(SUM(amount),0) AS paid, COALESCE(SUM(months_covered),0) AS mpaid FROM installment_payments WHERE plan_id=?")
    .bind(planId).first<{ paid: number; mpaid: number }>();
  if (sum && (sum.paid >= plan.total_amount || sum.mpaid >= plan.months_total)) {
    await db()
      .prepare("UPDATE installment_plans SET status='paid', updated_at=? WHERE id=? AND status='active'")
      .bind(now, planId).run();
  }

  return json(200, { ok: true, payment_id: paymentId, movement_id: movementId });
};
