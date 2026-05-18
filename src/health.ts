// stoa/src/health.ts — Skill quality scoring and self-healing
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { createLogger } from "./logger.js";

const log = createLogger("health");
const HEALTH_DIR = "memory/skill-health";

export interface SkillScore {
  timestamp: string;
  agent: string;
  skill: string;
  score: number; // 1-5
  duration_ms: number;
  error?: string;
  output_size: number;
}

export interface SkillHealthReport {
  agent: string;
  skill: string;
  avg_score: number;
  recent_failures: number;
  total_runs: number;
  last_run: string;
  trend: "improving" | "stable" | "degrading";
  needs_repair: boolean;
}

function ensureDir(): void {
  if (!existsSync(HEALTH_DIR)) {
    mkdirSync(HEALTH_DIR, { recursive: true });
  }
}

function healthPath(agent: string, skill: string): string {
  return `${HEALTH_DIR}/${agent}-${skill}.json`;
}

export function recordScore(score: SkillScore): void {
  ensureDir();
  const path = healthPath(score.agent, score.skill);

  let history: SkillScore[] = [];
  if (existsSync(path)) {
    try {
      history = JSON.parse(readFileSync(path, "utf-8"));
    } catch {}
  }

  history.push(score);
  // Keep rolling 30-run history
  if (history.length > 30) {
    history = history.slice(-30);
  }

  writeFileSync(path, JSON.stringify(history, null, 2));
  log.info(`Recorded score for ${score.agent}/${score.skill}: ${score.score}/5`, {
    duration_ms: score.duration_ms,
  });
}

export function getHealthReport(agent: string, skill: string): SkillHealthReport {
  const path = healthPath(agent, skill);

  if (!existsSync(path)) {
    return {
      agent,
      skill,
      avg_score: 0,
      recent_failures: 0,
      total_runs: 0,
      last_run: "never",
      trend: "stable",
      needs_repair: false,
    };
  }

  const history: SkillScore[] = JSON.parse(readFileSync(path, "utf-8"));
  const total = history.length;
  const avgScore = history.reduce((sum, h) => sum + h.score, 0) / total;

  // Recent failures = last 5 runs with score <= 2
  const recent5 = history.slice(-5);
  const recentFailures = recent5.filter((h) => h.score <= 2).length;

  // Trend: compare first half vs second half
  const halfIdx = Math.floor(total / 2);
  const firstHalf = history.slice(0, halfIdx);
  const secondHalf = history.slice(halfIdx);
  const firstAvg = firstHalf.reduce((s, h) => s + h.score, 0) / (firstHalf.length || 1);
  const secondAvg = secondHalf.reduce((s, h) => s + h.score, 0) / (secondHalf.length || 1);

  let trend: "improving" | "stable" | "degrading" = "stable";
  if (secondAvg - firstAvg > 0.5) trend = "improving";
  else if (firstAvg - secondAvg > 0.5) trend = "degrading";

  // Needs repair if: avg < 3 OR 3+ consecutive failures
  const needsRepair = avgScore < 3 || recentFailures >= 3;

  return {
    agent,
    skill,
    avg_score: Math.round(avgScore * 100) / 100,
    recent_failures: recentFailures,
    total_runs: total,
    last_run: history[history.length - 1]?.timestamp || "never",
    trend,
    needs_repair: needsRepair,
  };
}

export function getAllHealthReports(): SkillHealthReport[] {
  ensureDir();
  const { readdirSync } = require("fs");
  const files: string[] = readdirSync(HEALTH_DIR).filter((f: string) => f.endsWith(".json"));

  return files.map((f) => {
    const [agent, ...skillParts] = f.replace(".json", "").split("-");
    const skill = skillParts.join("-");
    return getHealthReport(agent, skill);
  });
}

export function getFailingSkills(): SkillHealthReport[] {
  return getAllHealthReports().filter((r) => r.needs_repair);
}
