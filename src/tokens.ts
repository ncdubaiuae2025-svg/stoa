// stoa/src/tokens.ts — Token usage and cost tracking
import { appendFileSync, existsSync, readFileSync, mkdirSync } from "fs";
import { createLogger } from "./logger.js";

const log = createLogger("tokens");
const USAGE_FILE = "memory/token-usage.csv";

export interface TokenUsage {
  timestamp: string;
  agent: string;
  skill: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost_usd: number;
  duration_ms: number;
}

// Pricing per 1M tokens (as of 2025)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-20250514": { input: 3.0, output: 15.0 },
  "claude-opus-4-20250514": { input: 15.0, output: 75.0 },
  "claude-haiku-3-5-20241022": { input: 0.80, output: 4.0 },
};

function ensureCSV(): void {
  const dir = "memory";
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  if (!existsSync(USAGE_FILE)) {
    appendFileSync(
      USAGE_FILE,
      "timestamp,agent,skill,model,input_tokens,output_tokens,total_tokens,cost_usd,duration_ms\n"
    );
  }
}

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING["claude-sonnet-4-20250514"];
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

export function recordUsage(usage: TokenUsage): void {
  ensureCSV();

  const line = [
    usage.timestamp,
    usage.agent,
    usage.skill,
    usage.model,
    usage.input_tokens,
    usage.output_tokens,
    usage.total_tokens,
    usage.cost_usd.toFixed(6),
    usage.duration_ms,
  ].join(",");

  appendFileSync(USAGE_FILE, line + "\n");
  log.info("Token usage recorded", {
    agent: usage.agent,
    skill: usage.skill,
    tokens: usage.total_tokens,
    cost: `$${usage.cost_usd.toFixed(4)}`,
  });
}

export function getTotalCost(sinceDate?: string): { total_usd: number; by_agent: Record<string, number>; by_model: Record<string, number> } {
  if (!existsSync(USAGE_FILE)) {
    return { total_usd: 0, by_agent: {}, by_model: {} };
  }

  const content = readFileSync(USAGE_FILE, "utf-8");
  const lines = content.trim().split("\n").slice(1); // Skip header

  let totalUSD = 0;
  const byAgent: Record<string, number> = {};
  const byModel: Record<string, number> = {};

  for (const line of lines) {
    const parts = line.split(",");
    if (parts.length < 9) continue;

    const [timestamp, agent, , model, , , , costStr] = parts;

    if (sinceDate && timestamp < sinceDate) continue;

    const cost = parseFloat(costStr);
    if (isNaN(cost)) continue;

    totalUSD += cost;
    byAgent[agent] = (byAgent[agent] || 0) + cost;
    byModel[model] = (byModel[model] || 0) + cost;
  }

  return {
    total_usd: Math.round(totalUSD * 10000) / 10000,
    by_agent: byAgent,
    by_model: byModel,
  };
}
