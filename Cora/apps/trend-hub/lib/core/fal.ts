/**
 * fal.ai 클라이언트.
 *
 * Dify 이미지 워크플로우는 결국 fal 을 부르는 껍데기였다. 한 겹 벗기면
 * 필요한 건 키 하나와 POST 한 번이다. 그래서 앱이 직접 부른다.
 *
 * 동기 엔드포인트(`https://fal.run/<모델>`)를 쓴다. 큐(`queue.fal.run`)는
 * 폴링이 필요한데, FLUX dev 한 장은 보통 10초 안에 끝나 폴링 값어치가 없다.
 */

export interface FalImage {
  url: string;
  width?: number;
  height?: number;
  contentType?: string;
}

export interface FalResult {
  images: FalImage[];
  seed?: number;
  /** 안전 필터가 걸린 장. 켜 두고, 걸리면 버린다. */
  nsfw: boolean[];
  raw: unknown;
}

export class FalError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: string,
  ) {
    super(message);
    this.name = 'FalError';
  }
}

export const FLUX_DEV = 'fal-ai/flux/dev';

export function falKey(): string | undefined {
  const v = process.env.FAL_KEY;
  return v && v.trim() ? v.trim() : undefined;
}

/** fal 이 받는 크기. 문자열 프리셋이거나 {width,height} 다. */
export type FalImageSize =
  | 'square_hd'
  | 'square'
  | 'portrait_4_3'
  | 'portrait_16_9'
  | 'landscape_4_3'
  | 'landscape_16_9'
  | { width: number; height: number };

export interface TextToImageInput {
  prompt: string;
  imageSize: FalImageSize;
  numImages?: number;
  seed?: number;
  /** 기본 28. 낮추면 빨라지고 대신 뭉갠다. */
  steps?: number;
  guidance?: number;
}

export async function textToImage(
  input: TextToImageInput,
  opts: { model?: string; timeoutMs?: number } = {},
): Promise<FalResult> {
  const key = falKey();
  if (!key) {
    throw new FalError('FAL_KEY 가 없습니다. .env.local 에 넣거나 목 모드로 도세요.');
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 180_000);
  try {
    const res = await fetch(`https://fal.run/${opts.model ?? FLUX_DEV}`, {
      method: 'POST',
      headers: {
        // Bearer 가 아니다. fal 은 `Key <값>` 을 쓴다.
        Authorization: `Key ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: input.prompt,
        image_size: input.imageSize,
        num_images: input.numImages ?? 1,
        num_inference_steps: input.steps ?? 28,
        guidance_scale: input.guidance ?? 3.5,
        enable_safety_checker: true,
        output_format: 'jpeg',
        ...(input.seed != null ? { seed: input.seed } : {}),
      }),
      signal: ctrl.signal,
    });

    const text = await res.text();
    if (!res.ok) {
      throw new FalError(`fal 응답 ${res.status}`, res.status, text.slice(0, 500));
    }
    const json = JSON.parse(text) as {
      images?: Array<{ url?: string; width?: number; height?: number; content_type?: string }>;
      seed?: number;
      has_nsfw_concepts?: boolean[];
    };
    const images = (json.images ?? [])
      .filter((i) => i.url)
      .map((i) => ({
        url: i.url as string,
        width: i.width,
        height: i.height,
        contentType: i.content_type,
      }));
    if (!images.length) {
      throw new FalError('fal 이 이미지를 돌려주지 않았습니다.', res.status, text.slice(0, 300));
    }
    return { images, seed: json.seed, nsfw: json.has_nsfw_concepts ?? [], raw: json };
  } catch (e) {
    if (e instanceof FalError) throw e;
    if (e instanceof Error && e.name === 'AbortError') {
      throw new FalError('fal 호출이 시간 안에 끝나지 않았습니다.');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** fal 이 준 링크는 언젠가 만료된다. 바이트를 받아 우리 쪽에 둔다. */
export async function fetchBytes(url: string, timeoutMs = 60_000): Promise<Uint8Array> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new FalError(`이미지 내려받기 실패 ${res.status}`, res.status);
    return new Uint8Array(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}
