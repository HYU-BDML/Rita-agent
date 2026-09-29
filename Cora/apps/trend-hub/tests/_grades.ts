/** 지금 후보들의 판정 등급 분포. 호출 없음. */
import { listCandidates } from '../lib/core/store';
import { allTrends, gradeOf, trendKey } from '../lib/core/trend';

async function main() {
  const trends = await allTrends();
  const cs = (await listCandidates()).filter((c) => c.origin.discoveryId === 'character-native');
  const by = new Map<string, string[]>();
  for (const c of cs) {
    const g = gradeOf(trends.get(trendKey(c))?.points ?? [], c.origin.runAt);
    const k = `${g.label} (${g.days}일)`;
    by.set(k, [...(by.get(k) ?? []), c.subject]);
  }
  for (const [k, names] of [...by].sort()) {
    console.log(`${k.padEnd(14)} ${names.length}건  ${names.slice(0, 6).join(', ')}`);
  }
}
main();
