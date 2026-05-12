import type { APIRoute } from "astro";
import { json, requireAuth, requireWrite, db, nowMs } from "../../../lib/api";

export const prerender = false;

const FIELDS = ["name","type","bank","last4","balance","credit_limit","apr","cut_day","due_day","active","notes"] as const;

export const GET: APIRoute = async ({ request, params }) => {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.res;
  const id = Number(params.id);
  if (!id) return json(400, { ok: false, error: "bad_id" });
  const row = await db().prepare("SELECT * FROM accounts WHERE id=?").bind(id).first();
  if (!row) return json(404, { ok: false, error: "not_found" });
  return json(200, { ok: true, account: row });
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
  await db().prepare(`UPDATE accounts SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
  return json(200, { ok: true });
};
