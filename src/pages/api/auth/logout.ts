import type { APIRoute } from "astro";
import { destroySession, readSessionId, clearSessionCookie } from "../../../lib/auth";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const sessionId = readSessionId(request.headers.get("cookie"));
  if (sessionId) {
    await destroySession(sessionId).catch(() => {});
  }
  return new Response(null, {
    status: 302,
    headers: {
      location: "/",
      "set-cookie": clearSessionCookie(),
    },
  });
};

export const GET: APIRoute = POST;
