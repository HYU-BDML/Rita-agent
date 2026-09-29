import { GRAMMARS, type GrammarKind } from './grammar';

/**
 * 주소에 적힌 답을 읽는다 (`?form=video&item=no`).
 *
 * **답을 URL 에 두는 이유.** 새로고침해도 남고, 북마크되고, 옆자리에 보낼 수 있다.
 * 서버에 쓰지 않으므로 로그인이 필요 없고, 남의 답이 내 화면에 뜨지도 않는다.
 *
 * 모르는 값은 조용히 버린다. 주소는 사람이 손으로 고칠 수 있는 자리라 `?form=음악`
 * 같은 것이 들어오는데, 그때 빈 화면을 내는 것보다 "안 고른 것"으로 두는 쪽이 맞다.
 */
export type ItemAnswer = 'yes' | 'no';

const KINDS = new Set<string>(GRAMMARS.map((g) => g.kind));

export function readForm(value?: string | string[]): GrammarKind | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v && KINDS.has(v) ? (v as GrammarKind) : undefined;
}

export function readItem(value?: string | string[]): ItemAnswer | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v === 'yes' || v === 'no' ? v : undefined;
}
