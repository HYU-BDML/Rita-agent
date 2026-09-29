/** 레이더 회차가 이 앱의 게이트를 통과하나. 실제 파일로 확인한다. */
import { radarDiscovery } from '../lib/discoveries/radar';
import { cardnewsNativeProducer } from '../lib/producers/cardnews-native';
import { posterNativeProducer } from '../lib/producers/poster-native';

async function main() {
  const raw = await radarDiscovery.run({ runId: '' }, { runId: 'check', runAt: new Date().toISOString(), mock: false });
  const cands = radarDiscovery.normalize(raw, { runId: 'check', runAt: new Date().toISOString(), mock: false });
  console.log(`회차 ${(raw as any).runId} · 후보 ${cands.length}개\n`);
  for (const c of cands) {
    const card = cardnewsNativeProducer.gate(c);
    const poster = posterNativeProducer.accepts.includes(c.unit) ? posterNativeProducer.gate(c) : { ok: false, reason: '단위 안 맞음' };
    console.log(`  ${c.subject}`);
    console.log(`    ${c.verdict} · 근거 ${c.evidence.length}건 · grounded ${c.grounded}`);
    console.log(`    왜: ${c.why.slice(0, 70)}`);
    console.log(`    카드뉴스 ${card.ok ? '통과' : '막힘 — ' + card.reason}`);
    console.log(`    포스터   ${poster.ok ? '통과' : '막힘 — ' + poster.reason}`);
  }
}
main();
