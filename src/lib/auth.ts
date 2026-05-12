// Auth helpers: OTP por email + cookie de sesion, y Bearer token para API externa (Claude).
// Copiado y adaptado del dash-sopadeletras.
import { env } from "cloudflare:workers";

const COOKIE_NAME = "finanzas_session";
const SESSION_DAYS = 30;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;
const OTP_TTL_MS = 10 * 60 * 1000; // 10 min
const OTP_MAX_ATTEMPTS = 5;
const FROM_EMAIL = "finanzas@sopadeletras.art";
const FROM_NAME = "finanzas sopadeletras";

const db = () => (env as any).DB as D1Database;

// ---------- OTP ----------

export function generateOtpCode(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0] % 1_000_000).padStart(6, "0");
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function isAllowed(email: string): Promise<boolean> {
  const row = await db()
    .prepare("SELECT 1 FROM users WHERE email = ? LIMIT 1")
    .bind(email.toLowerCase().trim())
    .first<{ 1: number }>();
  return !!row;
}

export async function createOtp(email: string): Promise<string> {
  const code = generateOtpCode();
  const codeHash = await sha256Hex(code);
  const id = crypto.randomUUID();
  const now = Date.now();
  const expiresAt = now + OTP_TTL_MS;

  await db()
    .prepare(
      `INSERT INTO otp_codes (id, email, code_hash, created_at, expires_at, attempts)
       VALUES (?, ?, ?, ?, ?, 0)`
    )
    .bind(id, email.toLowerCase().trim(), codeHash, now, expiresAt)
    .run();

  return code;
}

export async function verifyOtp(
  email: string,
  code: string
): Promise<{ ok: true; email: string } | { ok: false; reason: string }> {
  const normalized = email.toLowerCase().trim();
  const codeHash = await sha256Hex(code);
  const now = Date.now();

  const row = await db()
    .prepare(
      `SELECT id, code_hash, expires_at, consumed_at, attempts
         FROM otp_codes
         WHERE email = ? AND consumed_at IS NULL AND expires_at > ?
         ORDER BY created_at DESC LIMIT 1`
    )
    .bind(normalized, now)
    .first<{
      id: string;
      code_hash: string;
      expires_at: number;
      consumed_at: number | null;
      attempts: number;
    }>();

  if (!row) return { ok: false, reason: "no_active_code" };
  if (row.attempts >= OTP_MAX_ATTEMPTS) return { ok: false, reason: "too_many_attempts" };

  if (row.code_hash !== codeHash) {
    await db()
      .prepare("UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?")
      .bind(row.id)
      .run();
    return { ok: false, reason: "wrong_code" };
  }

  await db()
    .prepare("UPDATE otp_codes SET consumed_at = ? WHERE id = ?")
    .bind(now, row.id)
    .run();

  return { ok: true, email: normalized };
}

// ---------- Sessions ----------

export async function createSession(email: string, deviceLabel?: string): Promise<string> {
  const id = crypto.randomUUID();
  const now = Date.now();
  const expiresAt = now + SESSION_MS;

  await db()
    .prepare(
      `INSERT INTO sessions (id, email, created_at, expires_at, device_label, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(id, email, now, expiresAt, deviceLabel ?? null, now)
    .run();

  return id;
}

export async function getSession(
  sessionId: string | null | undefined
): Promise<{ id: string; email: string } | null> {
  if (!sessionId) return null;

  const now = Date.now();
  const row = await db()
    .prepare(`SELECT id, email FROM sessions WHERE id = ? AND expires_at > ? LIMIT 1`)
    .bind(sessionId, now)
    .first<{ id: string; email: string }>();

  if (!row) return null;

  db()
    .prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?")
    .bind(now, row.id)
    .run()
    .catch(() => {});

  return row;
}

export async function destroySession(sessionId: string): Promise<void> {
  await db().prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run();
}

// ---------- Cookies ----------

export function sessionCookieName(): string {
  return COOKIE_NAME;
}

export function buildSessionCookie(sessionId: string): string {
  const maxAge = Math.floor(SESSION_MS / 1000);
  return [
    `${COOKIE_NAME}=${sessionId}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ].join("; ");
}

export function clearSessionCookie(): string {
  return [
    `${COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Max-Age=0",
  ].join("; ");
}

export function readSessionId(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [k, v] = part.trim().split("=");
    if (k === COOKIE_NAME && v) return decodeURIComponent(v);
  }
  return null;
}

// ---------- Bearer token (Claude / agentes externos) ----------

export type ApiTokenInfo = {
  id: string;
  name: string;
  scope: "read" | "write" | "admin";
};

export async function verifyBearerToken(
  authHeader: string | null
): Promise<ApiTokenInfo | null> {
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const hash = await sha256Hex(token);
  const row = await db()
    .prepare(
      `SELECT id, name, scope FROM api_tokens
        WHERE token_hash = ? AND revoked_at IS NULL LIMIT 1`
    )
    .bind(hash)
    .first<ApiTokenInfo>();

  if (!row) return null;

  db()
    .prepare("UPDATE api_tokens SET last_used_at = ? WHERE id = ?")
    .bind(Date.now(), row.id)
    .run()
    .catch(() => {});

  return row;
}

// ---------- Auth combinada para endpoints API ----------

export type AuthContext =
  | { kind: "session"; email: string }
  | { kind: "token"; tokenId: string; scope: "read" | "write" | "admin"; name: string };

export async function authenticateRequest(request: Request): Promise<AuthContext | null> {
  const bearer = await verifyBearerToken(request.headers.get("authorization"));
  if (bearer) {
    return { kind: "token", tokenId: bearer.id, scope: bearer.scope, name: bearer.name };
  }

  const sessionId = readSessionId(request.headers.get("cookie"));
  const session = await getSession(sessionId);
  if (session) {
    return { kind: "session", email: session.email };
  }

  return null;
}

export function canWrite(ctx: AuthContext): boolean {
  if (ctx.kind === "session") return true;
  return ctx.scope === "write" || ctx.scope === "admin";
}

// ---------- Resend ----------

export async function sendOtpEmail(toEmail: string, code: string, displayName?: string): Promise<void> {
  const apiKey = (env as any).RESEND_API_KEY as string | undefined;
  if (!apiKey) throw new Error("RESEND_API_KEY no configurado");

  const greet = displayName ? `Hola ${displayName},` : "Hola,";
  const html = `
<!doctype html>
<html lang="es">
  <body style="font-family:-apple-system,'Helvetica Neue',sans-serif;background:#fafafa;color:#1d1d1f;padding:32px;margin:0;">
    <div style="max-width:480px;margin:0 auto;">
      <p style="font-size:14px;color:#1d1d1f;opacity:.55;margin:0 0 24px;letter-spacing:.08em;text-transform:lowercase;">finanzas sopadeletras</p>
      <p style="font-size:18px;line-height:1.4;margin:0 0 16px;">${greet}</p>
      <p style="font-size:18px;line-height:1.4;margin:0 0 24px;">Tu código para entrar:</p>
      <div style="font-size:40px;font-weight:600;letter-spacing:.1em;background:#1d1d1f;color:#fafafa;padding:20px 28px;display:inline-block;font-family:ui-monospace,Menlo,monospace;border-radius:4px;">${code}</div>
      <p style="font-size:14px;color:#1d1d1f;opacity:.55;margin:24px 0 0;line-height:1.5;">Vence en 10 minutos. Si no fuiste tú, ignora este correo.</p>
      <p style="font-size:14px;color:#1d1d1f;opacity:.55;margin:32px 0 0;font-style:italic;">- sopadeletras®</p>
    </div>
  </body>
</html>`.trim();

  const text = `${greet}\n\nTu código para entrar a finanzas:\n\n${code}\n\nVence en 10 minutos. Si no fuiste tú, ignora este correo.\n\n- sopadeletras®`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: [toEmail],
      subject: `tu código de finanzas: ${code}`,
      html,
      text,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${errBody}`);
  }
}
