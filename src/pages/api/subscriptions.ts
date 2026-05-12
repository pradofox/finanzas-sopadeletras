import type { APIRoute } from "astro";
import { json, requireAuth, requireWrite, db, nowMs } from "../../lib/api";
import { listSubscriptions } from "../../lib/finance";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.res;
  const u = new URL(request.url);
  const subs = await listSubscriptions(u.searchParams.get("active") === "1");
  return json(200, { ok: true, subscriptions: subs });
};

export const POST: APIRoute = async ({ request }) => {
  const auth = await requireWrite(request);
  if (!auth.ok) return auth.res;
  const body = (await request.json().catch(() => null)) as {
    service?: string; amount_monthly?: number; currency?: string;
    account_id?: number | null; notes?: string | null;
  } | null;
  if (!body?.service || typeof body?.amount_monthly !== "number") {
    return json(400, { ok: false, error: "missing_fields" });
  }
  const now = nowMs();
  const res = await db()
    .prepare(
      `INSERT INTO subscriptions (service,amount_monthly,currency,account_id,active,cancelled_at,notes,created_at)
       VALUES (?,?,?,?,1,NULL,?,?)`
    )
    .bind(body.service, body.amount_monthly, body.currency ?? "MXN", body.account_id ?? null, body.notes ?? null, now)
    .run();
  return json(200, { ok: true, id: res.meta.last_row_id });
};
