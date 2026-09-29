/**
 * 저장된 밈 회차에 안전 판정을 소급한다. **수집하지 않는다.** LLM 1회.
 * `_rejudge.ts` 와 같은 규칙: 기본은 견적, 부르려면 --go. 빠진 것만 채운다.
 */
import { listSnapshots, patchSnapshotRaw, renormalize, key } from '../lib/core/store';
import { memeNativeDiscovery as d, memesFrom } from '../lib/discoveries/meme-native';
import { judgeMemeSafety, type SafetyVerdict } from '../lib/collect/meme-safety';

const GO = process.argv.includes('--go');

async function main() {
  const snaps = (await listSnapshots()).filter((s) => s.discoveryId === d.id);
  let called = 0;

  for (const s of snaps) {
    const raw = s.raw as { safety?: SafetyVerdict[] } | null;
    const had = new Set((raw?.safety ?? []).map((v) => key(v.name)));
    const memes = memesFrom(s.raw, s.at);
    const missing = memes.filter((m) => !had.has(key(m.name)));
    console.log(`${s.runId}  후보 ${memes.length}건 · 판정 있음 ${had.size} · 빠진 것 ${missing.length}`);
    if (!missing.length || !GO) continue;

    const r = await judgeMemeSafety(missing.map((m) => ({ name: m.name, posts: m.posts })));
    await patchSnapshotRaw(s.runId, { safety: [...(raw?.safety ?? []), ...r.verdicts] });
    called += 1;
    console.log(
      `   토큰 입력 ${r.usage.input.toLocaleString('ko-KR')} 출력 ${r.usage.output.toLocaleString('ko-KR')}` +
        ` ≈ $${((r.usage.input * 5) / 1e6 + (r.usage.output * 25) / 1e6).toFixed(2)}`,
    );
    for (const v of r.verdicts.sort((a, b) => a.level.localeCompare(b.level))) {
      const mark = v.level === 'blocked' ? '⛔' : v.level === 'flagged' ? '⚠ ' : '  ';
      console.log(`   ${mark} ${v.name.padEnd(22)} ${v.reason}`);
      if (v.evidence) console.log(`        근거: "${v.evidence.slice(0, 70)}"`);
    }
  }

  if (!GO) return console.log('\n견적만 냈습니다. 실제로 부르려면 --go');
  if (!called) return;
  const rn = await renormalize(d.id, (raw, ctx) => d.normalize(raw, ctx), (raw, ctx, c) => d.records!(raw, ctx, c));
  console.log(`\n다시 세움 — 후보 ${rn.before} → ${rn.after} · 레코드 ${rn.posts}건`);
}
main();
