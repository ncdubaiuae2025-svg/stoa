// stoa/src/config.ts — Load and validate stoa.yml

import { readFileSync, existsSync } from "fs";
import { parse } from "yaml";
import type { StoaConfig } from "./types.js";

const CONFIG_PATH = "stoa.yml";

export function loadConfig(): StoaConfig {
  if (!existsSync(CONFIG_PATH)) {
    throw new Error(`Config not found: ${CONFIG_PATH}`);
  }

  const raw = readFileSync(CONFIG_PATH, "utf-8");

  // Substitute environment variables: ${VAR_NAME} -> process.env.VAR_NAME
  const resolved = raw.replace(/\$\{(\w+)\}/g, (_, key) => {
    return process.env[key] || `\${${key}}`;
  });

  const config = parse(resolved) as StoaConfig;
  validateConfig(config);
  return config;
}

function validateConfig(config: StoaConfig): void {
  if (!config.version) throw new Error("Missing version in stoa.yml");
  if (!config.agents || Object.keys(config.agents).length === 0) {
    throw new Error("No agents defined in stoa.yml");
  }

  for (const [name, agent] of Object.entries(config.agents)) {
    if (!agent.role) throw new Error(`Agent "${name}" missing role`);
    if (!agent.skills || agent.skills.length === 0) {
      throw new Error(`Agent "${name}" has no skills`);
    }
  }
}

export function getAgent(config: StoaConfig, name: string) {
  const agent = config.agents[name];
  if (!agent) {
    throw new Error(`Agent "${name}" not found in stoa.yml`);
  }
  return agent;
}
