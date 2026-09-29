import type { FalImageSize } from '../core/fal';

/**
 * 포스터의 모양만. 브라우저와 서버가 같이 읽는다.
 *
 * 생성기 본체(poster-native.ts)는 node:fs 로 이미지를 저장하고 Anthropic SDK 를 부른다.
 * 시안 컴포넌트가 거기서 값을 하나라도 가져오면 그 덩어리가 통째로 클라이언트 번들로 끌려와
 * 빌드가 깨진다. 실제로 깨졌다 — `UnhandledSchemeError: node:fs`.
 * 타입만 가져오면 지워지지만 RATIOS 는 값이라 안 지워진다. 그래서 값은 여기 둔다.
 */

export type RatioName = '1:1' | '4:5' | '9:16' | '16:9';

/**
 * 비율 → fal 크기와 화면 종횡비.
 * 4:5 는 프리셋에 없어 픽셀로 준다 (인스타 세로 1080×1350 과 같은 비).
 */
export const RATIOS: Record<RatioName, { fal: FalImageSize; aspect: number }> = {
  '1:1': { fal: 'square_hd', aspect: 1 },
  '4:5': { fal: { width: 1024, height: 1280 }, aspect: 4 / 5 },
  '9:16': { fal: 'portrait_16_9', aspect: 9 / 16 },
  '16:9': { fal: 'landscape_16_9', aspect: 16 / 9 },
};

export const RATIO_NAMES = Object.keys(RATIOS) as RatioName[];

export function isRatioName(v: string): v is RatioName {
  return v in RATIOS;
}

/** 포스터 한 장. 저장된 output 모양이자 화면(PosterView)의 입력이다. */
export interface Poster {
  headline: string;
  subhead: string;
  /** 머리말 — 분류나 날짜 같은 짧은 말. */
  kicker: string;
  account: string;
  ratio: RatioName;
  /** 우리 쪽에 저장한 이미지 경로 (`/gen/…`). 목 모드면 빈 문자열. */
  imageUrl: string;
  /** fal 에 실제로 보낸 프롬프트. 결과가 이상할 때 여기부터 본다. */
  visualPrompt: string;
  sourceUrl?: string;
  sourceName?: string;
}
