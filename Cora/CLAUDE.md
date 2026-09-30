# Cora shared Claude / Codex entry point

Read `AGENTS.md`, then `docs/Cora_공동작업/00_시작과_현재상태.md` before editing.
Use the existing checkout and branch; changes belong in Cora only. Preserve sibling projects and uncommitted user work.
The handoff file is the shared current state; update it after each working session so either assistant can continue without chat history.
Only one assistant may write to this checkout at a time. Codex heartbeat is paused for the Claude handoff; do not resume it automatically.
Prioritize implemented/tested product functionality against the 119-feature ledger. Do not equate simulation with live integration or claim 90% complete.
No public posts, external messages, purchases, new subscriptions or secrets in Git. Actual AI checks: at most three per run, cheap cora_test route with caching, no expensive fallback.
