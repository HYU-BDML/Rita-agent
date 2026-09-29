import fs from 'node:fs';
import { classify } from '../lib/core/grammar';
const db = JSON.parse(fs.readFileSync('data/db.json', 'utf8'));
const cs: any[] = db.candidates ?? [];
const want: Record<string, string> = {
  포차코: '굿즈깡', Tutu: '입고 정보', 춘배: '입고 정보', 'Hatsune Miku': '입고 정보',
  페포: '비교·투표', 하치와레: '비교·투표', 모몽가: '비교·투표', '베이비 마일로': '비교·투표',
  'C.C.': '자캐 공개', Pomni: '2차 창작', 'Tsukasa Tenma': '손 클로즈업',
  Ikarus: '손 클로즈업', Firefly: '손 클로즈업', 로보프로스터: '손 클로즈업',
};
for (const [name, exp] of Object.entries(want)) {
  const c = cs.find((x) => x.subject === name);
  if (!c) { console.log(`${name.padEnd(14)} 후보 없음`); continue; }
  const g = classify(c);
  const got = g?.name ?? '없음';
  console.log(`${(got === exp ? '✔' : '✘')} ${name.padEnd(14)} → ${got.padEnd(8)} (기대 ${exp.padEnd(8)}) life=${c.lifecycle}`);
  if (got !== exp) console.log(`     angle: ${(c.hint?.angle ?? '(없음)').slice(0, 110)}`);
}
