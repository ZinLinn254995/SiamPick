import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  DEFAULT_SPENDING_LIMIT_CREDITS,
  MAX_SPENDING_LIMIT_CREDITS,
  MIN_SPENDING_LIMIT_CREDITS,
} from '../src/utils/kalodataPricing.ts';

export type BudgetStorageBackend = 'upstash-rest' | 'sqlite-wal';

export type BudgetReservationStatus =
  | 'reserved'
  | 'settled'
  | 'released'
  | 'expired_released'
  | 'uncertain';

export interface BudgetReservationRecord {
  reservationId: string;
  scopeKey: string;
  idempotencyKey: string;
  runId: string | null;
  operation: string;
  reservedCredits: number;
  settledCredits: number;
  status: BudgetReservationStatus;
  upstreamDispatched: boolean;
  createdAtMs: number;
  updatedAtMs: number;
  expiresAtMs: number;
  note: string | null;
}

export interface BudgetScopeSnapshot {
  scopeKey: string;
  scopeFingerprint: string;
  windowKey: string;
  backend: BudgetStorageBackend;
  storageAvailable: true;
  spentCredits: number;
  uncertainCredits: number;
  activeReservedCredits: number;
  totalCommittedCredits: number;
  configuredLimitCredits: number | null;
  hardCapCredits: number;
  effectiveLimitCredits: number;
  remainingCredits: number;
  updatedAt: string;
}

export interface AtomicReserveParams {
  scopeKey: string;
  idempotencyKey: string;
  runId?: string | null;
  operation: string;
  reserveCredits: number;
  requestedLimitCredits?: number;
  leaseMs?: number;
  nowMs?: number;
}

export type AtomicReserveResult =
  | {
      ok: true;
      reservationId: string;
      reservedCredits: number;
      snapshot: BudgetScopeSnapshot;
    }
  | {
      ok: false;
      reason:
        | 'SPENDING_LIMIT_EXCEEDED'
        | 'IDEMPOTENCY_IN_PROGRESS'
        | 'IDEMPOTENCY_ALREADY_SETTLED';
      existingReservation?: BudgetReservationRecord;
      snapshot: BudgetScopeSnapshot;
    };

export interface BudgetLedgerOptions {
  /** Override SQLite DB file path (primarily for isolated tests or custom deployments) */
  sqlitePath?: string;
  /** Override Upstash / Vercel KV REST URL */
  upstashRestUrl?: string;
  /** Override Upstash / Vercel KV REST Bearer Token */
  upstashRestToken?: string;
  /** Force distributed-store requirement (simulates Vercel / multi-instance serverless) */
  requireDistributedStore?: boolean;
  /** Disable storage explicitly to test fail-closed behavior */
  forceDisabled?: boolean;
  /** Override hard daily credit cap */
  hardCapCredits?: number;
  /** Injectable fetch for Upstash REST unit tests */
  fetchFn?: typeof fetch;
  /** Injectable clock for lease expiration tests */
  nowMsFn?: () => number;
}

export class BudgetStorageUnavailableError extends Error {
  readonly status = 503;
  readonly code = 'BUDGET_STORAGE_UNAVAILABLE';
  readonly errorMy: string;

  constructor(message: string, errorMy?: string) {
    super(message);
    this.name = 'BudgetStorageUnavailableError';
    this.errorMy =
      errorMy ??
      'Persistent Budget Storage မရရှိနိုင်သဖြင့် Paid API ခေါ်ဆိုမှုကို လုံခြုံရေးအရ Fail-Closed ရပ်တန့်ထားပါသည်။';
  }
}

export const DEFAULT_RESERVATION_LEASE_MS = 120_000; // 2 minutes
const UPSTASH_TIMEOUT_MS = 8_000;
const SCOPE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days retention in Redis

function roundCredits3(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 1000) / 1000;
}

function clampCredits(value: number, minVal: number, maxVal: number): number {
  if (!Number.isFinite(value)) return minVal;
  return roundCredits3(Math.max(minVal, Math.min(maxVal, value)));
}

function getUtcDayKey(nowMs = Date.now()): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

/**
 * Derives a tamper-proof server-side Budget Scope key.
 * - Never trusts client-supplied session spend or client-generated runId to escape limits.
 * - Binds to the server's configured Kalodata account fingerprint (SHA-256 hash, never raw key)
 *   + optional server-verified authenticatedUserId + UTC day budget window.
 */
export function resolveAuthoritativeBudgetScope(options?: {
  authenticatedUserId?: string | null;
  budgetWindowKey?: string | null;
  nowMs?: number;
}): {
  scopeKey: string;
  scopeFingerprint: string;
  windowKey: string;
} {
  const rawApiKey = (process.env.KALODATA_API_KEY ?? '').trim();
  const accountFingerprint = crypto
    .createHash('sha256')
    .update(rawApiKey ? `kalodata:${rawApiKey}` : 'kalodata:unconfigured')
    .digest('hex')
    .slice(0, 12);

  const windowKey =
    options?.budgetWindowKey && /^[A-Za-z0-9_-]{3,40}$/.test(options.budgetWindowKey.trim())
      ? options.budgetWindowKey.trim()
      : `day-${getUtcDayKey(options?.nowMs)}`;

  const authUser =
    typeof options?.authenticatedUserId === 'string' && options.authenticatedUserId.trim().length > 0
      ? crypto
          .createHash('sha256')
          .update(`user:${options.authenticatedUserId.trim()}`)
          .digest('hex')
          .slice(0, 12)
      : null;

  const scopeFingerprint = authUser ? `${authUser}:${accountFingerprint}` : accountFingerprint;
  const scopeKey = authUser
    ? `user:${authUser}:acct:${accountFingerprint}:${windowKey}`
    : `acct:${accountFingerprint}:${windowKey}`;

  return { scopeKey, scopeFingerprint, windowKey };
}

export function isServerlessMultiInstanceEnv(): boolean {
  return (
    process.env.VERCEL === '1' ||
    Boolean(process.env.VERCEL_ENV && process.env.VERCEL_ENV.trim().length > 0) ||
    Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME && process.env.AWS_LAMBDA_FUNCTION_NAME.trim().length > 0) ||
    process.env.NETLIFY === 'true' ||
    process.env.SIAMPICK_REQUIRE_DISTRIBUTED_BUDGET_STORE === 'true'
  );
}

export function resolveHardCapCredits(override?: number): number {
  if (typeof override === 'number' && Number.isFinite(override)) {
    return clampCredits(override, MIN_SPENDING_LIMIT_CREDITS, MAX_SPENDING_LIMIT_CREDITS);
  }
  const envRaw = Number(process.env.SIAMPICK_DAILY_HARD_CAP_CREDITS);
  if (Number.isFinite(envRaw) && envRaw > 0) {
    return clampCredits(envRaw, MIN_SPENDING_LIMIT_CREDITS, MAX_SPENDING_LIMIT_CREDITS);
  }
  return MAX_SPENDING_LIMIT_CREDITS;
}

function computeEffectiveLimit(
  configuredLimitCredits: number | null,
  requestedLimitCredits: number | undefined,
  hardCapCredits: number
): number {
  const requested =
    typeof requestedLimitCredits === 'number' && Number.isFinite(requestedLimitCredits)
      ? clampCredits(requestedLimitCredits, MIN_SPENDING_LIMIT_CREDITS, hardCapCredits)
      : null;

  if (configuredLimitCredits !== null && Number.isFinite(configuredLimitCredits)) {
    const persisted = clampCredits(
      configuredLimitCredits,
      MIN_SPENDING_LIMIT_CREDITS,
      hardCapCredits
    );
    return requested !== null ? Math.min(persisted, requested) : persisted;
  }

  if (requested !== null) {
    return requested;
  }

  return Math.min(DEFAULT_SPENDING_LIMIT_CREDITS, hardCapCredits);
}

function parseScopeMeta(scopeKey: string): { scopeFingerprint: string; windowKey: string } {
  const parts = scopeKey.split(':');
  const windowKey = parts[parts.length - 1] || `day-${getUtcDayKey()}`;
  const scopeFingerprint =
    parts.length >= 3 ? parts.slice(1, -1).join(':') : scopeKey.slice(0, 16);
  return { scopeFingerprint, windowKey };
}

function validateSafeSqlitePath(rawPath: string): string {
  const trimmed = rawPath.trim();
  if (!trimmed || trimmed.includes('\0')) {
    throw new BudgetStorageUnavailableError(
      'Invalid persistent budget database path configuration.',
      'Persistent Budget Database လမ်းကြောင်း မမှန်ကန်ပါ။ Paid API ကို လုံခြုံရေးအရ ပိတ်ထားပါသည်။'
    );
  }
  const resolved = path.resolve(trimmed);
  return resolved;
}

// ============================================================================
// Atomic Redis Lua Scripts for Multi-Instance Serverless (Upstash / Vercel KV)
// ============================================================================

const LUA_RECONCILE_HELPER = `
local function round3(n)
  return math.floor(n * 1000 + 0.5) / 1000
end
local function reconcile(scopeKey, activeSetKey, resPrefix, nowMs)
  local spent = tonumber(redis.call('HGET', scopeKey, 'spent_credits') or '0') or 0
  local uncertain = tonumber(redis.call('HGET', scopeKey, 'uncertain_credits') or '0') or 0
  local activeSum = 0
  local members = redis.call('SMEMBERS', activeSetKey)
  for _, resId in ipairs(members) do
    local rKey = resPrefix .. resId
    local st = redis.call('HGET', rKey, 'status')
    if not st or st ~= 'reserved' then
      redis.call('SREM', activeSetKey, resId)
    else
      local exp = tonumber(redis.call('HGET', rKey, 'expires_at_ms') or '0') or 0
      local amt = tonumber(redis.call('HGET', rKey, 'reserved_credits') or '0') or 0
      local disp = tonumber(redis.call('HGET', rKey, 'upstream_dispatched') or '0') or 0
      if exp > 0 and nowMs >= exp then
        if disp == 1 then
          redis.call('HSET', rKey, 'status', 'uncertain', 'settled_credits', tostring(amt), 'updated_at_ms', tostring(nowMs), 'note', 'lease-expired-after-dispatch')
          uncertain = round3(uncertain + amt)
          redis.call('HSET', scopeKey, 'uncertain_credits', tostring(uncertain), 'updated_at_ms', tostring(nowMs))
        else
          redis.call('HSET', rKey, 'status', 'expired_released', 'settled_credits', '0', 'updated_at_ms', tostring(nowMs), 'note', 'lease-expired-before-dispatch')
        end
        redis.call('SREM', activeSetKey, resId)
      else
        activeSum = round3(activeSum + amt)
      end
    end
  end
  return spent, uncertain, activeSum
end
`;

const LUA_GET_SNAPSHOT = `
${LUA_RECONCILE_HELPER}
local scopeKey = KEYS[1]
local activeSetKey = KEYS[2]
local resPrefix = ARGV[1]
local nowMs = tonumber(ARGV[2])
local spent, uncertain, activeSum = reconcile(scopeKey, activeSetKey, resPrefix, nowMs)
local cfg = redis.call('HGET', scopeKey, 'configured_limit_credits')
return { tostring(spent), tostring(uncertain), tostring(activeSum), cfg or '' }
`;

const LUA_SET_LIMIT = `
${LUA_RECONCILE_HELPER}
local scopeKey = KEYS[1]
local activeSetKey = KEYS[2]
local resPrefix = ARGV[1]
local nowMs = tonumber(ARGV[2])
local limitVal = ARGV[3]
local ttlSec = tonumber(ARGV[4])
local spent, uncertain, activeSum = reconcile(scopeKey, activeSetKey, resPrefix, nowMs)
redis.call('HSET', scopeKey, 'configured_limit_credits', limitVal, 'updated_at_ms', tostring(nowMs))
redis.call('EXPIRE', scopeKey, ttlSec)
return { tostring(spent), tostring(uncertain), tostring(activeSum), limitVal }
`;

const LUA_RESERVE = `
${LUA_RECONCILE_HELPER}
local scopeKey = KEYS[1]
local activeSetKey = KEYS[2]
local idemKey = KEYS[3]
local resKey = KEYS[4]

local resPrefix = ARGV[1]
local nowMs = tonumber(ARGV[2])
local reserveCredits = tonumber(ARGV[3])
local requestedLimit = tonumber(ARGV[4])
local hardCap = tonumber(ARGV[5])
local defaultLimit = tonumber(ARGV[6])
local resId = ARGV[7]
local runId = ARGV[8]
local operation = ARGV[9]
local expiresAtMs = tonumber(ARGV[10])
local ttlSec = tonumber(ARGV[11])
local idempotencyRaw = ARGV[12]

local spent, uncertain, activeSum = reconcile(scopeKey, activeSetKey, resPrefix, nowMs)
local cfgRaw = redis.call('HGET', scopeKey, 'configured_limit_credits')
local cfgNum = cfgRaw and tonumber(cfgRaw) or nil

local effLimit = defaultLimit
if cfgNum ~= nil then
  effLimit = math.min(cfgNum, hardCap)
  if requestedLimit > 0 then
    effLimit = math.min(effLimit, requestedLimit)
  end
elseif requestedLimit > 0 then
  effLimit = math.min(requestedLimit, hardCap)
else
  effLimit = math.min(defaultLimit, hardCap)
end

local existingResId = redis.call('GET', idemKey)
if existingResId and existingResId ~= '' then
  local existingKey = resPrefix .. existingResId
  local existingStatus = redis.call('HGET', existingKey, 'status')
  if existingStatus == 'reserved' then
    return { 'IDEMPOTENCY_IN_PROGRESS', existingResId, tostring(spent), tostring(uncertain), tostring(activeSum), cfgRaw or '', existingStatus }
  elseif existingStatus == 'settled' or existingStatus == 'uncertain' then
    return { 'IDEMPOTENCY_ALREADY_SETTLED', existingResId, tostring(spent), tostring(uncertain), tostring(activeSum), cfgRaw or '', existingStatus }
  end
end

local committed = round3(spent + uncertain + activeSum)
if committed + reserveCredits > effLimit + 0.000001 then
  return { 'SPENDING_LIMIT_EXCEEDED', '', tostring(spent), tostring(uncertain), tostring(activeSum), cfgRaw or '', '' }
end

redis.call('HSET', resKey,
  'reservation_id', resId,
  'scope_key', scopeKey,
  'idempotency_key', idempotencyRaw,
  'run_id', runId,
  'operation', operation,
  'reserved_credits', tostring(reserveCredits),
  'settled_credits', '0',
  'status', 'reserved',
  'upstream_dispatched', '0',
  'created_at_ms', tostring(nowMs),
  'updated_at_ms', tostring(nowMs),
  'expires_at_ms', tostring(expiresAtMs),
  'note', ''
)
redis.call('EXPIRE', resKey, ttlSec)
redis.call('SET', idemKey, resId, 'EX', ttlSec)
redis.call('SADD', activeSetKey, resId)
redis.call('EXPIRE', activeSetKey, ttlSec)
redis.call('HSET', scopeKey, 'updated_at_ms', tostring(nowMs))
redis.call('EXPIRE', scopeKey, ttlSec)

local nextActive = round3(activeSum + reserveCredits)
return { 'OK', resId, tostring(spent), tostring(uncertain), tostring(nextActive), cfgRaw or '', 'reserved' }
`;

const LUA_MARK_DISPATCHED = `
local resKey = KEYS[1]
local nowMs = ARGV[1]
local st = redis.call('HGET', resKey, 'status')
if st == 'reserved' then
  redis.call('HSET', resKey, 'upstream_dispatched', '1', 'updated_at_ms', nowMs)
  return 'OK'
end
return st or 'NOT_FOUND'
`;

const LUA_SETTLE = `
${LUA_RECONCILE_HELPER}
local scopeKey = KEYS[1]
local activeSetKey = KEYS[2]
local resKey = KEYS[3]
local resPrefix = ARGV[1]
local resId = ARGV[2]
local actualCreditsArg = ARGV[3]
local nowMs = tonumber(ARGV[4])
local note = ARGV[5]
local ttlSec = tonumber(ARGV[6])

local st = redis.call('HGET', resKey, 'status')
if st == 'reserved' then
  local reservedAmt = tonumber(redis.call('HGET', resKey, 'reserved_credits') or '0') or 0
  local settleAmt = reservedAmt
  if actualCreditsArg ~= '' then
    local parsed = tonumber(actualCreditsArg)
    if parsed ~= nil and parsed >= 0 then
      settleAmt = round3(parsed)
    end
  end
  local spent = tonumber(redis.call('HGET', scopeKey, 'spent_credits') or '0') or 0
  spent = round3(spent + settleAmt)
  redis.call('HSET', scopeKey, 'spent_credits', tostring(spent), 'updated_at_ms', tostring(nowMs))
  redis.call('EXPIRE', scopeKey, ttlSec)
  redis.call('HSET', resKey, 'status', 'settled', 'settled_credits', tostring(settleAmt), 'updated_at_ms', tostring(nowMs), 'note', note)
  redis.call('SREM', activeSetKey, resId)
end

local spentNow, uncertainNow, activeNow = reconcile(scopeKey, activeSetKey, resPrefix, nowMs)
local cfg = redis.call('HGET', scopeKey, 'configured_limit_credits')
return { tostring(spentNow), tostring(uncertainNow), tostring(activeNow), cfg or '' }
`;

const LUA_RELEASE = `
${LUA_RECONCILE_HELPER}
local scopeKey = KEYS[1]
local activeSetKey = KEYS[2]
local resKey = KEYS[3]
local resPrefix = ARGV[1]
local resId = ARGV[2]
local verifiedZero = ARGV[3]
local nowMs = tonumber(ARGV[4])
local note = ARGV[5]
local ttlSec = tonumber(ARGV[6])

local st = redis.call('HGET', resKey, 'status')
local outcome = 'NOOP'
if st == 'reserved' then
  local disp = tonumber(redis.call('HGET', resKey, 'upstream_dispatched') or '0') or 0
  local reservedAmt = tonumber(redis.call('HGET', resKey, 'reserved_credits') or '0') or 0
  if disp == 1 and verifiedZero ~= '1' then
    local uncertain = tonumber(redis.call('HGET', scopeKey, 'uncertain_credits') or '0') or 0
    uncertain = round3(uncertain + reservedAmt)
    redis.call('HSET', scopeKey, 'uncertain_credits', tostring(uncertain), 'updated_at_ms', tostring(nowMs))
    redis.call('EXPIRE', scopeKey, ttlSec)
    redis.call('HSET', resKey, 'status', 'uncertain', 'settled_credits', tostring(reservedAmt), 'updated_at_ms', tostring(nowMs), 'note', 'refused-unverified-release:' .. note)
    redis.call('SREM', activeSetKey, resId)
    outcome = 'HELD_UNCERTAIN'
  else
    redis.call('HSET', resKey, 'status', 'released', 'settled_credits', '0', 'updated_at_ms', tostring(nowMs), 'note', note)
    redis.call('SREM', activeSetKey, resId)
    outcome = 'RELEASED'
  end
end

local spentNow, uncertainNow, activeNow = reconcile(scopeKey, activeSetKey, resPrefix, nowMs)
local cfg = redis.call('HGET', scopeKey, 'configured_limit_credits')
return { outcome, tostring(spentNow), tostring(uncertainNow), tostring(activeNow), cfg or '' }
`;

const LUA_MARK_UNCERTAIN = `
${LUA_RECONCILE_HELPER}
local scopeKey = KEYS[1]
local activeSetKey = KEYS[2]
local resKey = KEYS[3]
local resPrefix = ARGV[1]
local resId = ARGV[2]
local nowMs = tonumber(ARGV[3])
local note = ARGV[4]
local ttlSec = tonumber(ARGV[5])

local st = redis.call('HGET', resKey, 'status')
if st == 'reserved' then
  local reservedAmt = tonumber(redis.call('HGET', resKey, 'reserved_credits') or '0') or 0
  local uncertain = tonumber(redis.call('HGET', scopeKey, 'uncertain_credits') or '0') or 0
  uncertain = round3(uncertain + reservedAmt)
  redis.call('HSET', scopeKey, 'uncertain_credits', tostring(uncertain), 'updated_at_ms', tostring(nowMs))
  redis.call('EXPIRE', scopeKey, ttlSec)
  redis.call('HSET', resKey, 'status', 'uncertain', 'settled_credits', tostring(reservedAmt), 'updated_at_ms', tostring(nowMs), 'note', note)
  redis.call('SREM', activeSetKey, resId)
end

local spentNow, uncertainNow, activeNow = reconcile(scopeKey, activeSetKey, resPrefix, nowMs)
local cfg = redis.call('HGET', scopeKey, 'configured_limit_credits')
return { tostring(spentNow), tostring(uncertainNow), tostring(activeNow), cfg or '' }
`;

// ============================================================================
// Persistent Budget Ledger Class (SQLite WAL or Upstash/Vercel KV REST)
// ============================================================================

export class PersistentBudgetLedger {
  private backend: BudgetStorageBackend;
  private readonly requireDistributed: boolean;
  private readonly hardCapCredits: number;
  private readonly nowMsFn: () => number;
  private readonly fetchFn: typeof fetch;
  private readonly upstashUrl: string | null = null;
  private readonly upstashToken: string | null = null;
  private sqlitePath: string | null = null;
  private db: DatabaseSync | null = null;
  private upstashEverSucceeded = false;

  constructor(options?: BudgetLedgerOptions) {
    this.hardCapCredits = resolveHardCapCredits(options?.hardCapCredits);
    this.nowMsFn = options?.nowMsFn ?? (() => Date.now());
    this.fetchFn = options?.fetchFn ?? globalThis.fetch.bind(globalThis);
    this.requireDistributed =
      options?.requireDistributedStore === true || isServerlessMultiInstanceEnv();

    if (options?.forceDisabled || process.env.SIAMPICK_BUDGET_STORE_DISABLED === 'true') {
      throw new BudgetStorageUnavailableError(
        'Persistent budget storage is disabled (SIAMPICK_BUDGET_STORE_DISABLED=true). Paid APIs are blocked fail-closed.',
        'Persistent Budget Storage ကို ပိတ်ထားသဖြင့် Paid API ခေါ်ဆိုမှုကို လုံခြုံရေးအရ ရပ်တန့်ထားပါသည်။'
      );
    }

    const stripOuterQuotes = (raw: string): string => {
      const trimmed = raw.trim();
      if (
        trimmed.length >= 2 &&
        ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
          (trimmed.startsWith("'") && trimmed.endsWith("'")))
      ) {
        return trimmed.slice(1, -1).trim();
      }
      return trimmed;
    };

    const upstashUrl = stripOuterQuotes(
      options?.upstashRestUrl ??
        process.env.UPSTASH_REDIS_REST_URL ??
        process.env.KV_REST_API_URL ??
        ''
    );
    const upstashToken = stripOuterQuotes(
      options?.upstashRestToken ??
        process.env.UPSTASH_REDIS_REST_TOKEN ??
        process.env.KV_REST_API_TOKEN ??
        ''
    ).replace(/^Bearer\s+/i, '').trim();

    const rawSqlitePath =
      options?.sqlitePath ??
      process.env.SIAMPICK_BUDGET_DB_PATH ??
      path.join(process.cwd(), '.data', 'siampick-budget.sqlite');

    if (upstashUrl && upstashToken) {
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(upstashUrl);
      } catch {
        throw new BudgetStorageUnavailableError(
          'Invalid Upstash/Vercel KV REST URL. Paid APIs are blocked fail-closed.',
          'Upstash/Vercel KV REST URL မမှန်ကန်သဖြင့် Paid API ကို Fail-Closed ပိတ်ထားပါသည်။'
        );
      }
      if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
        throw new BudgetStorageUnavailableError(
          'Unsupported persistent budget store URL scheme. Paid APIs are blocked fail-closed.'
        );
      }
      this.backend = 'upstash-rest';
      this.upstashUrl = upstashUrl.replace(/\/+$/, '');
      this.upstashToken = upstashToken;
      if (!this.requireDistributed) {
        try {
          this.sqlitePath = validateSafeSqlitePath(rawSqlitePath);
        } catch {
          this.sqlitePath = null;
        }
      }
      return;
    }

    if (this.requireDistributed) {
      throw new BudgetStorageUnavailableError(
        'Multi-instance serverless runtime detected without distributed persistent budget storage. Configure UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (or Vercel KV KV_REST_API_URL + KV_REST_API_TOKEN). Paid APIs are blocked fail-closed (no unsafe in-memory fallback).',
        'Serverless Multi-instance ပတ်ဝန်းကျင်တွင် Distributed Persistent Budget Storage (Upstash Redis / Vercel KV) မချိတ်ဆက်ထားသဖြင့် Paid API များကို Fail-Closed ပိတ်ထားပါသည်။ In-memory Map ဖြင့် အစားမထိုးပါ။'
      );
    }

    this.sqlitePath = validateSafeSqlitePath(rawSqlitePath);
    this.backend = 'sqlite-wal';
    this.initSqlite(this.sqlitePath);
  }

  getBackendType(): BudgetStorageBackend {
    return this.backend;
  }

  getHardCapCredits(): number {
    return this.hardCapCredits;
  }

  close(): void {
    if (this.db) {
      try {
        this.db.close();
      } catch {
        // Ignore close errors during shutdown
      }
      this.db = null;
    }
  }

  private initSqlite(dbPath: string): void {
    try {
      const parentDir = path.dirname(dbPath);
      fs.mkdirSync(parentDir, { recursive: true });
      const db = new DatabaseSync(dbPath);
      db.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = FULL;
        PRAGMA busy_timeout = 5000;
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS budget_scopes (
          scope_key TEXT PRIMARY KEY,
          spent_credits REAL NOT NULL DEFAULT 0,
          uncertain_credits REAL NOT NULL DEFAULT 0,
          configured_limit_credits REAL,
          updated_at_ms INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS budget_reservations (
          reservation_id TEXT PRIMARY KEY,
          scope_key TEXT NOT NULL,
          idempotency_key TEXT NOT NULL,
          run_id TEXT,
          operation TEXT NOT NULL,
          reserved_credits REAL NOT NULL,
          settled_credits REAL NOT NULL DEFAULT 0,
          status TEXT NOT NULL,
          upstream_dispatched INTEGER NOT NULL DEFAULT 0,
          created_at_ms INTEGER NOT NULL,
          updated_at_ms INTEGER NOT NULL,
          expires_at_ms INTEGER NOT NULL,
          note TEXT,
          UNIQUE(scope_key, idempotency_key)
        );

        CREATE INDEX IF NOT EXISTS idx_budget_res_scope_status_exp
          ON budget_reservations(scope_key, status, expires_at_ms);
      `);
      this.db = db;
    } catch (error) {
      throw new BudgetStorageUnavailableError(
        `Unable to initialize persistent SQLite budget ledger (${error instanceof Error ? error.message : 'storage error'}). Paid APIs are blocked fail-closed.`,
        'Persistent SQLite Budget Database ကို ဖွင့်၍မရသဖြင့် Paid API ခေါ်ဆိုမှုများကို Fail-Closed ပိတ်ထားပါသည်။'
      );
    }
  }

  private requireDb(): DatabaseSync {
    if (!this.db) {
      if (this.sqlitePath) {
        this.initSqlite(this.sqlitePath);
      }
      if (!this.db) {
        throw new BudgetStorageUnavailableError(
          'Persistent SQLite budget ledger is closed or unavailable. Paid APIs are blocked fail-closed.'
        );
      }
    }
    return this.db;
  }

  private runSqliteImmediateTx<T>(fn: (db: DatabaseSync) => T): T {
    const db = this.requireDb();
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      let inTx = false;
      try {
        db.exec('BEGIN IMMEDIATE');
        inTx = true;
        const result = fn(db);
        db.exec('COMMIT');
        inTx = false;
        return result;
      } catch (err) {
        if (inTx) {
          try {
            db.exec('ROLLBACK');
          } catch {
            // ignore rollback error
          }
        }
        const msg = err instanceof Error ? err.message : String(err);
        if (/SQLITE_BUSY|database is locked/i.test(msg) && attempt < 9) {
          lastError = err;
          // Short spin-wait for multi-process SQLite lock contention
          const waitUntil = Date.now() + 15 + attempt * 10;
          while (Date.now() < waitUntil) {
            // brief backoff
          }
          continue;
        }
        if (err instanceof BudgetStorageUnavailableError) {
          throw err;
        }
        throw new BudgetStorageUnavailableError(
          `Persistent budget transaction failed (${msg}). Paid APIs are blocked fail-closed.`
        );
      }
    }
    throw new BudgetStorageUnavailableError(
      `Persistent budget lock contention timeout (${lastError instanceof Error ? lastError.message : 'SQLITE_BUSY'}). Paid APIs are blocked fail-closed.`
    );
  }

  private reconcileSqliteScopeInTx(db: DatabaseSync, scopeKey: string, nowMs: number): void {
    db.prepare(
      `INSERT OR IGNORE INTO budget_scopes (scope_key, spent_credits, uncertain_credits, configured_limit_credits, updated_at_ms)
       VALUES (?, 0, 0, NULL, ?)`
    ).run(scopeKey, nowMs);

    const expiredRows = db
      .prepare(
        `SELECT reservation_id, reserved_credits, upstream_dispatched
         FROM budget_reservations
         WHERE scope_key = ? AND status = 'reserved' AND expires_at_ms <= ?`
      )
      .all(scopeKey, nowMs) as Array<{
      reservation_id: string;
      reserved_credits: number;
      upstream_dispatched: number;
    }>;

    for (const row of expiredRows) {
      if (row.upstream_dispatched === 1) {
        const amt = roundCredits3(Number(row.reserved_credits) || 0);
        db.prepare(
          `UPDATE budget_reservations
           SET status = 'uncertain', settled_credits = ?, updated_at_ms = ?, note = 'lease-expired-after-dispatch'
           WHERE reservation_id = ?`
        ).run(amt, nowMs, row.reservation_id);
        db.prepare(
          `UPDATE budget_scopes
           SET uncertain_credits = ROUND(uncertain_credits + ?, 3), updated_at_ms = ?
           WHERE scope_key = ?`
        ).run(amt, nowMs, scopeKey);
      } else {
        db.prepare(
          `UPDATE budget_reservations
           SET status = 'expired_released', settled_credits = 0, updated_at_ms = ?, note = 'lease-expired-before-dispatch'
           WHERE reservation_id = ?`
        ).run(nowMs, row.reservation_id);
      }
    }
  }

  private readSqliteSnapshotInTx(
    db: DatabaseSync,
    scopeKey: string,
    requestedLimitCredits: number | undefined,
    nowMs: number
  ): BudgetScopeSnapshot {
    const scopeRow = db
      .prepare(
        `SELECT spent_credits, uncertain_credits, configured_limit_credits
         FROM budget_scopes WHERE scope_key = ?`
      )
      .get(scopeKey) as
      | {
          spent_credits: number;
          uncertain_credits: number;
          configured_limit_credits: number | null;
        }
      | undefined;

    const activeRow = db
      .prepare(
        `SELECT COALESCE(SUM(reserved_credits), 0) AS active_sum
         FROM budget_reservations
         WHERE scope_key = ? AND status = 'reserved'`
      )
      .get(scopeKey) as { active_sum: number } | undefined;

    const spentCredits = roundCredits3(Number(scopeRow?.spent_credits ?? 0));
    const uncertainCredits = roundCredits3(Number(scopeRow?.uncertain_credits ?? 0));
    const activeReservedCredits = roundCredits3(Number(activeRow?.active_sum ?? 0));
    const configuredLimitCredits =
      typeof scopeRow?.configured_limit_credits === 'number' &&
      Number.isFinite(scopeRow.configured_limit_credits)
        ? roundCredits3(scopeRow.configured_limit_credits)
        : null;

    return this.buildSnapshot(
      scopeKey,
      spentCredits,
      uncertainCredits,
      activeReservedCredits,
      configuredLimitCredits,
      requestedLimitCredits,
      nowMs
    );
  }

  private buildSnapshot(
    scopeKey: string,
    spentCredits: number,
    uncertainCredits: number,
    activeReservedCredits: number,
    configuredLimitCredits: number | null,
    requestedLimitCredits: number | undefined,
    nowMs: number
  ): BudgetScopeSnapshot {
    const totalCommittedCredits = roundCredits3(
      spentCredits + uncertainCredits + activeReservedCredits
    );
    const effectiveLimitCredits = computeEffectiveLimit(
      configuredLimitCredits,
      requestedLimitCredits,
      this.hardCapCredits
    );
    const remainingCredits = Math.max(
      0,
      roundCredits3(effectiveLimitCredits - totalCommittedCredits)
    );
    const { scopeFingerprint, windowKey } = parseScopeMeta(scopeKey);
    return {
      scopeKey,
      scopeFingerprint,
      windowKey,
      backend: this.backend,
      storageAvailable: true,
      spentCredits,
      uncertainCredits,
      activeReservedCredits,
      totalCommittedCredits,
      configuredLimitCredits,
      hardCapCredits: this.hardCapCredits,
      effectiveLimitCredits,
      remainingCredits,
      updatedAt: new Date(nowMs).toISOString(),
    };
  }

  private trySwitchToPersistentSqliteOnInitialAuthReject(error: unknown): boolean {
    if (
      this.backend !== 'upstash-rest' ||
      this.requireDistributed ||
      this.upstashEverSucceeded ||
      !this.sqlitePath
    ) {
      return false;
    }
    const authRejected =
      error instanceof BudgetStorageUnavailableError &&
      (error as BudgetStorageUnavailableError & { initialUpstashAuthRejected?: boolean })
        .initialUpstashAuthRejected === true;
    if (!authRejected) {
      return false;
    }
    this.initSqlite(this.sqlitePath);
    this.backend = 'sqlite-wal';
    console.warn(
      '[budget-ledger] Upstash REST returned HTTP 401/403 on single-instance host; switched to persistent local SQLite WAL ledger.'
    );
    return true;
  }

  private async runUpstashCommand(command: Array<string | number>): Promise<unknown> {
    if (!this.upstashUrl || !this.upstashToken) {
      throw new BudgetStorageUnavailableError(
        'Distributed persistent budget store credentials are missing. Paid APIs are blocked fail-closed.'
      );
    }
    try {
      const response = await this.fetchFn(this.upstashUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.upstashToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(command),
        signal: AbortSignal.timeout(UPSTASH_TIMEOUT_MS),
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          const authErr = new BudgetStorageUnavailableError(
            `Distributed budget storage rejected credentials (HTTP ${response.status}). Check UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN in Settings > Secrets (or remove them in single-instance preview to use local SQLite). Paid APIs are blocked fail-closed (0 credits charged).`,
            `Upstash Redis Budget Storage ချိတ်ဆက်မှု ခွင့်ပြုချက်မရပါ (HTTP ${response.status})။ ဘေးကင်းစေရန် Paid API ကို ပိတ်ထားပါသည် (0 cr သာ)။ Settings > Secrets တွင် UPSTASH_REDIS_REST_URL နှင့် UPSTASH_REDIS_REST_TOKEN ကို မှန်ကန်အောင် ပြန်စစ်ပါ (သို့မဟုတ် Single-instance Preview အတွက် ၎င်းတို့ကို ဖယ်ရှားပါက Local SQLite ကို အလိုအလျောက် သုံးပါမည်)။`
          ) as BudgetStorageUnavailableError & { initialUpstashAuthRejected?: boolean };
          if (!this.upstashEverSucceeded) {
            authErr.initialUpstashAuthRejected = true;
          }
          throw authErr;
        }
        throw new BudgetStorageUnavailableError(
          `Distributed budget storage returned HTTP ${response.status}. Paid APIs are blocked fail-closed.`
        );
      }
      const payload = (await response.json().catch(() => null)) as {
        result?: unknown;
        error?: string;
      } | null;
      if (!payload || payload.error) {
        throw new BudgetStorageUnavailableError(
          `Distributed budget storage error: ${payload?.error ?? 'invalid response'}. Paid APIs are blocked fail-closed.`
        );
      }
      this.upstashEverSucceeded = true;
      return payload.result;
    } catch (error) {
      if (error instanceof BudgetStorageUnavailableError) throw error;
      throw new BudgetStorageUnavailableError(
        `Distributed budget storage unreachable (${error instanceof Error ? error.message : 'network error'}). Paid APIs are blocked fail-closed.`
      );
    }
  }

  private upstashKeys(scopeKey: string) {
    const base = `siampick:budget:v1:${scopeKey}`;
    return {
      scopeKeyRedis: `${base}:scope`,
      activeSetKey: `${base}:active`,
      resPrefix: `${base}:res:`,
      idemPrefix: `${base}:idem:`,
    };
  }

  async getScopeSnapshot(
    scopeKey: string,
    requestedLimitCredits?: number,
    nowMsOverride?: number
  ): Promise<BudgetScopeSnapshot> {
    const nowMs = nowMsOverride ?? this.nowMsFn();
    if (this.backend === 'sqlite-wal') {
      return this.runSqliteImmediateTx((db) => {
        this.reconcileSqliteScopeInTx(db, scopeKey, nowMs);
        return this.readSqliteSnapshotInTx(db, scopeKey, requestedLimitCredits, nowMs);
      });
    }

    const k = this.upstashKeys(scopeKey);
    let res: string[];
    try {
      res = (await this.runUpstashCommand([
        'EVAL',
        LUA_GET_SNAPSHOT,
        2,
        k.scopeKeyRedis,
        k.activeSetKey,
        k.resPrefix,
        String(nowMs),
      ])) as string[];
    } catch (error) {
      if (this.trySwitchToPersistentSqliteOnInitialAuthReject(error)) {
        return this.getScopeSnapshot(scopeKey, requestedLimitCredits, nowMs);
      }
      throw error;
    }

    const spent = roundCredits3(Number(res?.[0] ?? 0));
    const uncertain = roundCredits3(Number(res?.[1] ?? 0));
    const active = roundCredits3(Number(res?.[2] ?? 0));
    const cfg = res?.[3] ? roundCredits3(Number(res[3])) : null;
    return this.buildSnapshot(
      scopeKey,
      spent,
      uncertain,
      active,
      Number.isFinite(cfg) ? cfg : null,
      requestedLimitCredits,
      nowMs
    );
  }

  async setConfiguredSpendingLimit(
    scopeKey: string,
    limitCredits: number,
    nowMsOverride?: number
  ): Promise<BudgetScopeSnapshot> {
    const nowMs = nowMsOverride ?? this.nowMsFn();
    const clamped = clampCredits(limitCredits, MIN_SPENDING_LIMIT_CREDITS, this.hardCapCredits);

    if (this.backend === 'sqlite-wal') {
      return this.runSqliteImmediateTx((db) => {
        this.reconcileSqliteScopeInTx(db, scopeKey, nowMs);
        db.prepare(
          `UPDATE budget_scopes
           SET configured_limit_credits = ?, updated_at_ms = ?
           WHERE scope_key = ?`
        ).run(clamped, nowMs, scopeKey);
        return this.readSqliteSnapshotInTx(db, scopeKey, clamped, nowMs);
      });
    }

    const k = this.upstashKeys(scopeKey);
    let res: string[];
    try {
      res = (await this.runUpstashCommand([
        'EVAL',
        LUA_SET_LIMIT,
        2,
        k.scopeKeyRedis,
        k.activeSetKey,
        k.resPrefix,
        String(nowMs),
        String(clamped),
        String(SCOPE_TTL_SECONDS),
      ])) as string[];
    } catch (error) {
      if (this.trySwitchToPersistentSqliteOnInitialAuthReject(error)) {
        return this.setConfiguredSpendingLimit(scopeKey, limitCredits, nowMs);
      }
      throw error;
    }

    return this.buildSnapshot(
      scopeKey,
      roundCredits3(Number(res?.[0] ?? 0)),
      roundCredits3(Number(res?.[1] ?? 0)),
      roundCredits3(Number(res?.[2] ?? 0)),
      clamped,
      clamped,
      nowMs
    );
  }

  async atomicReserveBudget(params: AtomicReserveParams): Promise<AtomicReserveResult> {
    const nowMs = params.nowMs ?? this.nowMsFn();
    const reserveCredits = roundCredits3(Math.max(0, params.reserveCredits));
    const leaseMs = Math.max(5_000, params.leaseMs ?? DEFAULT_RESERVATION_LEASE_MS);
    const expiresAtMs = nowMs + leaseMs;
    const reservationId = `res_${crypto.randomUUID()}`;
    const runId = params.runId?.trim() ? params.runId.trim().slice(0, 80) : null;
    const idempotencyKey = params.idempotencyKey.trim().slice(0, 160);
    const operation = params.operation.trim().slice(0, 80) || 'paid-api';

    if (this.backend === 'sqlite-wal') {
      return this.runSqliteImmediateTx((db) => {
        this.reconcileSqliteScopeInTx(db, params.scopeKey, nowMs);
        const snapshotBefore = this.readSqliteSnapshotInTx(
          db,
          params.scopeKey,
          params.requestedLimitCredits,
          nowMs
        );

        const existing = db
          .prepare(
            `SELECT * FROM budget_reservations WHERE scope_key = ? AND idempotency_key = ?`
          )
          .get(params.scopeKey, idempotencyKey) as
          | {
              reservation_id: string;
              scope_key: string;
              idempotency_key: string;
              run_id: string | null;
              operation: string;
              reserved_credits: number;
              settled_credits: number;
              status: BudgetReservationStatus;
              upstream_dispatched: number;
              created_at_ms: number;
              updated_at_ms: number;
              expires_at_ms: number;
              note: string | null;
            }
          | undefined;

        if (existing) {
          const mapped: BudgetReservationRecord = {
            reservationId: existing.reservation_id,
            scopeKey: existing.scope_key,
            idempotencyKey: existing.idempotency_key,
            runId: existing.run_id,
            operation: existing.operation,
            reservedCredits: roundCredits3(existing.reserved_credits),
            settledCredits: roundCredits3(existing.settled_credits),
            status: existing.status,
            upstreamDispatched: existing.upstream_dispatched === 1,
            createdAtMs: existing.created_at_ms,
            updatedAtMs: existing.updated_at_ms,
            expiresAtMs: existing.expires_at_ms,
            note: existing.note,
          };

          if (existing.status === 'reserved') {
            return {
              ok: false,
              reason: 'IDEMPOTENCY_IN_PROGRESS',
              existingReservation: mapped,
              snapshot: snapshotBefore,
            };
          }
          if (existing.status === 'settled' || existing.status === 'uncertain') {
            return {
              ok: false,
              reason: 'IDEMPOTENCY_ALREADY_SETTLED',
              existingReservation: mapped,
              snapshot: snapshotBefore,
            };
          }
          // Released or expired_released before dispatch: replace with a fresh attempt cleanly
          db.prepare(`DELETE FROM budget_reservations WHERE reservation_id = ?`).run(
            existing.reservation_id
          );
        }

        if (
          snapshotBefore.totalCommittedCredits + reserveCredits >
          snapshotBefore.effectiveLimitCredits + 1e-6
        ) {
          return {
            ok: false,
            reason: 'SPENDING_LIMIT_EXCEEDED',
            snapshot: snapshotBefore,
          };
        }

        db.prepare(
          `INSERT INTO budget_reservations (
             reservation_id, scope_key, idempotency_key, run_id, operation,
             reserved_credits, settled_credits, status, upstream_dispatched,
             created_at_ms, updated_at_ms, expires_at_ms, note
           ) VALUES (?, ?, ?, ?, ?, ?, 0, 'reserved', 0, ?, ?, ?, NULL)`
        ).run(
          reservationId,
          params.scopeKey,
          idempotencyKey,
          runId,
          operation,
          reserveCredits,
          nowMs,
          nowMs,
          expiresAtMs
        );

        const snapshotAfter = this.readSqliteSnapshotInTx(
          db,
          params.scopeKey,
          params.requestedLimitCredits,
          nowMs
        );
        return {
          ok: true,
          reservationId,
          reservedCredits: reserveCredits,
          snapshot: snapshotAfter,
        };
      });
    }

    const k = this.upstashKeys(params.scopeKey);
    const requestedLimitVal =
      typeof params.requestedLimitCredits === 'number' &&
      Number.isFinite(params.requestedLimitCredits)
        ? clampCredits(
            params.requestedLimitCredits,
            MIN_SPENDING_LIMIT_CREDITS,
            this.hardCapCredits
          )
        : 0;

    let res: string[];
    try {
      res = (await this.runUpstashCommand([
        'EVAL',
        LUA_RESERVE,
        4,
        k.scopeKeyRedis,
        k.activeSetKey,
        `${k.idemPrefix}${idempotencyKey}`,
        `${k.resPrefix}${reservationId}`,
        k.resPrefix,
        String(nowMs),
        String(reserveCredits),
        String(requestedLimitVal),
        String(this.hardCapCredits),
        String(DEFAULT_SPENDING_LIMIT_CREDITS),
        reservationId,
        runId ?? '',
        operation,
        String(expiresAtMs),
        String(SCOPE_TTL_SECONDS),
        idempotencyKey,
      ])) as string[];
    } catch (error) {
      if (this.trySwitchToPersistentSqliteOnInitialAuthReject(error)) {
        return this.atomicReserveBudget({ ...params, nowMs });
      }
      throw error;
    }

    const code = res?.[0] ?? '';
    const returnedResId = res?.[1] ?? '';
    const spent = roundCredits3(Number(res?.[2] ?? 0));
    const uncertain = roundCredits3(Number(res?.[3] ?? 0));
    const active = roundCredits3(Number(res?.[4] ?? 0));
    const cfg = res?.[5] ? roundCredits3(Number(res[5])) : null;
    const snapshot = this.buildSnapshot(
      params.scopeKey,
      spent,
      uncertain,
      active,
      Number.isFinite(cfg) ? cfg : null,
      params.requestedLimitCredits,
      nowMs
    );

    if (code === 'OK') {
      return {
        ok: true,
        reservationId: returnedResId || reservationId,
        reservedCredits: reserveCredits,
        snapshot,
      };
    }

    if (code === 'IDEMPOTENCY_IN_PROGRESS' || code === 'IDEMPOTENCY_ALREADY_SETTLED') {
      return {
        ok: false,
        reason: code,
        snapshot,
      };
    }

    return {
      ok: false,
      reason: 'SPENDING_LIMIT_EXCEEDED',
      snapshot,
    };
  }

  async markReservationDispatched(
    scopeKey: string,
    reservationId: string,
    nowMsOverride?: number
  ): Promise<void> {
    const nowMs = nowMsOverride ?? this.nowMsFn();
    if (this.backend === 'sqlite-wal') {
      this.runSqliteImmediateTx((db) => {
        db.prepare(
          `UPDATE budget_reservations
           SET upstream_dispatched = 1, updated_at_ms = ?
           WHERE reservation_id = ? AND scope_key = ? AND status = 'reserved'`
        ).run(nowMs, reservationId, scopeKey);
      });
      return;
    }

    const k = this.upstashKeys(scopeKey);
    await this.runUpstashCommand([
      'EVAL',
      LUA_MARK_DISPATCHED,
      1,
      `${k.resPrefix}${reservationId}`,
      String(nowMs),
    ]);
  }

  async settleReservation(params: {
    scopeKey: string;
    reservationId: string;
    actualCredits?: number | null;
    requestedLimitCredits?: number;
    note?: string;
    nowMs?: number;
  }): Promise<BudgetScopeSnapshot> {
    const nowMs = params.nowMs ?? this.nowMsFn();
    const note = (params.note ?? 'settled').slice(0, 160);

    if (this.backend === 'sqlite-wal') {
      return this.runSqliteImmediateTx((db) => {
        const row = db
          .prepare(
            `SELECT status, reserved_credits FROM budget_reservations
             WHERE reservation_id = ? AND scope_key = ?`
          )
          .get(params.reservationId, params.scopeKey) as
          | { status: BudgetReservationStatus; reserved_credits: number }
          | undefined;

        if (row && row.status === 'reserved') {
          const settleAmt =
            typeof params.actualCredits === 'number' &&
            Number.isFinite(params.actualCredits) &&
            params.actualCredits >= 0
              ? roundCredits3(params.actualCredits)
              : roundCredits3(row.reserved_credits);

          db.prepare(
            `UPDATE budget_reservations
             SET status = 'settled', settled_credits = ?, updated_at_ms = ?, note = ?
             WHERE reservation_id = ?`
          ).run(settleAmt, nowMs, note, params.reservationId);

          db.prepare(
            `UPDATE budget_scopes
             SET spent_credits = ROUND(spent_credits + ?, 3), updated_at_ms = ?
             WHERE scope_key = ?`
          ).run(settleAmt, nowMs, params.scopeKey);
        }

        this.reconcileSqliteScopeInTx(db, params.scopeKey, nowMs);
        return this.readSqliteSnapshotInTx(
          db,
          params.scopeKey,
          params.requestedLimitCredits,
          nowMs
        );
      });
    }

    const k = this.upstashKeys(params.scopeKey);
    const actualArg =
      typeof params.actualCredits === 'number' &&
      Number.isFinite(params.actualCredits) &&
      params.actualCredits >= 0
        ? String(roundCredits3(params.actualCredits))
        : '';

    const res = (await this.runUpstashCommand([
      'EVAL',
      LUA_SETTLE,
      3,
      k.scopeKeyRedis,
      k.activeSetKey,
      `${k.resPrefix}${params.reservationId}`,
      k.resPrefix,
      params.reservationId,
      actualArg,
      String(nowMs),
      note,
      String(SCOPE_TTL_SECONDS),
    ])) as string[];

    const cfg = res?.[3] ? roundCredits3(Number(res[3])) : null;
    return this.buildSnapshot(
      params.scopeKey,
      roundCredits3(Number(res?.[0] ?? 0)),
      roundCredits3(Number(res?.[1] ?? 0)),
      roundCredits3(Number(res?.[2] ?? 0)),
      Number.isFinite(cfg) ? cfg : null,
      params.requestedLimitCredits,
      nowMs
    );
  }

  /**
   * Releases a reservation ONLY when confirmed not charged:
   * - Either upstream_dispatched === 0 (never sent a paid request), OR
   * - verifiedZeroCharge === true (confirmed via balance check on deterministic error).
   * Defense-in-depth: if upstream_dispatched === 1 and verifiedZeroCharge !== true,
   * refuses to release and transitions to 'uncertain' instead!
   */
  async releaseReservation(params: {
    scopeKey: string;
    reservationId: string;
    verifiedZeroCharge?: boolean;
    requestedLimitCredits?: number;
    reason?: string;
    nowMs?: number;
  }): Promise<{ outcome: 'RELEASED' | 'HELD_UNCERTAIN' | 'NOOP'; snapshot: BudgetScopeSnapshot }> {
    const nowMs = params.nowMs ?? this.nowMsFn();
    const reason = (params.reason ?? 'released').slice(0, 140);
    const verifiedZero = params.verifiedZeroCharge === true;

    if (this.backend === 'sqlite-wal') {
      return this.runSqliteImmediateTx((db) => {
        const row = db
          .prepare(
            `SELECT status, reserved_credits, upstream_dispatched FROM budget_reservations
             WHERE reservation_id = ? AND scope_key = ?`
          )
          .get(params.reservationId, params.scopeKey) as
          | {
              status: BudgetReservationStatus;
              reserved_credits: number;
              upstream_dispatched: number;
            }
          | undefined;

        let outcome: 'RELEASED' | 'HELD_UNCERTAIN' | 'NOOP' = 'NOOP';
        if (row && row.status === 'reserved') {
          if (row.upstream_dispatched === 1 && !verifiedZero) {
            const amt = roundCredits3(row.reserved_credits);
            db.prepare(
              `UPDATE budget_reservations
               SET status = 'uncertain', settled_credits = ?, updated_at_ms = ?, note = ?
               WHERE reservation_id = ?`
            ).run(amt, nowMs, `refused-unverified-release:${reason}`, params.reservationId);
            db.prepare(
              `UPDATE budget_scopes
               SET uncertain_credits = ROUND(uncertain_credits + ?, 3), updated_at_ms = ?
               WHERE scope_key = ?`
            ).run(amt, nowMs, params.scopeKey);
            outcome = 'HELD_UNCERTAIN';
          } else {
            db.prepare(
              `UPDATE budget_reservations
               SET status = 'released', settled_credits = 0, updated_at_ms = ?, note = ?
               WHERE reservation_id = ?`
            ).run(nowMs, reason, params.reservationId);
            outcome = 'RELEASED';
          }
        }

        this.reconcileSqliteScopeInTx(db, params.scopeKey, nowMs);
        const snapshot = this.readSqliteSnapshotInTx(
          db,
          params.scopeKey,
          params.requestedLimitCredits,
          nowMs
        );
        return { outcome, snapshot };
      });
    }

    const k = this.upstashKeys(params.scopeKey);
    const res = (await this.runUpstashCommand([
      'EVAL',
      LUA_RELEASE,
      3,
      k.scopeKeyRedis,
      k.activeSetKey,
      `${k.resPrefix}${params.reservationId}`,
      k.resPrefix,
      params.reservationId,
      verifiedZero ? '1' : '0',
      String(nowMs),
      reason,
      String(SCOPE_TTL_SECONDS),
    ])) as string[];

    const rawOutcome = res?.[0];
    const outcome: 'RELEASED' | 'HELD_UNCERTAIN' | 'NOOP' =
      rawOutcome === 'RELEASED' || rawOutcome === 'HELD_UNCERTAIN' ? rawOutcome : 'NOOP';
    const cfg = res?.[4] ? roundCredits3(Number(res[4])) : null;
    const snapshot = this.buildSnapshot(
      params.scopeKey,
      roundCredits3(Number(res?.[1] ?? 0)),
      roundCredits3(Number(res?.[2] ?? 0)),
      roundCredits3(Number(res?.[3] ?? 0)),
      Number.isFinite(cfg) ? cfg : null,
      params.requestedLimitCredits,
      nowMs
    );
    return { outcome, snapshot };
  }

  async markReservationUncertain(params: {
    scopeKey: string;
    reservationId: string;
    requestedLimitCredits?: number;
    reason?: string;
    nowMs?: number;
  }): Promise<BudgetScopeSnapshot> {
    const nowMs = params.nowMs ?? this.nowMsFn();
    const reason = (params.reason ?? 'uncertain-outcome').slice(0, 140);

    if (this.backend === 'sqlite-wal') {
      return this.runSqliteImmediateTx((db) => {
        const row = db
          .prepare(
            `SELECT status, reserved_credits FROM budget_reservations
             WHERE reservation_id = ? AND scope_key = ?`
          )
          .get(params.reservationId, params.scopeKey) as
          | { status: BudgetReservationStatus; reserved_credits: number }
          | undefined;

        if (row && row.status === 'reserved') {
          const amt = roundCredits3(row.reserved_credits);
          db.prepare(
            `UPDATE budget_reservations
             SET status = 'uncertain', settled_credits = ?, updated_at_ms = ?, note = ?
             WHERE reservation_id = ?`
          ).run(amt, nowMs, reason, params.reservationId);
          db.prepare(
            `UPDATE budget_scopes
             SET uncertain_credits = ROUND(uncertain_credits + ?, 3), updated_at_ms = ?
             WHERE scope_key = ?`
          ).run(amt, nowMs, params.scopeKey);
        }

        this.reconcileSqliteScopeInTx(db, params.scopeKey, nowMs);
        return this.readSqliteSnapshotInTx(
          db,
          params.scopeKey,
          params.requestedLimitCredits,
          nowMs
        );
      });
    }

    const k = this.upstashKeys(params.scopeKey);
    const res = (await this.runUpstashCommand([
      'EVAL',
      LUA_MARK_UNCERTAIN,
      3,
      k.scopeKeyRedis,
      k.activeSetKey,
      `${k.resPrefix}${params.reservationId}`,
      k.resPrefix,
      params.reservationId,
      String(nowMs),
      reason,
      String(SCOPE_TTL_SECONDS),
    ])) as string[];

    const cfg = res?.[3] ? roundCredits3(Number(res[3])) : null;
    return this.buildSnapshot(
      params.scopeKey,
      roundCredits3(Number(res?.[0] ?? 0)),
      roundCredits3(Number(res?.[1] ?? 0)),
      roundCredits3(Number(res?.[2] ?? 0)),
      Number.isFinite(cfg) ? cfg : null,
      params.requestedLimitCredits,
      nowMs
    );
  }

  /**
   * Test-only helper to clear local SQLite rows between isolated unit tests.
   * NEVER exposed via any HTTP route.
   */
  clearAllForTests(): void {
    if (this.backend !== 'sqlite-wal') return;
    this.runSqliteImmediateTx((db) => {
      db.exec('DELETE FROM budget_reservations; DELETE FROM budget_scopes;');
    });
  }
}

export function createBudgetLedger(options?: BudgetLedgerOptions): PersistentBudgetLedger {
  return new PersistentBudgetLedger(options);
}

let defaultLedgerInstance: PersistentBudgetLedger | null = null;
let defaultLedgerEnvSignature: string | null = null;

function computeEnvSignature(): string {
  return [
    process.env.SIAMPICK_BUDGET_STORE_DISABLED ?? '',
    process.env.SIAMPICK_REQUIRE_DISTRIBUTED_BUDGET_STORE ?? '',
    process.env.VERCEL ?? '',
    process.env.VERCEL_ENV ?? '',
    process.env.AWS_LAMBDA_FUNCTION_NAME ?? '',
    process.env.NETLIFY ?? '',
    process.env.UPSTASH_REDIS_REST_URL ?? '',
    process.env.KV_REST_API_URL ?? '',
    process.env.SIAMPICK_BUDGET_DB_PATH ?? '',
    process.env.SIAMPICK_DAILY_HARD_CAP_CREDITS ?? '',
  ].join('|');
}

export function getDefaultBudgetLedger(): PersistentBudgetLedger {
  const sig = computeEnvSignature();
  if (defaultLedgerInstance && defaultLedgerEnvSignature === sig) {
    return defaultLedgerInstance;
  }
  if (defaultLedgerInstance) {
    defaultLedgerInstance.close();
    defaultLedgerInstance = null;
  }
  const instance = new PersistentBudgetLedger();
  defaultLedgerInstance = instance;
  defaultLedgerEnvSignature = sig;
  return instance;
}

export function resetDefaultBudgetLedgerForTests(): void {
  if (defaultLedgerInstance) {
    try {
      defaultLedgerInstance.clearAllForTests();
    } catch {
      // ignore if disabled
    }
    defaultLedgerInstance.close();
    defaultLedgerInstance = null;
    defaultLedgerEnvSignature = null;
    return;
  }

  if (
    process.env.SIAMPICK_BUDGET_STORE_DISABLED === 'true' ||
    isServerlessMultiInstanceEnv() ||
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.KV_REST_API_URL
  ) {
    return;
  }

  const rawSqlitePath =
    process.env.SIAMPICK_BUDGET_DB_PATH ??
    path.join(process.cwd(), '.data', 'siampick-budget.sqlite');
  try {
    const resolved = validateSafeSqlitePath(rawSqlitePath);
    if (fs.existsSync(resolved)) {
      const temp = new PersistentBudgetLedger({ sqlitePath: resolved });
      temp.clearAllForTests();
      temp.close();
    }
  } catch {
    // ignore cleanup errors in test helper
  }
}
