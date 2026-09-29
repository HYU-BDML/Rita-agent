/**
 * n-gram 문구 세기를 **이미 쌓인 스냅샷**에 돌려 본다. 수집도 LLM 도 부르지 않는다.
 *
 * 밈 회차에 돈을 쓰기 전에 로직이 도는지 확인하는 자리다. 2026-09-17 조사에서
 * 캐릭터 스냅샷 663건에 같은 계산을 했을 때 237개가 나왔고 갈래가 이랬다 —
 * 검색어 반향 60 · 나열 의심 59 · 문법 조각 31 · 캐릭터 이름 7 · 남음 80.
 */
import { listSnapshots } from '../lib/core/store';
import { countPhrases, MIN_ACCOUNTS } from '../lib/collect/phrases';
import { dropAdult } from '../lib/collect/safety';
import { withinWindow } from '../lib/discoveries/character-native';
import type { Post } from '../lib/collect/tikhub';
import type { NameDraft } from '../lib/collect/names';

const CHAR_QUERIES = ['캐릭터 굿즈', '캐릭터 인형', '요즘 캐릭터', '캐릭터 언박싱', '캐릭터 유행', '캐릭터', '굿즈', '인형'];

async function main() {
  const snaps = (await listSnapshots()).filter((s) => s.discoveryId === 'character-native');
  const posts: Post[] = [];
  const names: string[] = [];
  const seen = new Set<string>();
  for (const s of snaps) {
    const raw = s.raw as { posts?: Post[]; drafts?: NameDraft[] };
    for (const p of dropAdult(withinWindow(raw.posts ?? [], s.at)).kept) {
      if (seen.has(p.sourceId)) continue;
      seen.add(p.sourceId);
      posts.push(p);
    }
    for (const d of raw.drafts ?? []) names.push(d.name);
  }
  const accounts = new Set(posts.map((p) => p.authorId || p.authorName));
  console.log(`게시물 ${posts.length}건 · 계정 ${accounts.size}곳 · 이름 ${new Set(names).size}개\n`);

  const r = countPhrases(posts, { queries: CHAR_QUERIES, names: [...new Set(names)] });
  const by = new Map<string, number>();
  for (const d of r.dropped) by.set(d.why, (by.get(d.why) ?? 0) + 1);

  console.log(`전체 문구 ${r.total.toLocaleString('ko-KR')}개 → 계정 ${MIN_ACCOUNTS}곳 이상 ${r.dropped.length + r.kept.length}개`);
  for (const [why, n] of [...by].sort((a, b) => b[1] - a[1])) console.log(`   거름 ${why.padEnd(8)} ${n}`);
  console.log(`   남음            ${r.kept.length} (그중 마케팅 상투어 ${r.kept.filter((k) => k.boilerplate).length})`);

  console.log('\n남은 것 상위 15');
  for (const p of r.kept.slice(0, 15)) {
    console.log(`   계정 ${String(p.accounts.length).padStart(2)} · ${p.platforms.join(',').padEnd(18)} ${p.boilerplate ? '[상투어] ' : ''}${p.text}`);
  }
}
main();
