/**
 * 이미 쌓인 후보 중 기한이 지난 것을 지금 내린다. **수집하지 않는다. LLM 도 안 부른다.**
 *
 * 내리기는 회차가 끝날 때 도는데(`upsertCandidates`), 그 전에 쌓인 것은 다음 회차까지
 * 그대로 남는다. 뉴스는 기한이 7일이라 그동안 지난 소재가 계속 표를 차지한다.
 *
 * 나이만 본다. 미포착(`misses`)은 회차가 세는 값이라 여기서 만들지 않는다.
 * 기본은 견적, 실제로 내리려면 --go.
 */
import { listCandidates, collectionSchedule, patchCandidate } from '../lib/core/store';
import { retireReason } from '../lib/core/retire';

const GO = process.argv.includes('--go');

async function main() {
  const [cands, schedule] = await Promise.all([listCandidates(), collectionSchedule()]);
  const now = new Date();
  const hits = cands
    .map((c) => ({ c, why: retireReason(c, now, schedule.retire) }))
    .filter((x): x is { c: (typeof cands)[number]; why: string } => Boolean(x.why));

  const live = cands.filter((c) => c.lifecycle === 'active').length;
  console.log(`후보 ${cands.length}건 (표에 있는 것 ${live}) · 내릴 것 ${hits.length}건`);

  const by = new Map<string, typeof hits>();
  for (const h of hits) {
    const k = h.c.origin.discoveryId;
    by.set(k, [...(by.get(k) ?? []), h]);
  }
  for (const [disc, list] of [...by].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n■ ${disc} ${list.length}건`);
    for (const h of list.slice(0, 5)) console.log(`   ${h.c.subject.slice(0, 22).padEnd(24)} ${h.why}`);
    if (list.length > 5) console.log(`   … 외 ${list.length - 5}건`);
  }

  const kept = cands.filter((c) => c.lifecycle === 'archived').length;
  console.log(`\n보관 중이라 안 내리는 것 ${kept}건`);
  if (!GO) return console.log('\n견적만 냈습니다. 실제로 내리려면 --go');

  for (const h of hits) await patchCandidate(h.c.id, { lifecycle: 'retired' });
  const after = (await listCandidates()).filter((c) => c.lifecycle === 'active').length;
  console.log(`\n내렸습니다 — 표에 있는 것 ${live} → ${after}건`);
}
main();
