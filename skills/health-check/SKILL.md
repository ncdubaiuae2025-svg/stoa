---
name: health-check
agent: guardian
schedule: "0 */6 * * *"
model: claude-haiku-3-5-20241022
---

# Health Check

Evaluate the overall health of the stoa swarm. Check each agent's recent performance, score outputs, and flag any degradation.

## Steps

1. **Read health data**: Read `memory/skill-health/` directory for all agent score histories.
2. **Compute metrics**: For each agent-skill pair:
   - Average score over last 10 runs
   - Failure rate (score <= 2)
   - Trend (improving/stable/degrading)
3. **Read cron state**: Check `memory/cron-state.json` for last dispatch times and run counts.
4. **Detect anomalies**:
   - Agent hasn't run in 2x its expected interval
   - 3+ consecutive failures
   - Average score dropped below 3.0
   - Swarm stuck in halt/cooldown for > 1 hour
5. **Generate report**: Write to `memory/health-report.json`:
   ```json
   {
     "timestamp": "ISO",
     "overall_status": "healthy|degraded|critical",
     "agents": {
       "<name>": {
         "status": "healthy|degraded|failing",
         "avg_score": 4.2,
         "issues": ["..."]
       }
     },
     "recommendations": ["..."]
   }
   ```
6. **Trigger repair if needed**: If any agent is "failing", post a mesh message to guardian:
   ```json
   {
     "from": "guardian",
     "to": "guardian",
     "type": "repair-needed",
     "data": { "agent": "<failing-agent>", "skill": "<failing-skill>", "reason": "..." }
   }
   ```

## Output
- Write: `memory/health-report.json`
- Mesh: repair-needed messages if applicable

## Commit Message
`guardian: health-check @ <timestamp>`

## Exit Codes
- 0: All agents healthy
- 0: Report generated with degradation warnings
- 1: Failed to read health data (system error)
