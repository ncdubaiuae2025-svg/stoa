---
name: analyze-signal
description: Evaluates scout signals through a multi-factor scoring model, generates trade theses for executor
tags: [analysis, signals, trading, strategy, scoring]
agent: analyst
var: >
  ${var} adjusts the analysis lens. If set, weight signals matching this narrative
  higher (e.g., "AI tokens momentum play"). If empty, score all signals equally.
---

# analyze-signal

> **Priority**: P0 (core analyst function — runs hourly + on new signals)
> **Input**: `memory/mesh/analyst.json` (signals from scout)
> **Output**: Trade-signals to executor inbox, feedback to scout inbox

## Instructions

You are executing the **analyze-signal** skill for the Analyst agent.

### Step 0: Check Halt Status

Read your inbox for any `halt` messages from Guardian. If an active halt exists (cooldown_until > now), **exit immediately**. Do not generate any trade-signals during a halt.

Exit code: `ANALYSIS_HALTED`

### Step 1: Read Inbox

Read `memory/mesh/analyst.json`. Filter for messages where `type` = `signal`.
Sort by timestamp (newest first). Process up to 20 signals per execution.

### Step 2: Score Each Signal

Apply the appropriate scoring model based on `signal_type`:

**Volume Spike / Surge (max score: 1.0):**
| Factor | Weight | Criteria |
|--------|--------|----------|
| Magnitude | 0.25 | 2-3x = 0.1, 3-5x = 0.2, 5x+ = 0.25 |
| Organic | 0.25 | Check unique traders ratio: >100 unique traders in 1h = 0.25 |
| Confirmation | 0.25 | Price also moving in same direction = 0.25 |
| Narrative | 0.25 | Token has recent social/news catalyst (check memory/social-signals.json if exists) |

**Price Breakout (max score: 1.0):**
| Factor | Weight | Criteria |
|--------|--------|----------|
| Resistance break | 0.30 | Above 7d high = 0.15, above 30d high = 0.30 |
| Momentum | 0.25 | Accelerating (consecutive higher candles) = 0.25 |
| Volume confirm | 0.25 | Volume above average during breakout = 0.25 |
| Trend alignment | 0.20 | SOL also trending same direction = 0.20 |

**New Pool (max score: 1.0):**
| Factor | Weight | Criteria |
|--------|--------|----------|
| Contract safety | 0.35 | Mint authority renounced = 0.20, no freeze = 0.15 |
| Liquidity depth | 0.25 | TVL/mcap ratio > 0.1 = 0.25 |
| Team signal | 0.20 | Known deployer or social presence = 0.20 |
| Early momentum | 0.20 | Price trending up in first 30 min = 0.20 |

**Whale Move (max score: 1.0):**
| Factor | Weight | Criteria |
|--------|--------|----------|
| Direction | 0.30 | Accumulation = 0.30, distribution = 0.05 |
| Whale track record | 0.30 | >60% win rate (from memory/whale-track-record.json) = 0.30 |
| Size significance | 0.20 | >1% of token supply = 0.20 |
| Timing | 0.20 | Against the crowd (buying dip / selling pump) = 0.20 |

### Step 3: Generate Trade Thesis (if score >= ${min_confidence})

Select best matching strategy from `${strategy}`:

- **momentum**: Ride the trend. Entry: now. Stop-loss: -5 to -8%. Take-profit: +15 to +25%. Time horizon: 1-4h.
- **mean-reversion**: Fade the spike. Entry: wait for pullback to -3%. Stop-loss: -10%. Take-profit: +10%. Time horizon: 4-12h.
- **narrative**: Long-duration position on emerging story. Entry: now. Stop-loss: -15%. Take-profit: +50%. Time horizon: 1-7d.

Write trade-signal to `memory/mesh/executor.json`:

```json
{
  "from": "analyst",
  "to": "executor",
  "type": "trade-signal",
  "id": "analyst-{timestamp}-{index}",
  "timestamp": "{now_iso}",
  "data": {
    "action": "buy | sell",
    "token": "SYMBOL",
    "token_address": "mint_address",
    "confidence": 0.85,
    "strategy": "momentum",
    "thesis": "One paragraph explaining why this trade makes sense, citing specific data points.",
    "suggested_size_pct": 10,
    "stop_loss_pct": -8,
    "take_profit_pct": 25,
    "time_horizon": "4h",
    "supporting_signals": ["scout-signal-id-1", "scout-signal-id-2"],
    "risk_factors": ["Low liquidity — position size should be conservative"]
  }
}
```

### Step 4: Send Feedback on Rejected Signals

For every signal scored below `${min_confidence}`, write feedback to `memory/mesh/scout.json`:

```json
{
  "from": "analyst",
  "to": "scout",
  "type": "feedback",
  "id": "analyst-fb-{timestamp}",
  "timestamp": "{now_iso}",
  "data": {
    "signal_id": "scout-signal-id",
    "verdict": "rejected",
    "score": 0.45,
    "reason": "Volume spike is likely wash trading — only 12 unique traders despite 3x volume increase"
  }
}
```

### Step 5: Log Reasoning

Append to `memory/analyst-log.json`:

```json
{
  "timestamp": "{now_iso}",
  "signals_processed": 5,
  "signals_accepted": 1,
  "signals_rejected": 4,
  "trade_signals_generated": 1,
  "reasoning": [
    {
      "signal_id": "scout-...",
      "token": "JUP",
      "score": 0.85,
      "verdict": "accepted",
      "factors": {"magnitude": 0.25, "organic": 0.20, "confirmation": 0.25, "narrative": 0.15}
    }
  ]
}
```

### Anti-Patterns

- Do NOT execute any transactions. You recommend, Executor acts.
- Do NOT generate trade-signals below the confidence threshold. Ever.
- Do NOT score based on "gut feeling." Use the factor tables above. Show your math.
- Do NOT recommend more than 3 trades per execution. If >3 signals pass, pick the top 3 by score.
- Do NOT re-analyze signals you already processed (check analyst-log.json for signal_id dedup).

### Exit Codes

- `ANALYSIS_OK` — processed signals normally
- `ANALYSIS_EMPTY` — no new signals in inbox
- `ANALYSIS_HALTED` — Guardian halt active, did nothing

### Output

Commit message format: `analyst: {N} signals scored, {M} trade-signals [{tokens}]`
Example: `analyst: 5 signals scored, 1 trade-signal [JUP]`
