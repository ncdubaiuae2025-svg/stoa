// stoa/src/dedup.ts — Dispatch deduplication
//
// Prevents duplicate agent dispatches when ticks overlap or
// when the same trigger fires multiple times.

import { createHash } from "crypto";
import { readJSON, writeJSON } from "./memory.js";
import { createLogger } from "./logger.js";

const log = createLogger("dedup");
const STATE_FILE = "dedup-state.json";

interface DedupEntry {
  hash: string;
  agent: string;
  skill: string;
  dispatched_at: string;
  expires_at: string;
}

function generateHash(agent: string, skill: string, window: string): string {
  return createHash("sha256")
    .update(`${agent}:${skill}:${window}`)
    .digest("hex")
    .slice(0, 16);
}

function getTimeWindow(intervalMinutes: number): string {
  const now = Date.now();
  const windowStart = Math.floor(now / (intervalMinutes * 60 * 1000));
  return `${windowStart}`;
}

export function isDuplicate(agent: string, skill: string, dedupWindowMinutes: number = 10): boolean {
  const window = getTimeWindow(dedupWindowMinutes);
  const hash = generateHash(agent, skill, window);

  const state = readJSON<DedupEntry[]>(STATE_FILE, []);
  const now = Date.now();

  // Clean expired entries
  const active = state.filter((e) => new Date(e.expires_at).getTime() > now);

  const exists = active.some((e) => e.hash === hash);

  if (exists) {
    log.info(`Dedup: skipping duplicate dispatch for ${agent}/${skill}`, { hash, window });
    return true;
  }

  return false;
}

export function markDispatched(agent: string, skill: string, dedupWindowMinutes: number = 10): void {
  const window = getTimeWindow(dedupWindowMinutes);
  const hash = generateHash(agent, skill, window);
  const now = new Date();

  const state = readJSON<DedupEntry[]>(STATE_FILE, []);

  // Clean expired + add new
  const active = state.filter((e) => new Date(e.expires_at).getTime() > now.getTime());

  active.push({
    hash,
    agent,
    skill,
    dispatched_at: now.toISOString(),
    expires_at: new Date(now.getTime() + dedupWindowMinutes * 60 * 1000).toISOString(),
  });

  writeJSON(STATE_FILE, active);
}

/** Generate a content hash for notification dedup */
export function contentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 12);
}

/** Check if a notification was already sent (prevents duplicate alerts) */
export function isNotificationDuplicate(content: string, ttlMinutes: number = 60): boolean {
  const hash = contentHash(content);
  const state = readJSON<Record<string, string>>("notification-dedup.json", {});
  const now = Date.now();

  // Clean expired
  const cleaned: Record<string, string> = {};
  for (const [h, ts] of Object.entries(state)) {
    if (now - new Date(ts).getTime() < ttlMinutes * 60 * 1000) {
      cleaned[h] = ts;
    }
  }

  if (cleaned[hash]) {
    return true;
  }

  cleaned[hash] = new Date().toISOString();
  writeJSON("notification-dedup.json", cleaned);
  return false;
}
