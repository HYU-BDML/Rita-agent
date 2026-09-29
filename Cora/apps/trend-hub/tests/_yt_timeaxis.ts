/** 유튜브만으로 시간축이 나오나. 쿼터만 쓰고 돈은 안 든다. */
import { searchVideos } from '../lib/collect/youtube';

const WEEK = 7 * 86_400_000;

async function main() {
  const q = process.argv[2] ?? '치이카와';
  // ① 8주 창 한 번 검색(최신순 아님, relevance) → publishedAt 을 주별로 묶는다
  const vids = await searchVideos(q, { max: 50, withinDays: 56 });
  const now = Date.now();
  const buckets = new Array(8).fill(0);
  for (const v of vids) {
    const age = now - Date.parse(v.publishedAt);
    const i = 7 - Math.floor(age / WEEK);
    if (i >= 0 && i < 8) buckets[i] += 1;
  }
  console.log(`"${q}" · 8주 창 · 받은 영상 ${vids.length}건 (상한 50)`);
  console.log(`  주별(오래된→최근): ${buckets.join(' · ')}`);
  const dates = vids.map((v) => v.publishedAt.slice(0, 10)).sort();
  console.log(`  가장 이른 ${dates[0]} · 가장 늦은 ${dates[dates.length - 1]}`);
  console.log(`  조회수 합 ${vids.reduce((s, v) => s + v.views, 0).toLocaleString('ko-KR')}`);
}
main();
