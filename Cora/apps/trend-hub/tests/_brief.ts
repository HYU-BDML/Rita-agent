import fs from 'node:fs';
import { grammarsWithEvidence } from '../lib/core/grammar';
const db = JSON.parse(fs.readFileSync('data/db.json', 'utf8'));
const cands: any[] = db.candidates ?? [];
const posts: any[] = db.posts ?? [];
const runs = [...(db.runs ?? [])].sort((a, b) => b.at.localeCompare(a.at));
const asOf = runs[0]?.at;
const gs = grammarsWithEvidence(cands, posts, asOf);

const byC = new Map<string, any[]>();
for (const p of posts) { const a = byC.get(p.candidateId); if (a) a.push(p); else byC.set(p.candidateId, [p]); }

console.log('방식            근거  게시물  고유계정  views수  하위25%   신선도');
for (const g of gs) {
  const mine = g.evidence.flatMap((e) => byC.get(e.candidateId) ?? []);
  const acc = new Set(mine.map((p) => p.accountId || p.account).filter(Boolean)).size;
  const v = mine.map((p) => p.views).filter((x): x is number => typeof x === 'number' && x > 0).sort((a, b) => a - b);
  const p25 = v.length >= 10 ? v[Math.floor(v.length * 0.25)] : null;
  console.log(
    `${g.name.padEnd(9)} ${String(g.evidence.length).padStart(5)} ${String(mine.length).padStart(6)} ${String(acc).padStart(8)} ${String(v.length).padStart(7)} ${String(p25 ?? '—').padStart(8)} ${String(g.freshness).padStart(6)}`,
  );
}
const top = [...gs].sort((a, b) => b.evidence.length - a.evidence.length || (b.freshness ?? -1) - (a.freshness ?? -1))[0];
const mine = top.evidence.flatMap((e) => byC.get(e.candidateId) ?? []);
const lead = [...top.evidence].sort((a, b) => (b.topViews ?? 0) - (a.topViews ?? 0))[0];
console.log(`\n1번 방식: ${top.name} (근거 ${top.evidence.length} · 신선도 ${top.freshness})`);
console.log(`근거 카드: ${lead.subject} · 최고 ${lead.topViews} · 계정 ${lead.accounts}곳 · 썸네일 ${lead.thumbs.length} · 캡션 ${lead.caption ? 'O' : 'X'}`);
