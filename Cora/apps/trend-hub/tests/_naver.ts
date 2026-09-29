/**
 * 캐릭터에 네이버 검색 추이를 붙인다 — **규모 기준선**. 뉴스 축과 같은 잣대다.
 *
 * **무료다.** 네이버 오픈 API 라 과금이 없다. 이름당 2콜(올해 9주 + 작년 대비 구간).
 * 순차로 돌아 68건에 2~3분.
 *
 * 점이 0개로 오는 후보(개인 창작 등)는 **null 로 둔다.** 0배로 적으면 거짓말이다 —
 * 검색량이 데이터랩 임계 미만이라 "못 잰 것"이고, 화면은 미터를 아예 안 그린다.
 *
 * 이름마다 **마지막으로 나온 회차**의 스냅샷에 적는다(`_rejudge.ts` 와 같은 규칙).
 */
import { listSnapshots, patchSnapshotRaw, renormalize, key } from '../lib/core/store';
import { characterNativeDiscovery as d, verifiedFrom, pickForTable } from '../lib/discoveries/character-native';
import { trendFor, hasNaver } from '../lib/collect/naver';

const GO = process.argv.includes('--go');

interface Row { name: string; surge: number | null; yoy: number | null; points: number; at: string }

async function main() {
  if (!hasNaver()) return console.log('NAVER_ID / NAVER_SECRET 이 없습니다.');
  const snaps = (await listSnapshots()).filter((s) => s.discoveryId === d.id);

  const last = new Map<string, string>();
  for (const s of snaps) {
    for (const n of pickForTable(verifiedFrom(s.raw, s.at))) last.set(key(n.name), s.runId);
  }

  const plan = new Map<string, string[]>(); // runId → names
  for (const s of snaps) {
    const had = new Set(((s.raw as { trends?: Row[] })?.trends ?? []).map((t) => key(t.name)));
    const mine = pickForTable(verifiedFrom(s.raw, s.at))
      .filter((n) => last.get(key(n.name)) === s.runId && !had.has(key(n.name)))
      .map((n) => n.name);
    if (mine.length) plan.set(s.runId, mine);
  }
  const total = [...plan.values()].reduce((a, b) => a + b.length, 0);
  console.log(`이름 ${total}개 · 네이버 ${total * 2}콜 · **무료** · 약 ${Math.ceil(total * 2.5 / 60)}분`);
  if (!GO) return console.log('견적만 냈습니다. 실제로 부르려면 --go');

  const at = new Date().toISOString();
  let measured = 0;
  for (const [runId, names] of plan) {
    const rows: Row[] = [];
    for (const name of names) {
      try {
        const t = await trendFor(name);
        rows.push({ name, surge: t.surge, yoy: t.yoy, points: t.points, at });
        if (t.surge != null) measured += 1;
        process.stdout.write(`  ${name.slice(0, 12).padEnd(14)}${t.surge ?? '못 잼'}\r`);
      } catch {
        rows.push({ name, surge: null, yoy: null, points: 0, at });
      }
    }
    const had = ((snaps.find((s) => s.runId === runId)!.raw as { trends?: Row[] })?.trends ?? []);
    await patchSnapshotRaw(runId, { trends: [...had, ...rows] });
    console.log(`${runId}  ${rows.length}개 적음`);
  }
  console.log(`\n잰 것 ${measured}/${total} · 못 잰 것 ${total - measured}`);

  const rn = await renormalize(d.id, (raw, ctx) => d.normalize(raw, ctx), (raw, ctx, c) => d.records!(raw, ctx, c));
  console.log(`다시 세움 — 후보 ${rn.before} → ${rn.after} · 레코드 ${rn.posts}건`);
}
main();
