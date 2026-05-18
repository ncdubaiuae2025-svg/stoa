---
name: self-improve
agent: guardian
schedule: "0 0 * * 0"
model: claude-opus-4-20250514
---

# Self-Improve

Weekly meta-analysis of swarm performance. Identifies systematic improvements to skill prompts, scheduling, and coordination patterns.

## Steps

1. **Collect data**:
   - Read all files in `memory/skill-health/`
   - Read `memory/repair-log.json` for recent repairs
   - Read `memory/token-usage.csv` for cost analysis
   - Read `memory/cron-state.json` for timing patterns
   - Read `memory/tx-log.json` for trade outcomes
2. **Analyze patterns**:
   - Which skills consistently score high? Why?
   - Which skills are expensive but low-value?
   - Are there coordination bottlenecks (analyst waiting too long for scout)?
   - Is the guardian over/under-triggering halts?
   - Are there time-of-day patterns in success rates?
3. **Generate recommendations**:
   - Schedule optimizations (move skills to their optimal time)
   - Prompt improvements (based on what works in high-scoring skills)
   - Cost optimizations (downgrade model for simple skills)
   - Coordination improvements (adjust trigger conditions)
4. **Apply safe changes** (optional, if confidence > 0.9):
   - Adjust `var:` values in stoa.yml for optimization
   - Add clarifying instructions to skill prompts
   - Do NOT change schedules, models, or core behavior without logging
5. **Write report**: `memory/improvement-report.json`:
   ```json
   {
     "timestamp": "ISO",
     "period": "last 7 days",
     "metrics": {
       "avg_score": 4.1,
       "total_cost_usd": 2.34,
       "total_runs": 156,
       "failure_rate_pct": 5.2
     },
     "insights": ["..."],
     "applied_changes": ["..."],
     "proposed_changes": ["..."]
   }
   ```

## Constraints

- This runs weekly. Take time to be thorough.
- Never reduce safety margins (stop-loss, max_drawdown, position limits)
- Proposed changes that affect trading behavior MUST be logged, not applied
- Maximum 3 auto-applied changes per run

## Commit Message
`guardian: self-improve weekly analysis`

## Exit Codes
- 0: Report generated
- 1: Insufficient data (< 20 runs in the period)
