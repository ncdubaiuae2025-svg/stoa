#!/usr/bin/env node
// stoa/src/validate-config.ts — Config validation for CI
import { loadConfig } from "./config.js";
import { scanSkillForInjection } from "./security.js";
import { existsSync } from "fs";

let errors = 0;

try {
  const config = loadConfig();
  console.log("✓ stoa.yml is valid");

  // Validate all referenced skills exist
  for (const [name, agent] of Object.entries(config.agents)) {
    for (const skill of agent.skills) {
      const skillPath = `skills/${skill}/SKILL.md`;
      if (!existsSync(skillPath)) {
        console.error(`✗ Agent "${name}" references missing skill: ${skillPath}`);
        errors++;
      } else {
        // Security scan
        const scan = scanSkillForInjection(skillPath);
        if (!scan.safe) {
          console.error(`✗ Skill "${skill}" has security issues: ${scan.issues.join(", ")}`);
          errors++;
        }
      }
    }

    // Validate agent definition exists
    const agentPath = `agents/${name}/AGENT.md`;
    if (!existsSync(agentPath)) {
      console.error(`✗ Agent "${name}" missing definition: ${agentPath}`);
      errors++;
    }
  }

  if (errors === 0) {
    console.log("✓ All skills and agents validated");
  }
} catch (e) {
  console.error(`✗ Config validation failed: ${e instanceof Error ? e.message : e}`);
  errors++;
}

process.exit(errors > 0 ? 1 : 0);
