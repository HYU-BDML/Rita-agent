/**
 * `slice(0, 12)` 를 늘리면 무엇이 달라지나. **호출은 count_tokens(무료) 뿐이다.**
 *
 * 저장된 스냅샷에 normalize 규칙만 다시 걸어 세므로 수집도 판정도 다시 하지 않는다.
 */
import Anthropic from '@anthropic-ai/sdk';
import { listSnapshots } from '../lib/core/store';
import { verifiedFrom } from '../lib/discoveries/character-native';
import { observedDay } from '../lib/core/trend';
import { cut } from '../lib/core/text';
import type { VerifiedName } from '../lib/collect/names';

const CAPS = [12, 16, 20, 24, 30, 999];
/** track=전체 로 돌린 회차만. 09-05 는 track=창작 이라 비교 대상이 아니다. */
const TRACK_ALL_FROM = '2026-09-10';

async function main() {
  const snaps = (await listSnapshots()).filter(
    (s) => s.discoveryId === 'character-native' && s.at >= TRACK_ALL_FROM,
  );

  // 같은 날 여러 번 돌린 회차는 마지막 것만 쓴다 (allTrends 와 같은 규칙).
  const byDay = new Map<string, (typeof snaps)[number]>();
  for (const s of snaps) byDay.set(observedDay(s.at), s);
  const days = [...byDay.keys()].sort();
  console.log(`관측일 ${days.length}일: ${days.join(' · ')}\n`);

  const ranked = new Map<string, VerifiedName[]>();
  for (const [day, s] of byDay) ranked.set(day, verifiedFrom(s.raw, s.at));

  console.log('■ 상한을 바꾸면 등급이 어떻게 되나 (지금 쌓인 회차 그대로, 무료로 다시 셈)');
  console.log('   상한   후보(합집합)   2일  3일=확정   확정될 이름');
  for (const cap of CAPS) {
    const dayCount = new Map<string, number>();
    for (const day of days) {
      for (const n of ranked.get(day)!.slice(0, cap)) {
        dayCount.set(n.name, (dayCount.get(n.name) ?? 0) + 1);
      }
    }
    const two = [...dayCount.values()].filter((v) => v === 2).length;
    const three = [...dayCount].filter(([, v]) => v >= 3);
    const label = cap === 999 ? '제한없음' : String(cap);
    console.log(
      `   ${label.padEnd(6)} ${String(dayCount.size).padStart(6)}       ${String(two).padStart(3)}   ${String(three.length).padStart(3)}      ${three.map(([k]) => k).join(', ') || '-'}`,
    );
  }

  console.log('\n■ 12에서 잘린 것들 — 09-18 회차 13~24위');
  const last = ranked.get(days[days.length - 1])!;
  console.log('   순위 이름            계정 플랫폼 조회      확인된자리');
  for (const [i, n] of last.slice(0, 24).entries()) {
    const mark = i < 12 ? '  ' : '✂ ';
    console.log(
      `${mark}${String(i + 1).padStart(3)} ${n.name.padEnd(15)} ${String(n.authors.length).padStart(3)} ` +
        `${n.platforms.join(',').padEnd(7)} ${String(n.views).padStart(8)}  ${n.hits.join('·')}`,
    );
  }
  console.log(`   (이 회차에서 대조를 통과한 이름은 모두 ${last.length}건)`);

  console.log('\n■ 늘리면 LLM 이 얼마나 더 드나 (09-18 회차 기준, count_tokens 실측)');
  const client = new Anthropic();
  for (const cap of [12, 20, 24]) {
    const names = last.slice(0, cap);
    const rights = names
      .map((n) => {
        const lines = [
          `### ${n.name}${n.aliases.length ? ` (다른 표기: ${n.aliases.join(', ')})` : ''}`,
          `확인된 자리: ${n.hits.join('·')} · 계정 ${n.authors.length} · 플랫폼 ${n.platforms.join(',')} · 계정명일치 ${n.selfNamed ? '예' : '아니오'}`,
        ];
        for (const p of n.posts.slice(0, 5)) {
          lines.push(`- [${p.platform}] 계정명 "${p.authorName}" @${p.authorId} · 태그 ${p.tags.join(',') || '-'} · 조회 ${p.views}`);
          lines.push(`  본문: ${cut(p.text.replace(/\s+/g, ' '), 180)}`);
        }
        return lines.join('\n');
      })
      .join('\n\n');
    const summary = names
      .map((n) =>
        `## ${n.name}\n` +
        n.posts
          .map((p) => `- ${p.platform} ${p.authorName}(@${p.authorId}) 본문:${cut(p.text.replace(/\s+/g, ' ').trim(), 300)}`)
          .join('\n'),
      )
      .join('\n\n');

    const [r, s] = await Promise.all([
      client.messages.countTokens({ model: 'claude-opus-5', messages: [{ role: 'user', content: `## 후보와 근거 자료\n\n${rights}` }] }),
      client.messages.countTokens({ model: 'claude-opus-5', messages: [{ role: 'user', content: summary }] }),
    ]);
    const input = r.input_tokens + s.input_tokens;
    // 출력은 후보 수에 거의 비례한다. 09-18 실측(판정 12건 + 요약 12건 = 출력 4,434)을 1건당으로 나눠 쓴다.
    const out = Math.round((4434 / 12) * names.length);
    const usd = (input * 5) / 1e6 + (out * 25) / 1e6;
    console.log(
      `   상한 ${String(cap).padEnd(3)} 후보 ${String(names.length).padStart(2)}건 · 판정 입력 ${String(r.input_tokens).padStart(6)} + 요약 입력 ${String(s.input_tokens).padStart(6)}` +
        ` · 출력 추정 ${String(out).padStart(5)} → 두 호출 합계 약 $${usd.toFixed(3)}`,
    );
  }
  console.log('   ※ 이름 추출(proposeNames)과 TikHub 15콜은 상한과 무관하게 그대로다.');

  console.log('\n■ 날짜별 산출량 — 상한이 실제로 걸리는가');
  for (const day of days) {
    const all = ranked.get(day)!;
    console.log(`   ${day}  대조 통과 ${String(all.length).padStart(2)}건 · 12로 잘린 것 ${Math.max(0, all.length - 12)}건`);
  }

  console.log('\n■ 날짜끼리 얼마나 겹치나 (상한 16)');
  const setOf = (day: string) => new Set(ranked.get(day)!.slice(0, 16).map((n) => n.name));
  for (let i = 0; i < days.length; i++) {
    for (let j = i + 1; j < days.length; j++) {
      const a = setOf(days[i]);
      const b = setOf(days[j]);
      const both = [...a].filter((n) => b.has(n));
      console.log(`   ${days[i]} ∩ ${days[j]}  ${String(both.length).padStart(2)}/${a.size}  ${both.join(', ')}`);
    }
  }

  console.log('\n■ 09-19 에 확정이 될 수 있는 이름 (지금 2일짜리, 상한 16)');
  const cnt = new Map<string, string[]>();
  for (const day of days) for (const n of ranked.get(day)!.slice(0, 16)) cnt.set(n.name, [...(cnt.get(n.name) ?? []), day.slice(5)]);
  for (const [name, ds] of [...cnt].filter(([, v]) => v.length === 2)) {
    console.log(`   ${name.padEnd(15)} ${ds.join(' · ')}`);
  }
}
main();
