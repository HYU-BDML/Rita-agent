import { trendFor, hasNaver } from '../lib/collect/naver';

async function main() {
  console.log('네이버 키:', hasNaver() ? '있음' : '없음');
  for (const k of ['불꽃축제', '제로슈가', '로또', '저속노화']) {
    const t = await trendFor(k);
    console.log(
      `  ${k.padEnd(10)} 최근/평소 ${String(t.surge ?? '-').padStart(5)}  작년비 ${String(t.yoy ?? '-').padStart(5)}  자료 ${t.points}점`,
    );
  }
}
main();
