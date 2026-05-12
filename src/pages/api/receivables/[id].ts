import type { APIRoute } from "astro";
import { json, requireWrite, db, nowMs, todayIso } from "../../../lib/api";

export const prerender = false;

const FIELDS = ["client","project","amount","expected_date","status","paid_amount","paid_date","notes"] as const;

export const PATCH: APIRoute = async ({ request, params }) => {
  const auth = await requireWrite(request);
  if (!auth.ok) return auth.res;
  const id = Number(params.id);
  if (!id) return json(400, { ok: false, error: "bad_id" });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown> & {
    create_income?: { account_id: number; category?: string | null; description?: string | null };
  };

  // Si marcan paid sin paid_date, sellar hoy.
  if (body.status === "paid" && !body.paid_date) body.paid_date = todayIso();
  if (body.status === "paid" && body.paid_amount == null) {
    // Asumir que se cobro completo: tomarlo del monto actual
    const cur = await db().prepare("SELECT amount FROM receivables WHERE id=?").bind(id).first<{ amount: number }>();
    if (cur) body.paid_amount = cur.amount;
  }

  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const f of FIELDS) {
    if (f in body) { sets.push(`${f} = ?`); vals.push(body[f] as unknown); }
  }
  if (!sets.length && !body.create_income) return json(400, { ok: false, error: "no_fields" });

  const now = nowMs();
  if (sets.length) {
    sets.push("updated_at = ?"); vals.push(now);
    vals.push(id);
    await db().prepare(`UPDATE receivables SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
  }

  // Opcionalmente crear movement de ingreso amarrado a este receivable
  let movementId: number | null = null;
  if (body.create_income && body.create_income.account_id && body.paid_amount && body.paid_date) {
    const r = await db().prepare("SELECT client, project FROM receivables WHERE id=?").bind(id).first<{ client: string; project: string | null }>();
    const desc = body.create_income.description ?? (r ? `Cobro ${r.client}${r.project ? " · " + r.project : ""}` : "Cobro");
    const res = await db()
      .prepare(
        `INSERT INTO movements (date,account_id,kind,amount,category,counterparty,description,notes,reconciled,related_receivable_id,related_account_id,created_at)
         VALUES (?,?, 'income', ?, ?, ?, ?, NULL, 1, ?, NULL, ?)`
      )
      .bind(
        body.paid_date, body.create_income.account_id, body.paid_amount as number,
        body.create_income.category ?? "ingresos", r?.client ?? null, desc, id, now
      ).run();
    movementId = Number(res.meta.last_row_id);
    await db().prepare("UPDATE accounts SET balance = balance + ?, updated_at = ? WHERE id = ?")
      .bind(body.paid_amount as number, now, body.create_income.account_id).run();
  }

  return json(200, { ok: true, movement_id: movementId });
};
