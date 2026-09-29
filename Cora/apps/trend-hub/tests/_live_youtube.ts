import { searchVideos, hasYouTube } from '../lib/collect/youtube';

async function main() {
  console.log('YouTube 키:', hasYouTube() ? '있음' : '없음');
  const vs = await searchVideos('불꽃축제', { max: 12, withinDays: 30 });
  console.log(`영상 ${vs.length}건\n`);
  console.log('구독대비   조회       구독      길이  제목');
  for (const v of vs.sort((a, b) => (b.subRatio ?? -1) - (a.subRatio ?? -1)).slice(0, 8)) {
    console.log(
      `  ${String(v.subRatio ?? '-').padStart(6)}  ${String(v.views).padStart(9)}  ${String(v.subs ?? '-').padStart(8)}  ${String(v.durationSec).padStart(5)}s  ${v.title.slice(0, 40)}`,
    );
  }
}
main();
