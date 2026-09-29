import fs from 'node:fs';
import { grammarsWithEvidence } from '../lib/core/grammar';
const db = JSON.parse(fs.readFileSync('data/db.json', 'utf8'));
const cands: any[] = db.candidates ?? [];
const posts: any[] = db.posts ?? [];
const byC = new Map<string, any[]>();
for (const p of posts) { const a = byC.get(p.candidateId); if (a) a.push(p); else byC.set(p.candidateId, [p]); }
const man = (n: number) => `${Math.round(n / 10000)}만`;
const only = process.argv[2];
for (const g of grammarsWithEvidence(cands, posts, '2026-09-24T00:00:00Z')) {
  if (only && g.id !== only) continue;
  console.log(`\n══ ${g.name} (${g.id}) · 근거 ${g.evidence.length}건`);
  g.evidence.forEach((e, i) => {
    const c = cands.find((x) => x.id === e.candidateId);
    const mine = (byC.get(e.candidateId) ?? []).sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
    const acc = new Set(mine.map((p) => p.accountId || p.account).filter(Boolean)).size;
    const top = mine[0]?.views ?? 0;
    console.log(` ${i + 1} ${e.subject} — 최고 ${top ? man(top) : '없음'} · 계정 ${acc}곳 · 썸네일 ${mine.filter((p) => p.thumbnailUrl).length}`);
    for (const ev of (c?.evidence ?? []).slice(0, 2)) {
      const t = String(ev.title ?? '').trim();
      if (t) console.log(`     "${t.slice(0, 100)}"  ${ev.metric ?? ''}`);
    }
  });
}
