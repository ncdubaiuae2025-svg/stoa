// stoa/src/memory.ts — Shared state management (git-backed)
//
// All swarm state lives in memory/ as JSON files.
// Every change is committed to git, creating an immutable audit trail.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import type { CronState, Position, PortfolioState } from "./types.js";

const MEMORY_DIR = "memory";

function ensurePath(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/** Generic read/write for any JSON file in memory/ */
export function readJSON<T>(filename: string, fallback: T): T {
  const path = `${MEMORY_DIR}/${filename}`;
  if (!existsSync(path)) return fallback;

  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

export function writeJSON(filename: string, data: unknown): void {
  const path = `${MEMORY_DIR}/${filename}`;
  ensurePath(path);
  writeFileSync(path, JSON.stringify(data, null, 2));
}

/** Append to a JSON array file (for logs) */
export function appendJSON<T>(filename: string, entry: T): void {
  const existing = readJSON<T[]>(filename, []);
  existing.push(entry);

  // Keep last 500 entries to prevent unbounded growth
  const trimmed = existing.slice(-500);
  writeJSON(filename, trimmed);
}

// --- Typed accessors for core state files ---

export function getCronState(): CronState {
  return readJSON<CronState>("cron-state.json", {
    agents: {},
    swarm_status: "active",
  });
}

export function setCronState(state: CronState): void {
  writeJSON("cron-state.json", state);
}

export function getPositions(): Position[] {
  return readJSON<Position[]>("positions.json", []);
}

export function setPositions(positions: Position[]): void {
  writeJSON("positions.json", positions);
}

export function getPortfolioState(): PortfolioState {
  return readJSON<PortfolioState>("portfolio-state.json", {
    timestamp: new Date().toISOString(),
    total_value_usd: 0,
    total_value_sol: 0,
    peak_value_usd: 0,
    drawdown_pct: 0,
    open_positions: 0,
    status: "active",
    alerts: [],
  });
}

export function setPortfolioState(state: PortfolioState): void {
  writeJSON("portfolio-state.json", state);
}
