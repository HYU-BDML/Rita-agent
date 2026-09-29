import Anthropic from '@anthropic-ai/sdk';
import { cut } from '../core/text';
import type { Article } from './rss';

/**
 * 기사 제목에서 '지금 여러 곳이 다루는 주제'를 뽑는다.
 *
 * 형태소 분석 없이 한국어를 자르면 '글로벌·가을·시간' 같은 흔한 말이 상위에 온다(실제로 그랬다).
 * 그래서 LLM 이 주제를 제안하고, 매체 수는 코드가 다시 센다.
 *
 * 이건 사용자가 이미 Dify 에서 쓰던 구조와 같다 — names(LLM 제안) → verify(원문 대조).
 * LLM 이 숫자를 지어내지 못하게 하는 게 요점이다. 여기서도 LLM 은 기사 번호만 고르고,
 * 매체 수·언급 수는 그 번호로 코드가 계산한다.
 */

const MODEL = 'claude-opus-5';

export interface TopicDraft {
  topic: string;
  why: string;
  /** 검색추이를 물어볼 짧은 말. 긴 주제명 그대로는 검색량이 안 잡힌다. */
  searchKeyword: string;
  articleIndexes: number[];
}

export interface Topic {
  topic: string;
  why: string;
  searchKeyword: string;
  /** 코드가 다시 센 값. LLM 이 말한 숫자가 아니다. */
  sources: string[];
  kinds: string[];
  articles: Article[];
  /** LLM 이 댄 기사 번호 중 실제로 존재하지 않았던 것. 0 이 아니면 신뢰를 낮춘다. */
  droppedIndexes: number[];
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['topics'],
  properties: {
    topics: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['topic', 'why', 'search_keyword', 'article_indexes'],
        properties: {
          topic: { type: 'string', description: '주제를 2~12자 명사구로. 일반명사 금지.' },
          why: { type: 'string', description: '왜 지금 묶이는지 한 줄. 기사에 있는 내용만.' },
          search_keyword: {
            type: 'string',
            description:
              '사람들이 이 주제를 찾을 때 실제로 칠 말. 2~8자로 짧게. 수식어·조사·연도 빼고 핵심 명사만.',
          },
          article_indexes: {
            type: 'array',
            items: { type: 'integer' },
            description: '이 주제에 해당하는 기사 번호. 목록에 있는 번호만.',
          },
        },
      },
    },
  },
} as const;

const SYSTEM = `너는 기사 제목 목록에서 '지금 여러 매체가 함께 다루는 주제'를 골라내는 추출기다.

## 고르는 기준
- 서로 다른 매체 둘 이상이 같은 사안을 다룰 때만 주제로 삼는다. 한 매체만 다룬 것은 버린다.
- 콘텐츠로 만들 수 있는 구체적 사안이어야 한다. '글로벌', '가을', '혁신' 같은 일반명사는 주제가 아니다.
- 사건·제품·인물·현상처럼 이름을 댈 수 있는 것을 고른다.

## 하지 않을 것
- 목록에 없는 내용을 보태지 않는다. 배경지식으로 설명을 채우지 않는다.
- article_indexes 에는 목록에 실제로 있는 번호만 넣는다. 지어내면 그 주제는 통째로 버려진다.
- why 는 기사 제목에서 확인되는 것만 쓴다. 원인을 추측하지 않는다.

## search_keyword
검색추이를 조회할 말이다. 사람들이 포털 검색창에 실제로 칠 법한 짧은 말로 쓴다.
주제명을 그대로 넣으면 검색량이 잡히지 않는다.
  '서울세계불꽃축제 인파' → '불꽃축제'
  '미군 이란 유조선 타격' → '이란'
  '젠지 LCK 결승 진출'   → '젠지'

## 개수
많아야 12개. 매체가 많이 겹치는 것부터.`;

export interface ProposeResult {
  articles: Article[];
  drafts: TopicDraft[];
  usage: { input: number; output: number };
}

/** LLM 제안. 여기서만 API 를 부른다. */
export async function proposeTopics(
  articles: Article[],
  opts: { max?: number } = {},
): Promise<ProposeResult> {
  const list = articles.slice(0, opts.max ?? 300);
  const lines = list
    .map((a, i) => `${i}\t[${a.sourceName}]\t${cut(a.title.replace(/\s+/g, ' '), 120)}`)
    .join('\n');

  const client = new Anthropic();
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    thinking: { type: 'adaptive' },
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: `## 기사 목록 (번호\t매체\t제목)\n${lines}` }],
  });

  let drafts: TopicDraft[] = [];
  for (const block of res.content) {
    if (block.type !== 'text') continue;
    let raw: { topics?: Array<Record<string, unknown>> };
    try {
      raw = JSON.parse(block.text) as { topics?: Array<Record<string, unknown>> };
    } catch {
      // 스키마를 걸었으므로 여기 오면 안 되지만, 와도 조용히 빈손이 되게 두지 않는다.
      throw new Error(`주제 추출 응답을 읽지 못했습니다: ${block.text.slice(0, 200)}`);
    }
    drafts = (raw.topics ?? []).map((t) => ({
      topic: String(t.topic ?? ''),
      why: String(t.why ?? ''),
      searchKeyword: String(t.search_keyword ?? '').trim(),
      articleIndexes: Array.isArray(t.article_indexes) ? (t.article_indexes as number[]) : [],
    }));
    break;
  }

  return {
    articles: list,
    drafts,
    usage: { input: res.usage.input_tokens, output: res.usage.output_tokens },
  };
}

/**
 * 검증. API 를 부르지 않는 순수 함수라 저장된 스냅샷에 몇 번이든 다시 돌릴 수 있다.
 * 매체 수는 여기서 다시 센다 — LLM 이 말한 숫자를 쓰지 않는다.
 */
export function verifyTopics(articles: Article[], drafts: TopicDraft[]): Topic[] {
  const topics: Topic[] = [];

  for (const d of drafts) {
    if (!d.topic.trim()) continue;

    const dropped: number[] = [];
    const arts: Article[] = [];
    for (const i of d.articleIndexes) {
      const a = articles[i];
      if (a) arts.push(a);
      else dropped.push(i);   // 지어낸 번호. 세지 않는다.
    }
    if (!arts.length) continue;

    const sources = [...new Set(arts.map((a) => a.sourceName))];
    // 매체 둘 미만이면 '여러 곳이 다뤘다'가 성립하지 않는다. LLM 이 뭐라 했든 버린다.
    if (sources.length < 2) continue;

    topics.push({
      topic: d.topic.trim(),
      why: d.why.trim(),
      searchKeyword: d.searchKeyword || d.topic.trim(),
      sources,
      kinds: [...new Set(arts.map((a) => a.kind))],
      articles: arts,
      droppedIndexes: dropped,
    });
  }

  topics.sort((a, b) => b.sources.length - a.sources.length || b.articles.length - a.articles.length);
  return topics;
}
