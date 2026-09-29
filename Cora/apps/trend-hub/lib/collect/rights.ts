import Anthropic from '@anthropic-ai/sdk';
import { cut } from '../core/text';
import type { VerifiedName } from './names';

/**
 * 권리 귀속과 제작 가능 여부.
 *
 * 이 앱의 차별점이 여기 있다 — '트렌드로 콘텐츠 만들기'는 흔하지만
 * '만들면 안 되는 걸 막기'는 흔하지 않다.
 *
 * prompt_basis 가 생성기 게이트를 직접 움직인다:
 *   source_grounded    자료에 시각 근거가 있음 → 그대로 생성 가능
 *   reference_required 외형을 지어내면 안 됨   → 공식 레퍼런스를 물려야만
 *   none               생성 불가             → 기획까지만
 */

const MODEL = 'claude-opus-5';

export interface RightsVerdict {
  name: string;
  ownership: 'individual' | 'corporate' | 'disputed' | 'unknown';
  confidence: number;
  handle: string;
  evidence: string;
  whyTrending: string;
  trendGrounded: boolean;
  features: string;
  tone: string;
  contentAngle: string;
  visualGrounded: boolean;
  promptBasis: 'source_grounded' | 'reference_required' | 'none';
  imagePrompt: string;
  motionPrompt: string;
  negativePrompt: string;
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
        required: [
          'name', 'ownership', 'confidence', 'evidence', 'why_trending', 'trend_grounded',
          'visual_grounded', 'prompt_basis',
        ],
        properties: {
          name: { type: 'string' },
          ownership: { type: 'string', enum: ['individual', 'corporate', 'disputed', 'unknown'] },
          confidence: { type: 'number' },
          handle: { type: 'string', description: '원작자로 추정되는 계정. 없으면 빈 문자열.' },
          evidence: { type: 'string', description: '그렇게 본 근거를 자료에서 그대로.' },
          why_trending: { type: 'string' },
          trend_grounded: { type: 'boolean' },
          features: { type: 'string' },
          tone: { type: 'string' },
          content_angle: { type: 'string' },
          visual_grounded: { type: 'boolean' },
          prompt_basis: { type: 'string', enum: ['source_grounded', 'reference_required', 'none'] },
          image_prompt: { type: 'string' },
          motion_prompt: { type: 'string' },
          negative_prompt: { type: 'string' },
        },
      },
    },
  },
} as const;

const SYSTEM = `너는 검증된 캐릭터 후보의 권리 귀속을 판정하고 제작 메모를 쓴다.
주어진 자료만 쓴다. 외부 지식·날짜·외형을 보충하지 않는다.

## ownership
- individual: 개인 창작자의 것으로 보임 (계정 표시명이 곧 캐릭터명이거나, 창작자 선언이 있음)
- corporate: 기업·브랜드 IP
- disputed: 권리 주장이 엇갈림
- unknown: 자료로는 정할 수 없음

## trend_grounded
왜 지금 퍼지는지를 뒷받침하는 서로 다른 게시자 또는 플랫폼의 출처가 2개 이상일 때만 true 다.
단일 게시물이나 오디오 포맷의 인기만으로는 false 다.
false 이면 why_trending 은 "최근 확산 원인을 단정할 독립 출처가 부족함" 으로 쓴다.

## visual_grounded
색·형태·비율·의상 등 시각 특징이 자료에 명시되어 있고 그 근거를 인용할 수 있을 때만 true 다.
캐릭터명이나 '자캐'라고 적힌 것은 시각 근거가 아니다. 캡션에 외형 설명이 없으면 false 다.

## prompt_basis 와 프롬프트
- individual 이고 visual_grounded 가 true 일 때만 source_grounded 로 하고 세 프롬프트를 쓴다.
- corporate 는 visual_grounded 와 무관하게 reference_required 로 한다.
  (다음 코드 단계가 공식 레퍼런스 잠금 프롬프트를 일관되게 앞에 붙인다.)
  **프롬프트는 visual_grounded 가 true 일 때만 쓴다.** 자료에 색·형태·비율·의상이
  적혀 있으면 그것만 옮겨 적는다. false 면 세 프롬프트를 비운다 — 잠금 문구만으로는
  무엇을 그릴지 정해지지 않지만, 없는 외형을 지어내는 것보다는 비어 있는 편이 낫다.
- individual 이지만 근거가 부족한 경우, disputed, unknown 은 none 으로 하고 세 프롬프트를 비운다.

귀여움·둥근 몸·파스텔색 같은 흔한 기본값을 임의로 보태지 않는다.
features 와 tone 은 확인된 것만 쓴다. 자료가 부족하면 "자료 부족" 이라고 쓴다.`;

export async function judgeRights(
  names: VerifiedName[],
): Promise<{ verdicts: RightsVerdict[]; usage: { input: number; output: number } }> {
  if (!names.length) return { verdicts: [], usage: { input: 0, output: 0 } };

  const brief = names
    .map((n) => {
      const lines = [
        `### ${n.name}${n.aliases.length ? ` (다른 표기: ${n.aliases.join(', ')})` : ''}`,
        `확인된 자리: ${n.hits.join('·')} · 계정 ${n.authors.length} · 플랫폼 ${n.platforms.join(',')} · 계정명일치 ${n.selfNamed ? '예' : '아니오'}`,
      ];
      for (const p of n.posts.slice(0, 5)) {
        lines.push(
          `- [${p.platform}] 계정명 "${p.authorName}" @${p.authorId} · 태그 ${p.tags.join(',') || '-'} · 조회 ${p.views}`,
        );
        lines.push(`  본문: ${cut(p.text.replace(/\s+/g, ' '), 180)}`);
      }
      return lines.join('\n');
    })
    .join('\n\n');

  const client = new Anthropic();
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    thinking: { type: 'adaptive' },
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: `## 후보와 근거 자료\n\n${brief}` }],
  });

  let verdicts: RightsVerdict[] = [];
  for (const b of res.content) {
    if (b.type !== 'text') continue;
    let raw: { items?: Array<Record<string, unknown>> };
    try {
      raw = JSON.parse(b.text) as typeof raw;
    } catch {
      throw new Error(`권리 판정 응답을 읽지 못했습니다: ${b.text.slice(0, 200)}`);
    }
    verdicts = (raw.items ?? []).map((t) => ({
      name: String(t.name ?? '').trim(),
      ownership: (t.ownership as RightsVerdict['ownership']) ?? 'unknown',
      confidence: Number(t.confidence ?? 0),
      handle: String(t.handle ?? ''),
      evidence: String(t.evidence ?? ''),
      whyTrending: String(t.why_trending ?? ''),
      trendGrounded: Boolean(t.trend_grounded),
      features: String(t.features ?? ''),
      tone: String(t.tone ?? ''),
      contentAngle: String(t.content_angle ?? ''),
      visualGrounded: Boolean(t.visual_grounded),
      promptBasis: (t.prompt_basis as RightsVerdict['promptBasis']) ?? 'none',
      imagePrompt: String(t.image_prompt ?? ''),
      motionPrompt: String(t.motion_prompt ?? ''),
      negativePrompt: String(t.negative_prompt ?? ''),
    }));
    break;
  }
  return { verdicts, usage: { input: res.usage.input_tokens, output: res.usage.output_tokens } };
}

/**
 * 판정 결과를 코드가 다시 조인다. LLM 이 뭐라 했든 자료가 못 받치면 내린다.
 * corporate 는 무조건 reference_required, 근거가 얇으면 none.
 */
export function tighten(v: RightsVerdict, n: VerifiedName): RightsVerdict {
  const out = { ...v };
  if (out.ownership === 'corporate') {
    out.promptBasis = 'reference_required';
    /*
     * 2026-09-17 (지시서 4-1) 프롬프트를 비우던 세 줄을 뺀다. 교육 목적 배포라
     * 기업 IP 라는 이유만으로 비우지 않는다. 이 세 줄 때문에 기업 후보 7건의
     * 프롬프트가 전부 공란이었고, 그래서 이미지 생성기가 열려도 부를 것이 없었다.
     *
     * **promptBasis 는 남긴다.** 지시서는 "corporate 케이스만 제외"라고 했지만
     * 블록을 통째로 빼면 후보가 아래 source_grounded 분기로 흘러내린다
     * (ownership !== 'individual' 이라 참) → none 으로 떨어지고 거기서 다시 비워진다.
     * 지금보다 나빠진다. 그래서 비우는 줄만 뺀다.
     *
     * 안전장치는 그대로다 — reference_required 는 각 생성기에서 referenceLock()
     * 과 REFERENCE_CAUTION 이 강제로 붙어 외형을 지어내지 못한다.
     */
  }
  // 계정 하나짜리는 확산이라 부를 수 없다.
  if (n.authors.length <= 1) out.trendGrounded = false;
  // 시각 근거가 없는데 source_grounded 라고 하면 외형을 지어낸 것이다.
  if (out.promptBasis === 'source_grounded' && (!out.visualGrounded || out.ownership !== 'individual')) {
    out.promptBasis = 'none';
    out.imagePrompt = '';
    out.motionPrompt = '';
  }
  if (out.promptBasis === 'none') {
    out.imagePrompt = '';
    out.motionPrompt = '';
  }
  return out;
}
