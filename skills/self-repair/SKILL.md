---
name: self-repair
agent: guardian
schedule: null
triggers:
  - on: mesh
    from: guardian
    type: repair-needed
model: deepseek-chat
---

# Self-Repair (Safe Mode with Pull Request)

Diagnose and fix a failing skill by creating a Pull Request with the proposed changes.  
**No direct file modification** – all changes go through a PR for review.

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
   - `skill-patch`: Propose changes to the SKILL.md (via PR)
   - `config-patch`: Propose changes to stoa.yml (via PR)
   - `escalate`: Problem too complex, log for human review
5. **Apply fix via Pull Request** (if skill-patch or config-patch):
   - Create a new branch: `repair/${agent}/${skill}/$(date +%s)`
   - Make the minimal required changes to the target file
   - Commit with message: `guardian: self-repair ${agent}/${skill} — ${fix_type}`
   - Create a Pull Request using GitHub API (see helper script below)
   - Assign to the repository owner (or user specified in `memory/config.json`)
   - Add label `auto-repair`
   - **Do NOT merge automatically**
6. **Record outcome**: Write to `memory/repair-log.json` including PR URL.

## Helper script for creating PR (bash)

```bash
create_pr() {
  local branch="$1"
  local title="$2"
  local body="$3"
  local target_file="$4"
  
  # Ensure we have latest main
  git fetch origin main
  git checkout -b "$branch" origin/main
  
  # Stage and commit changes (already made)
  git add "$target_file"
  git commit -m "$title"
  git push -u origin "$branch"
  
  # Create PR via GitHub CLI (gh) if available
  if command -v gh &> /dev/null; then
    gh pr create --title "$title" --body "$body" --label auto-repair
  else
    # Fallback: use curl with GITHUB_TOKEN
    curl -X POST \
      -H "Authorization: token $GITHUB_TOKEN" \
      -H "Accept: application/vnd.github.v3+json" \
      https://api.github.com/repos/${GITHUB_REPOSITORY}/pulls \
      -d "{\"title\":\"$title\",\"body\":\"$body\",\"head\":\"$branch\",\"base\":\"main\"}"
  fi
}
