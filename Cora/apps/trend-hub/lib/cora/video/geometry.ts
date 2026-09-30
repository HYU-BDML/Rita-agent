/** F038 output ratios. All are 1080 px wide; frames are scaled to fit and padded with the brand color. */
export const RATIOS = { '9:16': { width: 1080, height: 1920 }, '4:5': { width: 1080, height: 1350 }, '1:1': { width: 1080, height: 1080 } } as const;
export type Ratio = keyof typeof RATIOS;
export const LANGS = { kor: '한국어', eng: 'English' } as const;
export type Lang = keyof typeof LANGS;
export const BRAND_COLOR = '#183e33';
export function ratioGeometry(value: unknown = '9:16') {
  if (typeof value !== 'string' || !Object.prototype.hasOwnProperty.call(RATIOS, value)) throw new Error('영상 비율은 9:16, 4:5, 1:1 중 하나여야 합니다.');
  const ratio = value as Ratio; return { ratio, ...RATIOS[ratio] };
}
export function parseLang(value: unknown = 'kor'): Lang {
  if (value !== 'kor' && value !== 'eng') throw new Error('자막 언어는 kor 또는 eng여야 합니다.'); return value;
}
export const hexColor = (value: unknown, fallback: string, label = '색상') => {
  if (value === undefined || value === '') return fallback;
  if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value)) throw new Error(`${label}은 #RRGGBB 형식이어야 합니다.`); return value.toLowerCase();
};
/** FFmpeg filter fragment: scale to fit inside the canvas, pad the rest. */
export const fitFilter = (width: number, height: number, color = BRAND_COLOR) => `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=0x${color.slice(1)}`;
