/** 부착기가 영상 레코드를 내는지 실제로 돌려 본다. YouTube 는 무료 할당량(search 100 + videos 1). */
import { benchmarkNativeDiscovery as d } from '../lib/discoveries/benchmark-native';
import { listCandidates, upsertPosts, postsFor } from '../lib/core/store';

async function main() {
  const subject = process.argv[2] ?? '치이카와';
  const all = await listCandidates();
  const c = all.find((x) => x.subject === subject);
  if (!c) throw new Error(`후보 '${subject}' 없음`);

  const ctx = { runId: `run-yt-${Date.now()}`, runAt: new Date().toISOString(), mock: false };
  const raw = (await d.run(d.inputsFrom(c), ctx)) as any;
  console.log(`검색어 "${raw.keyword}" → 영상 ${raw.videos?.length ?? 0}편  ${raw.error ?? ''}`);

  const recs = d.records!(raw, ctx, [c]);
  const saved = await upsertPosts(recs);
  console.log(`레코드 ${recs.length}건 (저장 ${saved})`);
  console.log(`  썸네일 ${recs.filter((r) => r.thumbnailUrl).length}/${recs.length} · 게시일 ${recs.filter((r) => r.postedAt).length}/${recs.length}`);

  const dates = recs.map((r) => r.postedAt).filter(Boolean).sort() as string[];
  if (dates.length) console.log(`  기간 ${dates[0].slice(0, 10)} ~ ${dates[dates.length - 1].slice(0, 10)}`);

  for (const r of (await postsFor(c.id)).filter((p) => p.platform === 'youtube').slice(0, 3)) {
    console.log(`  · ${r.postedAt?.slice(0, 10)} 조회 ${r.views?.toLocaleString('ko-KR')} ${r.account}`);
    console.log(`    ${r.thumbnailUrl ?? '(썸네일 없음)'}`);
  }
}
main();
