import { useCallback, useEffect, useRef, useState } from 'react';

const BALANCE_CLIENT_TIMEOUT_MS = 12_000;

export interface KalodataBalanceEntry {
  key: string;
  value: string | number | boolean;
}

export interface KalodataBalanceResponse {
  ok: boolean;
  configured: boolean;
  endpoint: string;
  authHeader: string;
  httpStatus: number | null;
  checkedAt: string;
  balance: number | null;
  unit: string | null;
  fields: KalodataBalanceEntry[];
  rawData: unknown;
  upstreamCode?: string;
  errorCategory?: string;
  error?: string;
  errorMy?: string;
}

export interface KalodataBalanceState {
  status: KalodataBalanceResponse | null;
  loading: boolean;
  fetchError: string | null;
  refreshBalance: () => Promise<void>;
}

/**
 * Shared Kalodata credit balance hook so both the top Header and the inline
 * KalodataBalanceBar display the exact same real-time balance with a single API call.
 */
export function useKalodataBalance(refreshSignal = 0): KalodataBalanceState {
  const [status, setStatus] = useState<KalodataBalanceResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);

  const refreshBalance = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, BALANCE_CLIENT_TIMEOUT_MS);

    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch('/api/kalodata/balance', {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
      });
      const data = (await res.json().catch(() => null)) as KalodataBalanceResponse | null;
      if (abortRef.current !== controller) return;
      if (!data) {
        setStatus(null);
        setFetchError(`HTTP ${res.status}`);
        return;
      }
      setStatus(data);
    } catch (err) {
      if (abortRef.current !== controller) return;
      if (err instanceof DOMException && err.name === 'AbortError') {
        if (timedOut) {
          setStatus(null);
          setFetchError('Request timed out (12s)');
        }
        return;
      }
      setStatus(null);
      setFetchError(err instanceof Error ? err.message : 'Network error');
    } finally {
      window.clearTimeout(timeoutId);
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      inFlightRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshBalance();
    return () => {
      abortRef.current?.abort();
      inFlightRef.current = false;
    };
  }, [refreshBalance, refreshSignal]);

  return {
    status,
    loading,
    fetchError,
    refreshBalance,
  };
}
