/**
 * 대표 사진이 아직 점수 없는 후보만 골라 메운다.
 *
 * 회차가 charShot 을 직접 만들게 고쳤지만(2026-09-22), 그 전에 들어온 게시물은
 * 여전히 비어 있다. 전부 메울 이유는 없다 — 대표 자리를 정할 만큼만 본다.
 * 그래서 **대표로 뽑히는 장이 미채점인 후보**만 골라, 그 후보의 상위 몇 장만 묻는다.
 *
 * 레코드에 직접 적는다. 캐릭터 회차 레코드는 재정규화하면 raw.shotScores 쪽이
 * 다시 덮으므로, 거기 없는 유튜브 백필 레코드에 특히 의미가 있다.
 *
 * **키를 직접 물려야 한다.** 이 스크립트는 Next 를 거치지 않으므로 .env.local 이
 * 저절로 읽히지 않는다. 안 물리면 Anthropic 호출이 인증 오류로 떨어지는데
 * scoreThumbs 가 그걸 삼켜서 '0장 판정'으로만 보인다 — 원인이 안 보인다.
 *   npx tsx --env-file=.env.local tests/이름.ts --go
 */
import { listCandidates, listPosts, upsertPosts } from '../lib/core/store';
import { scoreThumbs, SCORE_MODEL } from '../lib/collect/thumb-text';
import { bestShotFirst } from '../lib/core/candidate-images';
import type { Post } from '../lib/collect/tikhub';

const GO = process.argv.includes('--go');
const PER = 6;

async function main() {
  const cands = (await listCandidates()).filter((c) => c.origin.discoveryId === 'character-native');
  const posts = await listPosts();
  const byCandidate = new Map<string, typeof posts>();
  for (const p of posts) {
    if (!p.thumbnailUrl) continue;
    byCandidate.set(p.candidateId, [...(byCandidate.get(p.candidateId) ?? []), p]);
  }

  const pick: typeof posts = [];
  let risky = 0;
  for (const c of cands) {
    const ordered = bestShotFirst(byCandidate.get(c.id) ?? []);
    // 대표로 뽑히는 장에 점수가 있으면 건드리지 않는다. 이미 제 몫을 하고 있다.
    if (!ordered.length || ordered[0].charShot !== undefined) continue;
    risky += 1;
    pick.push(...ordered.slice(0, PER).filter((p) => p.charShot === undefined));
  }

  const cost = (pick.length * 588) / 1e6 + (pick.length * 45 * 5) / 1e6;
  console.log(
    `캐릭터 후보 ${cands.length} · 대표가 미채점인 후보 ${risky} · 물어볼 썸네일 ${pick.length}장` +
      ` · ${SCORE_MODEL} · 예상 $${cost.toFixed(3)}`,
  );
  if (!GO) return console.log('견적만 냈습니다. 실제로 부르려면 --go');
  if (!pick.length) return;

  const r = await scoreThumbs(
    pick.map((p) => ({ sourceId: p.id, thumbnail: p.thumbnailUrl }) as unknown as Post),
  );
  const updated = pick
    .filter((p) => r.scores.has(p.id))
    .map((p) => ({ ...p, charShot: r.scores.get(p.id)! }));
  await upsertPosts(updated);

  const by = new Map<number, number>();
  for (const v of r.scores.values()) by.set(v, (by.get(v) ?? 0) + 1);
  console.log(
    `${updated.length}/${pick.length}장 판정 · 분포 ${[...by].sort().map(([k, v]) => `${k}:${v}`).join(' · ')}` +
      ` · 토큰 입력 ${r.usage.input.toLocaleString('ko-KR')} 출력 ${r.usage.output.toLocaleString('ko-KR')}` +
      ` ≈ $${((r.usage.input * 1) / 1e6 + (r.usage.output * 5) / 1e6).toFixed(3)}`,
  );
  const missed = pick.length - updated.length;
  if (missed) console.log(`${missed}장은 받지 못했다 — 만료된 CDN 주소(틱톡 서명 URL)일 가능성이 높다.`);
}
main();
