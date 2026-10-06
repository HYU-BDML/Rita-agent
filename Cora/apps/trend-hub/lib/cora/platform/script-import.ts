import { validateDraft, blankBrief, defaultDesign, type Draft, type Slide } from '../model';

/** F002: a finished script becomes cards without rewriting. Scenes are numbered ("1." "1)" "장면 1") or blank-line separated (max 12). Every character stays in a headline or body. */
export const SCRIPT_MAX_SCENES = 12, SCRIPT_MAX_CHARS = 8000, MIN_SCENES = 2;
const NUM = /^\s*(?:(?:장면|씬|scene|컷|카드)\s*)?\d{1,2}\s*(?:[.)\]:：]|번)\s*/i;
export type ScriptInput = { script: string; brand: string; audience?: string; goal?: string; accent?: string; title?: string };
export function splitScenes(script: string): string[] {
  const text = script.replace(/\r\n?/g, '\n').trim(); const lines = text.split('\n');
  const starts = lines.map((l, i) => NUM.test(l) ? i : -1).filter(i => i >= 0);
  if (starts.length >= MIN_SCENES) {
    if (starts[0] !== 0 && lines.slice(0, starts[0]).join('').trim()) throw new Error('번호가 붙은 첫 장면 앞에 번호 없는 글이 있습니다. 번호를 붙이거나 앞부분을 지워 주세요.');
    return starts.map((s, k) => lines.slice(s, k + 1 < starts.length ? starts[k + 1] : lines.length).join('\n').trim());
  }
  return text.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
}
/** headline = first line (numbering marker removed only when it is pure numbering), body = the remaining lines verbatim. */
export function sceneToCard(scene: string): { headline: string; body: string } {
  const [first, ...rest] = scene.split('\n'); const stripped = first.replace(NUM, '').trim();
  const headline = stripped || first.trim(); let body = rest.join('\n').trim();
  if (!stripped && !body) throw new Error('번호만 있고 내용이 없는 장면이 있습니다.');
  return { headline, body };
}
export function scriptToDraft(input: ScriptInput): { draft: Draft; scenes: number } {
  if (typeof input.script !== 'string' || !input.script.trim()) throw new Error('대본을 입력해 주세요.');
  if (input.script.length > SCRIPT_MAX_CHARS) throw new Error(`대본은 ${SCRIPT_MAX_CHARS}자 이내입니다.`);
  const scenes = splitScenes(input.script);
  if (scenes.length < MIN_SCENES) throw new Error(`장면이 ${scenes.length}개입니다. 번호를 붙이거나 빈 줄로 나눠 2개 이상으로 만들어 주세요.`);
  if (scenes.length > SCRIPT_MAX_SCENES) throw new Error(`장면은 ${SCRIPT_MAX_SCENES}개까지입니다. 현재 ${scenes.length}개입니다. 장면을 합쳐 주세요.`);
  const slides: Slide[] = scenes.map(sc => { const c = sceneToCard(sc); if (c.headline.length > 80) throw new Error(`첫 줄이 80자를 넘는 장면이 있습니다("${c.headline.slice(0, 20)}…"). 첫 줄을 짧게 나눠 주세요.`); if (c.body.length > 500) throw new Error(`본문이 500자를 넘는 장면이 있습니다("${c.headline.slice(0, 20)}…"). 장면을 나눠 주세요.`); return { id: crypto.randomUUID(), ...c }; });
  const material = input.script.trim();
  const draft = validateDraft({ design: defaultDesign, brief: { ...blankBrief, brand: input.brand, audience: input.audience ?? '', goal: input.goal ?? blankBrief.goal, material: material.slice(0, 20000), accent: input.accent ?? blankBrief.accent }, idea: (input.title?.trim() || slides[0].headline).slice(0, 200), slides, caption: '', origin: 'source-outline', postedUrl: '', workStatus: 'draft' });
  return { draft, scenes: scenes.length };
}
