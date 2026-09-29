import fs from 'node:fs';
import { grammarsWithEvidence } from '../lib/core/grammar';
const db = JSON.parse(fs.readFileSync('data/db.json', 'utf8'));
const cands: any[] = db.candidates ?? [];
const posts: any[] = db.posts ?? [];
const have = new Set(posts.map((p) => p.candidateId));
const zero = cands.filter((c) => c.lifecycle !== 'retired' && !have.has(c.id));
const by: Record<string, number> = {};
for (const c of zero) by[c.origin?.discoveryId ?? '?'] = (by[c.origin?.discoveryId ?? '?'] ?? 0) + 1;
console.log(`게시물 0건인 후보 ${zero.length}건 (retired 제외) · 축별 ${JSON.stringify(by)}`);

const gs = grammarsWithEvidence(cands, posts, '2026-09-24T00:00:00Z');
console.log('\n방식              지금  0건카드  뺀 뒤   2건 미만');
let dropped = 0;
for (const g of gs) {
  const z = g.evidence.filter((e) => !have.has(e.candidateId)).length;
  dropped += z;
  const after = g.evidence.length - z;
  console.log(
    `${g.name.padEnd(9)} ${String(g.evidence.length).padStart(5)} ${String(z).padStart(7)} ${String(after).padStart(6)}   ${after < 2 ? '✘ ' + after + '건' : ''}`,
  );
}
console.log(`\n근거 카드 합 ${gs.reduce((n, g) => n + g.evidence.length, 0)} → ${gs.reduce((n, g) => n + g.evidence.length, 0) - dropped} (−${dropped})`);
