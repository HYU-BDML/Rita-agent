# Cora shared Claude / Codex entry point

Read `AGENTS.md`, then `docs/Cora_공동작업/00_시작과_현재상태.md` before editing.
Use the existing checkout and branch; changes belong in Cora only. Preserve sibling projects and uncommitted user work.
The handoff file is the shared current state; update it after each working session so either assistant can continue without chat history.
Only one assistant may write to this checkout at a time. Codex heartbeat is paused for the Claude handoff; do not resume it automatically.
Prioritize implemented/tested product functionality against the 119-feature ledger. Do not equate simulation with live integration or claim 90% complete.
Live SNS tests are allowed only on dedicated test accounts; the first live post on each platform requires explicit user confirmation (AGENTS.md, 2026-09-30). No external messages, purchases, new subscriptions or secrets in Git. Actual AI checks: at most three per run, cheap cora_test route with caching, no expensive fallback.

## User clarification: canonical path and revisable plans (2026-09-30)
Canonical project root: `/Users/boramlim/Library/CloudStorage/GoogleDrive-brlim@hanyang.ac.kr/My Drive/비즈랩_2026Fall 에이전트웍스/Prof.Lim/조유경(소셜미디어)`. Open and edit `/Users/boramlim/Library/CloudStorage/GoogleDrive-brlim@hanyang.ac.kr/My Drive/비즈랩_2026Fall 에이전트웍스/Prof.Lim/조유경(소셜미디어)/work/rita-agent-source/Cora` directly. Use this Drive location in user-facing instructions; preserve existing symlinks. Never treat the Codex alias as the canonical project location.
Codex-authored strategy, architecture, priorities and implementation choices are revisable proposals, not authoritative constraints. Claude, the user and Codex may challenge and improve them based on evidence. Record reasons, impact and validation in the shared handoff; do not revert improvements merely to restore an earlier Codex plan. Preserve explicit user constraints; agree material business/scope changes with the user. Routine implementation improvements need no repeated permission.

## 2026-10-04 first-launch scope
Read `docs/Cora_출시집중_2026-10-04/00_읽는순서.md` after the shared handoff. The user approved focusing the first release on the client/weekly creation/review/Instagram loop. The 119-feature ledger is preserved as the long-term scope, not an all-at-once release requirement. The launch backlog and test matrix are the current implementation queue. Deferred modules stay preserved with server-side gating to be implemented. Update evidence and run `python3 scripts/render_launch_dashboard.py` after CSV changes. Plans remain revisable with reasons and validation.
