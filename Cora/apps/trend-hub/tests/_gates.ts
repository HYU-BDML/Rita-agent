/**
 * 쌓인 후보가 생성기로 넘어갈 수 있나. 못 넘어가면 무엇이 없어서인가.
 *
 * 어댑터가 '쓸 수 있음'인 것과 **실제로 만들 수 있는 것**은 다른 질문이다.
 * 카드뉴스·포스터는 등록되어 있고 키도 있지만, 후보마다 게이트가 따로 막는다.
 * 여기서 그 게이트를 후보 60개에 전부 돌려 무엇이 몇 개를 막는지 센다.
 *
 *   npx tsx --env-file=.env.local tests/_gates.ts
 */

import { listCandidates } from '../lib/core/store';
import { PRODUCERS } from '../lib/core/registry';
import { apiKeyFor } from '../lib/core/dify';
import type { Candidate } from '../lib/core/candidate';

async function main() {
  const cands = await listCandidates();
  console.log(`후보 ${cands.length}개 · 생성기 ${PRODUCERS.length}개\n`);

  // 후보가 어디서 왔나
  const byOrigin = new Map<string, Candidate[]>();
  for (const c of cands) {
    const k = c.origin?.discoveryId ?? '?';
    byOrigin.set(k, [...(byOrigin.get(k) ?? []), c]);
  }
  console.log('── 후보 출처 ──');
  for (const [id, list] of byOrigin) {
    const withUrl = list.filter((c) => (c.evidence ?? []).some((e) => e.url)).length;
    const grounded = list.filter((c) => c.grounded).length;
    console.log(`  ${id.padEnd(18)} ${String(list.length).padStart(3)}개 · ` +
      `evidence[].url 있음 ${withUrl} · grounded ${grounded} · ` +
      `단위 ${[...new Set(list.map((c) => c.unit))].join('·')}`);
  }

  console.log(`\n── 생성기별로 후보 ${cands.length}개를 통과시켜 본다 ──`);
  for (const p of PRODUCERS) {
    const keyOk = !p.keyEnv || Boolean(apiKeyFor(p.keyEnv));
    const head = `  ${p.name} (${p.id})`;
    if (p.held) { console.log(`${head}\n      ✕ 보류: ${p.held}`); continue; }
    if (!keyOk) { console.log(`${head}\n      ○ 키 없음: ${p.keyEnv}`); continue; }

    const unitOk = cands.filter((c) => p.accepts.includes(c.unit));
    const reasons = new Map<string, number>();
    let pass = 0;
    for (const c of unitOk) {
      const g = p.gate(c);
      if (g.ok) pass += 1;
      else reasons.set(g.reason ?? '(사유 없음)', (reasons.get(g.reason ?? '(사유 없음)') ?? 0) + 1);
    }
    console.log(`${head}\n      단위 맞는 후보 ${unitOk.length}개 중 통과 ${pass}개` +
      (cands.length - unitOk.length ? ` · 단위가 안 맞아 애초에 제외 ${cands.length - unitOk.length}개` : ''));
    for (const [why, n] of [...reasons].sort((a, b) => b[1] - a[1])) {
      console.log(`      막힘 ${String(n).padStart(3)}개 — ${why}`);
    }
  }

  // 근거가 없는 후보는 무엇이 없어서인가
  console.log('\n── 근거(evidence[].url) 가 없는 후보 ──');
  const noUrl = cands.filter((c) => !(c.evidence ?? []).some((e) => e.url));
  console.log(`  ${noUrl.length}개 / ${cands.length}개`);
  const byOriginNoUrl = new Map<string, number>();
  for (const c of noUrl) {
    const k = c.origin?.discoveryId ?? '?';
    byOriginNoUrl.set(k, (byOriginNoUrl.get(k) ?? 0) + 1);
  }
  for (const [id, n] of byOriginNoUrl) console.log(`    ${id}: ${n}개`);

  // hint 는 생성기가 요구하는 값이다. 채우는 경로가 없으면 버튼이 영원히 막힌다.
  console.log('\n── hint 채워진 후보 ──');
  const hintKeys = ['imagePrompt', 'motionPrompt', 'negativePrompt', 'ratio'] as const;
  for (const k of hintKeys) {
    const n = cands.filter((c) => (c.hint as Record<string, unknown> | undefined)?.[k]).length;
    console.log(`  ${k.padEnd(16)} ${n}개`);
  }
}

main();
