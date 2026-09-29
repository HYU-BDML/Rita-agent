/**
 * Gemini — 이미지 생성과 영상 분석. 한 모듈 두 함수, 같은 키를 쓴다.
 *
 * **키가 없으면 아무것도 부르지 않는다.** 이 앱의 다른 어댑터와 같은 규칙이다 —
 * `hasGemini()` 가 false 면 부르는 쪽이 건너뛰고, 계약 JSON 에서는 **항목 자체가 빠진다**
 * (`images[role=material]` 과 같다). 빈 문자열로 자리를 잡아 두지 않는다.
 *
 * ── 영상 분석이 왜 여기 같이 있나 ──
 * 교수님 레이더(별도 서비스)가 영상 1편을 분석해 내놓는 항목이 계약 JSON 의
 * `video_analysis` 하위로 들어간다. 그 분석을 같은 API·같은 키로 할 수 있다 —
 * YouTube URL 을 그대로 넣으면 되고 파일 업로드가 필요 없다.
 *
 *   요청당 영상 10편까지 (Gemini 2.5 이상) · **공개 영상만** · 무료 등급은 하루 8시간
 *   타임스탬프(MM:SS)로 특정 시점을 물을 수 있다 — '장면 흐름 6단계'가 여기서 나온다
 *
 * 화면 글자·받아쓰기는 문서가 보장하지 않는다. 한 편 돌려 보면 바로 안다.
 * 안 나오면 밈-글자 판정을 다른 방법으로 해야 하고 그건 범위에 영향이 있다.
 */
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

/** 이미지 생성. 참조 이미지를 함께 넣을 수 있는 모델이어야 한다. */
const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
/** 영상 이해. YouTube URL 을 직접 받는다. */
const VIDEO_MODEL = process.env.GEMINI_VIDEO_MODEL || 'gemini-2.5-flash';

export function hasGemini(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

async function call(model: string, body: unknown, timeoutMs = 120_000): Promise<any> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error('GEMINI_API_KEY 가 없습니다.');

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${text.slice(0, 300)}`);
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

/* ── 1. 이미지 생성 ────────────────────────────────────────────────── */

export interface GeneratedImage {
  /** 이미지 바이트. 저장은 부르는 쪽이 한다 — 이 모듈은 파일을 만들지 않는다. */
  bytes: Buffer;
  mimeType: string;
}

/**
 * 참조 이미지를 물려 그린다.
 *
 * **참조가 비어 있으면 부르지 않는다.** `reference_required` 후보에 참조 없이 잠금 문구만
 * 보내면 모델이 아는 캐릭터를 그리거나 지어낸다 — 잠금 문구가 빈말이 되는 것이
 * 저작권 장치로서 가장 나쁜 실패다. 그럴 땐 null 을 돌려주고 생성을 건너뛴다.
 */
export async function generateImage(
  prompt: string,
  referenceUrls: string[],
  opts: { requireReference?: boolean } = {},
): Promise<GeneratedImage | null> {
  if (opts.requireReference && !referenceUrls.length) return null;

  const parts: unknown[] = [];
  for (const url of referenceUrls) {
    const img = await fetchImage(url);
    // 한 장 못 받아도 나머지로 간다. 참조가 하나라도 있으면 없는 것보다 낫다.
    if (img) parts.push({ inline_data: { mime_type: img.mimeType, data: img.base64 } });
  }
  if (opts.requireReference && !parts.length) return null;
  parts.push({ text: prompt });

  const res = await call(IMAGE_MODEL, { contents: [{ parts }] });
  for (const p of res?.candidates?.[0]?.content?.parts ?? []) {
    const d = p?.inline_data ?? p?.inlineData;
    if (d?.data) {
      return { bytes: Buffer.from(d.data, 'base64'), mimeType: String(d.mime_type ?? d.mimeType ?? 'image/png') };
    }
  }
  return null;
}

/** 참조 이미지를 받아 온다. 썸네일 CDN 이라 만료되거나 막힐 수 있어 실패를 삼킨다. */
async function fetchImage(url: string): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return { base64: buf.toString('base64'), mimeType: res.headers.get('content-type') || 'image/jpeg' };
  } catch {
    return null;
  }
}

/* ── 2. 영상 분석 ──────────────────────────────────────────────────── */

/** 교수님 레이더의 6항목. 계약 JSON 의 `video_analysis` 가 이 모양이다. */
export interface VideoAnalysis {
  url: string;
  first3s: string;
  /** 장면 흐름 6단계. 각 단계에 타임스탬프가 붙는다. */
  beats: { at: string; what: string }[];
  whyItWorked: string;
  howToApply: string;
  /** 화면에 박힌 글자. 문서가 보장하지 않는 항목이라 비어 있을 수 있다. */
  onScreenText: string[];
  /** 받아쓰기. 위와 같다. */
  transcript: string;
}

const VIDEO_SCHEMA = {
  type: 'object',
  required: ['first3s', 'beats', 'whyItWorked', 'howToApply', 'onScreenText', 'transcript'],
  properties: {
    first3s: { type: 'string', description: '첫 3초에 무엇이 보이고 들리는가. 본 것만 쓴다.' },
    beats: {
      type: 'array',
      description: '장면 흐름 6단계. 여섯 개를 채우되 영상이 짧으면 있는 만큼만.',
      items: {
        type: 'object',
        required: ['at', 'what'],
        properties: {
          at: { type: 'string', description: 'MM:SS' },
          what: { type: 'string' },
        },
      },
    },
    whyItWorked: { type: 'string', description: '왜 잘됐나. 영상에서 확인되는 것만.' },
    howToApply: { type: 'string', description: '따라 만들 때 참고할 점.' },
    onScreenText: {
      type: 'array',
      description: '화면에 박힌 글자를 그대로. 없으면 빈 배열 — 지어내지 않는다.',
      items: { type: 'string' },
    },
    transcript: { type: 'string', description: '말소리 받아쓰기. 말이 없으면 빈 문자열.' },
  },
} as const;

const VIDEO_SYSTEM =
  '너는 짧은 영상 한 편을 분석한다. 영상에서 실제로 보이고 들리는 것만 쓴다. ' +
  '추측·배경지식·일반론을 보태지 않는다. 확인되지 않는 칸은 비운다.';

/**
 * YouTube URL 한 편을 분석한다. 파일 업로드가 없다 — URL 을 그대로 넣는다.
 *
 * **공개 영상만 된다.** 비공개·미등록은 거절된다. 무료 등급은 하루 8시간까지다.
 */
export async function analyzeVideo(url: string): Promise<VideoAnalysis | null> {
  const res = await call(VIDEO_MODEL, {
    systemInstruction: { parts: [{ text: VIDEO_SYSTEM }] },
    contents: [
      {
        parts: [
          { file_data: { file_uri: url } },
          { text: '이 영상을 분석해 정해진 형식으로 내놓아라.' },
        ],
      },
    ],
    generationConfig: { responseMimeType: 'application/json', responseSchema: VIDEO_SCHEMA },
  });

  const text = res?.candidates?.[0]?.content?.parts?.find((p: any) => p?.text)?.text;
  if (!text) return null;
  const v = JSON.parse(text);
  return {
    url,
    first3s: String(v.first3s ?? ''),
    beats: Array.isArray(v.beats)
      ? v.beats.map((b: any) => ({ at: String(b?.at ?? ''), what: String(b?.what ?? '') }))
      : [],
    whyItWorked: String(v.whyItWorked ?? ''),
    howToApply: String(v.howToApply ?? ''),
    onScreenText: Array.isArray(v.onScreenText) ? v.onScreenText.map(String) : [],
    transcript: String(v.transcript ?? ''),
  };
}
