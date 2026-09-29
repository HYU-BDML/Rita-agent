/**
 * 레이더를 HTTP 로 읽는 길을 시험한다. 수집하지 않는다 — 이미 판정 끝난 회차를 집어 올 뿐.
 *   RADAR_BASE=http://127.0.0.1:8420 npx tsx tests/_try_radar_http.ts
 */
import { radarDiscovery as d } from '../lib/discoveries/radar';

async function main() {
  const ctx = { runId: 'try', runAt: new Date().toISOString(), mock: false };
  console.log('RADAR_BASE =', process.env.RADAR_BASE || '(없음 — 파일에서 읽는다)');
  console.log('held       =', d.held ?? '아니오 (돌릴 수 있다)');
  const raw = await d.run({}, ctx as never);
  const trends = (raw as { trends?: unknown[] }).trends ?? [];
  console.log(`회차 ${(raw as { runId: string }).runId} · 원본 ${trends.length}건`);
  const cands = d.normalize(raw, ctx as never);
  console.log(`후보 ${cands.length}건:`);
  for (const c of cands.slice(0, 8)) console.log(`   ${c.subject}  ·  ${c.verdict}`);
}
main().catch((e) => { console.error('실패:', e.message); process.exit(1); });
