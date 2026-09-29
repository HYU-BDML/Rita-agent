/**
 * 캐릭터 출신을 분류해 스냅샷에 소급한다. **수집하지 않는다.** LLM 1회.
 *
 * 후보 행은 회차마다 덮어써지므로, 이름마다 **마지막으로 나온 회차**의 스냅샷에만 적는다
 * (`_rejudge.ts` 와 같은 규칙). 기본은 견적, 부르려면 --go.
 */
import { listSnapshots, listCandidates, patchSnapshotRaw, renormalize, key } from '../lib/core/store';
import { characterNativeDiscovery as d, verifiedFrom, pickForTable } from '../lib/discoveries/character-native';
import { classifyLineage, type LineageVerdict } from '../lib/collect/lineage';

const GO = process.argv.includes('--go');

async function main() {
  const snaps = (await listSnapshots()).filter((s) => s.discoveryId === d.id);
  const cands = (await listCandidates()).filter((c) => c.origin.discoveryId === d.id);
  const byName = new Map(cands.map((c) => [key(c.subject), c]));

  // 이름 → 마지막 회차. 앞 회차에 적어도 renormalize 가 덮어쓴다.
  const last = new Map<string, string>();
  for (const s of snaps) {
    for (const n of pickForTable(verifiedFrom(s.raw, s.at))) last.set(key(n.name), s.runId);
  }

  let total = { input: 0, output: 0 };
  const all: LineageVerdict[] = [];

  for (const s of snaps) {
    const raw = s.raw as { lineages?: LineageVerdict[] } | null;
    const had = new Set((raw?.lineages ?? []).map((l) => key(l.name)));
    const mine = pickForTable(verifiedFrom(s.raw, s.at))
      .filter((n) => last.get(key(n.name)) === s.runId && !had.has(key(n.name)))
      .map((n) => byName.get(key(n.name)))
      .filter((c): c is NonNullable<typeof c> => Boolean(c));
    if (!mine.length) continue;

    console.log(`${s.runId}  분류할 것 ${mine.length}건`);
    if (!GO) continue;

    const r = await classifyLineage(
      mine.map((c) => ({
        name: c.subject,
        ownership: c.rights.ownership ?? 'unknown',
        summary: c.summary ?? '',
        evidence: c.evidence.map((e) => e.title),
      })),
    );
    await patchSnapshotRaw(s.runId, { lineages: [...(raw?.lineages ?? []), ...r.verdicts] });
    total.input += r.usage.input;
    total.output += r.usage.output;
    all.push(...r.verdicts);
  }

  if (!GO) return console.log('\n견적만 냈습니다. 실제로 부르려면 --go');
  if (!all.length) return console.log('새로 분류할 것이 없습니다.');

  console.log(
    `\n토큰 입력 ${total.input.toLocaleString('ko-KR')} 출력 ${total.output.toLocaleString('ko-KR')}` +
      ` ≈ $${((total.input * 5) / 1e6 + (total.output * 25) / 1e6).toFixed(3)}`,
  );

  const byKind = new Map<string, LineageVerdict[]>();
  for (const v of all) byKind.set(v.kind, [...(byKind.get(v.kind) ?? []), v]);
  console.log('\n■ 갈래별');
  for (const [kind, list] of [...byKind].sort((a, b) => b[1].length - a[1].length)) {
    const guess = list.filter((v) => v.basis === '지식').length;
    console.log(`   ${kind.padEnd(8)} ${String(list.length).padStart(2)}건  (자료 ${list.length - guess} · 지식 ${guess})`);
    for (const v of list.sort((a, b) => b.confidence - a.confidence).slice(0, 8)) {
      console.log(`      ${v.name.slice(0, 16).padEnd(18)}${v.work.slice(0, 24).padEnd(26)}${v.basis}  ${v.confidence.toFixed(2)}`);
    }
    if (list.length > 8) console.log(`      … 외 ${list.length - 8}건`);
  }

  const rn = await renormalize(d.id, (raw, ctx) => d.normalize(raw, ctx), (raw, ctx, c) => d.records!(raw, ctx, c));
  console.log(`\n다시 세움 — 후보 ${rn.before} → ${rn.after} · 레코드 ${rn.posts}건`);
}
main();
