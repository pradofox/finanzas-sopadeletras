import type { APIRoute } from "astro";
import { verifyOtp, createSession, buildSessionCookie } from "../../../lib/auth";

export const prerender = false;

const json = (status: number, body: Record<string, unknown>, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });

export const POST: APIRoute = async ({ request }) => {
  let email = "";
  let code = "";
  try {
    const ct = request.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      const body = (await request.json()) as { email?: string; code?: string };
      email = (body.email ?? "").toString();
      code = (body.code ?? "").toString();
    } else {
      const form = await request.formData();
      email = String(form.get("email") ?? "");
      code = String(form.get("code") ?? "");
    }
  } catch {
    return json(400, { ok: false, error: "invalid_body" });
  }

  email = email.trim().toLowerCase();
  code = code.trim();
  if (!email || !code) return json(400, { ok: false, error: "missing_fields" });

  const result = await verifyOtp(email, code);
  if (!result.ok) return json(401, { ok: false, error: result.reason });

  const ua = request.headers.get("user-agent") ?? "";
  const deviceLabel = ua.slice(0, 200);
  const sessionId = await createSession(result.email, deviceLabel);

  return json(
    200,
    { ok: true, redirect: "/app" },
    { "set-cookie": buildSessionCookie(sessionId) }
  );
};
