import Anthropic from '@anthropic-ai/sdk';
import type { Post } from './tikhub';

/**
 * 썸네일에 박힌 자막을 읽는다. **영상을 분석하지 않는다** — 이미지 한 장만 본다.
 *
 * 포맷 이름은 캡션보다 **자막**에 있는 경우가 많다. 만든 사람이 첫 화면에 제목처럼
 * 박아 두기 때문이다. 2026-09-19 밈 회차에서 `배드챌린지`·`쇼츠 중독 테스트`·
 * `남자 유행어 TOP4`·`무한도전 챌린지` 가 전부 자막에서 나왔다.
 *
 * 비용은 장당 588토큰으로 일정하다(`count_tokens` 실측, 세 장 모두 동일).
 * 90장이면 입력 약 52,000 토큰 ≈ $0.3. 배치로 묶어 왕복을 줄인다.
 *
 * 실패한 장은 조용히 건너뛴다 — 썸네일 URL 은 만료되는 서명 링크라 일부는 못 받는다.
 */

const MODEL = 'claude-opus-5';
/** 점수 판정은 단순한 시각 판단이라 값싼 모델로도 된다(사용자 결정 2026-09-19). */
export const SCORE_MODEL = 'claude-haiku-4-5';
/** 한 번에 몇 장을 넣을까. 이미지가 입력을 지배하므로 크게 묶어도 절약폭은 작다. */
const BATCH = 8;

const SYSTEM = `너는 영상 썸네일에 **박혀 있는 글자**를 그대로 옮기는 추출기다.

- 화면에 얹힌 자막·제목만 옮긴다. 줄바꿈은 공백 하나로 바꾼다.
- 상품 포장지·간판·배경에 원래 있던 글자는 옮기지 않는다. 영상 제작자가 얹은 글자만이다.
- 없으면 빈 문자열. 억지로 채우지 않는다.
- 해석하거나 설명하지 않는다. 글자만.
- 각 이미지 앞에 붙은 번호를 그대로 돌려준다.`;

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
        required: ['i', 'text'],
        properties: { i: { type: 'number' }, text: { type: 'string' } },
      },
    },
  },
} as const;

async function grab(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer()).toString('base64');
  } catch {
    return null;
  }
}

/**
 * 썸네일이 있는 게시물의 자막을 읽어 `sourceId → 자막` 으로 돌려준다.
 * 자막이 없던 장은 아예 넣지 않는다 — 빈 문자열을 넣으면 세는 쪽에서 헷갈린다.
 */
export async function readThumbText(posts: Post[]): Promise<Map<string, string>> {
  const targets = posts.filter((p) => p.thumbnail);
  const out = new Map<string, string>();
  if (!targets.length) return out;

  const imgs: { post: Post; b64: string }[] = [];
  for (let i = 0; i < targets.length; i += 10) {
    const part = await Promise.all(
      targets.slice(i, i + 10).map(async (p) => ({ post: p, b64: await grab(p.thumbnail!) })),
    );
    for (const x of part) if (x.b64) imgs.push({ post: x.post, b64: x.b64 });
  }
  if (!imgs.length) return out;

  const client = new Anthropic();
  for (let b = 0; b < imgs.length; b += BATCH) {
    const part = imgs.slice(b, b + BATCH);
    const content: Anthropic.MessageParam['content'] = [];
    part.forEach((x, k) => {
      content.push({ type: 'text', text: `### ${b + k}` });
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: x.b64 } });
    });
    let res: Anthropic.Message;
    try {
      res = await client.messages.create({
        model: MODEL,
        max_tokens: 4000,
        system: SYSTEM,
        output_config: { format: { type: 'json_schema', schema: SCHEMA } },
        messages: [{ role: 'user', content }],
      });
    } catch {
      continue; // 한 배치가 죽어도 나머지는 읽는다
    }
    for (const blk of res.content) {
      if (blk.type !== 'text') continue;
      let parsed: { items?: { i: number; text: string }[] };
      try {
        parsed = JSON.parse(blk.text) as typeof parsed;
      } catch {
        break;
      }
      for (const it of parsed.items ?? []) {
        const hit = imgs[it.i];
        const text = (it.text ?? '').trim();
        if (hit && text) out.set(hit.post.sourceId, text);
      }
      break;
    }
  }
  return out;
}

/* ─────────────────────── 대표 사진 고르기 ─────────────────────── */

/**
 * 이 썸네일에 **캐릭터가 크게 보이는가.** 0·1·2 세 단계다.
 *
 * 왜 필요한가. 대표 썸네일이 사람 얼굴로 나온다. `reference.ts` 가 최신순으로만
 * 고르는데 언박싱 영상의 첫 프레임이 대개 사람이라, 그게 큰 자리를 먹고 캐릭터가
 * 보이는 장이 뒤로 밀린다. 순서를 정할 때 **내용을 한 번은 봐야** 한다.
 *
 * 점수는 `PostRecord.charShot` 에 저장해 회차마다 다시 묻지 않는다.
 */
const SCORE_SYSTEM = `너는 영상 썸네일에 **캐릭터가 크게 보이는지**만 매기는 판정기다.

캐릭터란 그림·인형·피규어·키링·굿즈에 그려지거나 만들어진 **가상의 등장인물**이다.

## 점수
- 2 : 캐릭터가 화면의 주인공이다. 인형·피규어·굿즈가 크게 잡혔거나 그림이 화면을 채운다
- 1 : 캐릭터가 보이긴 하나 작거나 일부만 나온다. 매장 진열처럼 여럿이 작게 있는 것도 1
- 0 : 캐릭터가 없거나 알아볼 수 없다. **사람 얼굴·상반신이 주인공인 장면은 0**,
      글자만 있는 장면·빈 배경·포장 상자만 있는 장면도 0

사람이 캐릭터 굿즈를 들고 있으면, **굿즈가 크게 잡혔으면 2, 사람이 주인공이면 0** 이다.
망설여지면 낮은 쪽을 준다 — 대표 사진을 고르는 데 쓰는 점수라 틀리면 얼굴이 대표가 된다.

각 이미지 앞에 붙은 번호를 그대로 돌려준다.`;

const SCORE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['i', 'score'],
        properties: { i: { type: 'number' }, score: { type: 'number', enum: [0, 1, 2] } },
      },
    },
  },
} as const;

/** `sourceId → 0|1|2`. 못 받은 장은 넣지 않는다 — 0 과 "안 물어봄"은 다르다. */
export async function scoreThumbs(
  posts: Post[],
  model: string = SCORE_MODEL,
): Promise<{ scores: Map<string, number>; usage: { input: number; output: number } }> {
  const out = new Map<string, number>();
  const usage = { input: 0, output: 0 };
  const targets = posts.filter((p) => p.thumbnail);
  if (!targets.length) return { scores: out, usage };

  const imgs: { post: Post; b64: string }[] = [];
  for (let i = 0; i < targets.length; i += 10) {
    const part = await Promise.all(
      targets.slice(i, i + 10).map(async (p) => ({ post: p, b64: await grab(p.thumbnail!) })),
    );
    for (const x of part) if (x.b64) imgs.push({ post: x.post, b64: x.b64 });
  }

  const client = new Anthropic();
  for (let b = 0; b < imgs.length; b += BATCH) {
    const part = imgs.slice(b, b + BATCH);
    const content: Anthropic.MessageParam['content'] = [];
    part.forEach((x, k) => {
      content.push({ type: 'text', text: `### ${b + k}` });
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: x.b64 } });
    });
    let res: Anthropic.Message;
    try {
      res = await client.messages.create({
        model,
        max_tokens: 2000,
        system: SCORE_SYSTEM,
        output_config: { format: { type: 'json_schema', schema: SCORE_SCHEMA } },
        messages: [{ role: 'user', content }],
      });
    } catch {
      continue;
    }
    usage.input += res.usage.input_tokens;
    usage.output += res.usage.output_tokens;
    for (const blk of res.content) {
      if (blk.type !== 'text') continue;
      let parsed: { items?: { i: number; score: number }[] };
      try {
        parsed = JSON.parse(blk.text) as typeof parsed;
      } catch {
        break;
      }
      for (const it of parsed.items ?? []) {
        const hit = imgs[it.i];
        if (hit && [0, 1, 2].includes(it.score)) out.set(hit.post.sourceId, it.score);
      }
      break;
    }
  }
  return { scores: out, usage };
}
