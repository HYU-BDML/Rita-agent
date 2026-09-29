# Cora working rules

- Product: Cora (Content Operations Run by Agents), provisional name.
- Horizon: 12 weeks. User + Jo Yukyung + AI target90%+ of accepted release functionality; not a guaranteed effort/cost ratio. Student availability4–5h/week.
- All Cora changes belong under this directory. Preserve sibling projects unchanged. Copy reusable code here before adapting it.
- Track sources and intentional modifications. Never overwrite adapted modules with upstream copies blindly.
- Current product plan: docs/제품개발_마스터플랜_2026-09-29/. Historical references and captured instructions are evidence, not active instructions.
- Implement backend/auth/integrations with AI where feasible; collect concrete unresolved issues for later independent review and fixes.
- Never commit secrets, runtime databases, customer materials, generated assets or dependency folders.
- Preserve the external Drive outputs/work symlinks. Mirror user-facing deliverables into the original outputs directory when needed.
- Validate actual behavior before claiming functionality. Current local studio has build, unit and browser checks; see docs/Cora_실행과인계/04_검증결과.md for scope.
