import type { APIRoute } from "astro";
import { isAllowed, createOtp, sendOtpEmail } from "../../../lib/auth";

export const prerender = false;

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

export const POST: APIRoute = async ({ request }) => {
  let email = "";
  try {
    const ct = request.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      const body = (await request.json()) as { email?: string };
      email = (body.email ?? "").toString();
    } else {
      const form = await request.formData();
      email = String(form.get("email") ?? "");
    }
  } catch {
    return json(400, { ok: false, error: "invalid_body" });
  }

  email = email.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return json(400, { ok: false, error: "invalid_email" });
  }

  const allowed = await isAllowed(email);
  if (allowed) {
    try {
      const code = await createOtp(email);
      await sendOtpEmail(email, code);
    } catch (err) {
      console.error("auth/request error:", err);
      return json(500, { ok: false, error: "send_failed" });
    }
  }

  return json(200, { ok: true });
};
