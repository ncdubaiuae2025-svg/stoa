// stoa/src/ratelimit.ts — Token bucket rate limiter for API calls
import { readFileSync, writeFileSync, existsSync } from "fs";
import { createLogger } from "./logger.js";

const log = createLogger("ratelimit");
const STATE_FILE = "memory/ratelimit-state.json";

interface BucketState {
  tokens: number;
  last_refill: string;
}

interface RateLimitConfig {
  max_tokens: number;
  refill_rate: number; // tokens per second
  refill_interval: number; // ms between refills
}

const API_LIMITS: Record<string, RateLimitConfig> = {
  dexscreener: { max_tokens: 30, refill_rate: 1, refill_interval: 1000 },
  jupiter: { max_tokens: 60, refill_rate: 2, refill_interval: 1000 },
  helius: { max_tokens: 10, refill_rate: 0.5, refill_interval: 2000 },
  solana_rpc: { max_tokens: 40, refill_rate: 1.5, refill_interval: 1000 },
};

function loadState(): Record<string, BucketState> {
  if (!existsSync(STATE_FILE)) return {};
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function saveState(state: Record<string, BucketState>): void {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function refillBucket(bucket: BucketState, config: RateLimitConfig): BucketState {
  const now = Date.now();
  const elapsed = now - new Date(bucket.last_refill).getTime();
  const tokensToAdd = (elapsed / 1000) * config.refill_rate;
  return {
    tokens: Math.min(config.max_tokens, bucket.tokens + tokensToAdd),
    last_refill: new Date(now).toISOString(),
  };
}

export function canRequest(api: string): boolean {
  const config = API_LIMITS[api];
  if (!config) return true; // Unknown API = no limit

  const state = loadState();
  let bucket = state[api] || { tokens: config.max_tokens, last_refill: new Date().toISOString() };
  bucket = refillBucket(bucket, config);

  return bucket.tokens >= 1;
}

export function consumeToken(api: string): boolean {
  const config = API_LIMITS[api];
  if (!config) return true;

  const state = loadState();
  let bucket = state[api] || { tokens: config.max_tokens, last_refill: new Date().toISOString() };
  bucket = refillBucket(bucket, config);

  if (bucket.tokens < 1) {
    log.warn(`Rate limit hit for ${api}`, { tokens_available: bucket.tokens });
    state[api] = bucket;
    saveState(state);
    return false;
  }

  bucket.tokens -= 1;
  state[api] = bucket;
  saveState(state);
  return true;
}

export function waitForToken(api: string): Promise<void> {
  return new Promise((resolve) => {
    const check = () => {
      if (consumeToken(api)) {
        resolve();
      } else {
        const config = API_LIMITS[api] || { refill_interval: 1000 };
        setTimeout(check, config.refill_interval);
      }
    };
    check();
  });
}

export function getRateLimitStatus(): Record<string, { tokens: number; max: number }> {
  const state = loadState();
  const result: Record<string, { tokens: number; max: number }> = {};

  for (const [api, config] of Object.entries(API_LIMITS)) {
    let bucket = state[api] || { tokens: config.max_tokens, last_refill: new Date().toISOString() };
    bucket = refillBucket(bucket, config);
    result[api] = { tokens: Math.round(bucket.tokens * 10) / 10, max: config.max_tokens };
  }

  return result;
}
