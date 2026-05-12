import type { APIRoute } from "astro";
import { json, requireAuth, requireWrite, db, nowMs } from "../../lib/api";
import { listReceivables, type Receivable } from "../../lib/finance";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.res;
  const u = new URL(request.url);
  const status = (u.searchParams.get("status") as Receivable["status"]) || undefined;
  const receivables = await listReceivables(status);
  return json(200, { ok: true, receivables });
};

export const POST: APIRoute = async ({ request }) => {
  const auth = await requireWrite(request);
  if (!auth.ok) return auth.res;
  const body = (await request.json().catch(() => null)) as {
    client?: string; project?: string | null; amount?: number;
    expected_date?: string | null; status?: Receivable["status"]; notes?: string | null;
  } | null;
  if (!body?.client || typeof body?.amount !== "number") {
    return json(400, { ok: false, error: "missing_fields" });
  }
  const now = nowMs();
  const res = await db()
    .prepare(
      `INSERT INTO receivables (client,project,amount,expected_date,status,paid_amount,paid_date,notes,created_at,updated_at)
       VALUES (?,?,?,?,?,0,NULL,?,?,?)`
    )
    .bind(
      body.client, body.project ?? null, body.amount,
      body.expected_date ?? null, body.status ?? "pending",
      body.notes ?? null, now, now
    )
    .run();
  return json(200, { ok: true, id: res.meta.last_row_id });
};
