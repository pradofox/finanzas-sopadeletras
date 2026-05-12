import type { APIRoute } from "astro";
import { json, requireWrite, db, nowMs } from "../../../lib/api";

export const prerender = false;

const FIELDS = ["service","amount_monthly","currency","account_id","active","notes"] as const;

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
  // Si la cancelan, sellar cancelled_at
  if (body.active === 0 || body.active === false) {
    sets.push("cancelled_at = ?"); vals.push(nowMs());
  } else if (body.active === 1 || body.active === true) {
    sets.push("cancelled_at = NULL");
  }
  if (!sets.length) return json(400, { ok: false, error: "no_fields" });
  vals.push(id);
  await db().prepare(`UPDATE subscriptions SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
  return json(200, { ok: true });
};
