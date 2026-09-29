/**
 * 저장된 회차의 이름 + **표에 이미 있는 이름**으로 묶기를 시험한다. 수집하지 않는다. LLM 1회.
 *   npx tsx --env-file=.env.local tests/_try_grouping.ts --go
 */
import { listSnapshots, listCandidates } from '../lib/core/store';
import { verifyFormats } from '../lib/collect/formats';
import { groupNames } from '../lib/collect/grouping';

const GO = process.argv.includes('--go');

async function main() {
  const snaps = (await listSnapshots()).filter((s) => s.discoveryId === 'meme-native');
  const last = snaps[snaps.length - 1];
  const raw = (last?.raw ?? {}) as { posts?: any[]; ocr?: Record<string, string>; drafts?: any[] };
  const verified = verifyFormats(raw.posts ?? [], new Map(Object.entries(raw.ocr ?? {})), raw.drafts ?? []);
  const settled = (await listCandidates())
    .filter((c) => c.origin.discoveryId === 'meme-native' && c.lifecycle !== 'archived')
    .map((c) => c.subject);
  const fresh = new Set(verified.map((v) => v.draft.name));
  const input = [
    ...verified.map((v) => ({ name: v.draft.name, hint: v.draft.why })),
    ...settled.filter((s) => !fresh.has(s)).map((s) => ({ name: s, existing: true })),
  ];
  console.log(`이번 회차 이름 ${verified.length} + 표에 있던 이름 ${input.length - verified.length} = ${input.length}개`);
  if (!GO) return console.log('견적만 냈습니다. 실제로 부르려면 --go');

  const r = await groupNames(input);
  const merged = r.groups.filter((g) => g.aliases.length);
  const related = r.groups.filter((g) => g.related.length);
  console.log(`\n${input.length} → 그룹 ${r.groups.length}`);
  console.log(`토큰 입력 ${r.usage.input.toLocaleString('ko-KR')} 출력 ${r.usage.output.toLocaleString('ko-KR')}` +
    ` ≈ $${((r.usage.input * 5) / 1e6 + (r.usage.output * 25) / 1e6).toFixed(3)}`);
  console.log(`\n■ 합쳐진 것 ${merged.length}쌍`);
  for (const g of merged) console.log(`   ${g.canonical}  ←  ${g.aliases.join(' · ')}`);
  console.log(`\n■ 파생으로 이어진 것 ${related.length}건`);
  for (const g of related) console.log(`   ${g.canonical}  ~  ${g.related.join(' · ')}`);
}
main();
