import fs from 'node:fs';
import { grammarsWithEvidence } from '../lib/core/grammar';
const db = JSON.parse(fs.readFileSync('data/db.json', 'utf8'));
const gs = grammarsWithEvidence(db.candidates ?? [], db.posts ?? [], '2026-09-24T00:00:00Z');
// 화면에 나가면 안 되는 낱말 — 하나라도 남으면 판정기 메모가 새는 것이다.
const LEAK = /참고|확인됨|보류|레퍼런스|프롬프트|외형|권리|귀속|독립 출처|미확인|기업 IP|판정|자료|근거가 있음|다룰 수 있음|만$|으?로$|에$|와$|과$/;
let n = 0, bad = 0;
for (const g of gs) {
  for (const e of g.evidence) {
    n++;
    if (LEAK.test(e.line)) { bad++; console.log(`✘ [${g.name}] ${e.subject}: ${e.line}`); }
  }
}
console.log(`\n문장 ${n}개 중 새는 것 ${bad}개`);
