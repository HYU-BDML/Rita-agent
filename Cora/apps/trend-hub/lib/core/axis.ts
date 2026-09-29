import type { Candidate } from './candidate';

/**
 * 후보가 어느 축에 속하나. **화면과 계약이 같은 규칙을 쓰게 한 곳에 둔다.**
 *
 * 축이 셋인 이유는 재는 잣대가 셋이기 때문이다. 섞으면 칸 설명이 거짓말을 한다 —
 * 실제로 보드의 '검색은 평소' 칸 21건 중 12건이 캐릭터였던 적이 있고,
 * 2026-09-19 에는 밈 후보(`unit:'topic'`)가 같은 자리로 흘러들었다.
 * 밈은 검색 급등을 잰 적이 없는데 '못 잰 것' 칸에 앉는다.
 *
 *   이슈     여러 매체가 다뤘나 · 검색이 실제로 늘었나       news · radar
 *   캐릭터   몇 계정이 말하나 · 만들어도 되는 권리인가        character-native
 *   밈       몇 계정이 따라 하나 · 만들어도 되는 내용인가     meme-native
 */
export type Axis = 'issue' | 'character' | 'meme';

export const AXIS_LABEL: Record<Axis, string> = {
  issue: '이슈',
  character: '캐릭터',
  meme: '밈',
};

export const AXIS_HREF: Record<Axis, string> = {
  issue: '/issues',
  character: '/characters',
  meme: '/memes',
};

/**
 * **판정기로 가른다. 단위(unit)로 가르지 않는다.**
 *
 * 밈도 캐릭터도 레이더 주제도 `unit` 만 보면 겹친다 — 밈과 레이더 주제가 둘 다
 * `topic` 이다. 무엇을 재는지는 어느 판정기가 낳았는지가 정한다.
 * 모르는 판정기가 오면 이슈로 둔다. 보드가 기본 자리다.
 */
export function axisOf(c: Candidate): Axis {
  const d = c.origin?.discoveryId ?? '';
  if (d === 'meme-native') return 'meme';
  if (d.startsWith('character') || c.unit === 'subject') return 'character';
  return 'issue';
}

/**
 * 판정기가 어느 축의 것인가. `axisOf` 와 **같은 규칙**을 판정기에 적용한다.
 *
 * 화면마다 따로 걸렀더니 규칙이 흩어졌다 — /issues 는 `unit === 'topic' && id !== 'meme-native'`,
 * /memes 는 `id === 'meme-native'` 였다. 홈에도 발굴 버튼을 놓으려니 같은 규칙이 세 군데가 된다.
 */
export function axisOfDiscovery(d: { id: string; unit?: string }): Axis {
  if (d.id === 'meme-native') return 'meme';
  if (d.id.startsWith('character') || d.unit === 'subject') return 'character';
  return 'issue';
}

/**
 * 화면 목록에 올려도 되나. **안전 판정이 붙은 것은 목록에서 통째로 뺀다.**
 *
 * 처음에는 배지만 붙이고 목록에 남겼는데 그건 제지가 아니었다 — `야차룰` 카드가
 * 그대로 떠 있었고 **요약에 사망 사건 내용이 적혀 있어서 화면을 여는 순간 읽혔다.**
 *
 * 그다음에는 `blocked` 만 빼고 `flagged` 는 "확인 필요" 구획으로 올렸다. 그것도 틀렸다 —
 * **애매한 것이 목록 맨 위로 올라가 제일 먼저 보였다.** 표시하려던 것이 강조가 됐다.
 *
 * 그래서 둘 다 목록에서 뺀다. 차이는 **설정에서만** 남는다.
 *   blocked  명확히 위험 — 상세도 안 열고 계약으로도 안 나간다
 *   flagged  애매 — 상세는 열리고 계약에는 safety_note 를 달고 나간다
 * 목록에서 빠지는 것은 같고, 그 뒤 처리가 다르다.
 */
export function isBlocked(c: Candidate): boolean {
  return c.safety?.level === 'blocked';
}

export function isFlagged(c: Candidate): boolean {
  return c.safety?.level === 'flagged';
}

/**
 * 목록에 올릴 것만. **세는 것과 거르는 것을 같은 함수로** 해야
 * "안전 사유로 제외 N건" 숫자가 목록과 어긋나지 않는다.
 */
export function visibleOnly<T extends Candidate>(
  list: T[],
): { shown: T[]; blocked: number; flagged: number; hidden: number } {
  const blocked = list.filter(isBlocked).length;
  const flagged = list.filter(isFlagged).length;
  return {
    shown: list.filter((c) => !isBlocked(c) && !isFlagged(c)),
    blocked,
    flagged,
    hidden: blocked + flagged,
  };
}
