// stoa/src/chain.ts — Skill chaining and pipeline orchestration
//
// Supports sequential and parallel skill execution within a single agent run.
// Chains pass output between steps via .outputs/ directory.

import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { createLogger } from "./logger.js";

const log = createLogger("chain");
const OUTPUTS_DIR = ".outputs";

export interface ChainStep {
  agent: string;
  skill: string;
  depends_on?: string[]; // step IDs this step waits for
  condition?: string; // jq-style condition on previous output
}

export interface ChainConfig {
  id: string;
  name: string;
  steps: Record<string, ChainStep>;
  on_failure: "stop" | "continue" | "retry";
  max_retries: number;
}

export interface StepResult {
  step_id: string;
  status: "success" | "failed" | "skipped";
  started_at: string;
  completed_at: string;
  output_file?: string;
  error?: string;
}

function ensureOutputDir(): void {
  if (!existsSync(OUTPUTS_DIR)) {
    mkdirSync(OUTPUTS_DIR, { recursive: true });
  }
}

export function getStepOutput(stepId: string): string | null {
  const path = `${OUTPUTS_DIR}/${stepId}.json`;
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf-8");
}

export function setStepOutput(stepId: string, data: unknown): void {
  ensureOutputDir();
  const path = `${OUTPUTS_DIR}/${stepId}.json`;
  writeFileSync(path, JSON.stringify(data, null, 2));
}

function getReadySteps(
  chain: ChainConfig,
  completed: Set<string>,
  failed: Set<string>
): string[] {
  const ready: string[] = [];

  for (const [stepId, step] of Object.entries(chain.steps)) {
    if (completed.has(stepId) || failed.has(stepId)) continue;

    const deps = step.depends_on || [];
    const allDepsComplete = deps.every((d) => completed.has(d));
    const anyDepFailed = deps.some((d) => failed.has(d));

    if (anyDepFailed && chain.on_failure === "stop") continue;
    if (allDepsComplete) ready.push(stepId);
  }

  return ready;
}

export async function executeChain(chain: ChainConfig): Promise<StepResult[]> {
  log.info(`Starting chain: ${chain.name} (${Object.keys(chain.steps).length} steps)`);

  const results: StepResult[] = [];
  const completed = new Set<string>();
  const failed = new Set<string>();

  const totalSteps = Object.keys(chain.steps).length;

  while (completed.size + failed.size < totalSteps) {
    const readySteps = getReadySteps(chain, completed, failed);

    if (readySteps.length === 0) {
      log.warn("No steps ready — possible deadlock or all remaining steps blocked by failures");
      break;
    }

    // Execute ready steps (could be parallelized with Promise.all in future)
    for (const stepId of readySteps) {
      const step = chain.steps[stepId];
      const startedAt = new Date().toISOString();

      log.info(`Executing step: ${stepId} (${step.agent}/${step.skill})`);

      try {
        const isCI = process.env.GITHUB_ACTIONS === "true";
        if (isCI) {
          execSync(
            `gh workflow run agent.yml -f agent=${step.agent} -f skill=${step.skill}`,
            { stdio: "pipe", timeout: 10000 }
          );
        } else {
          execSync(
            `npx tsx src/execute.ts ${step.agent} ${step.skill}`,
            { stdio: "inherit", timeout: 300000 }
          );
        }

        completed.add(stepId);
        results.push({
          step_id: stepId,
          status: "success",
          started_at: startedAt,
          completed_at: new Date().toISOString(),
          output_file: `${OUTPUTS_DIR}/${stepId}.json`,
        });
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        failed.add(stepId);
        results.push({
          step_id: stepId,
          status: "failed",
          started_at: startedAt,
          completed_at: new Date().toISOString(),
          error,
        });

        if (chain.on_failure === "stop") {
          log.error(`Chain stopped: step ${stepId} failed`, { error });
          break;
        }
      }
    }
  }

  log.info(`Chain complete: ${completed.size} succeeded, ${failed.size} failed`);
  return results;
}
