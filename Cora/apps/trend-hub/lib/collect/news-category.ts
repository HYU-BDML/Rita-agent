import Anthropic from '@anthropic-ai/sdk';
import { cut } from '../core/text';

/**
 * 뉴스 소재의 갈래 — **무엇에 관한 이야기인가.**
 *
 * '오늘의 소재'가 한 줄로만 쌓여서, 연예 소재를 찾는 사람이 환율·정상회담을 지나쳐야
 * 했다. 축(뉴스·캐릭터·포맷) 아래 한 단을 더 둔다.
 *
 * 갈래는 지금 들어오는 기사에서 뽑았다. 매체가 연합뉴스·매일경제 같은 종합지와
 * 매드타임스·브랜드브리프 같은 광고 전문지로 갈리는데, 뒤엣것이 이 도구에서
 * 제일 쓸모 있는 소재를 낸다. 그래서 `마케팅·광고` 를 따로 세운다 — 종합지 분류를
 * 그대로 가져왔다면 저것들이 전부 `경제` 에 묻혔을 것이다.
 *
 * **모델은 Haiku 를 쓴다.** 주제를 뽑는 일(`topics.ts`)은 기사 수십 건을 읽고 묶는
 * 어려운 일이라 Opus 를 쓰지만, 이미 뽑힌 주제를 아홉 칸 중 하나에 넣는 것은 쉽다.
 * 회차마다 한 번 더 부르는 자리라 값이 눌려 있어야 한다.
 */

const MODEL = 'claude-haiku-4-5';

export const NEWS_CATEGORIES = [
  '정치',
  '경제·산업',
  '사회',
  '국제',
  '연예·문화',
  '스포츠·게임',
  '과학·기술',
  '마케팅·광고',
  '기타',
] as const;

export type NewsCategory = (typeof NEWS_CATEGORIES)[number];

export function isNewsCategory(value: unknown): value is NewsCategory {
  return typeof value === 'string' && (NEWS_CATEGORIES as readonly string[]).includes(value);
}

export interface CategoryVerdict {
  topic: string;
  category: NewsCategory;
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
        required: ['topic', 'category'],
        properties: {
          topic: { type: 'string' },
          category: { type: 'string', enum: NEWS_CATEGORIES as unknown as string[] },
        },
      },
    },
  },
} as const;

const SYSTEM = `너는 뉴스 주제를 갈래 하나에 넣는 분류기다.

## 갈래 (겹치지 않는다. 하나만 고른다)
- 정치        : 국내 정치·선거·국회·인사청문회·정당 공방
- 경제·산업   : 수출입·증시·환율·부동산·기업 실적·신제품 출시·산업 정책
- 사회        : 사건사고·재난·노동·교육·복지·지역. 국내에서 벌어진 일상의 일
- 국제        : 다른 나라의 일, 또는 나라 사이의 일. 전쟁·외교·해외 정책
- 연예·문화   : 연예인·방송·영화·음악·공연·출판
- 스포츠·게임 : 경기·선수·구단·e스포츠·게임 대회
- 과학·기술   : 연구·우주·의료기술·AI 와 그 규제
- 마케팅·광고 : 광고 캠페인·브랜드 마케팅·광고제·마케팅 업계 소식
- 기타        : 위 어디에도 안 들어갈 때. **억지로 고르지 않는다**

## 헷갈리는 자리
- 기업이 만든 **광고 캠페인**은 '마케팅·광고' 다. 기업 이야기라고 '경제·산업' 으로 보내지 마라
- 기업의 **실적·주가·신제품**은 '경제·산업' 이다
- **AI 규제**는 '과학·기술' 이다. 정치 공방으로 다뤄져도 그렇다
- 해외에서 벌어진 사건사고는 '국제' 다. 한국 정부가 관련되어도 상대가 다른 나라면 '국제' 다
- e스포츠 대회는 '스포츠·게임' 이다. '연예·문화' 가 아니다

입력에 있는 주제만, 주제 이름을 **글자 그대로** 돌려준다.`;

export interface CategoryInput {
  topic: string;
  /** 지금 뜨는 이유. 제목만으로는 안 갈리는 주제가 있다. */
  why: string;
  /** 근거 기사 제목 몇 개. 매체 이름이 갈래를 가르는 단서가 된다. */
  evidence: string[];
}

export async function classifyNews(
  items: CategoryInput[],
): Promise<{ verdicts: CategoryVerdict[]; usage: { input: number; output: number } }> {
  if (!items.length) return { verdicts: [], usage: { input: 0, output: 0 } };

  const table = items
    .map(
      (i) =>
        `${i.topic}\t이유:${cut((i.why || '').replace(/\s+/g, ' '), 140) || '-'}\t근거:${
          i.evidence
            .slice(0, 3)
            .map((e) => cut(e.replace(/\s+/g, ' '), 60))
            .join(' / ') || '-'
        }`,
    )
    .join('\n');

  const client = new Anthropic();
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: `## 주제 목록\n${table}` }],
  });

  const usage = { input: res.usage.input_tokens, output: res.usage.output_tokens };
  for (const b of res.content) {
    if (b.type !== 'text') continue;
    let parsed: { items?: Array<Record<string, unknown>> };
    try {
      parsed = JSON.parse(b.text) as typeof parsed;
    } catch {
      throw new Error(`갈래 분류 응답을 읽지 못했습니다: ${b.text.slice(0, 200)}`);
    }
    return { verdicts: pick(items, parsed.items ?? []), usage };
  }
  return { verdicts: [], usage };
}

/**
 * 준 것만 받는다. 모델이 이름을 바꿔 돌려주거나 없는 주제를 지어내면 버린다 —
 * 이름으로 후보에 다시 붙일 것이라, 어긋나면 갈래가 엉뚱한 소재에 달린다.
 */
function pick(items: CategoryInput[], raw: Array<Record<string, unknown>>): CategoryVerdict[] {
  const asked = new Map(items.map((i) => [i.topic.trim(), i.topic]));
  const out: CategoryVerdict[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const topic = asked.get(String(r.topic ?? '').trim());
    if (!topic || seen.has(topic)) continue;
    if (!isNewsCategory(r.category)) continue;
    seen.add(topic);
    out.push({ topic, category: r.category });
  }
  return out;
}
