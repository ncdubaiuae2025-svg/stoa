// stoa/src/logger.ts — Structured logging with file persistence
import { appendFileSync, existsSync, mkdirSync } from "fs";

const LOG_DIR = "memory/logs";
const isCI = process.env.GITHUB_ACTIONS === "true";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const MIN_LEVEL: LogLevel = (process.env.STOA_LOG_LEVEL as LogLevel) || "info";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  data?: Record<string, unknown>;
}

function ensureLogDir(): void {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
}

function formatEntry(entry: LogEntry): string {
  if (isCI) {
    return JSON.stringify(entry);
  }
  const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.module}]`;
  const dataStr = entry.data ? ` ${JSON.stringify(entry.data)}` : "";
  return `${prefix} ${entry.message}${dataStr}`;
}

function writeToFile(entry: LogEntry): void {
  ensureLogDir();
  const date = entry.timestamp.split("T")[0];
  const path = `${LOG_DIR}/${date}.log`;
  appendFileSync(path, JSON.stringify(entry) + "\n");
}

export function createLogger(module: string) {
  function log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[MIN_LEVEL]) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      module,
      message,
      data,
    };

    const formatted = formatEntry(entry);

    if (level === "error") {
      console.error(formatted);
    } else if (level === "warn") {
      console.warn(formatted);
    } else {
      console.log(formatted);
    }

    // Persist warn and error to file
    if (LEVEL_PRIORITY[level] >= LEVEL_PRIORITY["warn"]) {
      writeToFile(entry);
    }
  }

  return {
    debug: (msg: string, data?: Record<string, unknown>) => log("debug", msg, data),
    info: (msg: string, data?: Record<string, unknown>) => log("info", msg, data),
    warn: (msg: string, data?: Record<string, unknown>) => log("warn", msg, data),
    error: (msg: string, data?: Record<string, unknown>) => log("error", msg, data),
  };
}
