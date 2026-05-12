// GET /api/state - snapshot completo (lo que Claude jala cada que hablamos de finanzas)
import type { APIRoute } from "astro";
import { json, requireAuth } from "../../lib/api";
import { listAccounts, listReceivables, listSubscriptions, listGoals, upcomingDates, summarize } from "../../lib/finance";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.res;

  const [accounts, receivables, subscriptions, goals] = await Promise.all([
    listAccounts(false),
    listReceivables(),
    listSubscriptions(false),
    listGoals(),
  ]);

  const totals = summarize(accounts, receivables, subscriptions);
  const upcoming = upcomingDates(accounts, receivables);

  return json(200, {
    ok: true,
    as_of: new Date().toISOString(),
    totals,
    accounts,
    receivables,
    subscriptions,
    goals,
    upcoming,
  });
};
