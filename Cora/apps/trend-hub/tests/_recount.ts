/**
 * 고친 필터로 쌓인 회차를 다시 센다. **호출 없음 — 저장된 것만 읽는다.**
 *
 * 캡션과 썸네일 자막을 **한 corpus 로 합친다.** 자막만으로는 3계정 문구가 0개였는데
 * 캡션과 합치니 40개가 됐다. 자막은 단독 축이 아니라 캡션을 보강하는 축이다.
 *
 * 필터가 무엇을 죽이는지 갈래별로 보여 준다 — 반향 필터가 '픽셀 캐릭터'를 지우고
 * 있었던 것처럼, 나머지 셋도 같은 병이 있는지 눈으로 보려는 자리다.
 */
import { promises as fs } from 'node:fs';
import { listSnapshots } from '../lib/core/store';
import { countPhrases } from '../lib/collect/phrases';
import { dropAdult } from '../lib/collect/safety';
import { withinWindow } from '../lib/discoveries/character-native';
import type { Post } from '../lib/collect/tikhub';
import type { NameDraft } from '../lib/collect/names';

const OCR = (d: string) => `C:/Users/mooja/AppData/Local/Temp/thumb-text-${d}.json`;
const CHAR_QUERIES = ['캐릭터 굿즈', '캐릭터 인형', '요즘 캐릭터', '캐릭터 언박싱', '캐릭터 유행'];
const MEME_QUERIES = ['챌린지', '요즘유행', '밈', '이거뭐야', '따라하기'];

async function ocrMap(d: string): Promise<Map<string, string>> {
  try {
    const rows = JSON.parse(await fs.readFile(OCR(d), 'utf8')) as { id: string; text: string }[];
    return new Map(rows.map((r) => [r.id, r.text]));
  } catch {
    return new Map();
  }
}

function report(label: string, posts: Post[], queries: string[], names: string[]) {
  const r = countPhrases(posts, { queries, names });
  const by = new Map<string, typeof r.dropped>();
  for (const d of r.dropped) by.set(d.why, [...(by.get(d.why) ?? []), d]);
  const accounts = new Set(posts.map((p) => p.authorId || p.authorName));
  console.log(`\n${'═'.repeat(88)}\n${label}`);
  console.log(`게시물 ${posts.length}건 · 계정 ${accounts.size}곳 · 문구 ${r.total.toLocaleString('ko-KR')}개 → 3계정 이상 ${r.dropped.length + r.kept.length}개`);
  console.log(`   남음 ${r.kept.length} · 거름 ${[...by].map(([k, v]) => `${k} ${v.length}`).join(' · ') || '없음'}`);

  console.log(`\n■ 남은 문구 (계정 많은 순)`);
  if (!r.kept.length) console.log('   없음');
  for (const p of r.kept.slice(0, 20)) {
    console.log(`   ${String(p.accounts.length).padStart(2)}계정 ${p.boilerplate ? '[상투어]' : '        '} ${p.text}`);
  }

  for (const [why, list] of by) {
    console.log(`\n■ '${why}' 로 거른 것 ${list.length}개 — 죽여도 되는 것들인가`);
    for (const d of list.sort((a, b) => b.accounts - a.accounts).slice(0, 10)) {
      console.log(`   ${String(d.accounts).padStart(2)}계정  ${d.text}`);
    }
  }
}

async function main() {
  const ocr = await ocrMap('character-native');
  const snaps = await listSnapshots();

  const cn = snaps.filter((s) => s.discoveryId === 'character-native');
  const last = cn[cn.length - 1];
  const raw = last.raw as { posts?: Post[]; drafts?: NameDraft[] };
  const names = [...new Set((raw.drafts ?? []).map((d) => d.name))];
  const posts = dropAdult(withinWindow(raw.posts ?? [], last.at)).kept.map((p) => {
    const t = ocr.get(p.sourceId);
    // 자막을 본문 뒤에 잇는다. 같은 게시물의 두 자리를 한 문서로 본다.
    return t ? { ...p, text: `${p.text} ${t}` } : p;
  });
  console.log(`캡션에 자막을 더한 게시물 ${[...ocr.keys()].length}건`);
  report(`${last.runId} — 캐릭터 회차 (캡션 + 썸네일 자막)`, posts, CHAR_QUERIES, names);

  const mocr = await ocrMap('meme-native');
  for (const m of snaps.filter((s) => s.discoveryId === 'meme-native')) {
    const mraw = m.raw as { posts?: Post[]; drafts?: NameDraft[] };
    const mnames = [...new Set((mraw.drafts ?? []).map((d) => d.name))];
    const mposts = dropAdult(withinWindow(mraw.posts ?? [], m.at)).kept.map((p) => {
      const t = mocr.get(p.sourceId);
      return t ? { ...p, text: `${p.text} ${t}` } : p;
    });
    report(`${m.runId} — 밈 회차 (캡션 + 자막 ${[...mocr.keys()].length}건)`, mposts, MEME_QUERIES, mnames);
  }
}
main();
