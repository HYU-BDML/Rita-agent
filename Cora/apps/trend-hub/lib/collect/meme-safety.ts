import Anthropic from '@anthropic-ai/sdk';
import { cut } from '../core/text';
import type { Post } from './tikhub';

/**
 * 밈 후보 안전 판정 — **차단 · 표시 · 통과 3단.**
 *
 * 왜 필요한가. 2026-09-19 첫 회차에서 1위가 `야차룰`(계정 14곳)이었는데,
 * 규칙 없이 싸우는 유행이고 **청주에서 20대 여성이 강제로 싸움에 내몰려 숨진 사건**이
 * 얽혀 있었다. 이 앱은 후보에서 카드뉴스를 만드는 도구라, 그대로 두면 폭력 유행에
 * 올라타는 콘텐츠를 권하는 셈이 된다.
 *
 * 캐릭터 축은 `rights` 가 "만들면 안 되는 것"을 가린다. 밈은 권리 문제가 아니라
 * **안전 문제**라 그 자리를 이 판정이 맡는다. `dropAdult` 는 성인물만 보므로 부족하다.
 *
 * ── 3단으로 나눈 이유 ───────────────────────────────────────────
 * 2단(막거나 통과)으로 하면 애매한 것을 전부 막게 되고, 그러면 **블랙 코미디·자조·과장**이
 * 자해로 오판되어 멀쩡한 밈이 사라진다. 그게 제일 흔한 오판이다.
 * 그래서 **애매하면 차단이 아니라 표시**로 기울인다. 표시는 화면에 뜨고 생성도 된다 —
 * 사람이 보고 판단하라는 뜻이지 막는다는 뜻이 아니다.
 *
 * 판정에는 **근거 문장을 같이 받는다.** 오판을 눈으로 잡으려면 "무엇을 보고 그렇게
 * 봤는가"가 있어야 한다. 근거 없는 차단은 고칠 수가 없다.
 */

const MODEL = 'claude-opus-5';

export type SafetyLevel = 'blocked' | 'flagged' | 'ok';

export interface MemeSafety {
  level: SafetyLevel;
  /** 왜 그렇게 봤나. 한 줄. */
  reason: string;
  /** 그렇게 본 근거가 된 캡션 문장을 **원문 그대로**. 오판을 눈으로 잡는 자리다. */
  evidence: string;
}

export interface SafetyVerdict extends MemeSafety {
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
        required: ['name', 'level', 'reason', 'evidence'],
        properties: {
          name: { type: 'string' },
          level: { type: 'string', enum: ['blocked', 'flagged', 'ok'] },
          reason: { type: 'string' },
          evidence: { type: 'string', description: '캡션 문장을 그대로 옮긴다. 없으면 빈 문자열.' },
        },
      },
    },
  },
} as const;

const SYSTEM = `너는 유행 포맷이 콘텐츠로 다루기 안전한지 3단으로 가르는 판정기다.
이 판정은 **콘텐츠 제작 도구**에서 쓰인다 — 카드뉴스를 만들 후보를 고르는 자리다.

## 3단
- blocked : **명확히 위험한 것만.** 셋 중 하나에 확실히 해당할 때.
    1) 사람이 실제로 다치거나 죽은 사건이 얽힌 유행
    2) 자해·자살의 방법을 보여 주거나 부추기는 것
    3) 성적인 표현이 핵심인 것
  "그럴 수도 있다" 로는 blocked 를 주지 않는다. 자료에 그렇게 적혀 있어야 한다.

- flagged : **애매한 것.** 블랙 코미디, 자조 섞인 농담, 과장된 표현, 거친 말장난,
  위험해 보이지만 실제 위해는 없는 장난, 판단이 갈릴 만한 것.
  화면에 뜨고 만들 수도 있다. **사람에게 한 번 보라는 표시**지 막는 게 아니다.

- ok : 나머지.

## 가장 흔한 오판
**블랙 코미디·자조를 자해로 읽는 것이다.** "죽고 싶다", "나 망했어", "인생 끝났다" 같은
말은 한국어에서 과장된 관용 표현인 경우가 대부분이다. 실제 방법이나 실행이 없으면
blocked 가 아니다. **애매하면 flagged 로 기울여라.** 막아서 잃는 것이 표시해서 잃는 것보다 크다.

## 근거
evidence 에는 그렇게 판단한 **캡션 문장을 원문 그대로** 옮긴다. 요약하거나 풀어 쓰지 않는다.
사람이 그 문장만 보고 판정이 맞는지 가릴 수 있어야 한다. ok 면 빈 문자열이어도 된다.
reason 은 한 줄로 짧게.

판정은 **유행 포맷 자체**에 대한 것이다. 그 포맷을 다룬 뉴스 보도가 섞여 있다고 해서
보도를 근거로 포맷을 안전하다고 보지 않는다 — 보도의 내용이 곧 그 포맷의 내용이다.`;

/** 이름 하나당 캡션 몇 개를 보여 줄까. 많이 넣어도 판단이 크게 달라지지 않는다. */
const PER_NAME = 6;

export async function judgeMemeSafety(
  items: { name: string; posts: Post[] }[],
): Promise<{ verdicts: SafetyVerdict[]; usage: { input: number; output: number } }> {
  if (!items.length) return { verdicts: [], usage: { input: 0, output: 0 } };

  const body = items
    .map((it) => {
      const lines = it.posts
        .slice(0, PER_NAME)
        .map((p) => `- ${cut((p.text || '').replace(/\s+/g, ' '), 180)}`);
      return `## ${it.name}\n${lines.join('\n') || '- (캡션 없음)'}`;
    })
    .join('\n\n');

  const client = new Anthropic();
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM,
    thinking: { type: 'adaptive' },
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: `## 유행 포맷과 캡션\n\n${body}` }],
  });

  const usage = { input: res.usage.input_tokens, output: res.usage.output_tokens };
  for (const b of res.content) {
    if (b.type !== 'text') continue;
    let raw: { items?: Array<Record<string, unknown>> };
    try {
      raw = JSON.parse(b.text) as typeof raw;
    } catch {
      throw new Error(`안전 판정 응답을 읽지 못했습니다: ${b.text.slice(0, 200)}`);
    }
    return { verdicts: pick(items, raw.items ?? []), usage };
  }
  return { verdicts: [], usage };
}

/**
 * 입력에 없던 이름은 버린다. 그리고 **모르는 등급은 통과로 두지 않는다** —
 * 판정이 깨져 등급이 비면 `flagged` 로 둔다. 안전 쪽으로 기울이되 막지는 않는다.
 */
export function pick(
  items: { name: string }[],
  rows: Array<Record<string, unknown>>,
): SafetyVerdict[] {
  const want = new Map(items.map((i) => [i.name.normalize('NFKC').trim(), i.name]));
  const seen = new Set<string>();
  const out: SafetyVerdict[] = [];
  for (const r of rows) {
    const name = want.get(String(r.name ?? '').normalize('NFKC').trim());
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const lv = String(r.level ?? '');
    const level: SafetyLevel = lv === 'blocked' || lv === 'ok' ? lv : 'flagged';
    out.push({
      name,
      level,
      reason: String(r.reason ?? '').trim(),
      evidence: String(r.evidence ?? '').trim(),
    });
  }
  return out;
}
