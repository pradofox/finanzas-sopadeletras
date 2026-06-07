// GET /api/state - snapshot completo (lo que Claude jala cada que hablamos de finanzas)
import type { APIRoute } from "astro";
import { json, requireAuth } from "../../lib/api";
import { listAccounts, listReceivables, listSubscriptions, listGoals, listInstallmentPlans, upcomingDates, summarize } from "../../lib/finance";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.res;

  const [accounts, receivables, subscriptions, goals, installments] = await Promise.all([
    listAccounts(false),
    listReceivables(),
    listSubscriptions(false),
    listGoals(),
    listInstallmentPlans(false),
  ]);

  const totals = summarize(accounts, receivables, subscriptions, installments);
  const upcoming = upcomingDates(accounts, receivables);

  return json(200, {
    ok: true,
    as_of: new Date().toISOString(),
    totals,
    accounts,
    receivables,
    subscriptions,
    goals,
    installments,
    upcoming,
  });
};
