import Anthropic from '@anthropic-ai/sdk';
import { cut } from '../core/text';

/**
 * 캐릭터 출신 분류 — **어디서 온 캐릭터인가.**
 *
 * 캐릭터 화면의 하위 구획을 권리에서 출신으로 바꾸면서 생겼다. 권리(`rights`)와
 * **재는 것이 다르다** —
 *   출신  어디서 왔나      애니·만화 / 게임 / 브랜드 / 자캐
 *   권리  누구 것인가      individual / corporate / disputed / unknown
 * 그래서 갈래 이름을 `개인 창작` 이 아니라 **`자캐`** 로 둔다. 권리의 `individual` 과
 * 같은 말을 쓰면 화면에서 같은 것으로 읽힌다(2026-09-19 사용자 결정).
 * 둘이 어긋날 수 있고, 어긋나는 것 자체가 볼 만한 신호다.
 *
 * ── 지어내는 것을 막는 장치 ────────────────────────────────────────
 * 자료만으로는 **반만 갈린다.** `요술공주 세리`·`요리왕 비룡` 은 요약에 출처가 적혀
 * 있지만, `Rosalina`(슈퍼 마리오)·`Pomni`(Amazing Digital Circus)는 안 적혀 있다.
 * 모델은 그걸 **아는 것**이지 자료에서 읽은 게 아니다.
 *
 * 그래서 `basis` 를 같이 받는다 — `자료` 인지 `지식` 인지. 화면에서 `지식` 에는
 * **"추정"** 한 단어를 붙인다. 흐리게 처리하지 않는다 — 못 보고 지나간다.
 * 모르면 `모름` 으로 둔다. 넷 중 하나에 억지로 넣지 않는다.
 */

const MODEL = 'claude-opus-5';

export type LineageKind = '애니·만화' | '게임' | '브랜드' | '자캐' | '모름';
export const LINEAGE_KINDS: LineageKind[] = ['애니·만화', '게임', '브랜드', '자캐', '모름'];

export interface Lineage {
  kind: LineageKind;
  /** 출처 작품·브랜드 이름. 모르면 빈 문자열. */
  work: string;
  /** `자료` = 요약·근거에 적혀 있다 · `지식` = 모델이 아는 것(화면에 "추정"이 붙는다). */
  basis: '자료' | '지식';
  confidence: number;
}

export interface LineageVerdict extends Lineage {
  name: string;
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
        required: ['name', 'kind', 'work', 'basis', 'confidence'],
        properties: {
          name: { type: 'string' },
          kind: { type: 'string', enum: LINEAGE_KINDS },
          work: { type: 'string' },
          basis: { type: 'string', enum: ['자료', '지식'] },
          confidence: { type: 'number' },
        },
      },
    },
  },
} as const;

const SYSTEM = `너는 캐릭터가 **어디서 온 것인지**를 가르는 분류기다.

## 갈래 (겹치지 않는다. 하나만 고른다)
- 애니·만화 : 애니메이션·만화·웹툰·특촬물에서 온 캐릭터
- 게임      : 게임에서 온 캐릭터
- 브랜드    : 기업·상품·기관이 만든 마스코트나 캐릭터 IP (산리오·라인프렌즈·기업 마스코트)
- 자캐      : 개인이 만든 오리지널 캐릭터. 본문에 자캐·OC·오리지널 캐릭터 같은 말이 있거나
              계정 주인이 곧 그 캐릭터의 창작자인 경우
- 모름      : 위 넷 중 어디인지 **정할 수 없을 때.** 억지로 고르지 않는다

굿즈·인형·키링은 갈래가 아니다. 그건 형태이고, 어느 갈래든 굿즈가 나온다.

## basis — 어디서 알았나 (이게 이 작업에서 제일 중요하다)
- 자료 : 주어진 요약·근거에 출처가 **적혀 있다**. 예) 요약에 "요리왕 비룡" 이 있다
- 지식 : 자료에는 없고 **네가 아는 것**이다. 예) Rosalina 가 슈퍼 마리오 캐릭터인 것

**둘을 섞지 마라.** 자료에 없는데 자료라고 하면 사람이 검증할 길이 사라진다.
자료에 없고 너도 모르면 kind 를 "모름", work 를 빈 문자열로 둔다.

## work
출처 작품·브랜드 이름을 짧게. 모르면 빈 문자열. **지어내지 않는다.**

## confidence
0.9 = 자료에 분명히 적혀 있다 · 0.6 = 아는 캐릭터이고 확실하다
0.4 = 아마 그럴 것이다 · 0.2 이하면 kind 를 "모름" 으로 두는 편이 낫다

입력에 있는 이름만 돌려준다.`;

export interface LineageInput {
  name: string;
  ownership: string;
  summary: string;
  evidence: string[];
}

export async function classifyLineage(
  items: LineageInput[],
): Promise<{ verdicts: LineageVerdict[]; usage: { input: number; output: number } }> {
  if (!items.length) return { verdicts: [], usage: { input: 0, output: 0 } };

  const table = items
    .map(
      (i) =>
        `${i.name}\t권리:${i.ownership}\t요약:${cut(i.summary.replace(/\s+/g, ' '), 260) || '-'}\t근거:${i.evidence
          .slice(0, 2)
          .map((e) => cut(e.replace(/\s+/g, ' '), 70))
          .join(' / ') || '-'}`,
    )
    .join('\n');

  const client = new Anthropic();
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    thinking: { type: 'adaptive' },
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: `## 캐릭터 목록\n${table}` }],
  });

  const usage = { input: res.usage.input_tokens, output: res.usage.output_tokens };
  for (const b of res.content) {
    if (b.type !== 'text') continue;
    let raw: { items?: Array<Record<string, unknown>> };
    try {
      raw = JSON.parse(b.text) as typeof raw;
    } catch {
      throw new Error(`출신 분류 응답을 읽지 못했습니다: ${b.text.slice(0, 200)}`);
    }
    return { verdicts: pick(items, raw.items ?? []), usage };
  }
  return { verdicts: [], usage };
}

/**
 * 입력에 없던 이름은 버린다(`names.ts` 원문 대조와 같은 장치).
 * 모르는 갈래는 `모름` 으로 떨어뜨린다 — 넷 중 아무 데나 넣는 것보다 낫다.
 */
export function pick(
  items: { name: string }[],
  rows: Array<Record<string, unknown>>,
): LineageVerdict[] {
  const want = new Map(items.map((i) => [i.name.normalize('NFKC').trim(), i.name]));
  const seen = new Set<string>();
  const out: LineageVerdict[] = [];
  for (const r of rows) {
    const name = want.get(String(r.name ?? '').normalize('NFKC').trim());
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const k = String(r.kind ?? '') as LineageKind;
    const kind = LINEAGE_KINDS.includes(k) ? k : '모름';
    out.push({
      name,
      kind,
      work: kind === '모름' ? '' : String(r.work ?? '').trim(),
      basis: String(r.basis ?? '') === '자료' ? '자료' : '지식',
      confidence: Number(r.confidence ?? 0),
    });
  }
  return out;
}
