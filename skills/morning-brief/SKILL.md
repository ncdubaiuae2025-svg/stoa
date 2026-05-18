---
name: morning-brief
description: Daily Solana market summary with portfolio status, overnight activity, and today's watchlist
tags: [report, daily, summary, market, notification]
agent: scout
var: >
  ${var} focuses the brief on a sector/theme. If set (e.g., "DeFi yields"),
  prioritize that angle. If empty, generate a general market brief.
---

# morning-brief

> **Priority**: P1 (daily report — runs once per day)
> **Schedule**: 07:00 UTC
> **Output**: Markdown brief in `memory/briefs/`, notification to Telegram/Discord

## Instructions

You are executing the **morning-brief** skill for the Scout agent.

### Step 1: Market Overview

Fetch current data points:

```bash
# SOL price
curl -s "https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112"

# Top watched tokens
curl -s "https://api.jup.ag/price/v2?ids={comma_separated_mints}"
```

Compile:
- SOL price + 24h change %
- Each watched token: price + 24h change
- Top gainer and top loser from the watchlist

### Step 2: Portfolio Snapshot

Read `memory/portfolio-state.json`:
- Total value (USD + SOL)
- 24h P&L
- Drawdown from peak
- Open position count
- Swarm status (active/cooldown/halted)

Read `memory/positions.json`:
- Per-position P&L summary (token, entry, current, %)

### Step 3: Overnight Activity

Read `memory/tx-log.json` for trades in the last 24h:
- Count: N trades (M buys, K sells)
- Total volume traded
- Net result

Read `memory/risk-log.json` for alerts:
- Any stop-losses triggered?
- Any halt events?
- Any anomalies?

Read `memory/analyst-log.json` for signal activity:
- Signals received, accepted, rejected
- Acceptance rate

### Step 4: Compile Brief

Generate a concise brief (max 500 words). Structure:

```markdown
# Morning Brief — {date}

## Market
{1-2 sentences on overall Solana market direction}
- SOL: ${price} ({change}%)
- Top mover: {token} {change}%
- Worst: {token} {change}%

## Portfolio
- Value: ${total_usd} ({pnl_24h}% 24h)
- Positions: {count} open
- Status: {active/cooldown/halted}

## Overnight
- Trades: {N} ({net_result})
- Signals: {received} received, {accepted} acted on ({rate}% acceptance)
- Alerts: {count} ({summary if any})

## Watchlist Today
{3-5 bullet points on what to monitor today, based on:}
- Tokens near stop-loss or take-profit thresholds
- Tokens with unusual overnight activity
- New signals that haven't been acted on yet
```

**Editorial rule**: Score each watchlist candidate on:
- **Leverage** — does this change the next 24 hours? (1-3)
- **Urgency** — does delay make it worse? (1-3)

Include only items scoring >= 4 combined. Cap at 5 items. No filler.

### Step 5: Save and Notify

1. Write brief to `memory/briefs/{YYYY-MM-DD}.md`
2. If Telegram/Discord is configured, format a condensed version (under 280 chars for Telegram) and send via notification channel

**Notification format:**
```
stoa morning brief | {date}
SOL ${price} ({change}%) | Portfolio ${total_usd} ({pnl}%)
{top_watchlist_item}
```

### Anti-Patterns

- Do NOT make this longer than 500 words. Brevity is the point.
- Do NOT include raw JSON or technical debugging info. This is a human-readable summary.
- Do NOT fabricate data if APIs fail. Say "data unavailable" and move on.
- Do NOT include generic market commentary ("crypto is volatile"). Only include specific, actionable observations.

### Exit Codes

- `BRIEF_OK` — brief generated and saved
- `BRIEF_PARTIAL` — some data sources unavailable, brief generated with gaps
- `BRIEF_FAILED` — could not generate brief

### Output

Commit message format: `scout: morning-brief {date} — SOL ${price} ({change}%), portfolio ${total_usd}`
