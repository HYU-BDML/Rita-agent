import Anthropic from '@anthropic-ai/sdk';
import { stripLoneSurrogates } from '../core/text';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Producer } from '../core/adapters';
import type { Candidate } from '../core/candidate';
import { fetchBytes, textToImage } from '../core/fal';
import { hasRender, pieceUrl, renderTitle, uploadPiece } from '../core/render';
import { RATIOS, RATIO_NAMES, isRatioName, type Poster, type RatioName } from './poster-shape';
import { brief } from './shared';

/**
 * 주제 포스터 — 앱이 직접 만든다. Dify 도, 렌더 서버도 거치지 않는다.
 *
 * 두 가지를 갈라서 각자 잘하는 쪽에 맡긴다.
 *   1) 키비주얼  — fal FLUX 가 그린다. 글자는 한 자도 넣지 않는다.
 *   2) 한글 카피 — Claude 가 후보 근거로만 쓰고, 브라우저가 CSS 로 얹는다.
 * FLUX 는 한글 자모를 뭉갠다. 이미지에 한글을 시키면 반드시 깨진다.
 * 그래서 글자는 처음부터 이미지 밖에 둔다. 카드뉴스에서 쓴 수와 같다.
 *
 * 주제 후보(unit: 'topic')만 받는다. 캐릭터는 외형이 곧 남의 권리라
 * 공식 레퍼런스를 물리는 다른 길이 필요하다 — visual.ts 의 imageProducer 쪽이다.
 */

const MODEL = 'claude-opus-5';

export { RATIOS, RATIO_NAMES, type Poster, type RatioName } from './poster-shape';

/**
 * 렌더 서버 `/image/타이틀` 이 받는 선택지. GET 으로 물어보면 그대로 나온다.
 * 화면 입력칸은 정적이라 여기 적어 두되, 서버가 바꾸면 굽기가 거절하므로 그때 맞춘다.
 */
export const 자리들 = ['아래', '가운데', '위'] as const;
export const 글자크기들 = ['크게', '아주 크게', '보통', '작게'] as const;
export const 어둡게들 = ['아래쪽만', '조금', '많이', '없음'] as const;
/** 서버가 아는 강조색. 임의 색은 안 받는다. */
export const 강조색들 = ['없음', '#22E39A', '#FF7A2F', '#2B5BE8', '#FFD400'] as const;

/**
 * 헤드라인에서 강조할 구절을 별표로 감싼다. 서버가 별표 안쪽을 강조색으로 칠한다.
 *
 * 모델이 헤드라인에 없는 구절을 짚을 수 있다. 그때는 감싸지 않고 그대로 둔다 —
 * 억지로 끼우면 문장이 깨진다. 앞의 한 번만 감싼다.
 */
export function 별표(headline: string, 강조: string): string {
  const h = headline.trim();
  const e = (강조 ?? '').trim();
  if (!e || !h.includes(e)) return h;
  return h.replace(e, `*${e}*`);
}

export const STYLES: Record<string, string> = {
  '그래픽 추상': 'bold flat graphic poster art, geometric shapes, large areas of solid color, screen-print feel',
  일러스트: 'editorial illustration, clean linework, limited palette, printed magazine feel',
  '사진 질감': 'photographic still life of objects and places, natural light, shallow depth of field',
  미니멀: 'minimal composition, vast negative space, one simple subject, muted palette',
};

/**
 * 초상 요청을 막는다.
 *
 * 주제 후보에는 실존 인물이 그대로 들어 있다 — 정치인·연예인·피의자.
 * 그 얼굴을 만들어 붙이면 그건 포스터가 아니라 조작된 사진이다.
 * 모델에게 하지 말라고 시키는 것만으로는 부족해서 나온 프롬프트를 한 번 더 본다.
 */
const LIKENESS = [
  'portrait',
  'face of',
  'facial',
  'likeness',
  'celebrity',
  'politician',
  'president',
  'headshot',
  'selfie',
  'lookalike',
  'resembling',
  'photo of a man',
  'photo of a woman',
  'realistic person',
  'real person',
];

export function likenessHits(prompt: string): string[] {
  const p = prompt.toLowerCase();
  return LIKENESS.filter((w) => p.includes(w));
}

export function assertNoLikeness(prompt: string): void {
  const hits = likenessHits(prompt);
  if (hits.length) {
    throw new Error(
      `실존 인물의 얼굴을 그리려는 프롬프트라 막았습니다 (${hits.join(', ')}). ` +
        '주제 포스터는 인물 초상 없이 만듭니다. 다시 실행하면 다른 프롬프트가 나옵니다.',
    );
  }
}

/** 모델이 쓴 키비주얼 문장에 스타일과 '글자 금지'를 물린다. */
export function buildVisualPrompt(visual: string, style: string): string {
  const look = STYLES[style] ?? STYLES['그래픽 추상'];
  return [
    visual.trim(),
    look,
    // 한글은 CSS 로 얹는다. 이미지 안에 글자가 들어오면 겹쳐서 못 쓴다.
    'no text, no letters, no words, no numbers, no logos, no watermark',
    'no identifiable people, no faces',
  ].join('. ');
}

/** 모델이 적은 출처가 후보 근거에 실제로 있는지 본다. 없으면 버린다. */
export function pickSource(
  url: string,
  evidence: Candidate['evidence'],
): { sourceUrl?: string; sourceName?: string } {
  const hit = evidence.find((e) => e.url === url.trim());
  return hit ? { sourceUrl: hit.url, sourceName: hit.source } : {};
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['kicker', 'headline', 'subhead', 'visual_prompt', 'source_url'],
  properties: {
    kicker: { type: 'string', description: '머리말. 8자 이내. 분류나 한 마디.' },
    headline: { type: 'string', description: '포스터에 제일 크게 들어갈 한글 문구. 18자 이내.' },
    subhead: { type: 'string', description: '그 아래 작은 한글 한 줄. 40자 이내.' },
    emphasis: {
      type: 'string',
      description:
        '헤드라인 중 색을 입힐 짧은 구절. 반드시 헤드라인에 그대로 있는 말이어야 한다. ' +
        '강조할 것이 없으면 빈 문자열.',
    },
    visual_prompt: {
      type: 'string',
      description:
        '배경 키비주얼을 그릴 영어 프롬프트. 사물·장소·질감·색으로만 쓴다. ' +
        '사람의 얼굴이나 특정 인물을 절대 넣지 않는다. 글자도 넣지 않는다.',
    },
    source_url: { type: 'string', description: '헤드라인 근거가 된 기사 링크. 근거 목록에 있는 것만.' },
  },
} as const;

const SYSTEM = `너는 주어진 근거만으로 주제 포스터의 문구와 키비주얼을 정한다.

## 절대 규칙
- 근거 목록에 없는 사실을 쓰지 않는다. 배경지식으로 문장을 채우지 않는다.
- 숫자는 근거에 적힌 것만 쓴다. 어림잡지 않는다.
- source_url 은 근거 목록에 그대로 있는 링크만 적는다. 지어내지 않는다.

## 키비주얼 (visual_prompt)
- 영어로 쓴다. 사물·장소·질감·빛·색만으로 장면을 세운다.
- 실존 인물을 그리지 않는다. 얼굴·초상·유명인을 뜻하는 말을 쓰지 않는다.
  사람이 꼭 필요하면 뒷모습이나 실루엣, 군중처럼 알아볼 수 없는 형태로만 둔다.
- 글자·로고·표지판을 넣지 않는다. 한글은 나중에 따로 얹는다.
- 주제를 직역한 삽화보다 한 겹 물러선 상징이 낫다. 사건 재현은 하지 않는다.

## 문구
- 짧은 문장. 수식어를 덜어낸다.
- 과장하지 않는다. '충격', '역대급', '난리' 같은 말을 쓰지 않는다.
- 확인되지 않은 것은 단정하지 않는다. 의혹은 의혹이라고 쓴다.`;

export const posterNativeProducer: Producer = {
  id: 'poster-native',
  name: '주제 포스터',
  description:
    '후보의 근거로 한글 카피를 쓰고, fal FLUX 로 글자 없는 키비주얼을 그려 한 장으로 얹습니다. 실존 인물의 얼굴은 만들지 않습니다.',
  accepts: ['topic'],
  keyEnv: 'FAL_KEY',

  gate(c) {
    if (!c.evidence.length) {
      return { ok: false, reason: '근거 링크가 없습니다. 출처를 댈 수 있는 포스터를 만들 수 없습니다.' };
    }
    return { ok: true };
  },

  mapInputs(c) {
    return { material: brief(c) };
  },

  extraInputs: [
    { name: 'ratio', label: '비율', type: 'select', default: '4:5', options: RATIO_NAMES },
    { name: 'style', label: '결', type: 'select', default: '그래픽 추상', options: Object.keys(STYLES) },
    { name: 'account', label: '계정·브랜드 이름 (아래에 들어감)', type: 'text' },
    // 아래 넷은 렌더 서버가 굽는 방식. 브라우저 시안에는 안 쓰이고 서버 표지에만 걸린다.
    { name: '자리', label: '글자 자리 (서버)', type: 'select', default: '아래', options: [...자리들] },
    { name: '글자크기', label: '글자 크기 (서버)', type: 'select', default: '크게', options: [...글자크기들] },
    { name: '사진어둡게', label: '사진 어둡게 (서버)', type: 'select', default: '아래쪽만', options: [...어둡게들] },
    { name: '강조색', label: '강조색 (서버)', type: 'select', default: '없음', options: [...강조색들] },
  ],

  async run(inputs, c, ctx) {
    const ratio: RatioName = isRatioName(inputs.ratio ?? '') ? (inputs.ratio as RatioName) : '4:5';
    const style = inputs.style && STYLES[inputs.style] ? inputs.style : '그래픽 추상';
    const account = inputs.account || '';

    if (ctx.mock) {
      // 키가 없어도 화면이 돈다. 다만 그림은 없고 문구 자리만 보인다.
      const poster: Poster = {
        headline: c.subject,
        subhead: c.why,
        kicker: c.verdict,
        account,
        ratio,
        imageUrl: '',
        visualPrompt: buildVisualPrompt('(목 모드 — fal 을 부르지 않았습니다)', style),
        ...pickSource(c.evidence[0]?.url ?? '', c.evidence),
      };
      return { title: `포스터 — ${c.subject}`, output: { poster }, preview: { kind: 'json' as const, value: poster.headline } };
    }

    if (!process.env.ANTHROPIC_API_KEY?.trim()) {
      throw new Error('ANTHROPIC_API_KEY 가 없습니다. 포스터 문구를 쓸 수 없습니다.');
    }

    /* 1. 문구와 키비주얼 — Claude */
    const client = new Anthropic();
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: SYSTEM,
      thinking: { type: 'adaptive' },
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      messages: [
        {
          role: 'user',
          content: [
            `비율 ${ratio} 포스터 한 장. 결: ${style}.`,
            account ? `계정 이름: ${account}` : '',
            '',
            '## 근거 자료',
            stripLoneSurrogates(String(inputs.material ?? '')),
          ]
            .filter(Boolean)
            .join('\n'),
        },
      ],
    });

    let parsed: Record<string, unknown> = {};
    for (const b of res.content) {
      if (b.type !== 'text') continue;
      try {
        parsed = JSON.parse(b.text) as Record<string, unknown>;
      } catch {
        throw new Error(`포스터 응답을 읽지 못했습니다: ${b.text.slice(0, 200)}`);
      }
      break;
    }

    const visual = String(parsed.visual_prompt ?? '').trim();
    if (!visual) throw new Error('키비주얼 프롬프트가 비어 있습니다.');
    assertNoLikeness(visual);
    const prompt = buildVisualPrompt(visual, style);

    /* 2. 키비주얼 — fal FLUX */
    const fal = await textToImage({ prompt, imageSize: RATIOS[ratio].fal });
    const first = fal.images.findIndex((_, i) => !fal.nsfw[i]);
    if (first < 0) throw new Error('안전 필터에 걸려 쓸 수 있는 이미지가 없습니다. 프롬프트를 바꿔 다시 실행하세요.');

    /* 3. fal 링크는 만료된다. 바이트를 받아 public/gen 에 둔다. */
    const bytes = await fetchBytes(fal.images[first].url);
    const file = `${ctx.runId}.jpg`;
    const dir = path.join(process.cwd(), 'public', 'gen');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, file), bytes);

    /* 4. 렌더 서버에 표지로 굽는다. 실패해도 포스터는 그대로 남는다. */
    const 서버 = await bakeOnServer(
      bytes,
      file,
      {
        제목: 별표(String(parsed.headline ?? ''), String(parsed.emphasis ?? '')),
        부제: String(parsed.subhead ?? '').trim(),
      },
      inputs,
    );

    const poster: Poster = {
      headline: String(parsed.headline ?? '').trim(),
      subhead: String(parsed.subhead ?? '').trim(),
      kicker: String(parsed.kicker ?? '').trim(),
      account,
      ratio,
      imageUrl: `/gen/${file}`,
      visualPrompt: prompt,
      ...pickSource(String(parsed.source_url ?? ''), c.evidence),
    };

    return {
      title: `포스터 — ${c.subject}`,
      output: { poster, model: MODEL, seed: fal.seed, usage: res.usage, 서버 },
      preview: { kind: 'image' as const, value: poster.imageUrl },
    };
  },
};

/**
 * 렌더 서버에 표지로 굽는다 (`/image/타이틀` — '사진 위에 제목을 얹어 표지를 만든다').
 *
 * 우리 포스터와 같은 물건이라 그대로 넘어간다. 서버 쪽이 나은 점은 자동화다 —
 * 브라우저 CSS 시안은 사람이 탭을 열어야 그려지는데, 이건 사람 없이 구워진다.
 *
 * **실패해도 던지지 않는다.** 서버는 무료 티어라 자고 있거나 죽어 있을 수 있고,
 * 그때 포스터 생성 전체가 무너지면 앱이 남의 서버 상태에 묶인다.
 * 이미 fal 값을 치른 뒤라 더욱 그렇다.
 */
async function bakeOnServer(
  bytes: Uint8Array,
  name: string,
  글: { 제목: string; 부제: string },
  inputs: Record<string, string>,
): Promise<{ 조각?: string; 주소?: string; 제목?: string; 오류?: string } | undefined> {
  if (!hasRender()) return undefined;
  try {
    // 굽기는 조각 번호를 못 알아듣는다. 올린 뒤 받은 절대 경로만 먹는다.
    const 올린것 = await uploadPiece(bytes, name);
    const 구운것 = await renderTitle({
      사진경로: 올린것.경로,
      제목: 글.제목,
      부제: 글.부제,
      정렬: '왼쪽',
      자리: (inputs.자리 as '아래') || '아래',
      글자크기: (inputs.글자크기 as '크게') || '크게',
      // 우리가 손으로 짜던 scrim 이 서버에는 이 이름으로 있다.
      사진어둡게: (inputs.사진어둡게 as '아래쪽만') || '아래쪽만',
      강조색: inputs.강조색 && inputs.강조색 !== '없음' ? inputs.강조색 : undefined,
    });
    return { 조각: 구운것.번호, 주소: pieceUrl(구운것.번호), 제목: 글.제목 };
  } catch (e) {
    return { 오류: e instanceof Error ? e.message : String(e) };
  }
}
