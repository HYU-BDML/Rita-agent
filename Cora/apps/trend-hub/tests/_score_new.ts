/**
 * 백필로 처음 썸네일이 생긴 후보만, **후보당 6장씩** 점수를 매긴다.
 *
 * 1,217장을 다 돌리면 $1 이 넘는데 화면에 나올 일이 없는 32번째 썸네일을 판정할
 * 이유가 없다 — 카드는 3장, 계약은 6장만 쓴다. 대표 자리를 정할 만큼만 본다.
 *
 * 대상은 유튜브 백필 레코드라 **레코드에 직접 적는다.** 그 판정기를 재정규화하지
 * 않으므로 지워지지 않는다(캐릭터 회차 레코드는 스냅샷 raw.shotScores 쪽이다).
 */
import { promises as fs } from 'node:fs';
import { listCandidates, listPosts, upsertPosts } from '../lib/core/store';
import { scoreThumbs, SCORE_MODEL } from '../lib/collect/thumb-text';
import type { Post } from '../lib/collect/tikhub';

const GO = process.argv.includes('--go');
const PER = 6;
const LIST = 'C:/Users/mooja/AppData/Local/Temp/zero-thumbs.txt';

async function main() {
  const names = new Set(
    (await fs.readFile(LIST, 'utf8')).split('\n').map((s) => s.trim()).filter(Boolean),
  );
  const cands = (await listCandidates()).filter((c) => names.has(c.subject));
  const posts = await listPosts();

  const pick: typeof posts = [];
  for (const c of cands) {
    const mine = posts
      .filter((p) => p.candidateId === c.id && p.thumbnailUrl && p.charShot === undefined)
      .sort((a, b) => (b.postedAt ?? '').localeCompare(a.postedAt ?? ''))
      .slice(0, PER);
    pick.push(...mine);
  }
  const i = pick.length * 588;
  const o = pick.length * 45;
  console.log(
    `대상 후보 ${cands.length}/${names.size} · 썸네일 ${pick.length}장 (후보당 ${PER}장) · ${SCORE_MODEL}` +
      ` · 예상 $${(i / 1e6 + (o * 5) / 1e6).toFixed(2)}`,
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
      ` ≈ $${((r.usage.input * 1) / 1e6 + (r.usage.output * 5) / 1e6).toFixed(2)}`,
  );
}
main();
