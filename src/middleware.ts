import { defineMiddleware } from "astro:middleware";
import { getSession, readSessionId } from "./lib/auth";

const PROTECTED_PREFIX = "/app";
const LOGIN_PATH = "/login";

export const onRequest = defineMiddleware(async (context, next) => {
  const url = new URL(context.request.url);
  const path = url.pathname;
  const isProtected = path === PROTECTED_PREFIX || path.startsWith(`${PROTECTED_PREFIX}/`);

  if (isProtected) {
    const sessionId = readSessionId(context.request.headers.get("cookie"));
    const session = await getSession(sessionId);
    if (!session) {
      const nextParam = encodeURIComponent(path + url.search);
      return new Response(null, {
        status: 302,
        headers: { location: `${LOGIN_PATH}?next=${nextParam}` },
      });
    }
    (context.locals as any).session = session;
  } else if (path === LOGIN_PATH) {
    const sessionId = readSessionId(context.request.headers.get("cookie"));
    const session = await getSession(sessionId);
    if (session) {
      return new Response(null, { status: 302, headers: { location: "/app" } });
    }
  }

  return next();
});
