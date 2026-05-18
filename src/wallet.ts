// stoa/src/wallet.ts — Wallet balance tracking and verification
import { execSync } from "child_process";
import { createLogger } from "./logger.js";
import { readJSON, writeJSON, appendJSON } from "./memory.js";
import { consumeToken } from "./ratelimit.js";

const log = createLogger("wallet");

export interface WalletSnapshot {
  timestamp: string;
  sol_balance: number;
  token_balances: Record<string, { amount: number; usd_value: number }>;
  total_usd: number;
}

export interface WalletConfig {
  rpc_url: string;
  address?: string;
}

function getWalletAddress(): string | null {
  // Derive from private key if available
  const privKey = process.env.SOLANA_PRIVATE_KEY;
  if (!privKey) return null;

  try {
    const result = execSync(
      `solana address 2>/dev/null || echo ""`,
      { encoding: "utf-8", timeout: 5000 }
    ).trim();
    return result || null;
  } catch {
    return null;
  }
}

export async function getSOLBalance(rpcUrl: string): Promise<number> {
  const address = getWalletAddress();
  if (!address) {
    log.warn("No wallet address available");
    return 0;
  }

  if (!consumeToken("solana_rpc")) {
    log.warn("Rate limited on Solana RPC");
    return -1;
  }

  try {
    const payload = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getBalance",
      params: [address],
    });

    const result = execSync(
      `curl -s -X POST "${rpcUrl}" -H "Content-Type: application/json" -d '${payload}'`,
      { encoding: "utf-8", timeout: 10000 }
    );

    const parsed = JSON.parse(result);
    const lamports = parsed?.result?.value || 0;
    return lamports / 1_000_000_000; // Convert to SOL
  } catch (e) {
    log.error("Failed to get SOL balance", { error: e instanceof Error ? e.message : String(e) });
    return -1;
  }
}

export function recordSnapshot(snapshot: WalletSnapshot): void {
  writeJSON("wallet-balance.json", snapshot);
  appendJSON("wallet-history.json", {
    timestamp: snapshot.timestamp,
    total_usd: snapshot.total_usd,
    sol: snapshot.sol_balance,
  });
  log.info("Wallet snapshot recorded", { total_usd: snapshot.total_usd });
}

export function getLastSnapshot(): WalletSnapshot | null {
  return readJSON<WalletSnapshot | null>("wallet-balance.json", null);
}

export function checkBalanceSufficient(requiredUSD: number): { sufficient: boolean; available: number } {
  const snapshot = getLastSnapshot();
  if (!snapshot) {
    log.warn("No wallet snapshot available — cannot verify balance");
    return { sufficient: false, available: 0 };
  }

  // Check if snapshot is stale (> 15 min old)
  const age = Date.now() - new Date(snapshot.timestamp).getTime();
  if (age > 15 * 60 * 1000) {
    log.warn("Wallet snapshot is stale", { age_minutes: Math.round(age / 60000) });
  }

  return {
    sufficient: snapshot.total_usd >= requiredUSD,
    available: snapshot.total_usd,
  };
}
