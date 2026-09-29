/**
 * 판정이 빠진 후보에 권리 판정을 소급한다. **수집하지 않는다.**
 *
 * 상한을 12 → 16 으로 올리면서 새로 후보가 된 이름들은 그 회차에 `judgeRights` 를
 * 상위 12건에만 물었던 탓에 판정이 없다. 등급은 "확정"인데 권리는 "판정 전"인 카드가
 * 생긴다 — 화면에서 앞뒤가 안 맞는다.
 *
 * `_summarize.ts` 와 같은 규칙: 기본은 견적, 부르려면 `--go`.
 */
import Anthropic from '@anthropic-ai/sdk';
import { listSnapshots, patchSnapshotRaw, renormalize, key } from '../lib/core/store';
import { characterNativeDiscovery as d, verifiedFrom, pickForTable } from '../lib/discoveries/character-native';
import { judgeRights, type RightsVerdict } from '../lib/collect/rights';

const GO = process.argv.includes('--go');

async function main() {
  const snaps = (await listSnapshots()).filter((s) => s.discoveryId === d.id);
  let called = 0;

  /*
   * **같은 이름은 마지막 회차에서만 판정한다.**
   *
   * `renormalize` 는 스냅샷을 오래된 것부터 훑으며 같은 이름을 덮어쓴다. 그러니 표에
   * 남는 행은 그 이름이 **마지막으로 나온 회차**의 것이다. 앞 회차에서 판정을 사도
   * 곧바로 덮여 사라진다 — 09-05 의 이름을 판정해 놓고 09-18 것으로 갈아 끼우는 식이다.
   *
   * 대신 옛 회차에는 판정이 빈 채로 남는다. 나중에 규칙을 고쳐 그 행이 되살아나면
   * '판정 전'으로 보인다. 그때 이 스크립트를 다시 돌리면 된다.
   */
  const lastSeen = new Map<string, string>();
  for (const s of snaps) {
    for (const n of pickForTable(verifiedFrom(s.raw, s.at))) lastSeen.set(key(n.name), s.runId);
  }

  for (const s of snaps) {
    const raw = s.raw as { verdicts?: RightsVerdict[] } | null;
    const had = new Set((raw?.verdicts ?? []).map((v) => key(v.name)));
    const names = pickForTable(verifiedFrom(s.raw, s.at));
    const missing = names.filter((n) => !had.has(key(n.name)) && lastSeen.get(key(n.name)) === s.runId);
    const head = `${s.runId}  후보 ${names.length}건 · 판정 있음 ${had.size} · 빠진 것 ${missing.length}`;

    if (!missing.length) {
      console.log(`${head}  → 건너뜀`);
      continue;
    }
    console.log(`${head}  → ${missing.map((n) => n.name).join(', ')}`);
    if (!GO) continue;

    // 빠진 것만 물어본다. 이미 판정된 것을 다시 사지 않는다.
    const r = await judgeRights(missing);
    const merged = [...(raw?.verdicts ?? []), ...r.verdicts];
    const ok = await patchSnapshotRaw(s.runId, { verdicts: merged });
    called += 1;
    console.log(
      `    → 판정 ${r.verdicts.length}건 · 토큰 입력 ${r.usage.input.toLocaleString('ko-KR')} 출력 ${r.usage.output.toLocaleString('ko-KR')}` +
        (ok ? '' : ' · ⚠ 스냅샷에 못 썼습니다'),
    );
    for (const v of r.verdicts) console.log(`       ${v.name}: ${v.ownership} (확신 ${v.confidence})`);
  }

  if (!GO) {
    console.log('\n견적만 냈습니다. 아무것도 부르지 않았습니다. 실제로 돌리려면 --go');
    return;
  }
  if (!called) return;

  const rn = await renormalize(
    d.id,
    (raw, ctx) => d.normalize(raw, ctx),
    (raw, ctx, cands) => d.records!(raw, ctx, cands),
  );
  console.log(`\n다시 세움 — 후보 ${rn.before} → ${rn.after} · 레코드 ${rn.posts}건`);
}
main();
