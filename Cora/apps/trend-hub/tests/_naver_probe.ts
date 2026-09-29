/** 캐릭터 이름으로 네이버 데이터랩이 값을 주는지 본다. 무료 API, 호출 6회. */
import { trendFor } from '../lib/collect/naver';

async function main() {
  const names = ['치이카와', '리락쿠마', '토랩이', '火猫', '짱구', '쿠로미'];
  for (const n of names) {
    const t = await trendFor(n);
    console.log(
      `${n.padEnd(10)} surge=${t.surge ?? '-'}  yoy=${t.yoy ?? '-'}  점 ${t.points}개`,
    );
  }
}
main();
