/**
 * 저장된 스냅샷에 본문 요약을 소급해 채운다. **수집(TikHub)은 하지 않는다.**
 *
 * 본문은 이미 `snapshots[].raw.posts[].text` 에 들어 있다. 그래서 새 회차를 돌리지 않고도
 * 옛 회차에 요약을 얹을 수 있고, `PostRecord` 에 본문 칸을 만들 필요가 없다 (2026-09-18 결정).
 *
 * 돈이 나가는 건 Anthropic 호출뿐이고, 스냅샷 하나에 1번이다.
 * 그래서 **기본은 견적만 낸다.** 실제로 부르려면 `--go` 를 붙인다.
 *
 *   npx tsx --env-file=.env.local tests/_summarize.ts          # 견적
 *   npx tsx --env-file=.env.local tests/_summarize.ts --go     # 실제 호출
 */
import { listSnapshots, patchSnapshotRaw, renormalize, key } from '../lib/core/store';
import { characterNativeDiscovery as d, verifiedFrom, pickForTable } from '../lib/discoveries/character-native';
import { summarizePosts, BODY_CHARS, type PostSummary } from '../lib/collect/summaries';

const GO = process.argv.includes('--go');

async function main() {
  const snaps = (await listSnapshots()).filter((s) => s.discoveryId === d.id);
  if (!snaps.length) {
    console.log('character-native 스냅샷이 없습니다.');
    return;
  }

  console.log(`스냅샷 ${snaps.length}개 · 본문 ${BODY_CHARS}자까지\n`);

  let called = 0;
  for (const s of snaps) {
    const raw = s.raw as { summaries?: PostSummary[] } | null;
    const had = new Set((raw?.summaries ?? []).map((x) => key(x.name)));
    // 대조를 통과한 후보만 묻는다. normalize 와 같은 상한(MAX_CANDIDATES)을 쓴다 —
    // 여기만 넓으면 표에 안 오를 후보의 요약을 사 놓고 버리게 된다.
    //
    // **빠진 이름만 묻는다.** 스냅샷에 요약이 하나라도 있으면 통째로 건너뛰던 때가 있었는데,
    // 상한을 12 → 16 으로 올리자 새로 후보가 된 5건(확정 등급인 토랩이 포함)이 빈 채로 남았다.
    const groups = pickForTable(verifiedFrom(s.raw, s.at))
      .filter((n) => !had.has(key(n.name)))
      .map((n) => ({ name: n.name, posts: n.posts }));
    const chars = groups.reduce(
      (t, g) => t + g.posts.reduce((u, p) => u + Math.min((p.text ?? '').length, BODY_CHARS), 0),
      0,
    );
    const head = `${s.runId}  빠진 요약 ${groups.length}건 (이미 ${had.size}건) · 본문 약 ${chars.toLocaleString('ko-KR')}자`;

    if (!groups.length) {
      console.log(`${head}  → 건너뜀`);
      continue;
    }
    if (!GO) {
      console.log(`${head}  → 호출 1회 필요 (--go 를 붙이면 실제로 부릅니다)`);
      continue;
    }

    const r = await summarizePosts(groups);
    // 기존 요약을 덮지 않고 합친다. 이 스크립트는 빠진 것만 사 온다.
    const ok = await patchSnapshotRaw(s.runId, {
      summaries: [...(raw?.summaries ?? []), ...r.summaries],
    });
    called += 1;
    console.log(
      `${head}  → 요약 ${r.summaries.length}/${groups.length}건` +
        ` · 토큰 입력 ${r.usage.input.toLocaleString('ko-KR')} 출력 ${r.usage.output.toLocaleString('ko-KR')}` +
        (ok ? '' : ' · ⚠ 스냅샷에 못 썼습니다'),
    );
    for (const x of r.summaries.slice(0, 3)) {
      console.log(`    ${x.name}: ${x.summary.slice(0, 70)}…`);
    }
  }

  if (!GO) {
    console.log('\n견적만 냈습니다. 아무것도 부르지 않았고 저장도 하지 않았습니다.');
    return;
  }
  if (!called) {
    console.log('\n새로 부른 것이 없습니다.');
    return;
  }

  // 요약을 스냅샷에 넣었으니 표를 다시 세운다. 여기서는 API 를 한 번도 부르지 않는다.
  const rn = await renormalize(
    d.id,
    (raw, ctx) => d.normalize(raw, ctx),
    (raw, ctx, cands) => d.records!(raw, ctx, cands),
  );
  console.log(`\n다시 세움 — 후보 ${rn.before} → ${rn.after} · 레코드 ${rn.posts}건`);

  const { listCandidates } = await import('../lib/core/store');
  const mine = (await listCandidates()).filter((c) => c.origin.discoveryId === d.id);
  const withSum = mine.filter((c) => c.summary?.trim());
  console.log(`요약이 붙은 후보 ${withSum.length}/${mine.length}`);
  for (const c of withSum.slice(0, 5)) {
    console.log(`  ${key(c.subject)}  ${c.summary!.slice(0, 60)}…`);
  }
}

main();
