import { hexColor, parseLang, ratioGeometry, type Lang, type Ratio } from './geometry';
/** F045/F046 reusable video template: everything except the cards' pictures and the subtitle text. */
export interface SubtitleStyle { size: number; color: string; highlight: string; position: 'bottom' | 'middle' }
export interface TemplateSettings { ratio: Ratio; secondsPattern: number[]; lang: Lang; track: boolean; burn: boolean; style: SubtitleStyle; bgm: { id: string; volume: number; fadeOut: number } | null }
export const DEFAULT_STYLE: SubtitleStyle = { size: 56, color: '#ffffff', highlight: '#ffd84d', position: 'bottom' };
export function validateStyle(value: unknown): SubtitleStyle {
  const s = (value ?? {}) as Partial<SubtitleStyle>; if (typeof s !== 'object') throw new Error('자막 스타일 형식을 확인해 주세요.');
  const size = s.size === undefined ? DEFAULT_STYLE.size : s.size;
  if (!Number.isInteger(size) || size < 24 || size > 120) throw new Error('자막 글자 크기는 24~120입니다.');
  if (s.position !== undefined && s.position !== 'bottom' && s.position !== 'middle') throw new Error('자막 위치는 bottom 또는 middle입니다.');
  return { size, color: hexColor(s.color, DEFAULT_STYLE.color, '자막 색'), highlight: hexColor(s.highlight, DEFAULT_STYLE.highlight, '강조 색'), position: s.position ?? 'bottom' };
}
export function validateBgm(value: unknown) {
  if (value === undefined || value === null) return null;
  const b = value as { id?: unknown; volume?: unknown; fadeOut?: unknown };
  if (typeof b.id !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(b.id)) throw new Error('배경음악 식별자를 확인해 주세요.');
  const volume = b.volume === undefined ? .4 : b.volume, fadeOut = b.fadeOut === undefined ? 2 : b.fadeOut;
  if (typeof volume !== 'number' || !(volume >= 0 && volume <= 1)) throw new Error('배경음악 볼륨은 0~1입니다.');
  if (typeof fadeOut !== 'number' || !(fadeOut >= 0 && fadeOut <= 10)) throw new Error('페이드 아웃은 0~10초입니다.');
  return { id: b.id, volume, fadeOut };
}
export function validateTemplateSettings(value: unknown): TemplateSettings {
  const v = (value ?? {}) as Record<string, unknown>; if (!value || typeof value !== 'object') throw new Error('템플릿 설정이 필요합니다.');
  const pattern = v.secondsPattern;
  if (!Array.isArray(pattern) || pattern.length < 1 || pattern.length > 12 || pattern.some(n => !Number.isInteger(n) || n < 1 || n > 10)) throw new Error('장면 길이 패턴은 1~10초 정수 1~12개입니다.');
  const track = v.track === undefined ? true : v.track, burn = v.burn === undefined ? false : v.burn;
  if (typeof track !== 'boolean' || typeof burn !== 'boolean') throw new Error('자막 방식은 true 또는 false여야 합니다.');
  return { ratio: ratioGeometry(v.ratio).ratio, secondsPattern: pattern as number[], lang: parseLang(v.lang), track, burn, style: validateStyle(v.style), bgm: validateBgm(v.bgm) };
}
export function validateTemplateName(name: unknown) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 60 || /[\u0000-\u001f]/.test(name)) throw new Error('템플릿 이름은 1~60자여야 합니다.'); return name.trim();
}
/** Applies a template to a scene count: the seconds pattern repeats from the start. Nothing is written anywhere. */
export const applyTemplate = (settings: TemplateSettings, sceneCount: number) => ({ ...settings, seconds: Array.from({ length: sceneCount }, (_, i) => settings.secondsPattern[i % settings.secondsPattern.length]) });
/** Builds template settings from the settings a render saved on its work item (F046). */
export function settingsFromRender(data: Record<string, unknown>): TemplateSettings {
  const s = data.settings as Record<string, unknown> | undefined; const scenes = data.scenes as { seconds: number }[] | undefined;
  if (!s || !Array.isArray(scenes) || !scenes.length) throw new Error('이 영상에는 저장된 렌더 설정이 없어 템플릿을 만들 수 없습니다. 영상을 한 번 다시 만들어 주세요.');
  return validateTemplateSettings({ ...s, secondsPattern: scenes.map(x => x.seconds) });
}
