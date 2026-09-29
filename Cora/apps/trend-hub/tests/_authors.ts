/**
 * 캐릭터 판정기의 교차 확인 문턱을 바꿔 보고 무엇이 남는지 센다.
 *
 * 저장된 원본에 다시 돌리는 것이라 TikHub 도 LLM 도 부르지 않는다 — 공짜다.
 * 실행: npx tsx tests/_authors.ts
 */
import { readFileSync } from 'node:fs';
import { verifyNames } from '../lib/collect/names';

interface Snap {
  discoveryId: string;
  at: string;
  raw: { posts?: unknown[]; drafts?: unknown[] };
}

const db = JSON.parse(readFileSync('data/db.json', 'utf8')) as { snapshots: Snap[] };
const snap = db.snapshots.filter((s) => s.discoveryId === 'character-native').at(-1);
if (!snap) {
  console.log('캐릭터 회차 원본이 없습니다.');
  process.exit(0);
}

const posts = (snap.raw.posts ?? []) as Parameters<typeof verifyNames>[0];
const drafts = (snap.raw.drafts ?? []) as Parameters<typeof verifyNames>[1];

console.log(`회차 ${snap.at} · 수집 게시물 ${posts.length}건 · 이름 후보 ${drafts.length}개\n`);

for (const min of [1, 2, 3]) {
  const kept = verifyNames(posts, drafts, min);
  const names = kept.map((n) => `${n.name}(${n.authors.length})`);
  console.log(`계정 ${min}개 이상 요구 → ${kept.length}건`);
  if (names.length) console.log('   ', names.join(' · '));
}

// 계정 하나가 이름을 몇 개나 낳았나. 공식 계정 하나가 목록을 올리면 그게 다 후보가 된다.
const kept = verifyNames(posts, drafts, 1);
const byAuthor = new Map<string, string[]>();
for (const n of kept) {
  for (const a of n.authors) {
    byAuthor.set(a, [...(byAuthor.get(a) ?? []), n.name]);
  }
}
console.log('\n계정별로 낳은 이름 수:');
for (const [a, names] of [...byAuthor].sort((x, y) => y[1].length - x[1].length)) {
  console.log(`  ${names.length}개  ${a}  — ${names.join(', ')}`);
}
