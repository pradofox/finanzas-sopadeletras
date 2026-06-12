// Lectura del estado financiero. Sin auth aqui; cada endpoint decide.
import { db } from "./api";

export type Account = {
  id: number;
  name: string;
  type: "debit" | "credit" | "cash" | "wallet";
  bank: string | null;
  last4: string | null;
  balance: number;
  credit_limit: number | null;
  apr: number | null;
  cut_day: number | null;
  due_day: number | null;
  active: number;
  notes: string | null;
};

export type Movement = {
  id: number;
  date: string;
  account_id: number;
  kind: "income" | "expense" | "transfer" | "cc_payment" | "cc_charge";
  amount: number;
  category: string | null;
  counterparty: string | null;
  description: string | null;
  notes: string | null;
  reconciled: number;
  related_receivable_id: number | null;
  related_account_id: number | null;
};

export type Receivable = {
  id: number;
  client: string;
  project: string | null;
  amount: number;
  expected_date: string | null;
  status: "pending" | "partial" | "paid" | "late" | "cancelled";
  confidence: "confirmed" | "estimated" | "speculative";
  paid_amount: number;
  paid_date: string | null;
  notes: string | null;
};

export type Subscription = {
  id: number;
  service: string;
  amount_monthly: number;
  currency: string;
  account_id: number | null;
  active: number;
  cancelled_at: number | null;
  notes: string | null;
};

export type Goal = {
  id: number;
  name: string;
  target_amount: number | null;
  current_amount: number;
  target_date: string | null;
  priority: number;
  notes: string | null;
  achieved_at: number | null;
};

export async function listAccounts(includeInactive = false): Promise<Account[]> {
  const sql = includeInactive
    ? `SELECT id,name,type,bank,last4,balance,credit_limit,apr,cut_day,due_day,active,notes
         FROM accounts ORDER BY active DESC, id ASC`
    : `SELECT id,name,type,bank,last4,balance,credit_limit,apr,cut_day,due_day,active,notes
         FROM accounts WHERE active=1 ORDER BY id ASC`;
  const res = await db().prepare(sql).all<Account>();
  return res.results ?? [];
}

export async function listReceivables(status?: Receivable["status"]): Promise<Receivable[]> {
  const stmt = status
    ? db()
        .prepare(
          `SELECT id,client,project,amount,expected_date,status,confidence,paid_amount,paid_date,notes
             FROM receivables WHERE status=? ORDER BY expected_date IS NULL, expected_date ASC, id ASC`
        )
        .bind(status)
    : db().prepare(
        `SELECT id,client,project,amount,expected_date,status,confidence,paid_amount,paid_date,notes
           FROM receivables ORDER BY status='paid', expected_date IS NULL, expected_date ASC, id ASC`
      );
  const res = await stmt.all<Receivable>();
  return res.results ?? [];
}

export async function listSubscriptions(activeOnly = false): Promise<Subscription[]> {
  const sql = activeOnly
    ? `SELECT id,service,amount_monthly,currency,account_id,active,cancelled_at,notes
         FROM subscriptions WHERE active=1 ORDER BY amount_monthly DESC, service ASC`
    : `SELECT id,service,amount_monthly,currency,account_id,active,cancelled_at,notes
         FROM subscriptions ORDER BY active DESC, amount_monthly DESC, service ASC`;
  const res = await db().prepare(sql).all<Subscription>();
  return res.results ?? [];
}

export async function listGoals(): Promise<Goal[]> {
  const res = await db()
    .prepare(
      `SELECT id,name,target_amount,current_amount,target_date,priority,notes,achieved_at
         FROM goals ORDER BY priority ASC, target_date IS NULL, target_date ASC`
    )
    .all<Goal>();
  return res.results ?? [];
}

export async function listMovements(opts: {
  limit?: number;
  from?: string;
  to?: string;
  account_id?: number;
  kind?: Movement["kind"];
  category?: string;
} = {}): Promise<Movement[]> {
  const wh: string[] = [];
  const params: unknown[] = [];
  if (opts.from) { wh.push("date >= ?"); params.push(opts.from); }
  if (opts.to) { wh.push("date <= ?"); params.push(opts.to); }
  if (opts.account_id) { wh.push("account_id = ?"); params.push(opts.account_id); }
  if (opts.kind) { wh.push("kind = ?"); params.push(opts.kind); }
  if (opts.category) { wh.push("category = ?"); params.push(opts.category); }
  const where = wh.length ? `WHERE ${wh.join(" AND ")}` : "";
  const limit = Math.min(opts.limit ?? 200, 1000);
  const sql = `SELECT id,date,account_id,kind,amount,category,counterparty,description,notes,reconciled,related_receivable_id,related_account_id
                 FROM movements ${where} ORDER BY date DESC, id DESC LIMIT ${limit}`;
  const res = await db().prepare(sql).bind(...params).all<Movement>();
  return res.results ?? [];
}

// Computa proximas fechas relevantes: cortes y vencimientos de TDC + cobros pendientes.
export function upcomingDates(accounts: Account[], receivables: Receivable[], today = new Date()): Array<{
  date: string;
  label: string;
  kind: "cut" | "due" | "receivable";
  amount?: number;
}> {
  const out: Array<{ date: string; label: string; kind: "cut" | "due" | "receivable"; amount?: number }> = [];
  const horizonMs = 60 * 24 * 60 * 60 * 1000;
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const limit = new Date(todayUtc.getTime() + horizonMs);

  for (const a of accounts) {
    if (a.type !== "credit" || !a.active) continue;
    for (let monthOffset = 0; monthOffset < 3; monthOffset++) {
      const month = todayUtc.getUTCMonth() + monthOffset;
      const year = todayUtc.getUTCFullYear();
      if (a.cut_day) {
        const d = new Date(Date.UTC(year, month, a.cut_day));
        if (d >= todayUtc && d <= limit) {
          out.push({ date: d.toISOString().slice(0, 10), label: `Corte ${a.name}`, kind: "cut" });
        }
      }
      if (a.due_day) {
        const d = new Date(Date.UTC(year, month, a.due_day));
        if (d >= todayUtc && d <= limit) {
          const amt = a.balance < 0 ? -a.balance : 0;
          out.push({ date: d.toISOString().slice(0, 10), label: `Pago ${a.name}`, kind: "due", amount: amt });
        }
      }
    }
  }

  for (const r of receivables) {
    if (r.status !== "pending" && r.status !== "partial" && r.status !== "late") continue;
    if (!r.expected_date) continue;
    const d = new Date(r.expected_date + "T00:00:00Z");
    if (d <= limit) {
      out.push({ date: r.expected_date, label: `Cobro ${r.client}${r.project ? " · " + r.project : ""}`, kind: "receivable", amount: r.amount - r.paid_amount });
    }
  }

  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function summarize(accounts: Account[], receivables: Receivable[], subscriptions: Subscription[]) {
  let cashTotal = 0;
  let debtTotal = 0;
  let creditAvailable = 0;
  for (const a of accounts) {
    if (!a.active) continue;
    if (a.type === "credit") {
      debtTotal += Math.max(0, -a.balance);
      if (a.credit_limit != null) creditAvailable += a.credit_limit - Math.max(0, -a.balance);
    } else {
      cashTotal += a.balance;
    }
  }

  let pipelineTotal = 0;
  let pipelineConfirmed = 0;
  let pipelineEstimated = 0;
  let pipelineSpeculative = 0;
  let pipelineCount = 0;
  for (const r of receivables) {
    if (r.status === "pending" || r.status === "partial" || r.status === "late") {
      const net = r.amount - r.paid_amount;
      pipelineTotal += net;
      pipelineCount++;
      if (r.confidence === "confirmed") pipelineConfirmed += net;
      else if (r.confidence === "estimated") pipelineEstimated += net;
      else pipelineSpeculative += net;
    }
  }

  let subsMonthly = 0;
  let subsActive = 0;
  for (const s of subscriptions) {
    if (s.active) {
      subsMonthly += s.amount_monthly;
      subsActive++;
    }
  }

  const netWorth = cashTotal - debtTotal;
  return { cashTotal, debtTotal, creditAvailable, pipelineTotal, pipelineConfirmed, pipelineEstimated, pipelineSpeculative, pipelineCount, subsMonthly, subsActive, netWorth };
}
