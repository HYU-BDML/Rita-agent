import Anthropic from '@anthropic-ai/sdk';
import { cut } from '../core/text';
import type { Post } from './tikhub';

/**
 * 밈 축 2단계 — **포맷 이름을 뽑는다.** 문구를 세는 게 아니라 이름을 제안받는다.
 *
 * `phrases.ts`(n-gram)를 버리지 않고 보조로 둔다. 그쪽은 "같은 문구를 3계정 이상이
 * 썼나"를 세는데, 우리 수집은 **계정당 1.03건**이라 그 기준이 구조적으로 안 채워진다.
 * 2026-09-19 밈 회차에서 실제로 0건이 나왔다 — 그런데 같은 회차 자막에는
 * `배드챌린지` · `쇼츠 중독 테스트` · `남자 유행어 TOP4` · `무한도전 챌린지` 가
 * 버젓이 있었다. **세는 방법이 못 세고 있었던 것이지 없던 게 아니다.**
 *
 * 그래서 캐릭터 축과 같은 2단계로 간다.
 *   1) LLM 이 캡션+자막에서 포맷 이름을 제안한다        ← 이 파일
 *   2) 그 이름으로 재검색해 몇 계정이 하는지 코드가 센다  ← 다음 단계
 *
 * `names.ts` 와 같은 규칙을 따른다: **LLM 은 제안만 하고, 원문에 실제로 있는지는
 * 코드가 대조한다.** 지어낸 이름은 여기서 죽는다.
 */

const MODEL = 'claude-opus-5';

/** 한 번에 제안받을 이름 수. names.ts 의 MAX_NAMES 와 같은 뜻이다. */
export const MAX_FORMATS = 40;

export type FormatKind = 'challenge' | 'format' | 'catchphrase' | 'ambiguous';

export interface FormatDraft {
  name: string;
  kind: FormatKind;
  /** 원문에서 그대로 옮긴 문자열. 대조에 쓴다. */
  evidence: string;
  sourceIds: string[];
  confidence: number;
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
        required: ['name', 'kind', 'evidence', 'source_ids', 'confidence', 'why'],
        properties: {
          name: { type: 'string', description: '검색창에 넣을 수 있는 짧은 이름.' },
          kind: { type: 'string', enum: ['challenge', 'format', 'catchphrase', 'ambiguous'] },
          evidence: { type: 'string', description: '원문 문자열을 그대로 옮긴다.' },
          source_ids: { type: 'array', items: { type: 'string' } },
          confidence: { type: 'number' },
          why: { type: 'string' },
        },
      },
    },
  },
} as const;

const SYSTEM = `너는 소셜 게시물에서 **남들이 따라 하는 포맷의 이름**을 뽑는 추출기다.
최종 판정은 다음 코드 단계가 한다 — 그 이름으로 다시 검색해 몇 계정이 하는지 센다.
그러니 너는 **검색창에 넣을 수 있는 이름**을 제안하면 된다. 유행 여부를 단정하지 않는다.

## 자료 읽는 법
행마다 캡션과 **자막**(영상 첫 화면에 박힌 글자)이 따로 온다.
포맷 이름은 자막에 있는 경우가 많다 — 만든 사람이 제목처럼 박아 두기 때문이다.

## 뽑아야 하는 것
- challenge : 이름이 붙은 챌린지 (예: "배드챌린지", "무한도전 챌린지")
- format    : 따라 만드는 틀 (예: "쇼츠 중독 테스트", "남자 유행어 TOP4",
              "픽셀 캐릭터 만들기", "OO하는 법")
- catchphrase: 여러 사람이 받아 쓰는 말버릇·구호
- ambiguous : 포맷 같긴 한데 이름을 확정할 수 없음

## 뽑으면 안 되는 것 (이게 이 작업의 핵심이다)
- **상품·매장 고지** — "CGV 신상", "다이소 전제품 390엔", "굿즈 입고". 파는 얘기지 포맷이 아니다.
- **도구 흔적** — "Alight Motion"(편집 앱 워터마크), "소리없는음원". 만든 도구지 포맷이 아니다.
- **갈래 이름** — "댄스 챌린지", "챌린지", "밈". 종류를 가리키는 말이지 특정 포맷이 아니다.
  특정할 수 있는 이름만 뽑는다. "OO 챌린지" 에서 OO 가 있어야 한다.
- **검색어 그 자체** — 자료를 모을 때 쓴 말(챌린지·요즘유행·밈·이거뭐야·따라하기)과
  거기에 어미만 붙은 것("요즘 유행하는").
- **캐릭터·브랜드 이름** — 그건 다른 판정기가 센다.
- 한 게시물에서만 보이고 남이 따라 할 만한 틀이 아닌 개인 일상 서술.

## 이름 짓는 법
원문에 나온 말을 그대로 쓴다. 없는 말을 지어 붙이지 않는다.
길면 검색이 안 되므로 **2~6어절**로 줄인다. evidence 에는 줄이기 전 원문을 그대로 넣는다.

## confidence
0.9 = 자막에 제목처럼 박혀 있고 이름이 분명하다
0.5 = 포맷처럼 보이나 이름이 애매하다
0.3 = 한 건만 보여 판단이 어렵다

최대 ${MAX_FORMATS}개.`;

/** 한 행 = 한 게시물. 캡션과 자막을 갈라서 보여 준다. */
function table(posts: Post[], ocr: Map<string, string>): string {
  return posts
    .map((p) => {
      const cap = cut((p.text || '').replace(/\s+/g, ' '), 200);
      const sub = cut((ocr.get(p.sourceId) || '').replace(/\s+/g, ' '), 120);
      return `${p.sourceId}\t${p.platform}\t계정:${p.authorId || '-'}\t조회:${p.views}\t캡션:${cap || '-'}\t자막:${sub || '-'}`;
    })
    .join('\n');
}

const compact = (s: string): string =>
  s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/**
 * 원문 대조. LLM 이 댄 이름이 실제 캡션·자막에 있는 행만 남긴다.
 * `names.ts:verifyNames` 와 같은 장치다 — 지어낸 이름은 여기서 죽는다.
 */
export function verifyFormats(
  posts: Post[],
  ocr: Map<string, string>,
  drafts: FormatDraft[],
): { draft: FormatDraft; posts: Post[] }[] {
  const corpus = new Map(
    posts.map((p) => [p.sourceId, compact(`${p.text || ''} ${ocr.get(p.sourceId) || ''}`)]),
  );
  const out: { draft: FormatDraft; posts: Post[] }[] = [];
  for (const d of drafts) {
    const k = compact(d.name);
    if (k.length < 2) continue;
    const hit = posts.filter((p) => (corpus.get(p.sourceId) ?? '').includes(k));
    if (!hit.length) continue; // 원문에 없는 이름은 버린다
    out.push({ draft: d, posts: hit });
  }
  return out;
}

export async function proposeFormats(
  posts: Post[],
  ocr: Map<string, string>,
): Promise<{ drafts: FormatDraft[]; usage: { input: number; output: number } }> {
  const client = new Anthropic();
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    thinking: { type: 'adaptive' },
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: `## 수집 목록\n${table(posts, ocr)}` }],
  });

  const usage = { input: res.usage.input_tokens, output: res.usage.output_tokens };
  for (const b of res.content) {
    if (b.type !== 'text') continue;
    let raw: { items?: Array<Record<string, unknown>> };
    try {
      raw = JSON.parse(b.text) as typeof raw;
    } catch {
      throw new Error(`포맷 추출 응답을 읽지 못했습니다: ${b.text.slice(0, 200)}`);
    }
    const drafts = (raw.items ?? []).map((t) => ({
      name: String(t.name ?? '').trim(),
      kind: (t.kind as FormatKind) ?? 'ambiguous',
      evidence: String(t.evidence ?? ''),
      sourceIds: Array.isArray(t.source_ids) ? (t.source_ids as string[]) : [],
      confidence: Number(t.confidence ?? 0),
      why: String(t.why ?? ''),
    }));
    return { drafts: drafts.filter((d) => d.name), usage };
  }
  return { drafts: [], usage };
}
