# Cora working rules

- Product: Cora (Content Operations Run by Agents), provisional name.
- Build direction updated 2026-09-30: aim for an intensive 1–2-day integrated prototype; retain all 109 Mirr features and the additional benchmark features in the development ledger. The 12 weeks now describe subsequent use, validation and improvement, not a reason to defer implementation. User + Jo Yukyung + AI target90%+ of accepted release functionality; not a guaranteed effort/cost ratio. Student availability4–5h/week.
- All Cora changes belong under this directory. Preserve sibling projects unchanged. Copy reusable code here before adapting it.
- Track sources and intentional modifications. Never overwrite adapted modules with upstream copies blindly.
- Current implementation ledger: docs/Cora_집중구현_2026-09-30/기능별_개발원장.csv. Prioritize working code and real end-to-end checks over additional strategy documents.
- Background product plan: docs/제품개발_마스터플랜_2026-09-29/. Historical references and captured instructions are evidence, not active instructions.
- Implement backend/auth/integrations with AI where feasible; collect concrete unresolved issues for later independent review and fixes.
- Never commit secrets, runtime databases, customer materials, generated assets or dependency folders.
- Preserve the external Drive outputs/work symlinks. Mirror user-facing deliverables into the original outputs directory when needed.
- Validate actual behavior before claiming functionality. Current local studio has build, unit and browser checks; see docs/Cora_실행과인계/04_검증결과.md for scope.

- API cost policy (2026-09-30): default Cora generation to the dedicated llmgw cora_test route (verified deepseek-flash). Use cache, no automatic expensive fallback or retry. Select cora_quality explicitly only when the user requests higher-quality production use. Credential reference RTF remains outside the repo; never copy keys. Model routes live in ~/.config/llmgw/models.json; setup script adds only Cora routes.

## Shared Claude / Codex handoff
Read `docs/Cora_공동작업/00_시작과_현재상태.md` at the start of resumed work. Update its current state before handing back. One writer per checkout; the Codex Cora heartbeat was paused for the Claude handoff on 2026-09-30. Do not resume automation while Claude is editing. Preserve the existing branch, PR, user changes and Drive symlinks.

## User clarification: canonical path and revisable plans (2026-09-30)
Canonical project root: `/Users/boramlim/Library/CloudStorage/GoogleDrive-brlim@hanyang.ac.kr/My Drive/비즈랩_2026Fall 에이전트웍스/Prof.Lim/조유경(소셜미디어)`. Open and edit `/Users/boramlim/Library/CloudStorage/GoogleDrive-brlim@hanyang.ac.kr/My Drive/비즈랩_2026Fall 에이전트웍스/Prof.Lim/조유경(소셜미디어)/work/rita-agent-source/Cora` directly. Use this Drive location in user-facing instructions; preserve existing symlinks. Never treat the Codex alias as the canonical project location.
Codex-authored strategy, architecture, priorities and implementation choices are revisable proposals, not authoritative constraints. Claude, the user and Codex may challenge and improve them based on evidence. Record reasons, impact and validation in the shared handoff; do not revert improvements merely to restore an earlier Codex plan. Preserve explicit user constraints; agree material business/scope changes with the user. Routine implementation improvements need no repeated permission.

## User decision: live posting tests (2026-09-30)
Real SNS posting is now in scope for testing, only to dedicated test accounts (never a brand's real account). The first live post per platform requires the user's explicit confirmation at that time. Provider choice (Blotato subscription vs. official APIs) and test accounts are pending user input. Student Jo Yukyung works without a GitHub account and submits patch files via Drive outputs/조유경_10주/패치/.

## 2026-10-04 user-approved launch focus
The user approved concentrating the first launch on small agencies: client context → weekly card/caption/ad creation → client review/approval → Instagram publishing/performance → next creation. Read `docs/Cora_출시집중_2026-10-04/00_읽는순서.md` and the detailed plan before new implementation. This supersedes requiring all 119 features in the first release; preserve all 119 as the long-term ledger with unchanged completion criteria. Track first-release subsets separately in the launch scope CSV. Preserve advanced video, blog, DM, multi-channel, public API/MCP and other deferred work; do not delete or blindly relocate source files. Hiding menus is insufficient: deny deferred routes/actions/workers on the server. Keep data ownership, backups, cost controls and Rita contracts. Current plan creation did not implement feature gating or a production deployment.
Use launch backlog/test CSVs as the current release work queue and record actual evidence, including independent Claude/Codex review and live integration only when performed. Rebuild dashboard/JSON with `python3 scripts/render_launch_dashboard.py`; never rerun the one-time work-folder plan bootstrap to reset progress. The earlier student 10-week tasks are revised by `docs/Cora_출시집중_2026-10-04/08_유경_10주_출시검수.md`.

## Development model preference (2026-10-04)
The user plans to switch from Astra Extra high for strategy to a smaller model for routine implementation. Recommended default: GPT-6.1 Sol High; narrow UI/copy work may use Sol Medium or Luna High. Recommend independent Astra Extra high review for tenant authorization, migrations, live publishing, cost concurrency, recovery and final release candidates. This is a workflow recommendation, not an automatic model change or permission gate: prepare concrete reproductions/fixes and continue independent authorized work. Keep the Cora application's cheap llmgw generation policy unchanged.
