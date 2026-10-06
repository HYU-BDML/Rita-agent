/** F054 media provenance. Every media item used in a render carries a source and a license note. */
export type MediaSource = 'user-upload' | 'generated' | 'url';
export interface MediaItem { kind: 'card-image' | 'bgm' | 'source-video'; ref: string; source: MediaSource; license: string; url?: string }
export const MEDIA_SOURCES: MediaSource[] = ['user-upload', 'generated', 'url'];
const cleanNote = (value: unknown) => {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' || value.length > 200 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new Error('이용 조건(라이선스) 메모는 200자 이하 문자여야 합니다.'); return value.trim();
};
export function mediaSource(value: unknown, fallback: MediaSource): MediaSource {
  if (value === undefined) return fallback; if (!MEDIA_SOURCES.includes(value as MediaSource)) throw new Error('미디어 출처는 user-upload, generated, url 중 하나여야 합니다.'); return value as MediaSource;
}
/** Card images: entry i of `input` describes frame i; missing entries default to generated / no license note. */
export function cardMedia(input: unknown, frameCount: number): MediaItem[] {
  if (input !== undefined && !Array.isArray(input)) throw new Error('미디어 목록 형식을 확인해 주세요.');
  const list = (input ?? []) as { source?: unknown; license?: unknown; url?: unknown }[];
  if (list.length > frameCount) throw new Error('미디어 목록이 장면 수보다 깁니다.');
  return Array.from({ length: frameCount }, (_, i) => {
    const e = list[i] ?? {}; const source = mediaSource(e.source, 'generated');
    let url: string | undefined;
    if (source === 'url') { if (typeof e.url !== 'string' || !/^https?:\/\/[^\s]{1,480}$/.test(e.url)) throw new Error(`${i + 1}번 장면 이미지 출처 URL이 필요합니다.`); url = e.url; }
    return { kind: 'card-image' as const, ref: `card-${i + 1}`, source, license: cleanNote(e.license), ...(url ? { url } : {}) };
  });
}
export const missingLicense = (items: MediaItem[]) => items.filter(i => !i.license.trim()).map(i => i.ref);
/** In strict mode a render is refused when any media item lacks a license note. */
export function enforceManifest(items: MediaItem[], strict: boolean) {
  const missing = missingLicense(items);
  if (strict && missing.length) throw new Error(`이용 조건(라이선스) 메모가 없는 미디어가 있어 렌더를 중단했습니다: ${missing.join(', ')}`);
  return { items, strict, missing };
}
