#!/bin/bash
# demo.sh — Simulated stoa swarm demo for recording
# Shows the full pipeline: boot → scout → analyst → executor → guardian

BOLD="\033[1m"
DIM="\033[2m"
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
CYAN="\033[36m"
MAGENTA="\033[35m"
RESET="\033[0m"

type_slow() {
  local text="$1"
  local delay="${2:-0.04}"
  for ((i=0; i<${#text}; i++)); do
    printf "%s" "${text:$i:1}"
    sleep "$delay"
  done
  echo
}

pause() { sleep "${1:-1.5}"; }

clear
echo ""
echo -e "${BOLD}  ┃┃┃┃  STOA${RESET}"
echo -e "${DIM}  Solana-native multi-agent swarm framework${RESET}"
echo ""
pause 2

# --- Boot ---
echo -e "${DIM}$ ${RESET}${BOLD}npx stoa status${RESET}"
pause 0.8
echo ""
echo -e "  ${BOLD}═══ stoa swarm status ═══${RESET}"
echo -e "  Status: ${GREEN}active${RESET}"
echo -e "  Agents: scout, analyst, executor, guardian"
echo ""
echo -e "  Portfolio:"
echo -e "    Value: ${BOLD}\$1,000.00${RESET} (6.50 SOL)"
echo -e "    Drawdown: 0%"
echo -e "    Positions: 0"
echo ""
pause 2

# --- Dispatch ---
echo -e "${DIM}$ ${RESET}${BOLD}npx stoa dispatch${RESET}"
pause 0.8
echo ""
echo -e "  ${DIM}[stoa dispatch] 2026-05-18T09:00:00Z${RESET}"
echo -e "  ${DIM}swarm status: active${RESET}"
echo ""
echo -e "  ${GREEN}[scout]${RESET}    ${BOLD}RUN${RESET} — scheduled (*/30 * * * *)"
pause 0.5
echo -e "  ${CYAN}[analyst]${RESET}  skip — no matching triggers"
echo -e "  ${MAGENTA}[executor]${RESET} skip — reactive only"
echo -e "  ${RED}[guardian]${RESET}  ${BOLD}RUN${RESET} — scheduled (*/15 * * * *)"
echo ""
echo -e "  ${DIM}dispatching scout/scan-tokens...${RESET}"
pause 0.5
echo -e "  ${DIM}dispatching guardian/check-risk...${RESET}"
echo ""
pause 2

# --- Scout executes ---
echo -e "${DIM}$ ${RESET}${BOLD}npx stoa execute scout scan-tokens${RESET}"
pause 0.8
echo ""
echo -e "  ${GREEN}[scout]${RESET} executing ${BOLD}scan-tokens${RESET}..."
echo -e "  ${DIM}loading memory/scan-state.json${RESET}"
pause 0.8
echo -e "  ${DIM}fetching prices from Jupiter API...${RESET}"
pause 1
echo -e "  ${DIM}fetching volume from DexScreener...${RESET}"
pause 0.8
echo ""
echo -e "  ${GREEN}▸${RESET} ${BOLD}JUP${RESET}  \$1.45 (+20.8%)  vol 15M (${YELLOW}3x avg${RESET})"
echo -e "  ${DIM}▸${RESET} SOL  \$154.20 (+2.1%)   vol normal"
echo -e "  ${DIM}▸${RESET} PYTH \$0.38 (-1.2%)     vol normal"
echo -e "  ${DIM}▸${RESET} JTO  \$3.21 (+0.5%)     vol normal"
echo ""
pause 1
echo -e "  ${YELLOW}⚡ SIGNAL: volume_spike on JUP — 3x avg volume with breakout${RESET}"
echo -e "  ${DIM}→ posted to memory/mesh/analyst.json${RESET}"
echo ""
echo -e "  ${DIM}scout: scan-tokens — 1 signal [volume_spike]${RESET}"
pause 2

# --- Analyst triggered ---
echo ""
echo -e "  ${CYAN}[analyst]${RESET} ${BOLD}TRIGGERED${RESET} — new signal from scout"
echo -e "  ${DIM}executing analyze-signal...${RESET}"
pause 0.8
echo ""
echo -e "  ${DIM}evaluating signal: JUP volume_spike${RESET}"
pause 0.5
echo -e "    magnitude:    ${GREEN}0.25${RESET} (3x = high)"
echo -e "    organic:      ${GREEN}0.20${RESET} (847 unique traders)"
echo -e "    confirmation: ${GREEN}0.25${RESET} (price confirms)"
echo -e "    narrative:    ${YELLOW}0.15${RESET} (moderate social)"
echo -e "    ${BOLD}────────────────${RESET}"
echo -e "    confidence:   ${GREEN}${BOLD}0.85${RESET} (threshold: 0.70) ${GREEN}✓ PASS${RESET}"
echo ""
pause 1
echo -e "  ${CYAN}⚡ TRADE-SIGNAL: buy JUP | momentum | conf 0.85${RESET}"
echo -e "  ${DIM}→ posted to memory/mesh/executor.json${RESET}"
echo ""
echo -e "  ${DIM}analyst: 1 signal scored, 1 trade-signal [JUP]${RESET}"
pause 2

# --- Executor triggered ---
echo ""
echo -e "  ${MAGENTA}[executor]${RESET} ${BOLD}TRIGGERED${RESET} — trade-signal from analyst"
echo -e "  ${DIM}executing execute-trade...${RESET}"
pause 0.5
echo ""
echo -e "  ${DIM}safety checks...${RESET}"
echo -e "    halt status:    ${GREEN}clear${RESET}"
echo -e "    wallet:         ${GREEN}configured${RESET}"
echo -e "    position size:  \$100 ≤ \$100 max  ${GREEN}✓${RESET}"
pause 0.8
echo ""
echo -e "  ${DIM}Jupiter quote: 68.97 JUP @ 1.45 (slippage: 25 bps)${RESET}"
echo -e "  ${DIM}simulating transaction...${RESET}"
pause 0.8
echo -e "  ${DIM}simulation: ${GREEN}OK${RESET}"
echo -e "  ${DIM}sending transaction...${RESET}"
pause 1.2
echo -e "  ${DIM}confirming...${RESET}"
pause 0.8
echo ""
echo -e "  ${GREEN}${BOLD}✓ FILLED${RESET} buy 68.97 JUP @ \$1.45 — tx:5xG7...kJmN"
echo -e "  ${DIM}→ position recorded in memory/positions.json${RESET}"
echo -e "  ${DIM}→ execution-report sent to analyst + guardian${RESET}"
echo ""
pause 2

# --- Guardian normal check ---
echo ""
echo -e "  ${RED}[guardian]${RESET} executing ${BOLD}check-risk${RESET}..."
pause 0.8
echo ""
echo -e "  ${DIM}checking 1 open position...${RESET}"
echo -e "    JUP: entry \$1.45 → current \$1.50  ${GREEN}+3.4%${RESET}"
echo -e "    stop-loss: -8%  ${GREEN}OK${RESET}"
echo -e "    take-profit: +25%  ${DIM}not yet${RESET}"
echo ""
echo -e "  ${DIM}portfolio: \$1,003.45 | drawdown: 0% | status: ${GREEN}active${RESET}"
echo ""
pause 2

# --- Time passes, price crashes ---
echo -e "${DIM}  ─── 2 hours later ───${RESET}"
pause 2
echo ""
echo -e "  ${RED}[guardian]${RESET} executing ${BOLD}check-risk${RESET}..."
pause 0.8
echo ""
echo -e "  ${DIM}checking 1 open position...${RESET}"
echo -e "    JUP: entry \$1.45 → current \$1.10  ${RED}${BOLD}-24.1%${RESET}"
echo -e "    stop-loss: -8%  ${RED}${BOLD}✗ BREACHED${RESET}"
echo ""
pause 1
echo -e "  ${DIM}portfolio: \$975.87 | drawdown: ${RED}-18.5%${RESET} | threshold: -15%"
echo ""
pause 1
echo -e "  ${RED}${BOLD}⚠ HALT — drawdown exceeded 15%${RESET}"
echo -e "  ${RED}→ halt message sent to ALL agents${RESET}"
echo -e "  ${RED}→ urgent sell signal: liquidate JUP position${RESET}"
echo -e "  ${RED}→ cooldown: 4 hours${RESET}"
echo ""
pause 2

# --- Final status ---
echo -e "${DIM}$ ${RESET}${BOLD}npx stoa status${RESET}"
pause 0.8
echo ""
echo -e "  ${BOLD}═══ stoa swarm status ═══${RESET}"
echo -e "  Status: ${RED}${BOLD}HALTED${RESET}"
echo -e "  Cooldown until: 2026-05-18T15:30:00Z"
echo ""
echo -e "  Agents:"
echo -e "    scout:    ${RED}blocked${RESET}"
echo -e "    analyst:  ${RED}blocked${RESET}"
echo -e "    executor: ${RED}blocked${RESET} (processing urgent sell)"
echo -e "    guardian: ${GREEN}active${RESET} (monitoring)"
echo ""
echo -e "  Portfolio:"
echo -e "    Value: \$975.87 (6.35 SOL)"
echo -e "    Drawdown: ${RED}-18.5%${RESET}"
echo -e "    Positions: 1 (pending liquidation)"
echo ""
pause 3
echo -e "${DIM}  github.com/stoaaadev/stoa${RESET}"
echo -e "${DIM}  Deploy a swarm, not a dashboard.${RESET}"
echo ""
pause 3
