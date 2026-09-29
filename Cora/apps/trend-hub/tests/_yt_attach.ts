/**
 * 후보에 YouTube 를 붙여 영상 레코드를 쌓는다. **무료 할당량만 쓴다**(search 100 + videos 1 + channels 1).
 * 인자 없으면 참조가 필요한데 아직 없는 후보만 고른다.
 */
import { listCandidates, listPosts, upsertPosts } from '../lib/core/store';
import { benchmarkNativeDiscovery as d } from '../lib/discoveries/benchmark-native';
import { referencesFor, needsReference } from '../lib/core/reference';

async function main() {
  const only = process.argv.slice(2);
  const cands = await listCandidates();
  let posts = await listPosts();

  const targets = only.length
    ? cands.filter((c) => only.includes(c.subject))
    : cands.filter((c) => needsReference(c) && referencesFor(c, posts).length === 0);

  console.log(`대상 ${targets.length}건 · YouTube 호출 ${targets.length}회 (무료 할당량)\n`);

  for (const c of targets) {
    const ctx = { runId: `run-yt-${Date.now()}`, runAt: new Date().toISOString(), mock: false };
    try {
      const raw = (await d.run(d.inputsFrom(c), ctx)) as any;
      const recs = d.records!(raw, ctx, [c]);
      await upsertPosts(recs);
      const dates = recs.map((r) => r.postedAt).filter(Boolean).sort() as string[];
      console.log(
        `  ${c.subject.padEnd(12)} 검색어 "${raw.keyword}" → 영상 ${raw.videos?.length ?? 0}편 · 레코드 ${recs.length}건` +
          (dates.length ? ` · ${dates[0].slice(0, 10)}~${dates[dates.length - 1].slice(0, 10)}` : '') +
          (raw.error ? ` · ${raw.error}` : ''),
      );
    } catch (e) {
      console.log(`  ${c.subject.padEnd(12)} 실패: ${e instanceof Error ? e.message : e}`);
    }
  }

  posts = await listPosts();
  const need = cands.filter(needsReference);
  const ok = need.filter((c) => referencesFor(c, posts).length > 0).length;
  console.log(`\n레코드 ${posts.length}건 · 참조를 물릴 수 있는 후보 ${ok}/${need.length}`);
}
main();
