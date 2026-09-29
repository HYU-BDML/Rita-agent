/**
 * 카드 테마.
 *
 * 색을 늘리는 건 쉽지만 안 읽히는 조합을 늘리는 것도 쉽다.
 * 그래서 대비를 계산해 문턱을 못 넘는 테마는 테스트가 떨어뜨린다(themes.test.ts).
 *
 *   본문(작은 글씨)  4.5:1 이상  — WCAG AA
 *   제목(큰 글씨)    3:1 이상
 *
 * 색과 짜임을 나눠 둔다. 색 10 × 짜임 4 = 40가지가 되고,
 * 새 색 하나를 더해도 짜임 전부에 그대로 얹힌다.
 */

export interface Theme {
  name: string;
  bg: string;
  fg: string;      // 제목
  sub: string;     // 본문·보조
  accent: string;  // 강조 (번호·계정명)
  dark: boolean;
}

export const THEMES: Theme[] = [
  { name: '먹지',     bg: '#111111', fg: '#ffffff', sub: '#b4b4b4', accent: '#ffffff', dark: true },
  { name: '미드나잇', bg: '#0f2a44', fg: '#ffffff', sub: '#a8c8e4', accent: '#8ecbff', dark: true },
  { name: '숲',       bg: '#12291f', fg: '#ffffff', sub: '#a9c9b8', accent: '#7fdcaa', dark: true },
  { name: '자두',     bg: '#2b1230', fg: '#ffffff', sub: '#cbadd0', accent: '#e79bf0', dark: true },
  { name: '벽돌',     bg: '#331512', fg: '#ffffff', sub: '#d5aca6', accent: '#ffa892', dark: true },
  { name: '종이',     bg: '#faf8f3', fg: '#1a1a1a', sub: '#5c5c5c', accent: '#1a1a1a', dark: false },
  { name: '크림',     bg: '#fff6e5', fg: '#2b2113', sub: '#5f5138', accent: '#8a5a12', dark: false },
  { name: '살구',     bg: '#fff1e8', fg: '#2b1a12', sub: '#6b4a3b', accent: '#a83a12', dark: false },
  { name: '하늘',     bg: '#eef6fd', fg: '#0d2233', sub: '#3f5a70', accent: '#0a5c9e', dark: false },
  { name: '잿빛',     bg: '#eeeeec', fg: '#1c1c1a', sub: '#54544f', accent: '#1c1c1a', dark: false },
];

export type LayoutName = '기본' | '큰글씨' | '번호강조' | '인용';
export const LAYOUTS: LayoutName[] = ['기본', '큰글씨', '번호강조', '인용'];

/* ───────────── 대비 계산 (WCAG) ───────────── */

function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return (
    0.2126 * srgbToLinear(parseInt(n.slice(0, 2), 16)) +
    0.7152 * srgbToLinear(parseInt(n.slice(2, 4), 16)) +
    0.0722 * srgbToLinear(parseInt(n.slice(4, 6), 16))
  );
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

export const MIN_BODY = 4.5;
export const MIN_TITLE = 3;

export function checkTheme(t: Theme): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  const title = contrast(t.fg, t.bg);
  const body = contrast(t.sub, t.bg);
  const accent = contrast(t.accent, t.bg);
  if (title < MIN_TITLE) problems.push(`제목 ${title}:1`);
  if (body < MIN_BODY) problems.push(`본문 ${body}:1`);
  if (accent < MIN_TITLE) problems.push(`강조 ${accent}:1`);
  return { ok: problems.length === 0, problems };
}
