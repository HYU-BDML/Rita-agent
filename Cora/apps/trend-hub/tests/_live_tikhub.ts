import { searchInstagram, searchX, searchTikTok, hasTikHub } from '../lib/collect/tikhub';

async function main() {
  console.log('TikHub 키:', hasTikHub() ? '있음' : '없음', '— 호출 3회만 씁니다\n');
  const jobs: [string, () => Promise<any[]>][] = [
    ['instagram', () => searchInstagram('자캐', 8)],
    ['x', () => searchX('자캐', 8)],
    ['tiktok', () => searchTikTok('자캐', 8)],
  ];
  for (const [name, fn] of jobs) {
    try {
      const ps = await fn();
      console.log(`${name}: ${ps.length}건`);
      for (const p of ps.slice(0, 3)) {
        console.log(`   계정명 "${p.authorName}" @${p.authorId} · 태그 [${p.tags.slice(0,4).join(',')}]`);
        console.log(`   본문 ${JSON.stringify(p.text.slice(0, 46))} · 조회 ${p.views} · ${p.url.slice(0,52)}`);
      }
    } catch (e) {
      console.log(`${name}: 실패 — ${e instanceof Error ? e.message.slice(0, 160) : e}`);
    }
    console.log();
  }
}
main();
