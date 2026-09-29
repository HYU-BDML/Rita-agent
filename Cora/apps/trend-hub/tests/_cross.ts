import fs from 'node:fs';
import { grammarsWithEvidence } from '../lib/core/grammar';
const db = JSON.parse(fs.readFileSync('data/db.json', 'utf8'));
const gs = grammarsWithEvidence(db.candidates ?? [], db.posts ?? [], '2026-09-24T00:00:00Z');
const at = new Map<string, string[]>();
for (const g of gs) for (const e of g.evidence) {
  const a = at.get(e.url) ?? []; a.push(`${g.name}/${e.subject}`); at.set(e.url, a);
}
const sum = gs.reduce((n, g) => n + g.evidence.length, 0);
console.log(`카드 합 ${sum} · 고유 출처 ${at.size} · 차이 ${sum - at.size}`);
for (const [url, who] of at) if (who.length > 1) console.log(`  ${who.join('  ↔  ')}\n    ${url}`);
