/*
 * 신선도 수용 확인 (PROMPT.md §7 · §13-1).
 *
 * 단위 테스트는 db.json 에 기대지 않으므로, 실제 데이터 대조는 여기서 한다.
 *   npx tsx tests/_fresh4.ts
 *
 * 기준일을 두 개 다 찍는다. 사양의 검증값은 **마지막 회차**(수집이 멈춘 날)로만
 * 재현된다 — 오늘로 재면 경계가 밀려서 내려간다. 그게 asOf 를 필수로 둔 이유다.
 */
import fs from 'node:fs';
import { freshness } from '../lib/core/series';
import type { PostRecord } from '../lib/core/post-record';

const db = JSON.parse(fs.readFileSync('data/db.json', 'utf8'));
const byCand = new Map<string, PostRecord[]>();
for (const p of (db.posts ?? []) as PostRecord[]) {
  const a = byCand.get(p.candidateId);
  if (a) a.push(p);
  else byCand.set(p.candidateId, [p]);
}

const WANT: Record<string, number> = { 짱구: 92, 코난: 34, 리락쿠마: 33, 치이카와: 72 };
const lastRun = [...(db.runs ?? [])].sort((a, b) => b.at.localeCompare(a.at))[0]?.at;

let bad = 0;
for (const asOf of [lastRun, new Date().toISOString()]) {
  const line = Object.entries(WANT)
    .map(([name, want]) => {
      const c = (db.candidates ?? []).find((x: { subject?: string }) => x.subject === name);
      const got = c ? freshness(byCand.get(c.id) ?? [], asOf) : undefined;
      if (asOf === lastRun && got !== want) bad++;
      return `${got === want ? '✔' : '✘'} ${name}=${got}`;
    })
    .join('  ');
  const tag = asOf === lastRun ? '마지막 회차' : '오늘       ';
  console.log(`${tag} ${asOf.slice(0, 10)}  ${line}`);
}

// 10 건 미만은 null 이다. 0 이 아니다.
const all = (db.candidates ?? []) as { id: string }[];
const nulls = all.filter((c) => freshness(byCand.get(c.id) ?? [], lastRun) === null).length;
console.log(`\n후보 ${all.length}건 중 게시물 10건 미만 → null ${nulls}건 · 값이 나오는 것 ${all.length - nulls}건`);
console.log(bad ? `\n✘ 검증값 ${bad}개 불일치` : '\n✔ 검증값 네 개 모두 일치');
process.exit(bad ? 1 : 0);
