export function fmtMxn(n: number, opts: { sign?: boolean } = {}): string {
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = n < 0 ? "-" : opts.sign && n > 0 ? "+" : "";
  return `${sign}$${formatted}`;
}

export function fmtMxnCompact(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 100) / 10}k`;
  return `${sign}$${Math.round(abs)}`;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  const months = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  return `${parseInt(d)} ${months[parseInt(m) - 1] ?? m} ${y}`;
}

export function daysFromToday(iso: string | null): number | null {
  if (!iso) return null;
  const target = new Date(iso + "T00:00:00Z").getTime();
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((target - todayUtc) / (24 * 60 * 60 * 1000));
}

export function relativeDays(iso: string | null): string {
  const d = daysFromToday(iso);
  if (d === null) return "—";
  if (d === 0) return "hoy";
  if (d === 1) return "mañana";
  if (d === -1) return "ayer";
  if (d > 0) return `en ${d} días`;
  return `hace ${Math.abs(d)} días`;
}
