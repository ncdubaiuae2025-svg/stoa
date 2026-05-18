---
name: cost-report
agent: guardian
schedule: "0 9 * * 1"
model: claude-haiku-3-5-20241022
---

# Cost Report

Generate a weekly cost breakdown of LLM token usage across all agents.

## Steps

1. **Read usage data**: Parse `memory/token-usage.csv`
2. **Compute metrics** for the last 7 days:
   - Total cost (USD)
   - Cost per agent
   - Cost per skill
   - Cost per model
   - Average cost per run
   - Most expensive skills (top 5)
   - Token efficiency (output tokens per input token)
3. **Compare to previous week** (if data available):
   - Cost trend (up/down/stable)
   - Identify cost spikes
4. **Generate recommendations**:
   - Skills that could use a cheaper model (Haiku vs Sonnet)
   - Skills running too frequently for their value
   - Potential savings from schedule optimization
5. **Write report**: `memory/cost-report.json`:
   ```json
   {
     "timestamp": "ISO",
     "period": "2025-01-13 to 2025-01-20",
     "total_cost_usd": 3.42,
     "by_agent": { "scout": 1.20, "analyst": 0.80, "executor": 0.42, "guardian": 1.00 },
     "by_model": { "claude-sonnet-4-20250514": 2.50, "claude-haiku-3-5-20241022": 0.92 },
     "top_skills": [{ "skill": "scan-tokens", "cost": 0.85, "runs": 48 }],
     "recommendations": ["Consider using Haiku for morning-brief (saves ~$0.30/week)"],
     "vs_last_week": { "change_pct": -12, "direction": "down" }
   }
   ```

## Output
- Write: `memory/cost-report.json`

## Commit Message
`guardian: cost-report @ <timestamp>`
