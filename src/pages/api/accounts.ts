import type { APIRoute } from "astro";
import { json, requireAuth, requireWrite, db, nowMs } from "../../lib/api";
import { listAccounts } from "../../lib/finance";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.res;
  const url = new URL(request.url);
  const includeInactive = url.searchParams.get("inactive") === "1";
  const accounts = await listAccounts(includeInactive);
  return json(200, { ok: true, accounts });
};

export const POST: APIRoute = async ({ request }) => {
  const auth = await requireWrite(request);
  if (!auth.ok) return auth.res;
  const body = (await request.json().catch(() => null)) as {
    name?: string; type?: string; bank?: string | null; last4?: string | null;
    balance?: number; credit_limit?: number | null; apr?: number | null;
    cut_day?: number | null; due_day?: number | null; notes?: string | null;
  } | null;
  if (!body?.name || !body?.type) return json(400, { ok: false, error: "missing_fields" });
  if (!["debit","credit","cash","wallet"].includes(body.type)) return json(400, { ok: false, error: "invalid_type" });

  const now = nowMs();
  const res = await db()
    .prepare(
      `INSERT INTO accounts (name,type,bank,last4,balance,credit_limit,apr,cut_day,due_day,active,notes,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,1,?,?,?)`
    )
    .bind(
      body.name, body.type, body.bank ?? null, body.last4 ?? null,
      body.balance ?? 0, body.credit_limit ?? null, body.apr ?? null,
      body.cut_day ?? null, body.due_day ?? null, body.notes ?? null, now, now
    )
    .run();
  return json(200, { ok: true, id: res.meta.last_row_id });
};
