import fs from 'node:fs';
import { grammarsWithEvidence } from '../lib/core/grammar';
const db = JSON.parse(fs.readFileSync('data/db.json', 'utf8'));
const gs = grammarsWithEvidence(db.candidates ?? [], db.posts ?? [], '2026-09-24T00:00:00Z');
const want: Record<string, [number, number]> = {
  '동작 따라하기': [20, 100], '말투·유행어': [3, 100], '반응 편집': [4, 94],
  '지출 고백': [3, 76], '질문·선택': [4, 73], '굿즈깡': [13, 72],
  '손 클로즈업': [11, 51], '참여 이벤트': [4, 44], '비교·투표': [5, 39],
  '입고 정보': [7, 37], '2차 창작': [3, 34], '자캐 공개': [7, 22],
};
const urls = new Set<string>();
for (const g of gs) {
  const [wn, wf] = want[g.name] ?? [0, 0];
  const okN = g.evidence.length === wn ? '✔' : `✘${wn}`;
  const okF = g.freshness === wf ? '✔' : `✘${wf}`;
  console.log(`${g.name.padEnd(8)} 근거 ${String(g.evidence.length).padStart(2)} ${okN.padEnd(6)} 신선도 ${String(g.freshness).padStart(4)} ${okF}`);
  g.evidence.forEach((e) => urls.add(e.url));
}
console.log('고유 출처 합집합:', urls.size);
if (process.argv[2]) {
  const g = gs.find((x) => x.name === process.argv[2])!;
  for (const e of g.evidence) console.log(` · ${e.subject} [${e.freshness}] ${e.quote ? '“' : ''}${e.line.slice(0, 60)}`);
}
