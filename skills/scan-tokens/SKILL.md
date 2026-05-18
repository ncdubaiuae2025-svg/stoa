---
name: scan-tokens
description: Scans Solana DEXes for unusual token activity — volume spikes, price breakouts, new pools, whale moves
tags: [solana, dex, tokens, monitoring, signals]
agent: scout
var: >
  ${var} narrows the scan focus. If set, only scan tokens matching this theme/sector
  (e.g., "AI tokens", "new Raydium pools"). If empty, scan all watched tokens.
---

# scan-tokens

> **Priority**: P0 (core scout function — runs every 30 min)
> **Data sources**: Jupiter Price API, DexScreener API, Helius API (optional), Solana RPC
> **Output**: Signal messages to analyst inbox

## Instructions

You are executing the **scan-tokens** skill for the Scout agent.

### Step 1: Load State

Read `memory/scan-state.json`. Expected schema:

```json
{
  "last_scan": "ISO-8601",
  "tokens": {
    "SYMBOL": {
      "mint": "address",
      "last_price": 1.23,
      "avg_volume_7d": 500000,
      "last_volume_24h": 120000
    }
  }
}
```

If the file doesn't exist, initialize with an empty token map and proceed to populate it.

### Step 2: Check Watched Tokens

For each token in `${watch_tokens}`:

**P0 — Price check:**
1. Fetch current price: `curl -s "https://api.jup.ag/price/v2?ids={mint}"`
2. Compare to `last_price` in scan-state
3. Flag as `price_breakout` if change > **5% in 30 min** or > **10% in 1h**

**P1 — Volume check:**
1. Fetch from DexScreener: `curl -s "https://api.dexscreener.com/tokens/v1/solana/{mint}"`
2. Extract `volume.h24` from the response
3. Flag as `volume_spike` if > **2x** the `avg_volume_7d`
4. Flag as `volume_surge` if > **5x** (higher priority)

**P2 — Liquidity check:**
1. From the same DexScreener response, check `liquidity.usd`
2. Flag as `liquidity_change` if delta > **20%** from last scan

### Step 3: Scan for New Pools

```bash
curl -s "https://api.dexscreener.com/token-profiles/latest/v1"
```

Filter for:
- `chainId` = `solana`
- Created in the last 30 minutes
- Cross-reference with DexScreener pair data for TVL > $50,000

This catches new token launches and fresh liquidity that might be actionable.

### Step 4: Whale Detection

**Only if `HELIUS_API_KEY` is set.** Skip gracefully if not configured.

1. Read `memory/whale-wallets.json` for tracked addresses
2. For each whale wallet, check recent transactions:
   ```bash
   curl -s "https://api.helius.xyz/v0/addresses/{wallet}/transactions?api-key=${HELIUS_API_KEY}&limit=5"
   ```
3. Flag transfers > `${whale_threshold_usd}` USD as `whale_move`
4. Classify as `accumulation` (buying) or `distribution` (selling)

### Step 5: Emit Signals

For **each** finding, append a message to `memory/mesh/analyst.json`:

```json
{
  "from": "scout",
  "to": "analyst",
  "type": "signal",
  "id": "scout-{timestamp}-{index}",
  "timestamp": "{now_iso}",
  "data": {
    "signal_type": "volume_spike | volume_surge | price_breakout | new_pool | whale_move | liquidity_change",
    "token": "{symbol}",
    "token_address": "{mint}",
    "price_current": 1.23,
    "price_previous": 1.10,
    "change_pct": 11.8,
    "volume_24h": 1500000,
    "volume_avg_7d": 500000,
    "details": "{one-line human summary}",
    "raw_data": {}
  }
}
```

**Dedup rule**: Before posting, check if a signal for the same token + same signal_type already exists in the analyst inbox within the last 60 minutes. If so, skip it.

### Step 6: Update State

Write updated scan-state.json with:
- New `last_scan` timestamp
- Updated prices, volumes, and 7d averages for all tokens
- Recalculate `avg_volume_7d` as rolling average (weight recent data slightly more)

### Anti-Patterns

- Do NOT make trade recommendations. You report data, not opinions.
- Do NOT call any Solana program or sign any transaction. You are read-only.
- Do NOT fabricate data if an API call fails. Log the failure in the details field and move on.
- Do NOT flood the analyst with noise. If nothing unusual happened, emit zero signals.

### Exit Codes

- `SCAN_OK` — completed normally, N signals emitted
- `SCAN_PARTIAL` — some API calls failed, partial results emitted
- `SCAN_EMPTY` — no unusual activity detected (this is fine)
- `SCAN_FAILED` — critical failure, could not complete scan

### Output

Commit message format: `scout: scan-tokens — {N} signals [{types}]`
Example: `scout: scan-tokens — 3 signals [volume_spike, price_breakout, whale_move]`
