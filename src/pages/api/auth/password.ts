// Login alternativo por password compartido (backdoor mientras Resend no esta configurado).
// Valida que el correo este en allowlist y que la password concuerde con env.LOGIN_PASSWORD.
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { isAllowed, createSession, buildSessionCookie, sha256Hex } from "../../../lib/auth";

export const prerender = false;

const json = (status: number, body: Record<string, unknown>, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });

// Comparacion en tiempo constante (a nivel de tamano fijo): hash ambos lados.
async function constantTimeEqual(a: string, b: string): Promise<boolean> {
  const ha = await sha256Hex(a);
  const hb = await sha256Hex(b);
  if (ha.length !== hb.length) return false;
  let diff = 0;
  for (let i = 0; i < ha.length; i++) diff |= ha.charCodeAt(i) ^ hb.charCodeAt(i);
  return diff === 0;
}

export const POST: APIRoute = async ({ request }) => {
  let email = "";
  let password = "";
  try {
    const ct = request.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      const body = (await request.json()) as { email?: string; password?: string };
      email = (body.email ?? "").toString();
      password = (body.password ?? "").toString();
    } else {
      const form = await request.formData();
      email = String(form.get("email") ?? "");
      password = String(form.get("password") ?? "");
    }
  } catch {
    return json(400, { ok: false, error: "invalid_body" });
  }

  email = email.trim().toLowerCase();
  if (!email || !password) return json(400, { ok: false, error: "missing_fields" });

  const expected = (env as any).LOGIN_PASSWORD as string | undefined;
  if (!expected) return json(503, { ok: false, error: "password_login_disabled" });

  const allowed = await isAllowed(email);
  const passOk = await constantTimeEqual(password, expected);

  // Pequeno delay para nivelar tiempos de respuesta y desincentivar fuerza bruta.
  await new Promise((r) => setTimeout(r, 250));

  if (!allowed || !passOk) {
    return json(401, { ok: false, error: "invalid_credentials" });
  }

  const ua = request.headers.get("user-agent") ?? "";
  const sessionId = await createSession(email, ua.slice(0, 200));
  return json(
    200,
    { ok: true, redirect: "/app" },
    { "set-cookie": buildSessionCookie(sessionId) }
  );
};
