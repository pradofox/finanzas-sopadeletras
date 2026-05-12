// Helpers compartidos para endpoints API.
import { authenticateRequest, canWrite, type AuthContext } from "./auth";
import { env } from "cloudflare:workers";

export const db = () => (env as any).DB as D1Database;

export const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });

export async function requireAuth(
  request: Request
): Promise<{ ok: true; ctx: AuthContext } | { ok: false; res: Response }> {
  const ctx = await authenticateRequest(request);
  if (!ctx) return { ok: false, res: json(401, { ok: false, error: "unauthorized" }) };
  return { ok: true, ctx };
}

export async function requireWrite(
  request: Request
): Promise<{ ok: true; ctx: AuthContext } | { ok: false; res: Response }> {
  const r = await requireAuth(request);
  if (!r.ok) return r;
  if (!canWrite(r.ctx)) return { ok: false, res: json(403, { ok: false, error: "read_only_scope" }) };
  return r;
}

export function nowMs(): number {
  return Date.now();
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
