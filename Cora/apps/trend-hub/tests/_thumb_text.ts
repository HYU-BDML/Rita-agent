/**
 * 썸네일에 박힌 자막을 읽어 밈 문구를 센다. **캡션이 아니라 첫 화면 글자를 본다.**
 *
 * 캡션 n-gram 은 0건이었고(2026-09-18) 사운드도 0건이었다(09-19). 남은 자리가 여기다 —
 * 밈 문구는 영상 첫 화면에 박히고, 우리는 썸네일 URL 을 이미 갖고 있다.
 *
 * 세는 로직은 새로 만들지 않는다. `phrases.ts` 의 네 갈래 필터를 그대로 쓰고
 * **입력만 캡션에서 자막으로 바꾼다.** 같은 문구를 3계정 이상이 쓰면 밈이다.
 *
 * 기본은 견적. 부르려면 --go.
 */
import { promises as fs } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { listSnapshots } from '../lib/core/store';
import { countPhrases } from '../lib/collect/phrases';
import type { Post } from '../lib/collect/tikhub';
import type { NameDraft } from '../lib/collect/names';

const GO = process.argv.includes('--go');
const MODEL = 'claude-opus-5';
const BATCH = 8;
/** 어느 판정기의 회차를 볼까. 밈 회차와 캐릭터 회차가 검색어가 달라 반향 필터도 달라진다. */
const DISCOVERY = process.argv.find((a) => a === 'meme-native' || a === 'character-native') ?? 'character-native';
const OUT = `C:/Users/mooja/AppData/Local/Temp/thumb-text-${DISCOVERY}.json`;
const QUERIES: Record<string, string[]> = {
  'character-native': ['캐릭터 굿즈', '캐릭터 인형', '요즘 캐릭터', '캐릭터 언박싱', '캐릭터 유행'],
  'meme-native': ['챌린지', '요즘유행', '밈', '이거뭐야', '따라하기'],
};

const SYSTEM = `너는 영상 썸네일에 **박혀 있는 글자**를 그대로 옮기는 추출기다.

- 화면에 얹힌 자막·제목만 옮긴다. 줄바꿈은 공백 하나로 바꾼다.
- 상품 포장지·간판·배경에 원래 있던 글자는 옮기지 않는다. 영상 제작자가 얹은 글자만이다.
- 없으면 빈 문자열. 억지로 채우지 않는다.
- 해석하거나 설명하지 않는다. 글자만.
- 각 이미지 앞에 붙은 번호를 그대로 돌려준다.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['i', 'text'],
        properties: { i: { type: 'number' }, text: { type: 'string' } },
      },
    },
  },
} as const;

async function grab(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer()).toString('base64');
  } catch {
    return null;
  }
}

async function main() {
  const snaps = (await listSnapshots()).filter((s) => s.discoveryId === DISCOVERY);
  const snap = snaps[snaps.length - 1];
  const raw = snap.raw as { posts?: Post[]; drafts?: NameDraft[] };
  const targets = (raw.posts ?? []).filter(
    (p) => p.platform === 'tiktok' && p.thumbnail && /[가-힣]/.test(p.text || ''),
  );
  console.log(`${snap.runId} (${DISCOVERY})\n한글 틱톡 게시물 중 썸네일 있는 것 ${targets.length}건 · 배치 ${BATCH}장`);
  const calls = Math.ceil(targets.length / BATCH);
  console.log(`호출 ${calls}회 · 이미지 ${targets.length}장 × 약 588토큰 = 약 $${((targets.length * 588 * 5) / 1e6 + (targets.length * 30 * 25) / 1e6).toFixed(2)}\n`);
  if (!GO) {
    console.log('견적만 냈습니다. 실제로 부르려면 --go');
    return;
  }

  console.log('썸네일 받는 중…');
  const imgs: { post: Post; b64: string }[] = [];
  for (let i = 0; i < targets.length; i += 10) {
    const part = await Promise.all(targets.slice(i, i + 10).map(async (p) => ({ post: p, b64: await grab(p.thumbnail!) })));
    for (const x of part) if (x.b64) imgs.push({ post: x.post, b64: x.b64 });
  }
  console.log(`받음 ${imgs.length}/${targets.length}장\n`);

  const client = new Anthropic();
  const texts: { post: Post; text: string }[] = [];
  let usedIn = 0;
  let usedOut = 0;

  for (let b = 0; b < imgs.length; b += BATCH) {
    const part = imgs.slice(b, b + BATCH);
    const content: Anthropic.MessageParam['content'] = [];
    part.forEach((x, k) => {
      content.push({ type: 'text', text: `### ${b + k}` });
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: x.b64 } });
    });
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM,
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content }],
    });
    usedIn += res.usage.input_tokens;
    usedOut += res.usage.output_tokens;
    for (const blk of res.content) {
      if (blk.type !== 'text') continue;
      const parsed = JSON.parse(blk.text) as { items?: { i: number; text: string }[] };
      for (const it of parsed.items ?? []) {
        const hit = imgs[it.i];
        if (hit && it.text?.trim()) texts.push({ post: hit.post, text: it.text.trim() });
      }
      break;
    }
    process.stdout.write(`  ${Math.min(b + BATCH, imgs.length)}/${imgs.length}\r`);
  }
  console.log(`\n자막이 있던 것 ${texts.length}/${imgs.length}장 · 토큰 입력 ${usedIn.toLocaleString('ko-KR')} 출력 ${usedOut.toLocaleString('ko-KR')} · 약 $${((usedIn * 5) / 1e6 + (usedOut * 25) / 1e6).toFixed(2)}\n`);

  await fs.writeFile(OUT, JSON.stringify(texts.map((t) => ({ id: t.post.sourceId, account: t.post.authorId, url: t.post.url, thumbnail: t.post.thumbnail, text: t.text })), null, 2), 'utf8');
  console.log(`자막 원본 저장: ${OUT}\n`);

  console.log('■ 뽑힌 자막 (계정 · 자막)');
  for (const t of texts.slice(0, 30)) console.log(`   @${(t.post.authorId || '?').slice(0, 16).padEnd(17)} ${t.text.slice(0, 60)}`);
  if (texts.length > 30) console.log(`   … 외 ${texts.length - 30}건`);

  // 캡션 대신 자막을 본문 자리에 넣는다. 세는 로직은 그대로다.
  const asPosts: Post[] = texts.map((t) => ({ ...t.post, text: t.text }));
  const names = [...new Set((raw.drafts ?? []).map((d) => d.name))];
  const r = countPhrases(asPosts, { queries: QUERIES[DISCOVERY] ?? [], names });
  const by = new Map<string, number>();
  for (const d of r.dropped) by.set(d.why, (by.get(d.why) ?? 0) + 1);

  console.log(`\n■ 문구 세기 — 전체 ${r.total.toLocaleString('ko-KR')}개 → 계정 3곳 이상 ${r.dropped.length + r.kept.length}개`);
  for (const [why, n] of [...by].sort((a, b) => b[1] - a[1])) console.log(`   거름 ${why.padEnd(8)} ${n}`);
  console.log(`   남음            ${r.kept.length} (마케팅 상투어 표시 ${r.kept.filter((k) => k.boilerplate).length})`);
  for (const p of r.kept) {
    console.log(`\n   ▶ "${p.text}"  — 계정 ${p.accounts.length}곳 · ${p.platforms.join(',')}`);
    for (const x of p.posts.slice(0, 4)) console.log(`       @${x.authorId}  ${x.url}`);
  }
  if (r.dropped.length) {
    console.log('\n■ 거른 것 (계정 많은 순 10개)');
    for (const d of r.dropped.sort((a, b) => b.accounts - a.accounts).slice(0, 10)) {
      console.log(`   계정 ${String(d.accounts).padStart(2)} · ${d.why.padEnd(8)} ${d.text}`);
    }
  }
}
main();
