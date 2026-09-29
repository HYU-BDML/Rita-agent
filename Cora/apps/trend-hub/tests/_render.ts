/**
 * 렌더 서버가 무엇을 아는지 물어본다.
 * 실행: npx tsx --env-file=.env.local tests/_render.ts
 *
 * 무료 티어라 자고 있으면 첫 요청이 20초쯤 걸린다. 기다리는 게 정상이다.
 */
import { health, renderBase } from '../lib/core/render';

async function main() {
  console.log('주소:', renderBase() ?? '(RENDER_BASE 없음)');
  const t = Date.now();
  const h = await health();
  console.log(`깨우는 데 ${((Date.now() - t) / 1000).toFixed(1)}초`);
  console.log('서비스:', h.service, '· 빌드:', h.build, '· ok:', h.ok);
  console.log(`틀 ${h.templates.length}종:`, h.templates.join(' · '));
  console.log(`겉모습 ${h.styles.length}벌:`, h.styles.join(' · '));
}

main().catch((e) => {
  console.log('실패:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
