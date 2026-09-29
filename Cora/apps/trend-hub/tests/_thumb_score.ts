/**
 * 썸네일에 캐릭터가 크게 보이는지 점수를 매겨 스냅샷에 소급한다. **수집하지 않는다.**
 *
 * 대표 사진이 사람 얼굴로 나오는 걸 고치는 재료다. 점수는 `raw.shotScores` 에 적고
 * `records()` 가 `PostRecord.charShot` 으로 옮긴다 — 후보 행에 직접 쓰면 재정규화가 지운다.
 *
 * 기본은 견적. 부르려면 `--go`. 모델은 Haiku 4.5 (사용자 결정).
 */
import { listSnapshots, listPosts, listCandidates, patchSnapshotRaw, renormalize, upsertPosts } from '../lib/core/store';
import { characterNativeDiscovery as d, verifiedFrom, pickForTable } from '../lib/discoveries/character-native';
import { scoreThumbs, SCORE_MODEL } from '../lib/collect/thumb-text';
import type { Post } from '../lib/collect/tikhub';

const GO = process.argv.includes('--go');
/** 장당 588토큰 실측. 출력은 판정 하나라 45쯤. */
const PER_IN = 588;
const PER_OUT = 45;
const PRICE: Record<string, [number, number]> = {
  'claude-haiku-4-5': [1, 5],
  'claude-opus-5': [5, 25],
};

async function main() {
  const snaps = (await listSnapshots()).filter((s) => s.discoveryId === d.id);
  let total = 0;
  const plan: { runId: string; posts: Post[] }[] = [];

  for (const s of snaps) {
    const raw = s.raw as { posts?: Post[]; shotScores?: Record<string, number> } | null;
    const had = raw?.shotScores ?? {};
    // 표에 오르는 후보의 게시물만 본다 — 안 오를 것을 판정해 봐야 버린다.
    const names = pickForTable(verifiedFrom(s.raw, s.at));
    const ids = new Set(names.flatMap((n) => n.posts.map((p) => p.sourceId)));
    const posts = (raw?.posts ?? []).filter(
      (p) => p.thumbnail && ids.has(p.sourceId) && had[p.sourceId] === undefined,
    );
    if (!posts.length) continue;
    plan.push({ runId: s.runId, posts });
    total += posts.length;
    console.log(`${s.runId}  판정할 썸네일 ${posts.length}장 (이미 ${Object.keys(had).length}장)`);
  }

  const [pin, pout] = PRICE[SCORE_MODEL] ?? [5, 25];
  const subs0 = new Set(
    (await listCandidates()).filter((c) => c.unit === 'subject' && c.review !== 'rejected').map((c) => c.id),
  );
  const rest0 = (await listPosts()).filter(
    (p) => p.thumbnailUrl && subs0.has(p.candidateId) && p.discoveryId !== d.id && p.charShot === undefined,
  ).length;
  const grand = total + rest0;
  console.log(
    `\n스냅샷 ${total}장 + 스냅샷 밖(유튜브 등) ${rest0}장 = ${grand}장 · 모델 ${SCORE_MODEL}` +
      ` · 예상 $${((grand * PER_IN * pin) / 1e6 + (grand * PER_OUT * pout) / 1e6).toFixed(2)}`,
  );
  if (!GO) return console.log('견적만 냈습니다. 실제로 부르려면 --go');
  if (!total) return;

  let used = { input: 0, output: 0 };
  for (const { runId, posts } of plan) {
    const r = await scoreThumbs(posts);
    used = { input: used.input + r.usage.input, output: used.output + r.usage.output };
    const snap = snaps.find((s) => s.runId === runId)!;
    const had = (snap.raw as { shotScores?: Record<string, number> })?.shotScores ?? {};
    await patchSnapshotRaw(runId, { shotScores: { ...had, ...Object.fromEntries(r.scores) } });
    console.log(`  ${runId} → ${r.scores.size}/${posts.length}장 판정`);
  }
  console.log(
    `\n토큰 입력 ${used.input.toLocaleString('ko-KR')} 출력 ${used.output.toLocaleString('ko-KR')}` +
      ` ≈ $${((used.input * pin) / 1e6 + (used.output * pout) / 1e6).toFixed(2)}`,
  );

  const rn = await renormalize(d.id, (raw, ctx) => d.normalize(raw, ctx), (raw, ctx, c) => d.records!(raw, ctx, c));
  console.log(`다시 세움 — 후보 ${rn.before} → ${rn.after} · 레코드 ${rn.posts}건`);

  /*
   * 유튜브 레코드는 스냅샷이 아니라 `_yt_attach.ts` 가 레코드에 직접 붙인 것이라
   * 위 경로가 못 닿는다. **재정규화가 이것들을 건드리지 않으므로** 레코드에 바로 적어도
   * 지워지지 않는다(character-native 재정규화는 그 판정기 레코드만 다시 세운다).
   */
  const subs = new Set(
    (await listCandidates()).filter((c) => c.unit === 'subject' && c.review !== 'rejected').map((c) => c.id),
  );
  const rest = (await listPosts()).filter(
    (p) => p.thumbnailUrl && subs.has(p.candidateId) && p.discoveryId !== d.id && p.charShot === undefined,
  );
  if (!rest.length) return;
  console.log(`\n스냅샷 밖 레코드 ${rest.length}장 (유튜브 등) — 레코드에 직접 적는다`);
  const r2 = await scoreThumbs(
    rest.map((p) => ({ sourceId: p.id, thumbnail: p.thumbnailUrl }) as unknown as Post),
  );
  const updated = rest
    .filter((p) => r2.scores.has(p.id))
    .map((p) => ({ ...p, charShot: r2.scores.get(p.id)! }));
  const n = await upsertPosts(updated);
  console.log(
    `  ${updated.length}/${rest.length}장 판정 · 저장 ${n}건 · 토큰 입력 ${r2.usage.input.toLocaleString('ko-KR')}` +
      ` 출력 ${r2.usage.output.toLocaleString('ko-KR')}` +
      ` ≈ $${((r2.usage.input * pin) / 1e6 + (r2.usage.output * pout) / 1e6).toFixed(2)}`,
  );
}
main();
