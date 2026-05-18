---
name: self-repair
agent: guardian
schedule: null
triggers:
  - on: mesh
    from: guardian
    type: repair-needed
model: claude-sonnet-4-20250514
---

# Self-Repair

Diagnose and fix a failing skill. Triggered when health-check detects degradation.

## Context

Read the `repair-needed` message from your inbox to identify the failing agent and skill.

## Steps

1. **Identify the problem**: Read the repair-needed message to get `agent`, `skill`, and `reason`.
2. **Gather evidence**:
   - Read `memory/skill-health/<agent>-<skill>.json` for score history
   - Read `memory/logs/` for recent error logs related to this agent
   - Read the skill file `skills/<skill>/SKILL.md`
   - Read the agent file `agents/<agent>/AGENT.md`
3. **Diagnose**: Common failure modes:
   - API endpoint changed or down → update URL in skill
   - Rate limiting → adjust timing or add retry guidance
   - Schema mismatch → update expected response format
   - Prompt ambiguity → clarify instructions
   - External service outage → mark for retry, don't modify skill
4. **Determine fix type**:
   - `no-fix`: External/transient issue, schedule retry
   - `skill-patch`: Modify the SKILL.md to fix the issue
   - `config-patch`: Modify stoa.yml (schedule, vars, etc.)
   - `escalate`: Problem too complex, log for human review
5. **Apply fix** (if skill-patch):
   - Edit `skills/<skill>/SKILL.md` with targeted fix
   - Document what was changed and why
   - Do NOT rewrite the entire skill — minimal surgical changes only
6. **Record outcome**: Write to `memory/repair-log.json`:
   ```json
   {
     "timestamp": "ISO",
     "agent": "...",
     "skill": "...",
     "diagnosis": "...",
     "fix_type": "no-fix|skill-patch|config-patch|escalate",
     "changes": ["..."],
     "confidence": 0.8
   }
   ```

## Constraints

- NEVER modify files in `src/` or `.github/`
- Maximum 1 repair per agent per hour (check repair-log.json timestamps)
- If confidence < 0.6 in your fix, choose `escalate` instead
- Do not create circular repair loops (check if this skill was already repaired in last 2 hours)

## Commit Message
`guardian: self-repair ${agent}/${skill} — ${fix_type}`

## Exit Codes
- 0: Repair applied or scheduled
- 0: No-fix (transient issue)
- 1: Unable to diagnose
