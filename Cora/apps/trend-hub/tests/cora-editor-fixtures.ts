import type { Draft, Slide } from '../lib/cora/model';
export const IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
export const oldDraft = (over: Partial<Draft> = {}, slides?: Slide[]): Draft => ({
  brief: { brand: '모퉁이 책방', audience: '직장인', goal: '모임 안내', material: '자료', sourceUrl: '', accent: '#205b4a' },
  idea: '소재', origin: 'source-outline', postedUrl: '', caption: '캡션', workStatus: 'draft',
  slides: slides ?? [
    { id: 'a', headline: '모퉁이 책방을 만나는 첫 장면', body: '브랜드 소개부터 핵심 안내까지.' },
    { id: 'b', headline: '목요일 저녁 7시', body: '함께 책을 읽고 마음에 남은 문장을 나눕니다. <b>&"\'</b>', image: IMG },
    { id: 'c', headline: '스타일 적용', body: '목요일 저녁 책 모임에 오세요', image: IMG, style: { align: 'right', emphasis: '책 모임', letterSpacing: 4, lineHeight: 2, imageFit: 'contain', imageBrightness: 0.8 } },
    { id: 'd', headline: '긴 글', body: '가나다라마바사아자차카타파하'.repeat(20) },
  ], ...over });
/** Old-style (no layers) drafts across ratios, templates, fonts and text scales; index selects the card. */
export function golden() {
  const out: { name: string; draft: Draft; index: number }[] = [];
  for (const ratio of ['4:5', '1:1', '9:16'] as const) for (const template of ['editorial', 'minimal', 'bold'] as const) for (const font of ['sans', 'serif'] as const) for (const textScale of [0.85, 1, 1.15]) {
    const draft = oldDraft({ design: { ratio, template, font, textScale } });
    for (let index = 0; index < draft.slides.length; index++) out.push({ name: `${ratio}/${template}/${font}/${textScale}/#${index}`, draft, index });
  }
  out.push({ name: 'no-design', draft: oldDraft(), index: 1 });
  return out;
}
