import Anthropic from '@anthropic-ai/sdk';
import { cut } from '../core/text';
import type { Post } from './tikhub';

/**
 * 게시물에서 캐릭터 이름 후보를 뽑고, 원문 대조로 환각을 거른다.
 *
 * LLM 은 '이름처럼 보이는 문자열'을 제안만 한다. 그 문자열이 실제로 원문에 있는지,
 * 몇 계정이 말했는지는 코드가 센다. 기존 Dify 의 names → verify 와 같은 구조다.
 */

const MODEL = 'claude-opus-5';

export type EntityType =
  | 'character_candidate'
  | 'creator'
  | 'brand'
  | 'hashtag'
  | 'meme_audio'
  | 'ambiguous';

export interface NameDraft {
  name: string;
  aliases: string[];
  entityType: EntityType;
  foundIn: string;
  confidence: number;
  sourceIds: string[];
  evidence: string;
  why: string;
}

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
        required: ['name', 'entity_type', 'found_in', 'confidence', 'source_ids', 'evidence', 'why'],
        properties: {
          name: { type: 'string' },
          aliases: { type: 'array', items: { type: 'string' } },
          entity_type: {
            type: 'string',
            enum: ['character_candidate', 'creator', 'brand', 'hashtag', 'meme_audio', 'ambiguous'],
          },
          found_in: { type: 'string', enum: ['계정명', '태그', '본문', '제목'] },
          confidence: { type: 'number' },
          source_ids: { type: 'array', items: { type: 'string' } },
          evidence: { type: 'string', description: '원문 문자열을 그대로 옮긴다.' },
          why: { type: 'string' },
        },
      },
    },
  },
} as const;

const systemFor = (max: number): string => `너는 소셜 게시물에서 이름처럼 보이는 문자열을 제안하는 추출기다.
최종 판정은 다음 코드 단계가 하므로, 추측을 사실처럼 확정하지 않는다.

## 찾아야 하는 위치
계정 표시명·핸들, 해시태그, 본문을 모두 본다. 각 행 앞의 source_id 를 보존한다.
계정 표시명이 곧 캐릭터명인 경우가 개인 창작 캐릭터의 전형이다. 해시태그만 보면 이 계열을 놓친다.

## entity_type
- character_candidate: 캐릭터일 가능성이 있는 고유명
- creator: 사람·작가·채널명
- brand: 브랜드·기업·상호
- hashtag: 의미가 확인되지 않은 태그나 약어
- meme_audio: 오디오·챌린지·포맷 이름
- ambiguous: 자료만으로 유형을 정할 수 없음

## 중요한 구분
- 계정명에 후보 문자열이 들어 있다는 이유만으로 캐릭터나 원작자로 보지 않는다.
- OC, LS, PC 같은 2~3자 영문은 정확한 독립 토큰이어도 우선 hashtag 또는 ambiguous 로 본다.
- 짧은 영문을 character_candidate 로 제안하려면 같은 게시물에 자캐, OC, original character,
  캐릭터 이름 같은 명시적 문맥이 있어야 한다.
- 작품명·브랜드명과 작품 안의 개별 캐릭터명을 구분한다.
- 행위·장르어(그림, 드로잉, 일러스트, 챌린지)와 사람 이름은 캐릭터로 분류하지 않는다.

## 증거
evidence 는 수집 목록의 문자열을 그대로 옮긴다. source_ids 에는 그 문자열이 나온 행의 id 만 넣는다.
날짜·유행 원인·외형은 추측하지 않는다.

최대 ${max}개.`;

/**
 * 한 번에 제안받을 이름 수의 상한. 프롬프트에 그대로 들어간다.
 *
 * **25 였다. 2026-09-18 에 50 으로 올렸다.** 이게 산출을 묶는 진짜 병목이었다 —
 * 09-18 스냅샷으로 재 보니 제안이 정확히 25에서 끊겨 있었고, 풀어 주자
 * 대조 통과가 15 → 32 로 늘었다.
 *
 * 잡음이 늘까 봐 미뤄 뒀던 값인데 반대였다. 새로 나온 것 맨 위가 **치이카와**
 * (계정 4곳·조회 81,683)였다 — 그 회차에 실제로 있었는데 LLM 이 25칸을 다 써서
 * 제안조차 못 하고 있었다. 교차 확인 2건 → 9건. 잡음(`tsukasatenma`·`Hana` 류)은
 * 전부 계정 1곳·조회 하위라 정렬 축(계정 → 플랫폼 → 조회)이 알아서 아래로 내린다.
 *
 * 다시 재려면 `npx tsx --env-file=.env.local tests/_names_cap.ts` (기본은 견적).
 */
export const MAX_NAMES = 50;

export async function proposeNames(
  posts: Post[],
  opts: { max?: number } = {},
): Promise<{ drafts: NameDraft[]; usage: { input: number; output: number } }> {
  const table = posts
    .map(
      (p) =>
        `${p.sourceId}\t${p.platform}\t계정명:${p.authorName || '-'}\t@${p.authorId || '-'}\t태그:${p.tags.join(',') || '-'}\t본문:${cut(p.text.replace(/\s+/g, ' '), 160)}`,
    )
    .join('\n');

  const client = new Anthropic();
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: systemFor(opts.max ?? MAX_NAMES),
    thinking: { type: 'adaptive' },
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: `## 수집 목록\n${table}` }],
  });

  let drafts: NameDraft[] = [];
  for (const b of res.content) {
    if (b.type !== 'text') continue;
    let raw: { items?: Array<Record<string, unknown>> };
    try {
      raw = JSON.parse(b.text) as typeof raw;
    } catch {
      throw new Error(`이름 추출 응답을 읽지 못했습니다: ${b.text.slice(0, 200)}`);
    }
    drafts = (raw.items ?? []).map((t) => ({
      name: String(t.name ?? '').trim(),
      aliases: Array.isArray(t.aliases) ? (t.aliases as string[]) : [],
      entityType: (t.entity_type as EntityType) ?? 'ambiguous',
      foundIn: String(t.found_in ?? ''),
      confidence: Number(t.confidence ?? 0),
      sourceIds: Array.isArray(t.source_ids) ? (t.source_ids as string[]) : [],
      evidence: String(t.evidence ?? ''),
      why: String(t.why ?? ''),
    }));
    break;
  }
  return { drafts, usage: { input: res.usage.input_tokens, output: res.usage.output_tokens } };
}

/* ─────────────────────── 원문 대조 ─────────────────────── */

const compact = (s: string): string =>
  s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/** 이름이 본문에 실제로 있나. 붙여쓴 형태까지 본다. */
function inText(name: string, text: string): boolean {
  const k = compact(name);
  return k.length >= 2 && compact(text).includes(k);
}

function inTags(name: string, tags: string[]): boolean {
  const k = compact(name);
  return k.length >= 2 && tags.some((t) => compact(t) === k);
}

/**
 * 계정 이름 뒤에 흔히 붙는 말. 이게 붙어도 '그 이름의 계정'으로 본다.
 * 계정명이 `Tutu's Diary`·`tutulifediary` 처럼 생겼을 때를 잡으려고 둔다.
 */
const ACCOUNT_WORDS = [
  'official', 'studio', 'shop', 'store', 'diary', 'life', 'daily', 'world', 'land',
  'house', 'home', 'art', 'toon', 'tv', 'kr', 'korea', 'japan', 'global',
  '네', '이', '님', '공식', '스튜디오', '월드', '랜드', '하우스', '일상',
].map(compact);

/**
 * 계정명·핸들이 곧 이름인가. 개인 창작 캐릭터의 전형이라 따로 본다.
 *
 * **머리에서만 본다.** 2026-09-18 까지 표시명이 이름과 글자 그대로 같을 때만 인정했는데,
 * 실제 계정명에는 이모지·부제·가게 이름이 붙어 있어 거의 걸리지 않았다 —
 * `🍄Tutu's Diary`(@tutulifediary)가 Tutu 본인 계정인데 '아니오'였다.
 *
 * 그렇다고 '들어 있으면'으로 풀면 안 된다. 굿즈 가게가 파는 캐릭터를 나열한 계정명
 * (`💛리무네상점💛 산리오•지브리•모루카•짱구•치이카와`)이 전부 '그 캐릭터의 계정'이 된다.
 * 이름이 **맨 앞**에 오고 그 뒤가 글자가 아닐 때(또는 위의 흔한 말일 때)만 인정한다.
 *
 * 남는 한계: 이름을 앞세운 가게(`우사기 굿즈샵`)는 여전히 '예'로 읽힌다. 그건 이 함수가
 * 가를 수 있는 것이 아니고, 권리 귀속은 rights 판정이 따로 가린다.
 */
function inAccount(name: string, p: Post): boolean {
  const k = compact(name);
  if (k.length < 2) return false;
  const display = compact(p.authorName);
  const handle = compact(p.authorId);
  if (display === k || handle === k) return true;
  return [display, handle].some((field) => {
    if (!field.startsWith(k)) return false;
    const rest = field.slice(k.length);
    // 접미가 비었으면 위에서 이미 걸렸다. 흔한 말이거나, 그 말로 시작하면 인정한다.
    return ACCOUNT_WORDS.some((w) => w && (rest === w || rest.startsWith(w)));
  });
}

/** 2~3자 순영문은 약어일 확률이 높다. 명시적 문맥이 없으면 캐릭터로 보지 않는다. */
const SHORT_LATIN = /^[a-z0-9]{2,3}$/;
const CHAR_CONTEXT = /(자캐|오리지널\s*캐릭터|original\s*character|\boc\b|캐릭터\s*이름|캐릭터\s*만들)/i;

/** 이름이 아니라 행위·장르인 말들. 이게 상위에 오면 표가 쓸모없어진다. */
const STOP = new Set(
  ['자캐', '자캐만들기', '오리지널캐릭터', '캐릭터', '그림', '드로잉', '일러스트', '일러', '작화',
   '그림맞팔', '맞팔', '트친소', '친소', '챌린지', '추천', '팔로우', '리메이크', '2차창작', '팬아트',
   'oc', 'fyp', 'art', 'anime', 'drawing', 'illustration', 'webtoon', 'foryou', 'viral',
  ].map(compact),
);

export interface VerifiedName {
  name: string;
  aliases: string[];
  entityType: EntityType;
  /** 이름을 말한 서로 다른 계정 수. 이게 판정축이다. */
  authors: string[];
  platforms: string[];
  /** 계정 표시명이 곧 이름인 사례가 있었나. */
  selfNamed: boolean;
  posts: Post[];
  views: number;
  /** 어디서 확인됐나 — 대조를 통과한 자리들. */
  hits: string[];
}

/**
 * 검증. LLM 이 댄 이름이 원문에 실제로 있는 행만 남기고, 계정 수를 코드가 다시 센다.
 * API 를 부르지 않는 순수 함수라 저장된 스냅샷에 몇 번이든 다시 돌릴 수 있다.
 */
export function verifyNames(posts: Post[], drafts: NameDraft[], minAuthors = 1): VerifiedName[] {
  const byId = new Map(posts.map((p) => [p.sourceId, p]));
  const out: VerifiedName[] = [];

  /*
   * 한 게시물이 이름을 여러 개 낳았다면 그건 목록 게시물이다 — 캐릭터 소개 모음,
   * 작품 등장인물 나열 같은 것. 확산이 아니라 나열이므로 후보로 세우면 표가 오염된다.
   * 실제로 X 게시물 하나가 '기업 IP' 후보 4건을 만들어 냈다.
   */
  const namesPerPost = new Map<string, number>();
  for (const d of drafts) {
    if (d.entityType !== 'character_candidate') continue;
    for (const id of d.sourceIds) namesPerPost.set(id, (namesPerPost.get(id) ?? 0) + 1);
  }
  const LIST_POST = 3;

  for (const d of drafts) {
    if (!d.name || d.entityType !== 'character_candidate') continue;
    if (STOP.has(compact(d.name))) continue;

    // LLM 이 댄 행부터 보되, 다른 행에도 있는지 전체를 훑는다(계정 수를 정확히 세려고).
    const cited = d.sourceIds.map((id) => byId.get(id)).filter((p): p is Post => Boolean(p));
    const pool = cited.length ? posts : [];

    const matched: Post[] = [];
    const hits = new Set<string>();
    for (const p of pool) {
      let hit = '';
      if (inAccount(d.name, p)) hit = '계정명';
      else if (inTags(d.name, p.tags)) hit = '태그';
      else if (inText(d.name, `${p.text} ${p.title}`)) hit = '본문';
      if (!hit) continue;

      // 짧은 영문은 같은 게시물에 캐릭터 문맥이 있어야 인정한다.
      if (SHORT_LATIN.test(compact(d.name)) && !CHAR_CONTEXT.test(`${p.text} ${p.tags.join(' ')}`)) continue;

      matched.push(p);
      hits.add(hit);
    }

    const authors = [...new Set(matched.map((p) => p.authorId || p.authorName).filter(Boolean))];
    if (authors.length < minAuthors || !matched.length) continue;

    // 근거가 목록 게시물 하나뿐이면 버린다. 여러 곳에서 확인되면 남긴다.
    const onlyFromListPost =
      matched.length === 1 && (namesPerPost.get(matched[0].sourceId) ?? 0) >= LIST_POST;
    if (onlyFromListPost) continue;

    out.push({
      name: d.name,
      aliases: d.aliases,
      entityType: d.entityType,
      authors,
      platforms: [...new Set(matched.map((p) => p.platform))],
      selfNamed: matched.some((p) => inAccount(d.name, p)),
      posts: matched.slice(0, 10),
      views: matched.reduce((s, p) => s + p.views, 0),
      hits: [...hits],
    });
  }

  out.sort(
    (a, b) =>
      b.authors.length - a.authors.length ||
      b.platforms.length - a.platforms.length ||
      b.views - a.views,
  );
  return out;
}
