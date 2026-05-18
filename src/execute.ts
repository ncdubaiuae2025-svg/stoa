#!/usr/bin/env node
// stoa/src/execute.ts — Agent Executor
//
// Runs a single agent's skill. Called by the agent.yml GitHub Actions workflow.
// 1. Loads agent definition (AGENT.md) and skill prompt (SKILL.md)
// 2. Reads agent's mesh inbox for context
// 3. Reads memory/ for shared state
// 4. Executes via Claude Code CLI
// 5. Commits any changes to memory/ and mesh/
// 6. Sends notifications if configured

import { readFileSync, existsSync } from "fs";
import { execSync } from "child_process";
import { loadConfig, getAgent } from "./config.js";
import { readInbox, pruneInbox } from "./mesh.js";
import { getCronState, setCronState } from "./memory.js";

const AGENT_NAME = process.env.STOA_AGENT || process.argv[2];
const SKILL_NAME = process.env.STOA_SKILL || process.argv[3];

if (!AGENT_NAME || !SKILL_NAME) {
  console.error("Usage: stoa execute <agent> <skill>");
  console.error("  or set STOA_AGENT and STOA_SKILL env vars");
  process.exit(1);
}

function loadMarkdown(path: string): string {
  if (!existsSync(path)) {
    throw new Error(`File not found: ${path}`);
  }
  return readFileSync(path, "utf-8");
}

function buildPrompt(
  agentMd: string,
  skillMd: string,
  inbox: string,
  vars: Record<string, unknown>
): string {
  let prompt = `${agentMd}\n\n---\n\n# Current Skill Execution\n\n${skillMd}`;

  // Inject variables
  for (const [key, value] of Object.entries(vars)) {
    const placeholder = `{${key}}`;
    prompt = prompt.replaceAll(
      placeholder,
      typeof value === "string" ? value : JSON.stringify(value)
    );
  }

  // Append inbox context
  if (inbox && inbox !== "[]") {
    prompt += `\n\n---\n\n# Inbox Messages\n\nThe following messages are in your inbox:\n\`\`\`json\n${inbox}\n\`\`\``;
  }

  // Append timestamp
  prompt += `\n\n---\n\n# Runtime Context\n- Current time: ${new Date().toISOString()}\n- Agent: ${AGENT_NAME}\n- Skill: ${SKILL_NAME}`;

  return prompt;
}

function executeWithClaude(prompt: string, model: string): void {
  // Write prompt to temp file to avoid shell escaping issues
  const tmpFile = `/tmp/stoa-prompt-${AGENT_NAME}-${Date.now()}.md`;
  require("fs").writeFileSync(tmpFile, prompt);

  const allowedTools = [
    "Read",
    "Write",
    "Edit",
    "Bash",
    "Glob",
    "Grep",
  ].join(",");

  try {
    execSync(
      `claude --model ${model} --allowedTools ${allowedTools} --print < ${tmpFile}`,
      {
        stdio: "inherit",
        timeout: 300_000, // 5 min max
        env: {
          ...process.env,
          STOA_AGENT: AGENT_NAME,
          STOA_SKILL: SKILL_NAME,
        },
      }
    );
  } finally {
    // Cleanup
    try {
      require("fs").unlinkSync(tmpFile);
    } catch {}
  }
}

function gitCommit(message: string): void {
  try {
    execSync("git add memory/ mesh/ 2>/dev/null || true", { stdio: "pipe" });
    execSync(`git diff --staged --quiet 2>/dev/null || git commit -m "${message}"`, {
      stdio: "pipe",
    });
    execSync("git push 2>/dev/null || true", { stdio: "pipe" });
  } catch {
    // Non-fatal: commit may fail if nothing changed
  }
}

function notify(config: ReturnType<typeof loadConfig>, message: string): void {
  if (config.notifications?.telegram?.enabled) {
    const { bot_token, chat_id } = config.notifications.telegram;
    if (bot_token && chat_id && !bot_token.includes("${")) {
      try {
        execSync(
          `curl -s -X POST "https://api.telegram.org/bot${bot_token}/sendMessage" ` +
            `-d chat_id="${chat_id}" -d text="${message}" -d parse_mode=Markdown`,
          { stdio: "pipe" }
        );
      } catch {}
    }
  }

  if (config.notifications?.discord?.enabled) {
    const webhook = config.notifications.discord.webhook;
    if (webhook && !webhook.includes("${")) {
      try {
        execSync(
          `curl -s -X POST "${webhook}" -H "Content-Type: application/json" ` +
            `-d '{"content":"${message}"}'`,
          { stdio: "pipe" }
        );
      } catch {}
    }
  }
}

// --- Main ---
async function main() {
  console.log(`[stoa execute] agent=${AGENT_NAME} skill=${SKILL_NAME}`);

  const config = loadConfig();
  const agentConfig = getAgent(config, AGENT_NAME);
  const model = agentConfig.model || config.defaults.model;

  // Load agent definition
  const agentMd = loadMarkdown(`agents/${AGENT_NAME}/AGENT.md`);
  const skillMd = loadMarkdown(`skills/${SKILL_NAME}/SKILL.md`);

  // Load inbox
  const inbox = JSON.stringify(readInbox(AGENT_NAME), null, 2);

  // Build and execute prompt
  const vars = agentConfig.var || {};
  const prompt = buildPrompt(agentMd, skillMd, inbox, vars);

  console.log(`[stoa execute] model=${model}, prompt=${prompt.length} chars`);
  console.log(`[stoa execute] running claude...`);

  executeWithClaude(prompt, model);

  // Post-execution
  pruneInbox(AGENT_NAME, config.mesh);

  // Update cron state
  const state = getCronState();
  state.agents[AGENT_NAME] = {
    ...state.agents[AGENT_NAME],
    last_status: "success",
  };
  setCronState(state);

  // Git commit
  const commitMsg = `${AGENT_NAME}: ${SKILL_NAME} @ ${new Date().toISOString()}`;
  if (config.defaults.commit) {
    gitCommit(commitMsg);
  }

  // Notify
  notify(config, `*stoa* | \`${AGENT_NAME}\` ran \`${SKILL_NAME}\``);

  console.log(`[stoa execute] done`);
}

main().catch((e) => {
  console.error(`[stoa execute] fatal:`, e);

  // Record failure
  try {
    const config = loadConfig();
    const state = getCronState();
    state.agents[AGENT_NAME] = {
      ...state.agents[AGENT_NAME],
      last_status: "failed",
    };
    setCronState(state);
    if (config.defaults.commit) {
      gitCommit(`${AGENT_NAME}: ${SKILL_NAME} FAILED`);
    }
  } catch {}

  process.exit(1);
});
