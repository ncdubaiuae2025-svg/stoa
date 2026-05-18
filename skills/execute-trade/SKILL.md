---
name: execute-trade
description: Executes validated trade signals on Solana via Jupiter, with preflight simulation and slippage protection
tags: [trading, execution, jupiter, solana, swap, transactions]
agent: executor
var: >
  ${var} overrides the default protocol. If set (e.g., "raydium"), route through
  that protocol instead of Jupiter. If empty, use Jupiter aggregator.
---

# execute-trade

> **Priority**: P0 (reactive — only runs on trade-signal trigger)
> **Input**: `memory/mesh/executor.json` (trade-signals from analyst or guardian)
> **Output**: Execution reports to analyst + guardian inboxes, tx-log, positions

## Instructions

You are executing the **execute-trade** skill for the Executor agent.

### Step 0: Safety Checks (MANDATORY — do not skip)

**0a. Check Guardian halt:**
Read `memory/mesh/executor.json` for `halt` or `cooldown` messages from Guardian.
If active halt (cooldown_until > now): **EXIT IMMEDIATELY.**
Exit code: `EXEC_HALTED`

**0b. Check wallet:**
Verify `SOLANA_PRIVATE_KEY` is set. If not: **EXIT.**
Exit code: `EXEC_NO_WALLET`

**0c. Check RPC:**
Verify Solana RPC is reachable: `curl -s -X POST "${SOLANA_RPC_URL}" -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'`
If not healthy: **EXIT.**
Exit code: `EXEC_RPC_DOWN`

### Step 1: Read Trade Signals

Read `memory/mesh/executor.json` for messages where `type` = `trade-signal`.
Sort by: `priority` = "urgent" first, then by `confidence` descending.
Process **one trade at a time** (never batch).

### Step 2: Validate Each Signal

For each trade-signal, check **all** of the following:

| Check | Pass condition | On fail |
|-------|---------------|---------|
| Source | `from` is "analyst" or "guardian" | Reject: unknown source |
| Confidence | `confidence` >= `${min_confidence}` (from analyst config) | Reject: below threshold |
| Position size | Amount in USD <= `${max_position_usd}` | Reject: exceeds limit |
| Exposure | Adding this position keeps single-token exposure < 80% of portfolio | Reject: overexposed |
| Duplicate | No identical trade in `memory/tx-log.json` within last 1h | Reject: duplicate |
| Balance | Wallet has sufficient SOL (including ~0.01 SOL for gas) | Reject: insufficient balance |

If any check fails: log to `memory/tx-log.json` with status `rejected` and skip.

### Step 3: Execute via Jupiter

**For BUY orders:**

```bash
# 1. Get quote
curl -s "https://quote-api.jup.ag/v6/quote?\
inputMint=So11111111111111111111111111111111111111112&\
outputMint=${token_address}&\
amount=${amount_in_lamports}&\
slippageBps=${slippage_bps}"

# 2. Get swap transaction
curl -s -X POST "https://quote-api.jup.ag/v6/swap" \
  -H "Content-Type: application/json" \
  -d '{
    "quoteResponse": <from step 1>,
    "userPublicKey": "<wallet_pubkey>",
    "wrapAndUnwrapSol": true,
    "dynamicComputeUnitLimit": true,
    "prioritizationFeeLamports": "auto"
  }'

# 3. Deserialize, sign, and send
# Use @solana/web3.js VersionedTransaction
# Send with maxRetries: 3, skipPreflight: false
```

**For SELL orders:** Reverse `inputMint` and `outputMint`.

**Preflight simulation (MANDATORY):**
Before sending, simulate the transaction with `simulateTransaction`. If simulation fails or returns an error, **ABORT**. Log the simulation error.

**Slippage guard:**
After getting the quote, check `otherAmountThreshold`. If actual output is more than `${slippage_bps}` below expected, **ABORT**.

### Step 4: Confirm Transaction

After sending:
1. Wait for confirmation (commitment: `confirmed`, timeout: 60s)
2. Fetch the transaction details to verify actual execution price
3. Calculate actual slippage: `(expected_price - actual_price) / expected_price * 10000` bps

### Step 5: Record Position

**On successful fill**, update `memory/positions.json`:

```json
{
  "token": "JUP",
  "token_address": "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
  "entry_price": 1.234,
  "amount": 100.5,
  "amount_usd": 50.00,
  "entry_time": "2026-05-18T12:00:00.000Z",
  "stop_loss_pct": -8,
  "take_profit_pct": 25,
  "strategy": "momentum",
  "tx_signature": "5xG7...",
  "signal_id": "analyst-1716000000000-a3f2"
}
```

For SELL orders: remove the position from positions.json and record the exit in tx-log.

### Step 6: Report

Write execution-report to **both** `memory/mesh/analyst.json` and `memory/mesh/guardian.json`:

```json
{
  "from": "executor",
  "to": ["analyst", "guardian"],
  "type": "execution-report",
  "id": "exec-{timestamp}",
  "timestamp": "{now_iso}",
  "data": {
    "signal_id": "analyst-...",
    "status": "filled | failed | aborted | rejected",
    "action": "buy",
    "token": "JUP",
    "amount": 100.5,
    "price": 1.234,
    "amount_usd": 50.00,
    "slippage_actual_bps": 30,
    "tx_signature": "5xG7...",
    "error": null
  }
}
```

Append to `memory/tx-log.json`.

### Anti-Patterns

- **NEVER** execute without a trade-signal in your inbox. You do not freelance.
- **NEVER** exceed `${max_position_usd}`. This is a hard limit, not a suggestion.
- **NEVER** skip preflight simulation. A failed simulation = no trade.
- **NEVER** retry a failed transaction more than 3 times. After 3 failures, abort and report.
- **NEVER** log the full private key or transaction signing details.
- **NEVER** send funds to any address other than DEX program addresses (Jupiter, Raydium).

### Exit Codes

- `EXEC_FILLED` — trade executed successfully
- `EXEC_PARTIAL` — partially filled (log actual fill amount)
- `EXEC_ABORTED` — aborted due to slippage, simulation failure, or validation
- `EXEC_REJECTED` — signal failed validation checks
- `EXEC_FAILED` — transaction sent but failed on-chain
- `EXEC_HALTED` — Guardian halt active
- `EXEC_NO_WALLET` — no private key configured
- `EXEC_RPC_DOWN` — RPC unreachable

### Output

Commit message format: `executor: {action} {amount} {token} @ ${price} — {status} tx:{sig_short}`
Example: `executor: buy 100.5 JUP @ 1.234 — filled tx:5xG7...`
