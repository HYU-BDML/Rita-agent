import Anthropic from '@anthropic-ai/sdk';
import { stripLoneSurrogates } from '../core/text';
import type { Producer } from '../core/adapters';
import type { Candidate } from '../core/candidate';
import { brief, safetyGate } from './shared';
import { checkDeck, deckFromCards } from './deck';
import { cachedHealth, hasRender, renderDeck } from '../core/render';

/**
 * 카드뉴스 원고 — 앱이 직접 쓴다. Dify 를 거치지 않는다.
 *
 * Dify 카드뉴스는 원고 작성과 디자인 렌더를 한 워크플로우에서 한다(통합 v2 는 67노드).
 * 그 둘을 가르면 원고는 지금 바로 된다 — 필요한 건 Claude 키 하나뿐이다.
 * 디자인은 나중에 붙인다.
 *
 * 후보가 들고 있는 근거로만 쓴다. 배경지식을 보태면 출처를 댈 수 없는 문장이 섞인다.
 */

const MODEL = 'claude-opus-5';

export interface Card {
  no: number;
  kind: '표지' | '본문' | '마지막장';
  headline: string;
  body: string;
  /** 이 카드의 근거가 된 기사. 표지·마지막장은 비어도 된다. */
  sourceUrl?: string;
  sourceName?: string;
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['cards', 'caption'],
  properties: {
    cards: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'headline', 'body'],
        properties: {
          kind: { type: 'string', enum: ['표지', '본문', '마지막장'] },
          headline: { type: 'string', description: '카드에 크게 들어갈 말. 22자 이내.' },
          body: { type: 'string', description: '작은 글씨. 60자 이내. 표지는 비워도 된다.' },
          source_url: { type: 'string', description: '이 카드 내용의 출처 기사 링크. 없으면 빈 문자열.' },
        },
      },
    },
    caption: { type: 'string', description: '게시물 캡션. 3줄 이내.' },
  },
} as const;

const SYSTEM = `너는 주어진 근거만으로 카드뉴스 원고를 쓴다.

## 절대 규칙
- 근거 목록에 없는 사실을 쓰지 않는다. 배경지식으로 문장을 채우지 않는다.
- 숫자는 근거에 적힌 것만 쓴다. 어림잡지 않는다.
- 본문 카드마다 source_url 에 그 내용이 나온 기사 링크를 적는다. 근거를 못 대는 카드는 만들지 않는다.
- 근거가 얇으면 카드 수를 줄인다. 채우려고 늘리지 않는다.

## 구성
- 첫 장은 표지. 왜 지금 이걸 봐야 하는지 한 줄로.
- 가운데는 본문. 한 장에 하나씩만 말한다.
- 마지막 장은 마무리. 새 사실을 넣지 않는다.

## 문체
- 짧은 문장. 수식어를 덜어낸다.
- 과장하지 않는다. '충격', '역대급', '난리' 같은 말을 쓰지 않는다.
- 확인되지 않은 것은 단정하지 않는다.`;

export const cardnewsNativeProducer: Producer = {
  id: 'cardnews-native',
  name: '카드뉴스 원고',
  description: '후보의 근거만으로 카드별 문구와 캡션을 씁니다. Dify 를 거치지 않습니다.',
  accepts: ['topic', 'subject'],
  keyEnv: 'ANTHROPIC_API_KEY',

  gate(c) {
    // 안전 판정이 막은 것은 만들지 않는다. 표시(flagged)는 막지 않는다 — 사람이 본다.
    const s = safetyGate(c);
    if (!s.ok) return s;
    if (!c.evidence.length) {
      return { ok: false, reason: '근거 링크가 없습니다. 출처를 댈 수 있는 카드를 만들 수 없습니다.' };
    }
    return { ok: true };
  },

  mapInputs(c) {
    return { material: brief(c) };
  },

  extraInputs: [
    { name: 'slides', label: '카드 장수', type: 'select', default: '6', options: ['4', '5', '6', '7', '8'] },
    {
      name: 'tone',
      label: '말투',
      type: 'select',
      default: '정보 전달',
      options: ['정보 전달', '설명하듯', '짧고 건조하게'],
    },
    { name: 'account', label: '계정·브랜드 이름 (마지막장에 들어감)', type: 'text' },
    // 아래 셋은 렌더 서버가 굽는 방식. 겉모습 목록은 화면이 서버에서 받아 채운다.
    {
      name: 'style',
      label: '겉모습 (렌더 서버)',
      type: 'select',
      default: 'gogumafarm',
      options: ['gogumafarm'],
      help: '서버에 등록된 브랜드 디자인. 비워 두면 굽지 않고 원고와 브라우저 시안까지만 만듭니다.',
    },
    { name: 'template', label: '배치 형식 (렌더 서버)', type: 'select', default: 'explain_box', options: ['explain_box'] },
    { name: 'kicker', label: '분류어', type: 'select', default: '안 씀', options: ['안 씀', '계정 이름', '순서'] },
  ],

  async run(inputs, c, ctx) {
    if (ctx.mock) {
      return {
        title: `카드뉴스 원고 — ${c.subject}`,
        output: inputs,
        preview: { kind: 'markdown' as const, value: String(inputs.material ?? '') },
      };
    }

    const slides = Math.max(4, Math.min(8, Number(inputs.slides) || 6));
    const client = new Anthropic();
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      thinking: { type: 'adaptive' },
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      messages: [
        {
          role: 'user',
          content: [
            `카드 ${slides}장 (표지·마지막장 포함). 말투: ${inputs.tone || '정보 전달'}.`,
            inputs.account ? `계정 이름: ${inputs.account}` : '',
            '',
            '## 근거 자료',
            stripLoneSurrogates(String(inputs.material ?? '')),
          ]
            .filter(Boolean)
            .join('\n'),
        },
      ],
    });

    let parsed: { cards?: Array<Record<string, unknown>>; caption?: string } = {};
    for (const b of res.content) {
      if (b.type !== 'text') continue;
      try {
        parsed = JSON.parse(b.text) as typeof parsed;
      } catch {
        throw new Error(`원고 응답을 읽지 못했습니다: ${b.text.slice(0, 200)}`);
      }
      break;
    }

    // 근거 대조. 모델이 적은 링크가 후보의 근거 목록에 실제로 있는지 본다.
    const known = new Map(c.evidence.map((e) => [e.url, e.source]));
    const cards: Card[] = (parsed.cards ?? []).slice(0, slides).map((raw, i) => {
      const url = String(raw.source_url ?? '').trim();
      const known_ = known.get(url);
      return {
        no: i + 1,
        kind: (['표지', '본문', '마지막장'].includes(String(raw.kind)) ? raw.kind : '본문') as Card['kind'],
        headline: String(raw.headline ?? '').trim(),
        body: String(raw.body ?? '').trim(),
        // 후보 근거에 없는 링크는 버린다. 있는 척하는 출처가 제일 나쁘다.
        sourceUrl: known_ ? url : undefined,
        sourceName: known_,
      };
    });

    const unsourced = cards.filter((x) => x.kind === '본문' && !x.sourceUrl).length;

    // 서버에 구워 본다. 실패해도 원고는 그대로 남는다 — 이미 Claude 값을 치른 뒤다.
    const 서버 = await bake(cards, inputs);

    return {
      title: `카드뉴스 원고 — ${c.subject}`,
      output: { cards, caption: parsed.caption ?? '', account: inputs.account || '', unsourced, usage: res.usage, 서버 },
      preview: {
        kind: 'markdown' as const,
        value: render(cards, parsed.caption ?? '', unsourced),
      },
    };
  },
};

function render(cards: Card[], caption: string, unsourced: number): string {
  const L: string[] = [];
  for (const c of cards) {
    L.push(`── ${c.no}. ${c.kind} ─────────────`);
    L.push(`  ${c.headline}`);
    if (c.body) L.push(`  ${c.body}`);
    if (c.sourceUrl) L.push(`  출처: ${c.sourceName} ${c.sourceUrl}`);
    else if (c.kind === '본문') L.push('  ⚠ 출처를 대지 못한 카드');
    L.push('');
  }
  if (caption) {
    L.push('── 캡션 ─────────────');
    L.push(caption);
  }
  if (unsourced) {
    L.push('');
    L.push(`⚠ 본문 카드 ${unsourced}장이 근거 링크를 대지 못했습니다. 그대로 올리지 마세요.`);
  }
  return L.join('\n');
}

/** 서버가 구워 준 카드 한 장. */
export interface BakedSlide {
  index: number;
  url: string;
  w?: number;
  h?: number;
}

export interface Baked {
  job?: string;
  slides?: BakedSlide[];
  오류?: string;
}

/**
 * 원고를 렌더 서버에 넘겨 카드로 굽는다 (`POST /render`).
 *
 * 브라우저 시안은 그대로 둔다. 시안은 즉시 보이고 문구를 고치며 판단하는 자리고,
 * 서버 카드는 실제로 올릴 그림이다. 둘은 대체 관계가 아니다.
 *
 * **실패해도 던지지 않는다.** 무료 티어라 자거나 죽어 있을 수 있는데,
 * 그때 원고 생성 전체가 무너지면 앱이 남의 서버 상태에 묶인다.
 */
async function bake(cards: Card[], inputs: Record<string, string>): Promise<Baked | undefined> {
  const style = (inputs.style ?? '').trim();
  if (!hasRender() || !style) return undefined;

  try {
    const deck = deckFromCards(cards, {
      template: inputs.template || 'explain_box',
      style,
      account: inputs.account || '',
      kicker: (inputs.kicker as '안 씀') || '안 씀',
    });

    // 서버가 아는 것인지 먼저 본다. 굽는 데까지 가서 실패하면 왕복이 더 든다.
    const h = await cachedHealth();
    if (h) {
      const 검사 = checkDeck(deck, h);
      if (!검사.ok) return { 오류: 검사.reason };
    }

    const r = (await renderDeck(deck)) as { job?: string; slides?: BakedSlide[] };
    return { job: r.job, slides: r.slides };
  } catch (e) {
    return { 오류: e instanceof Error ? e.message : String(e) };
  }
}
