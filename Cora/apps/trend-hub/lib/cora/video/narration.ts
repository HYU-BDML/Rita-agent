/**
 * F051 narration length estimate. Documented rate: 7 spoken syllables per second, the usual pace of
 * Korean narration (5 slow, 9 fast). Counting rule: every Hangul syllable and every digit counts 1,
 * every Latin letter counts 0.5 (English words are spoken faster per letter), spaces and punctuation count 0.
 * The rate can be overridden per call or with CORA_NARRATION_SYLLABLES_PER_SEC (allowed range 3-12).
 */
export const DEFAULT_SYLLABLES_PER_SEC = 7;
export const narrationRate = (rate?: number) => {
  const value = rate ?? (process.env.CORA_NARRATION_SYLLABLES_PER_SEC ? Number(process.env.CORA_NARRATION_SYLLABLES_PER_SEC) : DEFAULT_SYLLABLES_PER_SEC);
  if (!Number.isFinite(value) || value < 3 || value > 12) throw new Error('말 속도는 초당 3~12음절이어야 합니다.'); return value;
};
export function syllableUnits(text: string) {
  let units = 0; for (const ch of text) { if (/[가-힣]/.test(ch) || /[0-9]/.test(ch)) units += 1; else if (/[A-Za-z]/.test(ch)) units += .5; } return units;
}
export const estimateNarrationSeconds = (text: string, rate?: number) => Math.round(syllableUnits(text) / narrationRate(rate) * 10) / 10;
export interface NarrationWarning { scene: number; seconds: number; needed: number; suggested: number; reachable: boolean; message: string }
export const SCENE_MAX_SECONDS = 10;
/** Flags scenes whose duration is shorter than the estimated narration. Never changes the input. */
export function checkNarration(scenes: { seconds: number; subtitle: string }[], rate?: number) {
  const warnings: NarrationWarning[] = [];
  const suggestedSeconds = scenes.map((s, i) => {
    const needed = estimateNarrationSeconds(s.subtitle, rate);
    if (!s.subtitle || needed <= s.seconds) return s.seconds;
    const suggested = Math.min(SCENE_MAX_SECONDS, Math.max(1, Math.ceil(needed)));
    warnings.push({ scene: i + 1, seconds: s.seconds, needed, suggested, reachable: Math.ceil(needed) <= SCENE_MAX_SECONDS,
      message: `${i + 1}번 장면은 자막을 읽는 데 약 ${needed}초가 걸리는데 장면 길이는 ${s.seconds}초입니다. ${Math.ceil(needed) <= SCENE_MAX_SECONDS ? `${suggested}초로 늘리거나 자막을 줄여 주세요.` : `장면 최대 길이 ${SCENE_MAX_SECONDS}초로도 부족하므로 자막을 줄이거나 장면을 나눠 주세요.`}` });
    return suggested;
  });
  return { rate: narrationRate(rate), warnings, suggestedSeconds };
}
