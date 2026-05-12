import type { APIRoute } from "astro";
import { json, requireWrite, db, nowMs } from "../../../lib/api";

export const prerender = false;

const FIELDS = ["date","account_id","kind","amount","category","counterparty","description","notes","reconciled","related_receivable_id","related_account_id"] as const;

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
  vals.push(id);
  await db().prepare(`UPDATE movements SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
  return json(200, { ok: true });
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const auth = await requireWrite(request);
  if (!auth.ok) return auth.res;
  const id = Number(params.id);
  if (!id) return json(400, { ok: false, error: "bad_id" });
  await db().prepare("DELETE FROM movements WHERE id=?").bind(id).run();
  nowMs();
  return json(200, { ok: true });
};
