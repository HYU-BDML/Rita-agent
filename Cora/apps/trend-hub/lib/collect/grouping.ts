import Anthropic from '@anthropic-ai/sdk';
import { cut } from '../core/text';

/**
 * 같은 것끼리 묶기 — **재검색 앞에 세운다.**
 *
 * 2026-09-22 회차가 밈 후보 27건을 냈는데 그중 네 쌍이 같은 것이었다.
 *   BAD 챌린지 / 배드 챌린지              음차
 *   venom meme / 베놈 밈                 번역
 *   질문에 한 단어로 대답해줘 / 한 단어로 대답해줘   같은 말의 길고 짧은 판
 *   연애의 조건 챌린지 / 연애의 조건 행진곡      같은 트렌드에서 갈라진 것
 *
 * 중복 제거가 `store.key()` 문자열 비교뿐이라 그렇다 — `bad챌린지` 와 `배드챌린지` 는
 * 다른 글자다. 이름을 뽑는 LLM 은 있었지만 **뽑은 이름들끼리 같은 것인지 묻는 단계가
 * 없었다.** 그래서 같은 챌린지를 두 번 재검색하고(돈 두 번, 시간 두 번) 표에 두 줄로 앉았다.
 *
 * 재검색 **앞**에 두는 이유가 여기 있다. 뒤에 두면 중복만 지우지만, 앞에 두면
 * 재검색 호출 자체가 줄어 비용과 시간이 같이 내려간다.
 *
 * **이미 표에 있는 이름도 같이 준다.** 위 네 쌍은 한 회차 안에서 생긴 게 아니라 회차를
 * 건너뛰며 생겼다 — `BAD 챌린지` 는 09-18·09-22 회차가, `배드 챌린지` 는 09-18(다른
 * 회차)·09-21 회차가 냈다. 회차 안만 보면 그 회차에는 중복이 없으니 아무것도 안 묶인다.
 * 실제로 09-22 회차 이름 35개를 물었더니 0쌍이 나왔다.
 *
 * ── 합치는 것과 안 합치는 것 ─────────────────────────────────
 * 표기가 다른 같은 것만 합친다. **파생은 합치지 않는다** — 같은 음원에서 갈라진 두
 * 포맷은 따라 하는 사람도 만드는 방식도 다르다. 합치면 그 차이가 사라진다.
 * 대신 `related` 로 이어 두어 화면에서 곁에 보여 줄 수 있게 한다.
 */

const MODEL = 'claude-opus-5';

export interface NameGroup {
  /** 대표 이름. 입력에 있던 것 중 하나를 그대로 쓴다. */
  canonical: string;
  /** 같은 것으로 묶인 나머지 이름. 대표는 여기 들어가지 않는다. */
  aliases: string[];
  /** 합치지는 않지만 같은 트렌드에서 갈라진 것으로 보이는 대표 이름. */
  related: string[];
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['groups'],
  properties: {
    groups: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['canonical', 'aliases', 'related'],
        properties: {
          canonical: { type: 'string', description: '입력에 있던 이름 그대로.' },
          aliases: { type: 'array', items: { type: 'string' } },
          related: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
} as const;

const SYSTEM = `너는 유행 이름 목록에서 **같은 것끼리 묶는다.**

## 합친다 (같은 것이다)
- 음차·번역만 다른 것        BAD 챌린지 = 배드 챌린지 · venom meme = 베놈 밈
- 같은 말의 길고 짧은 판       질문에 한 단어로 대답해줘 = 한 단어로 대답해줘
- 띄어쓰기·대소문자·조사만 다른 것  기침챌린지 = 기침 챌린지

## 합치지 않는다
- **파생**: 같은 음원이나 트렌드에서 갈라졌지만 따라 하는 방식이 다른 것.
  연애의 조건 챌린지(춤)와 연애의 조건 행진곡(편집)은 **따로 둔다.**
  대신 서로를 related 에 적는다.
- 말이 겹칠 뿐 다른 유행. '1분챌린지'와 '1분 요리'는 다르다.

## 규칙
- canonical 은 **입력에 있던 이름을 글자 그대로** 쓴다. 새로 짓지 않는다.
- 줄에 '표에있음' 이 붙은 것은 **이미 화면에 올라 있는 이름**이다. 같은 것끼리 묶일 때는
  그쪽을 canonical 로 고른다. 이름이 바뀌면 사람이 보던 줄이 사라진 것처럼 보인다.
- 둘 다 '표에있음' 이거나 둘 다 '이번회차' 면, 더 널리 쓰일 이름을 고른다 —
  한국어 사용자가 검색창에 칠 만한 쪽이다.
- 묶을 것이 없는 이름도 그 이름 하나짜리 그룹으로 낸다. **입력의 모든 이름이 어딘가에 한 번씩 나와야 한다.**
- 망설여지면 **합치지 않는다.** 잘못 합치면 서로 다른 유행이 한 줄로 뭉개지는데, 안 합치면 두 줄로 남을 뿐이다.
- related 는 canonical 이름만 적는다.`;

export interface GroupInput {
  name: string;
  /** 무엇인지 가늠할 한 줄. 이름만으로는 파생인지 같은 것인지 안 갈린다. */
  hint?: string;
  /** 이미 표에 올라 있는 이름인가. 같은 것이면 **이쪽을 대표로** 삼는다. */
  existing?: boolean;
}

export async function groupNames(
  items: GroupInput[],
): Promise<{ groups: NameGroup[]; usage: { input: number; output: number } }> {
  const usage = { input: 0, output: 0 };
  // 하나뿐이면 물어볼 것이 없다. 빈 목록도 마찬가지다.
  if (items.length < 2) {
    return { groups: items.map((i) => ({ canonical: i.name, aliases: [], related: [] })), usage };
  }

  const table = items
    .map((i) => `${i.name}\t${i.existing ? '표에있음' : '이번회차'}\t${cut((i.hint ?? '').replace(/\s+/g, ' '), 120) || '-'}`)
    .join('\n');

  const client = new Anthropic();
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: `## 이름 목록\n${table}` }],
  });
  usage.input = res.usage.input_tokens;
  usage.output = res.usage.output_tokens;

  for (const b of res.content) {
    if (b.type !== 'text') continue;
    let parsed: { groups?: Array<Record<string, unknown>> };
    try {
      parsed = JSON.parse(b.text) as typeof parsed;
    } catch {
      throw new Error(`묶기 응답을 읽지 못했습니다: ${b.text.slice(0, 200)}`);
    }
    return { groups: pick(items, parsed.groups ?? []), usage };
  }
  return { groups: items.map((i) => ({ canonical: i.name, aliases: [], related: [] })), usage };
}

/**
 * 준 것만 받고, **빠진 이름은 혼자 세운다.**
 *
 * 모델이 이름을 빠뜨리면 그 유행이 조용히 사라진다. 묶기는 줄이는 일이지 버리는 일이
 * 아니므로, 어느 그룹에도 안 들어간 이름은 제 이름짜리 그룹으로 돌려놓는다.
 */
export function pick(items: GroupInput[], raw: Array<Record<string, unknown>>): NameGroup[] {
  const asked = new Map(items.map((i) => [i.name.trim(), i.name]));
  const used = new Set<string>();
  const groups: NameGroup[] = [];

  const isExisting = new Set(items.filter((i) => i.existing).map((i) => i.name));
  for (const g of raw) {
    let canonical = asked.get(String(g.canonical ?? '').trim());
    /*
     * 대표가 새 이름인데 별칭에 표에 있던 이름이 섞였으면 **대표를 그쪽으로 돌린다.**
     * 모델이 규칙을 놓쳐도 사람이 보던 줄의 이름이 바뀌지는 않게 한다.
     */
    if (canonical && !isExisting.has(canonical)) {
      const others = Array.isArray(g.aliases) ? g.aliases.map((a) => String(a ?? '').trim()) : [];
      const settled = others
        .map((a) => asked.get(a))
        .find((n): n is string => n !== undefined && isExisting.has(n) && !used.has(n));
      if (settled) {
        g.aliases = [canonical, ...others.filter((a) => a !== settled)];
        canonical = settled;
      }
    }
    if (!canonical || used.has(canonical)) continue;
    const aliases: string[] = [];
    for (const a of Array.isArray(g.aliases) ? g.aliases : []) {
      const name = asked.get(String(a ?? '').trim());
      // 대표를 별칭에 또 넣거나, 이미 다른 그룹이 가져간 이름은 받지 않는다.
      if (!name || name === canonical || used.has(name)) continue;
      used.add(name);
      aliases.push(name);
    }
    used.add(canonical);
    groups.push({
      canonical,
      aliases,
      related: (Array.isArray(g.related) ? g.related : [])
        .map((r) => String(r ?? '').trim())
        .filter((r) => asked.has(r) && r !== canonical),
    });
  }

  for (const i of items) {
    if (!used.has(i.name)) groups.push({ canonical: i.name, aliases: [], related: [] });
  }
  return groups;
}
