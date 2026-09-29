/**
 * 밈 회차 한 장 — 재검색 분포와 문턱 판단 재료. **호출 없음.**
 *
 * `MAX_RESEARCH` 를 줄여도 되는지는 **통과한 이름이 몇 번째에 있었나**로 정한다.
 * 이름 순서는 verifyFormats 가 준 순서(= LLM 제안 순서)라, 통과한 것이 전부
 * 앞쪽에 몰려 있으면 상한을 낮춰도 안전하다.
 */
import { listSnapshots } from '../lib/core/store';
import { memesFrom, MIN_MEME_AUTHORS, MAX_RESEARCH } from '../lib/discoveries/meme-native';
import type { Post } from '../lib/collect/tikhub';

interface Hit { name: string; kind: string; posts: Post[]; searched: number }

async function main() {
  const snaps = (await listSnapshots()).filter((s) => s.discoveryId === 'meme-native');
  if (!snaps.length) return console.log('밈 회차가 없습니다.');
  const s = snaps[snaps.length - 1];
  const raw = s.raw as { posts?: Post[]; ocr?: Record<string, string>; drafts?: unknown[]; searches?: Hit[]; calls?: number; usage?: { input: number; output: number }; summaries?: { name: string }[] };
  const searches = raw.searches ?? [];

  console.log(`${s.runId}`);
  console.log(`씨앗 ${raw.posts?.length ?? 0}건 · 자막 ${Object.keys(raw.ocr ?? {}).length}건 · 이름 제안 ${raw.drafts?.length ?? 0}개 · 재검색 ${searches.length}개`);
  console.log(`TikHub ${raw.calls ?? 0}콜`);
  if (raw.usage) {
    const usd = (raw.usage.input * 5) / 1e6 + (raw.usage.output * 25) / 1e6;
    console.log(`LLM(이름+요약) 입력 ${raw.usage.input.toLocaleString('ko-KR')} 출력 ${raw.usage.output.toLocaleString('ko-KR')} ≈ $${usd.toFixed(2)} (OCR 별도)`);
  }

  const rows = searches.map((h, i) => {
    const acc = new Set(h.posts.map((p) => p.authorId || p.authorName)).size;
    return { i, name: h.name, kind: h.kind, searched: h.searched, matched: h.posts.length, acc };
  });

  console.log(`\n■ 재검색 계정 수 분포 (제안 순서대로 — 이 순서가 MAX_RESEARCH 로 잘린다)`);
  console.log(`   ${'#'.padStart(3)} ${'이름'.padEnd(24)}유형        검색 대조 계정  통과`);
  for (const r of rows) {
    console.log(
      `   ${String(r.i + 1).padStart(3)} ${r.name.slice(0, 23).padEnd(25)}${r.kind.padEnd(12)}${String(r.searched).padStart(4)}${String(r.matched).padStart(5)}${String(r.acc).padStart(5)}  ${r.acc >= MIN_MEME_AUTHORS ? '★' : ''}`,
    );
  }

  const pass = rows.filter((r) => r.acc >= MIN_MEME_AUTHORS);
  console.log(`\n■ 문턱 N=${MIN_MEME_AUTHORS} 통과 ${pass.length}개 / 재검색 ${rows.length}개 (상한 ${MAX_RESEARCH})`);
  for (const n of [2, 3, 4, 5]) {
    console.log(`   N=${n} → ${rows.filter((r) => r.acc >= n).length}개`);
  }
  if (pass.length) {
    const last = Math.max(...pass.map((r) => r.i)) + 1;
    console.log(`\n■ 통과한 것 중 가장 뒤 순번: ${last}번째`);
    console.log(`   → MAX_RESEARCH 를 ${last} 로 줄여도 이번 회차 결과는 같다. 여유를 두면 ${Math.min(MAX_RESEARCH, last + 5)}.`);
    console.log(`   (지금 ${rows.length}콜 중 ${rows.length - last}콜이 헛돈 셈이다 ≈ $${((rows.length - last) * 0.03).toFixed(2)})`);
  }

  console.log(`\n■ 후보로 세워진 것 (normalize 기준)`);
  for (const m of memesFrom(s.raw, s.at)) {
    const acc = [...new Set(m.posts.map((p) => p.authorId))];
    console.log(`   ${m.name.padEnd(24)} 계정 ${String(acc.length).padStart(2)}곳 · ${[...new Set(m.posts.map((p) => p.platform))].join(',')}`);
    for (const p of m.posts.slice(0, 2)) console.log(`        @${(p.authorId || '?').slice(0, 16).padEnd(17)} ${p.text.replace(/\s+/g, ' ').slice(0, 56)}`);
  }
}
main();
