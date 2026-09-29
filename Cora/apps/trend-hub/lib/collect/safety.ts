import type { Post } from './tikhub';

/**
 * 19금 걸러내기.
 *
 * 캐릭터 검색어(자캐·팬아트·2차창작)는 성인 창작물이 같이 딸려 오는 자리다.
 * 그걸 후보로 올리면 권리 판정을 사서 붙이고, 포스터 프롬프트로 넘어가고,
 * 화면에 썸네일이 뜬다. 어느 단계에서 막아도 늦다 — 수집 직후에 버린다.
 *
 * 두 곳에서 같은 함수를 쓴다:
 *   run()       — LLM 에 넣기 전에 버린다. 토큰과 돈이 안 나간다.
 *   normalize() — 규칙이므로 저장된 원본에도 다시 적용된다. 옛 회차를 다시 판정하면 같이 걸러진다.
 *
 * 완벽하지 않다. 글자만 보고 그림은 못 본다. 놓치는 것보다 과하게 버리는 쪽으로 기울여 두었다.
 */

/** 태그는 통째로 맞춰 본다. 본문보다 신호가 세고 오탐이 적다. */
const ADULT_TAGS = new Set([
  'nsfw',
  'r18',
  'r18g',
  'r-18',
  '18',
  '18plus',
  '18금',
  '19금',
  '19',
  'adultart',
  'nsfwart',
  'hentai',
  'ecchi',
  'lewd',
  'ahegao',
  'futanari',
  'porn',
  'xxx',
  'onlyfans',
  'fansly',
  '성인만화',
  '성인웹툰',
  '야짤',
  '후방주의',
]);

/**
 * 본문에서 찾는 말.
 *
 * 짧은 낱말 하나로 판단하지 않는다 — '성인'은 성인식·성인용품에도 붙고,
 * 'nude' 는 nude color(색 이름)에도 붙는다. 뜻이 갈리지 않는 것만 넣는다.
 */
const ADULT_TEXT = [
  /\bnsfw\b/i,
  /\br-?18\b/i,
  /\b18\s*\+/,
  /\bhentai\b/i,
  /\blewd\b/i,
  /\bahegao\b/i,
  /\bfutanari\b/i,
  /\bexplicit\s+(?:content|art)\b/i,
  /\buncensored\b/i,
  /\bonlyfans\b/i,
  /\bfansly\b/i,
  /19\s*금/,
  /18\s*금/,
  /성인\s*(?:물|웹툰|만화|콘텐츠|채널)/,
  /야한\s*(?:그림|만화|짤)/,
  /야짤/,
  /후방\s*주의/,
  /음란/,
  /노출\s*수위/,
];

function tagKey(t: string): string {
  return t.replace(/^#/, '').trim().toLowerCase();
}

/** 이 게시물이 19금으로 보이는 이유들. 비어 있으면 통과다. */
export function adultHits(post: Pick<Post, 'text' | 'title' | 'tags'>): string[] {
  const hits: string[] = [];
  for (const t of post.tags ?? []) {
    const k = tagKey(t);
    if (ADULT_TAGS.has(k)) hits.push(`#${k}`);
  }
  const body = `${post.title ?? ''} ${post.text ?? ''}`;
  for (const re of ADULT_TEXT) {
    const m = body.match(re);
    if (m) hits.push(m[0].trim());
  }
  return [...new Set(hits)];
}

export function isAdult(post: Pick<Post, 'text' | 'title' | 'tags'>): boolean {
  return adultHits(post).length > 0;
}

/**
 * 걸러내고, 몇 건을 왜 버렸는지 같이 돌려준다.
 * 조용히 사라지면 수집이 적게 된 건지 걸러진 건지 구분이 안 된다.
 */
export function dropAdult<T extends Pick<Post, 'text' | 'title' | 'tags'>>(
  posts: T[],
): { kept: T[]; dropped: number; reasons: string[] } {
  const kept: T[] = [];
  const reasons = new Set<string>();
  let dropped = 0;
  for (const p of posts) {
    const hits = adultHits(p);
    if (hits.length) {
      dropped += 1;
      for (const h of hits) reasons.add(h);
      continue;
    }
    kept.push(p);
  }
  return { kept, dropped, reasons: [...reasons] };
}

/** 이름 자체가 19금 표지인 경우. 게시물은 멀쩡한데 이름만 그런 경우가 있다. */
export function isAdultName(name: string): boolean {
  const k = name.trim().toLowerCase();
  if (ADULT_TAGS.has(k.replace(/\s+/g, ''))) return true;
  return ADULT_TEXT.some((re) => re.test(name));
}
