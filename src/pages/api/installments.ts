import type { APIRoute } from "astro";
import { json, requireAuth, requireWrite, db, nowMs } from "../../lib/api";
import { listInstallmentPlans } from "../../lib/finance";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.res;
  const u = new URL(request.url);
  const plans = await listInstallmentPlans(u.searchParams.get("active") === "1");
  return json(200, { ok: true, plans });
};

export const POST: APIRoute = async ({ request }) => {
  const auth = await requireWrite(request);
  if (!auth.ok) return auth.res;
  const body = (await request.json().catch(() => null)) as {
    concept?: string;
    creditor?: string;
    total_amount?: number;
    monthly_amount?: number;
    months_total?: number;
    start_date?: string | null;
    notes?: string | null;
  } | null;

  if (!body?.concept || !body?.creditor
      || typeof body?.total_amount !== "number"
      || typeof body?.monthly_amount !== "number"
      || typeof body?.months_total !== "number") {
    return json(400, { ok: false, error: "missing_fields" });
  }

  const now = nowMs();
  const res = await db()
    .prepare(
      `INSERT INTO installment_plans
       (concept,creditor,total_amount,monthly_amount,months_total,start_date,status,notes,created_at,updated_at)
       VALUES (?,?,?,?,?,?, 'active', ?,?,?)`
    )
    .bind(
      body.concept, body.creditor,
      body.total_amount, body.monthly_amount, body.months_total,
      body.start_date ?? null, body.notes ?? null, now, now,
    )
    .run();
  return json(200, { ok: true, id: res.meta.last_row_id });
};
