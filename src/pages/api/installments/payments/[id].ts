import type { APIRoute } from "astro";
import { json, requireWrite, db, nowMs } from "../../../../lib/api";

export const prerender = false;

export const DELETE: APIRoute = async ({ request, params }) => {
  const auth = await requireWrite(request);
  if (!auth.ok) return auth.res;
  const id = Number(params.id);
  if (!id) return json(400, { ok: false, error: "bad_id" });

  // Recuperar el pago para revertir el movement y el balance si aplica
  const pay = await db()
    .prepare("SELECT id, plan_id, amount, account_id, movement_id FROM installment_payments WHERE id=?")
    .bind(id).first<{ id: number; plan_id: number; amount: number; account_id: number | null; movement_id: number | null }>();
  if (!pay) return json(404, { ok: false, error: "not_found" });

  const now = nowMs();
  if (pay.movement_id && pay.account_id) {
    // Revertir balance y borrar movement
    await db()
      .prepare("UPDATE accounts SET balance = balance + ?, updated_at = ? WHERE id = ?")
      .bind(pay.amount, now, pay.account_id).run();
    await db().prepare("DELETE FROM movements WHERE id=?").bind(pay.movement_id).run();
  }
  await db().prepare("DELETE FROM installment_payments WHERE id=?").bind(id).run();

  // Si el plan estaba marcado paid y ya no se cumple la condicion, reabrirlo
  await db()
    .prepare(
      `UPDATE installment_plans SET status='active', updated_at=?
         WHERE id=? AND status='paid'
           AND (SELECT COALESCE(SUM(amount),0) FROM installment_payments WHERE plan_id=?) < total_amount
           AND (SELECT COALESCE(SUM(months_covered),0) FROM installment_payments WHERE plan_id=?) < months_total`
    )
    .bind(now, pay.plan_id, pay.plan_id, pay.plan_id).run();

  return json(200, { ok: true });
};
