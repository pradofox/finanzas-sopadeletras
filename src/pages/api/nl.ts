// POST /api/nl — parsea lenguaje natural y devuelve operaciones propuestas
// POST /api/nl/confirm — ejecuta las operaciones confirmadas
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { json, requireWrite, db, nowMs, todayIso } from "../../lib/api";
import { listAccounts, listReceivables } from "../../lib/finance";

export const prerender = false;

// ---- Tipos de operacion ----

type Op =
  | { op: "update_account_balance"; account_id: number; account_name: string; new_balance: number }
  | { op: "mark_receivable_paid"; receivable_id: number; client: string; project: string | null; paid_amount: number; paid_date: string; account_id: number }
  | { op: "add_receivable"; client: string; project: string | null; amount: number; expected_date: string | null; confidence: "confirmed" | "estimated" | "speculative"; notes: string | null }
  | { op: "update_receivable"; receivable_id: number; client: string; fields: Record<string, unknown> }
  | { op: "delete_receivable"; receivable_id: number; client: string; project: string | null }
  | { op: "add_movement"; account_id: number; account_name: string; kind: string; amount: number; category: string | null; description: string | null; date: string };

// ---- Prompt del sistema ----

function buildSystemPrompt(accounts: any[], receivables: any[]): string {
  const accList = accounts.map(a =>
    `  id=${a.id} "${a.name}" tipo=${a.type} saldo=${a.balance}${a.last4 ? ` ····${a.last4}` : ""}`
  ).join("\n");

  const recList = receivables
    .filter(r => r.status !== "paid" && r.status !== "cancelled")
    .map(r =>
      `  id=${r.id} cliente="${r.client}" proyecto="${r.project ?? ""}" monto=${r.amount} pendiente=${r.amount - r.paid_amount} status=${r.status} confidence=${r.confidence}`
    ).join("\n");

  return `Eres el asistente de finanzas de sopadeletras®. Analizas mensajes en español y devuelves SOLO un JSON con las operaciones a ejecutar. Sin texto extra, sin markdown, solo el JSON.

CUENTAS ACTUALES:
${accList}

COBROS PENDIENTES:
${recList}

REGLAS:
- Montos siempre positivos en MXN.
- Si el usuario dice "pagué X con la BBVA" → add_movement con kind=expense en la cuenta BBVA.
- Si dice "me pagaron X" o "llegó el cheque de X" → mark_receivable_paid si hay un cobro pendiente que coincida, o add_movement kind=income si no hay coincidencia clara.
- Si dice "el saldo de X es Y" → update_account_balance.
- Si dice "cancela" o "borra" un cobro → delete_receivable.
- Si dice "confirma" o "ya está confirmado" → update_receivable con confidence=confirmed.
- Si dice "es estimado" → update_receivable con confidence=estimated.
- Para mark_receivable_paid: usa la primera cuenta débito activa como account_id por defecto si no especifica cuenta.
- Para add_movement con kind=cc_charge o expense con TDC: usa la cuenta de crédito correspondiente.
- paid_date y date siempre en formato YYYY-MM-DD. Si no se menciona, usa hoy: ${todayIso()}.

DEVUELVE este JSON exacto (array de operaciones, puede ser vacío si no entiendes):
{
  "understood": "descripción breve de lo que entendiste en español",
  "ops": [ ...operaciones... ]
}

Cada operacion tiene un campo "op" con el tipo. Campos por tipo:
- update_account_balance: { op, account_id, account_name, new_balance }
- mark_receivable_paid: { op, receivable_id, client, project, paid_amount, paid_date, account_id }
- add_receivable: { op, client, project, amount, expected_date, confidence, notes }
- update_receivable: { op, receivable_id, client, fields: { status?, confidence?, expected_date?, amount?, notes? } }
- delete_receivable: { op, receivable_id, client, project }
- add_movement: { op, account_id, account_name, kind, amount, category, description, date }`;
}

// ---- POST /api/nl ----

export const POST: APIRoute = async ({ request }) => {
  const auth = await requireWrite(request);
  if (!auth.ok) return auth.res;

  const body = (await request.json().catch(() => null)) as { message?: string } | null;
  if (!body?.message?.trim()) return json(400, { ok: false, error: "message_required" });

  const [accounts, receivables] = await Promise.all([
    listAccounts(false),
    listReceivables(),
  ]);

  const ai = (env as any).AI as any;
  if (!ai) return json(503, { ok: false, error: "ai_not_available" });

  const systemPrompt = buildSystemPrompt(accounts, receivables);

  let raw = "";
  try {
    const result = await ai.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: body.message.trim() },
      ],
      max_tokens: 800,
      temperature: 0.1,
    });
    raw = result?.response ?? result?.choices?.[0]?.message?.content ?? "";
  } catch (err) {
    console.error("Workers AI error:", err);
    return json(500, { ok: false, error: "ai_failed" });
  }

  // Extraer JSON del response (el modelo a veces lo envuelve en markdown)
  let parsed: { understood: string; ops: Op[] } | null = null;
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) parsed = JSON.parse(match[0]);
  } catch {
    // fallback: devuelve el raw para debug
  }

  if (!parsed) {
    return json(200, {
      ok: true,
      understood: "No pude interpretar el mensaje con certeza.",
      ops: [],
      raw,
    });
  }

  // Validar que cada op tiene campos mínimos
  const validOps = (parsed.ops ?? []).filter((op: any) => op?.op && typeof op.op === "string");

  // Enriquecer mark_receivable_paid: si no tiene account_id, poner la primera cuenta débito
  const defaultDebit = accounts.find(a => a.type === "debit" && a.active);
  for (const op of validOps as any[]) {
    if (op.op === "mark_receivable_paid" && !op.account_id && defaultDebit) {
      op.account_id = defaultDebit.id;
      op.account_name = defaultDebit.name;
    }
  }

  return json(200, {
    ok: true,
    understood: parsed.understood ?? "",
    ops: validOps,
  });
};
