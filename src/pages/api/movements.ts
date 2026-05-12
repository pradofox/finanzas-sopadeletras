import type { APIRoute } from "astro";
import { json, requireAuth, requireWrite, db, nowMs, todayIso } from "../../lib/api";
import { listMovements, type Movement } from "../../lib/finance";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.res;
  const u = new URL(request.url);
  const movements = await listMovements({
    from: u.searchParams.get("from") || undefined,
    to: u.searchParams.get("to") || undefined,
    account_id: u.searchParams.get("account_id") ? Number(u.searchParams.get("account_id")) : undefined,
    kind: (u.searchParams.get("kind") as Movement["kind"]) || undefined,
    category: u.searchParams.get("category") || undefined,
    limit: u.searchParams.get("limit") ? Number(u.searchParams.get("limit")) : undefined,
  });
  return json(200, { ok: true, movements });
};

export const POST: APIRoute = async ({ request }) => {
  const auth = await requireWrite(request);
  if (!auth.ok) return auth.res;
  const body = (await request.json().catch(() => null)) as {
    date?: string; account_id?: number; kind?: string; amount?: number;
    category?: string | null; counterparty?: string | null;
    description?: string | null; notes?: string | null;
    related_receivable_id?: number | null; related_account_id?: number | null;
    apply_to_balance?: boolean;
  } | null;

  if (!body?.account_id || !body?.kind || typeof body?.amount !== "number") {
    return json(400, { ok: false, error: "missing_fields" });
  }
  if (!["income","expense","transfer","cc_payment","cc_charge"].includes(body.kind)) {
    return json(400, { ok: false, error: "invalid_kind" });
  }
  if (body.amount <= 0) return json(400, { ok: false, error: "amount_must_be_positive" });

  const now = nowMs();
  const date = body.date || todayIso();
  const res = await db()
    .prepare(
      `INSERT INTO movements (date,account_id,kind,amount,category,counterparty,description,notes,reconciled,related_receivable_id,related_account_id,created_at)
       VALUES (?,?,?,?,?,?,?,?,0,?,?,?)`
    )
    .bind(
      date, body.account_id, body.kind, body.amount,
      body.category ?? null, body.counterparty ?? null,
      body.description ?? null, body.notes ?? null,
      body.related_receivable_id ?? null, body.related_account_id ?? null,
      now
    )
    .run();

  // Aplicar a saldo de cuenta por defecto (true salvo que digan false explicito)
  if (body.apply_to_balance !== false) {
    const delta = signedDelta(body.kind, body.amount);
    await db().prepare("UPDATE accounts SET balance = balance + ?, updated_at = ? WHERE id = ?")
      .bind(delta, now, body.account_id).run();
    if ((body.kind === "transfer" || body.kind === "cc_payment") && body.related_account_id) {
      const other = body.kind === "transfer" ? body.amount : body.amount;
      // transfer: cuenta destino sube; cc_payment: cuenta TDC sube (su saldo negativo se acerca a 0)
      await db().prepare("UPDATE accounts SET balance = balance + ?, updated_at = ? WHERE id = ?")
        .bind(other, now, body.related_account_id).run();
    }
  }

  return json(200, { ok: true, id: res.meta.last_row_id });
};

function signedDelta(kind: string, amount: number): number {
  switch (kind) {
    case "income":      return +amount;  // entra a la cuenta de origen del movimiento
    case "expense":     return -amount;
    case "transfer":    return -amount;  // sale de account_id, entra a related_account_id
    case "cc_payment":  return -amount;  // sale de la cuenta debito (account_id)
    case "cc_charge":   return -amount;  // sube deuda (balance TDC mas negativo)
    default:            return 0;
  }
}
