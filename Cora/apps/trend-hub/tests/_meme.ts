/**
 * 밈 회차 결과를 한 장으로 본다. **저장된 스냅샷만 읽는다 — 호출 없음.**
 *
 * 판단 기준은 하나다: 네 갈래를 거르고 **따라 쓰는 말이 남았나.**
 * 남은 것이 전부 마케팅 상투어라면 그건 밈이 아니라 장사 문구다.
 */
import { listSnapshots } from '../lib/core/store';
import { phrasesFrom, MAX_MEMES } from '../lib/discoveries/meme-native';
import type { Post } from '../lib/collect/tikhub';

async function main() {
  const snaps = (await listSnapshots()).filter((s) => s.discoveryId === 'meme-native');
  if (!snaps.length) {
    console.log('밈 회차가 없습니다.');
    return;
  }
  const s = snaps[snaps.length - 1];
  const raw = s.raw as { posts?: Post[]; queries?: string[]; calls?: number; ok?: { platform: string; query: string; count: number }[]; failed?: { platform: string; query: string; reason: string }[]; usage?: { input: number; output: number } };
  const posts = raw.posts ?? [];
  const accounts = new Set(posts.map((p) => p.authorId || p.authorName));

  console.log(`${s.runId}`);
  console.log(`검색어: ${(raw.queries ?? []).join(' · ')}`);
  console.log(`게시물 ${posts.length}건 · 계정 ${accounts.size}곳 · TikHub ${raw.calls ?? 0}콜`);
  if (raw.usage) {
    const usd = (raw.usage.input * 5) / 1e6 + (raw.usage.output * 25) / 1e6;
    console.log(`이름 추출 토큰 입력 ${raw.usage.input.toLocaleString('ko-KR')} 출력 ${raw.usage.output.toLocaleString('ko-KR')} (약 $${usd.toFixed(2)})`);
  }
  for (const f of raw.failed ?? []) console.log(`  ⚠ 실패 ${f.platform}/${f.query}: ${f.reason.slice(0, 60)}`);
  const byQuery = new Map<string, number>();
  for (const o of raw.ok ?? []) byQuery.set(o.query, (byQuery.get(o.query) ?? 0) + o.count);
  console.log(`검색어별 수확: ${[...byQuery].map(([q, n]) => `${q} ${n}`).join(' · ')}\n`);

  const r = phrasesFrom(s.raw, s.at);
  const by = new Map<string, number>();
  for (const d of r.dropped) by.set(d.why, (by.get(d.why) ?? 0) + 1);

  console.log(`전체 문구 ${r.total.toLocaleString('ko-KR')}개 → 계정 3곳 이상 ${r.dropped.length + r.kept.length}개`);
  for (const [why, n] of [...by].sort((a, b) => b[1] - a[1])) console.log(`   거름 ${why.padEnd(8)} ${n}`);
  const boiler = r.kept.filter((k) => k.boilerplate).length;
  console.log(`   남음            ${r.kept.length}  (마케팅 상투어 ${boiler} · 나머지 ${r.kept.length - boiler})`);

  console.log(`\n■ 표에 오르는 것 (상한 ${MAX_MEMES})`);
  if (!r.kept.length) console.log('   없음');
  for (const p of r.kept.slice(0, MAX_MEMES)) {
    console.log(
      `   계정 ${String(p.accounts.length).padStart(2)} · ${p.platforms.join(',').padEnd(20)} 조회 ${String(p.views).padStart(8)}  ${p.boilerplate ? '[상투어] ' : ''}${p.text}`,
    );
  }

  console.log('\n■ 거른 것 중 계정이 많았던 것 10개 (필터가 과했는지 보는 자리)');
  for (const d of r.dropped.sort((a, b) => b.accounts - a.accounts).slice(0, 10)) {
    console.log(`   계정 ${String(d.accounts).padStart(2)} · ${d.why.padEnd(8)} ${d.text}`);
  }
}
main();
