// stoa/src/types.ts — Core type definitions

export interface StoaConfig {
  version: number;
  defaults: {
    model: string;
    chain: string;
    rpc: string;
    gateway: string;
    commit: boolean;
  };
  notifications: {
    telegram?: { enabled: boolean; bot_token: string; chat_id: string };
    discord?: { enabled: boolean; webhook: string };
  };
  agents: Record<string, AgentConfig>;
  mesh: { max_history: number; ttl_hours: number };
  rules: string[];
}

export interface AgentConfig {
  role: string;
  skills: string[];
  schedule: string | null;
  triggers?: AgentTrigger[];
  model?: string;
  var?: Record<string, unknown>;
}

export interface AgentTrigger {
  on: "mesh" | "webhook";
  from?: string;
  type?: string;
}

export interface MeshMessage {
  from: string;
  to: string | string[];
  type: string;
  id: string;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface CronState {
  agents: Record<
    string,
    {
      last_dispatch: string;
      last_status: "success" | "failed" | "skipped";
      run_count: number;
    }
  >;
  swarm_status: "active" | "cooldown" | "halted";
  cooldown_until?: string;
}

export interface Position {
  token: string;
  token_address: string;
  entry_price: number;
  amount: number;
  entry_time: string;
  stop_loss_pct: number;
  take_profit_pct: number;
  tx_signature: string;
  signal_id: string;
}

export interface PortfolioState {
  timestamp: string;
  total_value_usd: number;
  total_value_sol: number;
  peak_value_usd: number;
  drawdown_pct: number;
  open_positions: number;
  status: "active" | "cooldown" | "halted";
  alerts: string[];
}
