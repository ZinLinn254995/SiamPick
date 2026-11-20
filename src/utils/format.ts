export function formatThb(amount: number | null | undefined, fallback = '—'): string {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    return fallback;
  }
  return `฿${Math.round(amount).toLocaleString('en-US')}`;
}
