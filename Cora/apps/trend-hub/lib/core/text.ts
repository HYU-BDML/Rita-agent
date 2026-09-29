/*
 * 자를 때 이모지를 반으로 가르지 않기.
 *
 * JS 문자열은 UTF-16 이고 이모지 한 글자는 두 칸(서로게이트 쌍)을 차지한다.
 * `slice(0, 160)` 이 그 사이에 떨어지면 짝 없는 서로게이트가 남는다. 화면에서는
 * 깨진 글자 하나로 보이지만, JSON 으로 실어 보내면 본문 자체가 올바른 JSON 이
 * 아니게 되어 Anthropic 이 400 으로 돌려보낸다:
 *   "The request body is not valid JSON: no low surrogate in string"
 * 소셜 게시물 본문은 이모지 투성이라 흔히 걸린다.
 */

/** 짝 없는 서로게이트를 지운다. 쌍은 그대로 둔다. */
export function stripLoneSurrogates(s: string): string {
  return s.replace(
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
    '',
  );
}

/**
 * `max` 칸까지 자르되 서로게이트 쌍은 가르지 않는다.
 * 이미 깨져 들어온 문자열(저장해 둔 게시물 등)도 여기서 씻긴다.
 */
export function cut(s: string, max: number): string {
  const t = stripLoneSurrogates(s);
  if (t.length <= max) return t;
  const head = t.slice(0, max);
  const last = head.charCodeAt(max - 1);
  // 마지막 칸이 상반 서로게이트면 짝이 잘린 것이다 — 한 칸 물린다.
  return last >= 0xd800 && last <= 0xdbff ? head.slice(0, -1) : head;
}
