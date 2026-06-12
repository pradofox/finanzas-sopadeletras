// POST /api/nl/confirm — ejecuta las operaciones ya confirmadas por el usuario
import type { APIRoute } from "astro";
import { json, requireWrite, db, nowMs, todayIso } from "../../../lib/api";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const auth = await requireWrite(request);
  if (!auth.ok) return auth.res;

  const body = (await request.json().catch(() => null)) as { ops?: any[] } | null;
  if (!body?.ops?.length) return json(400, { ok: false, error: "no_ops" });

  const results: { op: string; ok: boolean; detail?: string }[] = [];
  const now = nowMs();

  for (const op of body.ops) {
    try {
      switch (op.op) {
        case "update_account_balance": {
          await db()
            .prepare("UPDATE accounts SET balance=?, updated_at=? WHERE id=?")
            .bind(op.new_balance, now, op.account_id)
            .run();
          results.push({ op: op.op, ok: true });
          break;
        }

        case "mark_receivable_paid": {
          const date = op.paid_date || todayIso();
          // Actualizar receivable
          await db()
            .prepare("UPDATE receivables SET status='paid', paid_amount=?, paid_date=?, updated_at=? WHERE id=?")
            .bind(op.paid_amount, date, now, op.receivable_id)
            .run();
          // Crear movement de ingreso
          const desc = `Cobro ${op.client}${op.project ? " · " + op.project : ""}`;
          await db()
            .prepare(
              `INSERT INTO movements (date,account_id,kind,amount,category,counterparty,description,reconciled,related_receivable_id,created_at)
               VALUES (?,?,'income',?,?,?,?,1,?,?)`
            )
            .bind(date, op.account_id, op.paid_amount, "ingresos", op.client, desc, op.receivable_id, now)
            .run();
          // Actualizar saldo de cuenta
          await db()
            .prepare("UPDATE accounts SET balance=balance+?, updated_at=? WHERE id=?")
            .bind(op.paid_amount, now, op.account_id)
            .run();
          results.push({ op: op.op, ok: true });
          break;
        }

        case "add_receivable": {
          await db()
            .prepare(
              `INSERT INTO receivables (client,project,amount,expected_date,status,confidence,paid_amount,notes,created_at,updated_at)
               VALUES (?,?,?,?,?,?,0,?,?,?)`
            )
            .bind(
              op.client, op.project ?? null, op.amount,
              op.expected_date ?? null, "pending",
              op.confidence ?? "confirmed",
              op.notes ?? null, now, now
            )
            .run();
          results.push({ op: op.op, ok: true });
          break;
        }

        case "update_receivable": {
          const fields = op.fields ?? {};
          const sets: string[] = [];
          const vals: unknown[] = [];
          const allowed = ["status", "confidence", "expected_date", "amount", "notes", "paid_amount", "paid_date"];
          for (const k of allowed) {
            if (k in fields) { sets.push(`${k}=?`); vals.push(fields[k]); }
          }
          if (sets.length) {
            sets.push("updated_at=?"); vals.push(now);
            vals.push(op.receivable_id);
            await db().prepare(`UPDATE receivables SET ${sets.join(",")} WHERE id=?`).bind(...vals).run();
          }
          results.push({ op: op.op, ok: true });
          break;
        }

        case "delete_receivable": {
          await db().prepare("UPDATE receivables SET status='cancelled', updated_at=? WHERE id=?").bind(now, op.receivable_id).run();
          results.push({ op: op.op, ok: true });
          break;
        }

        case "add_movement": {
          const date = op.date || todayIso();
          await db()
            .prepare(
              `INSERT INTO movements (date,account_id,kind,amount,category,description,reconciled,created_at)
               VALUES (?,?,?,?,?,?,0,?)`
            )
            .bind(date, op.account_id, op.kind, op.amount, op.category ?? null, op.description ?? null, now)
            .run();
          // Aplicar delta al saldo
          const delta = op.kind === "income" ? op.amount : -op.amount;
          await db().prepare("UPDATE accounts SET balance=balance+?, updated_at=? WHERE id=?").bind(delta, now, op.account_id).run();
          results.push({ op: op.op, ok: true });
          break;
        }

        default:
          results.push({ op: op.op, ok: false, detail: "op desconocida" });
      }
    } catch (err: any) {
      results.push({ op: op.op, ok: false, detail: err?.message ?? "error" });
    }
  }

  return json(200, { ok: true, results });
};
