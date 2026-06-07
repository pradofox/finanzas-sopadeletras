import type { APIRoute } from "astro";
import { json, requireWrite, db, nowMs } from "../../../lib/api";
import { listInstallmentPayments } from "../../../lib/finance";

export const prerender = false;

const FIELDS = ["concept","creditor","total_amount","monthly_amount","months_total","start_date","status","notes"] as const;

export const GET: APIRoute = async ({ request, params }) => {
  // Devuelve el plan + sus pagos
  const auth = await import("../../../lib/api").then(m => m.requireAuth(request));
  if (!auth.ok) return auth.res;
  const id = Number(params.id);
  if (!id) return json(400, { ok: false, error: "bad_id" });
  const plan = await db()
    .prepare("SELECT * FROM installment_plans WHERE id=?")
    .bind(id).first();
  if (!plan) return json(404, { ok: false, error: "not_found" });
  const payments = await listInstallmentPayments(id);
  return json(200, { ok: true, plan, payments });
};

export const PATCH: APIRoute = async ({ request, params }) => {
  const auth = await requireWrite(request);
  if (!auth.ok) return auth.res;
  const id = Number(params.id);
  if (!id) return json(400, { ok: false, error: "bad_id" });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const f of FIELDS) {
    if (f in body) { sets.push(`${f} = ?`); vals.push(body[f] as unknown); }
  }
  if (!sets.length) return json(400, { ok: false, error: "no_fields" });
  sets.push("updated_at = ?"); vals.push(nowMs());
  vals.push(id);
  await db().prepare(`UPDATE installment_plans SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
  return json(200, { ok: true });
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const auth = await requireWrite(request);
  if (!auth.ok) return auth.res;
  const id = Number(params.id);
  if (!id) return json(400, { ok: false, error: "bad_id" });
  // ON DELETE CASCADE limpia los pagos automaticamente
  await db().prepare("DELETE FROM installment_plans WHERE id = ?").bind(id).run();
  return json(200, { ok: true });
};
