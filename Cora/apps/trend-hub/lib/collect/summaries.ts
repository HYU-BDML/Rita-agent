import Anthropic from '@anthropic-ai/sdk';
import { cut } from '../core/text';
import type { Post } from './tikhub';

/**
 * 게시물 본문 요약 — "무슨 내용인가".
 *
 * **`why_trending` 과 칸이 겹치면 안 된다.** 둘은 입력부터 다르다.
 *
 *   why_trending  rights.ts 가 만든다  입력: 이름+근거요약+계정수  묻는 것: 왜 지금 뜨나
 *   summary       여기가 만든다        입력: 그 후보의 게시물 본문  묻는 것: 무슨 내용인가
 *
 * 그래서 프롬프트에서 **"왜 뜨는지"를 아예 묻지 않는다.** 물으면 LLM 이 답하고
 * 두 칸이 같아진다. 2026-09-17 까지 summary 자리에 why 가 들어가 있어서
 * 로빈 카드 6장에 "독립 출처는 확인되지 않았습니다"가 박혔던 것과 같은 사고다.
 *
 * 호출은 회차당 1번이다. 후보 27건이면 27번이 아니라 한 번에 전부 묶어 보낸다.
 * 입력이 문턱을 넘으면 그때만 나눠 보낸다(BATCH). 후보 경계는 `## 이름` 으로 표시한다.
 *
 * **새 수집을 하지 않는다.** 본문은 이미 스냅샷(`raw.posts[].text`)에 들어 있어서
 * 저장된 옛 회차에도 그대로 다시 돌릴 수 있다 — `tests/_summarize.ts`.
 * 그래서 `PostRecord` 에 본문 칸을 새로 만들지 않았다(2026-09-18 사용자 결정).
 */

const MODEL = 'claude-opus-5';

/** 본문을 몇 자까지 넣나. 300자 (2026-09-18 사용자 결정 — 160자는 한 문장에서 잘렸다). */
export const BODY_CHARS = 300;

/**
 * 한 번에 보낼 후보 수의 상한.
 *
 * 지금 회차는 12건이라 늘 한 번에 들어간다. 후보가 늘어 넘칠 때만 쪼개진다.
 * 쪼개도 결과는 같다 — 후보끼리 서로를 참조하지 않기 때문이다.
 */
export const BATCH = 40;

export interface PostSummary {
  /** 후보 이름. 후보 id 는 normalize 가 만들므로 여기서는 이름으로 잇는다(verdicts 와 같은 방식). */
  name: string;
  summary: string;
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
        required: ['id', 'summary'],
        properties: {
          id: { type: 'string', description: '## 뒤에 적힌 이름을 그대로 옮긴다.' },
          summary: { type: 'string', description: '쓸 말이 없으면 빈 문자열.' },
        },
      },
    },
  },
} as const;

const SYSTEM = `너는 소셜 게시물 묶음을 읽고 **무슨 내용인지**만 적는 요약기다.

## 적는 것
그 게시물들에 실제로 적힌 사실만 적는다.
- 무엇이 나왔나 (굿즈·인형·이모티콘·전시·콜라보 같은 물건이나 행사)
- 어디서 파나·어디서 하나 (매장, 플랫폼, 펀딩처)
- 언제 (게시물에 적힌 날짜·기간)
- 얼마 (가격·수량·조회수처럼 본문에 적힌 수)
계정을 짚을 때는 표시명 뒤에 핸들을 괄호로 붙인다 — 예: 한올디앤피(@hanalldnp).

## 적지 않는 것 (어기면 다른 칸과 겹친다)
- **왜 뜨는지 쓰지 않는다.** '인기', '화제', '유행', '확산', '주목받고 있다' 같은 말을 쓰지 않는다.
  그 판단은 다른 칸이 맡는다. 여기는 내용만 적는 자리다.
- 자료에 없는 날짜·수치·색·형태·비율을 채우지 않는다. 모르면 안 적는다.
- 판정하지 않는다. '독립 출처가 부족함', '근거가 얇음' 같은 메모를 쓰지 않는다.
- 권리·저작권 판단을 하지 않는다.

## 분량
한 후보에 3~4문장, 400자 안쪽. 게시물이 서로 다른 이야기면 많이 나온 쪽부터 적는다.

## 쓸 말이 없을 때
본문이 해시태그·인사말뿐이라 내용이라 할 것이 없으면 **summary 를 빈 문자열로 둔다.**
빈 문자열은 정상이다. 억지로 채운 한 줄보다 낫다.

입력에 있는 이름만 돌려준다. 이름을 새로 만들지 않는다.`;

/** 후보 하나치 입력. verifyNames 의 결과에서 필요한 것만 받는다. */
export interface SummaryInput {
  name: string;
  posts: Post[];
}

function table(group: SummaryInput): string {
  const rows = group.posts
    .map((p) => {
      const body = cut(p.text.replace(/\s+/g, ' ').trim(), BODY_CHARS);
      const title = p.title ? ` 제목:${cut(p.title.replace(/\s+/g, ' '), 80)}` : '';
      const when = p.postedAt ? ` ${p.postedAt.slice(0, 10)}` : '';
      const views = p.views ? ` 조회:${p.views}` : '';
      return `- ${p.platform}${when} ${p.authorName || '-'}(@${p.authorId || '-'})${views}${title} 본문:${body || '-'}`;
    })
    .join('\n');
  return `## ${group.name}\n${rows}`;
}

async function askOnce(
  groups: SummaryInput[],
): Promise<{ items: PostSummary[]; usage: { input: number; output: number } }> {
  const client = new Anthropic();
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    thinking: { type: 'adaptive' },
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: groups.map(table).join('\n\n') }],
  });

  const usage = { input: res.usage.input_tokens, output: res.usage.output_tokens };
  for (const b of res.content) {
    if (b.type !== 'text') continue;
    let raw: { items?: Array<Record<string, unknown>> };
    try {
      raw = JSON.parse(b.text) as typeof raw;
    } catch {
      throw new Error(`본문 요약 응답을 읽지 못했습니다: ${b.text.slice(0, 200)}`);
    }
    return { items: pick(groups, raw.items ?? []), usage };
  }
  return { items: [], usage };
}

/**
 * 입력에 없던 이름은 버린다. names.ts 의 원문 대조와 같은 장치다 —
 * LLM 이 이름을 지어내면 후보에 안 붙는 게 아니라 **엉뚱한 후보에 붙는다.**
 */
export function pick(groups: SummaryInput[], items: Array<Record<string, unknown>>): PostSummary[] {
  const want = new Map(groups.map((g) => [norm(g.name), g.name]));
  const out: PostSummary[] = [];
  const seen = new Set<string>();
  for (const t of items) {
    const name = want.get(norm(String(t.id ?? '')));
    if (!name || seen.has(name)) continue;
    const summary = String(t.summary ?? '').trim();
    // 빈 요약은 칸을 안 만든다. brief.ts 가 빈 문자열을 그대로 내보내면 안 되기 때문이다.
    if (!summary) continue;
    seen.add(name);
    out.push({ name, summary });
  }
  return out;
}

const norm = (s: string): string => s.normalize('NFKC').trim().toLowerCase();

/**
 * 후보별 본문 요약. 한 번에 보내되 BATCH 를 넘으면 나눠 보낸다.
 * 게시물이 하나도 없는 후보는 묻지 않는다 — 물어 봐야 빈 문자열이 온다.
 */
export async function summarizePosts(
  groups: SummaryInput[],
): Promise<{ summaries: PostSummary[]; usage: { input: number; output: number } }> {
  const usable = groups.filter((g) => g.name && g.posts.some((p) => (p.text || p.title || '').trim()));
  if (!usable.length) return { summaries: [], usage: { input: 0, output: 0 } };

  const summaries: PostSummary[] = [];
  const usage = { input: 0, output: 0 };
  for (let i = 0; i < usable.length; i += BATCH) {
    const r = await askOnce(usable.slice(i, i + BATCH));
    summaries.push(...r.items);
    usage.input += r.usage.input;
    usage.output += r.usage.output;
  }
  return { summaries, usage };
}
