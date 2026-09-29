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
