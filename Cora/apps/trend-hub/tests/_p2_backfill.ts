/** 저장된 원본에서 게시물 레코드를 소급 적재한다. 수집도 LLM 도 부르지 않는다 (지시서 P2). */
import { renormalize, listPosts } from '../lib/core/store';
import { characterNativeDiscovery as d } from '../lib/discoveries/character-native';

async function main() {
  const before = (await listPosts()).length;
  const r = await renormalize(
    d.id,
    (raw, ctx) => d.normalize(raw, ctx),
    (raw, ctx, cands) => d.records!(raw, ctx, cands),
  );
  const posts = await listPosts();
  console.log(`후보 ${r.before} → ${r.after} · 레코드 ${before} → ${posts.length} (고아 제작물 ${r.orphanedProducts})`);

  const withThumb = posts.filter((p) => p.thumbnailUrl).length;
  const withDate = posts.filter((p) => p.postedAt).length;
  const byPlat = new Map<string, number>();
  for (const p of posts) byPlat.set(p.platform, (byPlat.get(p.platform) ?? 0) + 1);
  console.log(`  썸네일 ${withThumb}/${posts.length} · 게시일 ${withDate}/${posts.length}`);
  console.log(`  플랫폼 ${[...byPlat].map(([k, v]) => `${k} ${v}`).join(' · ')}`);

  const dates = posts.map((p) => p.postedAt).filter(Boolean).sort();
  if (dates.length) console.log(`  기간 ${dates[0]!.slice(0, 10)} ~ ${dates[dates.length - 1]!.slice(0, 10)}`);

  const byCand = new Map<string, number>();
  for (const p of posts) byCand.set(p.candidateId, (byCand.get(p.candidateId) ?? 0) + 1);
  console.log('  후보별 상위 5:');
  for (const [c, n] of [...byCand].sort((a, b) => b[1] - a[1]).slice(0, 5)) console.log(`    ${c}  ${n}건`);
}
main();
