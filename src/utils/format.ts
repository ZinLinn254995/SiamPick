export function formatThb(amount: number | null | undefined, fallback = '—'): string {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    return fallback;
  }
  return `฿${Math.round(amount).toLocaleString('en-US')}`;
}

export function isSafeHttpUrl(rawUrl: string | null | undefined): rawUrl is string {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return false;
  try {
    const parsed = new URL(rawUrl.trim());
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}
