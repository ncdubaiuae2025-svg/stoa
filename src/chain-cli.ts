#!/usr/bin/env node
// stoa/src/chain-cli.ts — CLI entry point for chain execution
import { readFileSync } from "fs";
import { parse } from "yaml";
import { executeChain, ChainConfig } from "./chain.js";
import { createLogger } from "./logger.js";

const log = createLogger("chain-cli");
const chainId = process.env.STOA_CHAIN || process.argv[2];

if (!chainId) {
  console.error("Usage: stoa chain <chain-id>");
  process.exit(1);
}

async function main() {
  // Load chains from stoa.yml
  const raw = readFileSync("stoa.yml", "utf-8");
  const config = parse(raw);

  if (!config.chains || !config.chains[chainId]) {
    log.error(`Chain "${chainId}" not found in stoa.yml`);
    process.exit(1);
  }

  const chainDef = config.chains[chainId];
  const chain: ChainConfig = {
    id: chainId,
    name: chainDef.name || chainId,
    steps: chainDef.steps,
    on_failure: chainDef.on_failure || "stop",
    max_retries: chainDef.max_retries || 1,
  };

  const results = await executeChain(chain);

  // Summary
  const succeeded = results.filter((r) => r.status === "success").length;
  const failed = results.filter((r) => r.status === "failed").length;

  log.info(`Chain "${chainId}" complete`, { succeeded, failed, total: results.length });

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  log.error("Chain execution fatal error", { error: e.message });
  process.exit(1);
});
