---
name: check-risk
description: Monitors portfolio health, enforces stop-losses, triggers circuit breakers on excessive drawdown
tags: [risk, monitoring, portfolio, guardian, safety]
agent: guardian
var: >
  ${var} adds extra risk checks. If set (e.g., "strict mode"), lower all thresholds
  by 25% and increase check frequency. If empty, use standard thresholds.
---

# check-risk

> **Priority**: P0 (guardian's primary function — runs every 15 min)
> **Input**: `memory/positions.json`, `memory/portfolio-state.json`, `memory/tx-log.json`
> **Output**: Halt/sell messages to all agent inboxes, updated portfolio-state

## Instructions

You are executing the **check-risk** skill for the Guardian agent.

**You are the last line of defense. Be paranoid. When in doubt, halt.**

### Step 1: Load Portfolio State

Read these files:

| File | Schema |
|------|--------|
| `memory/positions.json` | `[{token, token_address, entry_price, amount, stop_loss_pct, ...}]` |
| `memory/portfolio-state.json` | `{total_value_usd, peak_value_usd, drawdown_pct, status}` |
| `memory/tx-log.json` | Recent transaction history |

Also check wallet SOL balance:
```bash
curl -s -X POST "${SOLANA_RPC_URL}" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getBalance","params":["WALLET_PUBKEY"]}'
```

### Step 2: Price Check (P0)

For each open position in positions.json:

1. Fetch current price: `curl -s "https://api.jup.ag/price/v2?ids={token_address}"`
2. Calculate P&L: `(current_price - entry_price) / entry_price * 100`
3. Calculate current position value in USD

### Step 3: Stop-Loss Enforcement (P0 — CRITICAL)

For each position where P&L <= `stop_loss_pct`:

**This is non-negotiable. Trigger immediately.**

Post URGENT sell signal to `memory/mesh/executor.json`:

```json
{
  "from": "guardian",
  "to": "executor",
  "type": "trade-signal",
  "id": "guardian-sl-{timestamp}",
  "timestamp": "{now_iso}",
  "data": {
    "action": "sell",
    "token": "SYMBOL",
    "token_address": "...",
    "confidence": 1.0,
    "strategy": "risk-management",
    "thesis": "STOP-LOSS TRIGGERED: position at {pnl}% (threshold: {stop_loss_pct}%)",
    "suggested_size_pct": 100,
    "priority": "urgent"
  }
}
```

Log to `memory/risk-log.json`.

### Step 4: Take-Profit Check (P1)

For each position where P&L >= `take_profit_pct`:

Post sell signal (normal priority, not urgent):
- `suggested_size_pct`: 50 (take half off the table)
- `strategy`: "risk-management"
- `thesis`: "TAKE-PROFIT: position at +{pnl}% (target: +{take_profit_pct}%)"

### Step 5: Portfolio Drawdown Check (P0 — CRITICAL)

Calculate total portfolio value (SOL balance + all position values).
Compare to `peak_value_usd` in portfolio-state.json.

**If drawdown > `${max_drawdown_pct}`%:**

1. Post **HALT** to ALL agents:

```json
{
  "from": "guardian",
  "to": ["scout", "analyst", "executor"],
  "type": "halt",
  "id": "guardian-halt-{timestamp}",
  "timestamp": "{now_iso}",
  "data": {
    "reason": "Portfolio drawdown exceeded {max_drawdown_pct}%: currently at {drawdown}%",
    "cooldown_until": "{now + 4 hours}",
    "action_required": "reduce_exposure"
  }
}
```

2. Post sell signals for ALL positions (orderly unwind):
   - Sell in order of worst-performing first
   - Set `priority`: "urgent"

3. Update portfolio-state.json: `status` = "halted"

### Step 6: Single-Asset Exposure Check (P1)

For each token: calculate `position_value / total_portfolio_value`.

If any single token > `${max_portfolio_exposure_pct}`%:
- Post feedback to analyst inbox: "WARNING: {token} is {pct}% of portfolio — exceeds {max_portfolio_exposure_pct}% limit"
- Do NOT auto-sell (this is a warning, not a circuit breaker)

### Step 7: Anomaly Detection (P2)

Review `memory/tx-log.json` for the last 24 hours:

| Anomaly | Trigger | Action |
|---------|---------|--------|
| Consecutive failures | >2 failed txns in a row | Alert + recommend pause |
| Extreme slippage | Actual slippage > 2x expected | Alert + investigate |
| Unknown tokens | Token in wallet not in positions.json | Alert (possible airdrop/dust attack) |
| Gas drain | SOL balance < 0.05 SOL | Alert + halt if < 0.01 SOL |

### Step 8: Update Portfolio State

Write to `memory/portfolio-state.json`:

```json
{
  "timestamp": "{now_iso}",
  "total_value_usd": 1234.56,
  "total_value_sol": 8.5,
  "peak_value_usd": 1500.00,
  "drawdown_pct": -17.7,
  "open_positions": 3,
  "pnl_24h_pct": -2.3,
  "status": "active | cooldown | halted",
  "alerts": ["JUP position at -6.5%, approaching stop-loss at -8%"],
  "next_check": "{now + 15 min}"
}
```

Update `peak_value_usd` only if current total exceeds it (peaks only go up).

### Anti-Patterns

- Do NOT hesitate to halt. False positives are better than ruin.
- Do NOT initiate NEW positions. Guardian only closes or reduces.
- Do NOT override configured thresholds. The numbers in stoa.yml are final.
- Do NOT skip the drawdown check because "it's just temporary."
- Do NOT trust executor's reported prices — always re-fetch from Jupiter.

### Exit Codes

- `RISK_OK` — all positions within acceptable parameters
- `RISK_STOPLOSS` — one or more stop-losses triggered
- `RISK_HALTED` — drawdown circuit breaker activated
- `RISK_ALERT` — anomalies detected, alerts posted
- `RISK_FAILED` — could not complete risk check (RPC/API failure)

### Output

Commit message format: `guardian: {status} — portfolio ${total_usd} USD, drawdown {pct}%`
Example: `guardian: RISK_OK — portfolio $1234.56 USD, drawdown -2.3%`
