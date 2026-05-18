#!/usr/bin/env node
// stoa/src/dispatch.ts — Cron Dispatcher
//
// This runs on every GitHub Actions cron tick (every 5 min).
// It checks which agents are due to run based on their schedule,
// and dispatches them via `gh workflow run`.
//
// Also checks mesh triggers: if an agent has pending messages
// that match its trigger config, dispatch it even if not scheduled.

import { execSync } from "child_process";
import { loadConfig } from "./config.js";
import { getCronState, setCronState } from "./memory.js";
import { readMessages } from "./mesh.js";
import type { CronState } from "./types.js";

/**
 * Cron parser — supports: *, star-slash-N, N, N-M (ranges), N,M,K (lists), and combinations.
 * Does NOT support: L, W, #, or named days/months. Use numeric values.
 */
function cronFieldMatches(field: string, value: number): boolean {
  // Handle comma-separated list: "1,15,30"
  if (field.includes(",")) {
    return field.split(",").some((part) => cronFieldMatches(part.trim(), value));
  }

  // Wildcard: "*"
  if (field === "*") return true;

  // Step on wildcard: "*/N"
  if (field.startsWith("*/")) {
    const step = parseInt(field.slice(2));
    if (isNaN(step) || step <= 0) return false;
    return value % step === 0;
  }

  // Range with optional step: "1-5" or "1-5/2"
  if (field.includes("-")) {
    const [rangePart, stepPart] = field.split("/");
    const [startStr, endStr] = rangePart.split("-");
    const start = parseInt(startStr);
    const end = parseInt(endStr);
    if (isNaN(start) || isNaN(end)) return false;

    if (value < start || value > end) return false;

    if (stepPart) {
      const step = parseInt(stepPart);
      if (isNaN(step) || step <= 0) return false;
      return (value - start) % step === 0;
    }
    return true;
  }

  // Fixed value: "30"
  return parseInt(field) === value;
}

function cronMatches(expr: string, now: Date): boolean {
  const parts = expr.split(/\s+/);
  if (parts.length !== 5) return false;

  const fields = [
    now.getMinutes(),
    now.getHours(),
    now.getDate(),
    now.getMonth() + 1,
    now.getDay(),
  ];

  return parts.every((part, i) => cronFieldMatches(part, fields[i]));
}

function shouldDispatch(
  agentName: string,
  schedule: string | null,
  state: CronState,
  now: Date
): { dispatch: boolean; reason: string } {
  // Check if swarm is halted
  if (state.swarm_status === "halted") {
    // Only guardian runs during halt
    if (agentName !== "guardian") {
      return { dispatch: false, reason: "swarm halted" };
    }
  }

  // Check cooldown
  if (state.swarm_status === "cooldown" && state.cooldown_until) {
    if (new Date(state.cooldown_until).getTime() > now.getTime()) {
      if (agentName !== "guardian") {
        return { dispatch: false, reason: "swarm in cooldown" };
      }
    }
  }

  // No schedule = reactive only (check triggers separately)
  if (!schedule) {
    return { dispatch: false, reason: "no schedule (reactive only)" };
  }

  // Check cron expression
  if (cronMatches(schedule, now)) {
    return { dispatch: true, reason: "scheduled" };
  }

  return { dispatch: false, reason: "not due" };
}

function checkTriggers(
  agentName: string,
  config: ReturnType<typeof loadConfig>
): { dispatch: boolean; reason: string } {
  const agent = config.agents[agentName];
  if (!agent.triggers) return { dispatch: false, reason: "no triggers" };

  for (const trigger of agent.triggers) {
    if (trigger.on === "mesh") {
      const messages = readMessages(agentName, {
        from: trigger.from,
        type: trigger.type,
      });
      if (messages.length > 0) {
        return {
          dispatch: true,
          reason: `mesh trigger: ${messages.length} messages from ${trigger.from}`,
        };
      }
    }
  }

  return { dispatch: false, reason: "no matching triggers" };
}

function dispatchAgent(agentName: string, skill: string): void {
  const isCI = process.env.GITHUB_ACTIONS === "true";

  if (isCI) {
    // In GitHub Actions: dispatch the agent workflow
    try {
      execSync(
        `gh workflow run agent.yml -f agent=${agentName} -f skill=${skill}`,
        { stdio: "inherit" }
      );
      console.log(`  -> dispatched: ${agentName}/${skill}`);
    } catch (e) {
      console.error(`  -> FAILED to dispatch: ${agentName}/${skill}`, e);
    }
  } else {
    // Local: just print what would happen
    console.log(`  -> [dry-run] would dispatch: ${agentName}/${skill}`);
  }
}

// --- Main ---
async function main() {
  const config = loadConfig();
  const state = getCronState();
  const now = new Date();

  console.log(`[stoa dispatch] ${now.toISOString()}`);
  console.log(`  swarm status: ${state.swarm_status}`);
  console.log(`  agents: ${Object.keys(config.agents).join(", ")}`);
  console.log("");

  const dispatched: string[] = [];

  for (const [name, agent] of Object.entries(config.agents)) {
    // Check schedule
    const scheduleCheck = shouldDispatch(name, agent.schedule, state, now);

    // Check mesh triggers
    const triggerCheck = checkTriggers(name, config);

    const shouldRun = scheduleCheck.dispatch || triggerCheck.dispatch;
    const reason = scheduleCheck.dispatch
      ? scheduleCheck.reason
      : triggerCheck.reason;

    console.log(`  [${name}] ${shouldRun ? "RUN" : "skip"} — ${reason}`);

    if (shouldRun) {
      for (const skill of agent.skills) {
        dispatchAgent(name, skill);
        dispatched.push(`${name}/${skill}`);
      }

      // Update cron state
      state.agents[name] = {
        last_dispatch: now.toISOString(),
        last_status: "success",
        run_count: (state.agents[name]?.run_count || 0) + 1,
      };
    }
  }

  setCronState(state);

  console.log("");
  console.log(
    `[stoa dispatch] done — ${dispatched.length} skills dispatched`
  );
}

main().catch((e) => {
  console.error("[stoa dispatch] fatal:", e);
  process.exit(1);
});
