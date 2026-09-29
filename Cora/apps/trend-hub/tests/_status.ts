/**
 * 지금 무엇이 되고 무엇이 안 되는지 한 장으로.
 * 실행: npx tsx --env-file=.env.local tests/_status.ts
 */
import { readFileSync } from 'node:fs';
import {
  availableDiscoveries,
  availableProducers,
  heldDiscoveries,
  heldProducers,
  hiddenDiscoveries,
  hiddenProducers,
} from '../lib/core/registry';
import { keyStatuses } from '../lib/core/keys';

const db = JSON.parse(readFileSync('data/db.json', 'utf8')) as {
  candidates: { unit: string; review: string }[];
  products: { producerId: string; output?: Record<string, unknown> }[];
  runs: unknown[];
  snapshots: unknown[];
};

function 줄(label: string, items: { id: string; name: string }[]) {
  console.log(`  ${label} ${items.length}${items.length ? ' — ' + items.map((x) => x.name).join(' · ') : ''}`);
}

console.log('── 판정기 ──');
줄('쓸 수 있음', availableDiscoveries());
줄('키 없음  ', hiddenDiscoveries());
줄('세워 둠  ', heldDiscoveries());

console.log('\n── 생성기 ──');
줄('쓸 수 있음', availableProducers());
줄('키 없음  ', hiddenProducers());
줄('세워 둠  ', heldProducers());

const 꽂힘 = keyStatuses().filter((k) => k.set);
console.log(`\n── 키 ${꽂힘.length}/${keyStatuses().length} ──`);
console.log('  꽂힘:', 꽂힘.map((k) => k.env).join(' · '));
console.log('  없음:', keyStatuses().filter((k) => !k.set).map((k) => k.env).join(' · '));

console.log('\n── 쌓인 것 ──');
const 주제 = db.candidates.filter((c) => c.unit === 'topic').length;
const 캐릭터 = db.candidates.filter((c) => c.unit === 'subject').length;
console.log(`  후보 ${db.candidates.length} (주제 ${주제} · 캐릭터 ${캐릭터}) · 회차 ${db.runs.length} · 원본 ${db.snapshots.length}`);

const 구운것 = db.products.filter((p) => {
  const s = (p.output as { 서버?: { slides?: unknown[]; 조각?: string } } | undefined)?.서버;
  return Boolean(s?.slides?.length || s?.조각);
}).length;
console.log(`  제작물 ${db.products.length} — 그중 렌더 서버에 구운 것 ${구운것}`);
for (const [id, n] of Object.entries(
  db.products.reduce<Record<string, number>>((m, p) => ({ ...m, [p.producerId]: (m[p.producerId] ?? 0) + 1 }), {}),
)) {
  console.log(`    ${id}: ${n}`);
}
