'use client';

import { usePick } from './pick';

/**
 * 담기 체크 아이콘 — 카드 썸네일 **우상단**.
 *
 * 카드 전체는 상세로 가는 링크로 두고 담기만 이 아이콘으로 뺐다. 격자에서 카드를
 * 누르면 열린다는 건 사람이 이미 아는 동작이라, 그 자리를 담기로 바꾸면 처음 쓰는
 * 사람은 반드시 한 번은 "열려고 눌렀는데 담겼다"를 겪는다. 가끔 나는 실수가 아니라
 * 배우기 전까지 매번 어긋나는 것이라 더 비싸다.
 *
 * 지킬 것 넷 (2026-09-19 검토):
 *   1. **우상단.** 좌상단은 '새로 포착'·'등급 오름' 딱지 자리라 겹친다
 *   2. **항상 보인다.** 호버로만 나타나게 하면 터치에서는 아예 없는 버튼이 된다.
 *      안 담긴 것은 흐리게, 담긴 것은 또렷하게 — 격자에서 둘이 한눈에 갈려야 한다
 *   3. **누르는 자리 44px.** 그림은 19px 로 작게 두고 버튼만 키운다
 *   4. **링크로 번지지 않게.** preventDefault + stopPropagation. 담고 나서 페이지는
 *      그대로 있고 아이콘 모양만 바뀐다
 */
export function PickCheck({
  id,
  name,
  variant = 'corner',
}: {
  id: string;
  name: string;
  /**
   * `corner` 는 카드 썸네일 우상단의 아이콘. `inline` 은 글자가 붙은 버튼이다.
   *
   * 소재 상세에는 모서리가 없다 — 카드가 아니라 문서라서 44px 정사각을 어디에 놓아도
   * 무엇에 대한 버튼인지 안 읽힌다. 거기서는 글자를 붙인다.
   *
   * **글자는 담긴 상태에 따라 바뀌지 않는다.** 「담기」와 「담김」을 번갈아 쓰면 누를
   * 것과 지금 상태가 한 낱말에 겹친다. 상태는 체크 사각형이 말하고 글자는 할 일을
   * 말한다. 문구는 `docs/WORDS.md` §10 의 것 그대로다.
   */
  variant?: 'corner' | 'inline';
}) {
  const { has, toggle, ready } = usePick();
  // 서버는 담긴 것을 모른다. 읽기 전에는 무조건 안 담긴 모양으로 그린다.
  const on = ready && has(id);

  if (variant === 'inline') {
    return (
      <button
        type="button"
        aria-pressed={on}
        aria-label={on ? `${name} 담기 취소` : `${name} 담기`}
        onClick={() => toggle(id)}
        className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors"
        style={{
          background: on ? 'var(--rita-blue)' : 'var(--surface)',
          border: `1px solid ${on ? 'var(--rita-blue)' : 'var(--line)'}`,
          color: on ? '#fff' : 'var(--ink-2)',
        }}
      >
        <Box on={on} onDark={on} />
        이 소재 담기
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? `${name} 담기 취소` : `${name} 담기`}
      title={on ? '담은 것 — 누르면 뺍니다' : '담기'}
      onClick={(e) => {
        /* 카드 전체가 <Link> 다. 둘 다 있어야 페이지가 안 넘어간다. */
        e.preventDefault();
        e.stopPropagation();
        toggle(id);
      }}
      style={{
        position: 'absolute',
        /*
         * 44px 정사각을 모서리에 딱 붙이고, 그림만 6px 안쪽으로 민다. 음수 offset 으로
         * 가운데를 맞추면 카드의 overflow:hidden 이 누르는 자리를 잘라 39px 이 된다.
         */
        top: 0,
        right: 0,
        width: 44,
        height: 44,
        display: 'grid',
        placeItems: 'start end',
        padding: 6,
        background: 'transparent',
        border: 0,
        cursor: 'pointer',
        zIndex: 1,
      }}
    >
      <Box on={on} />
    </button>
  );
}

/** 담김을 말하는 사각형. 밝은 썸네일 위에서도 테두리가 보이게 그림자를 한 겹 둔다. */
function Box({ on, onDark = false }: { on: boolean; onDark?: boolean }) {
  return (
    <span
      style={{
        display: 'grid',
        placeItems: 'center',
        width: 19,
        height: 19,
        flexShrink: 0,
        borderRadius: 5,
        transition: 'background .12s, border-color .12s',
        background: on ? (onDark ? '#fff' : 'var(--rita-blue)') : 'rgba(255,255,255,0.55)',
        border: `1px solid ${on ? (onDark ? '#fff' : 'var(--rita-blue)') : 'rgba(255,255,255,0.85)'}`,
        boxShadow: on ? 'none' : '0 0 0 1px rgba(21,22,58,0.18)',
      }}
    >
      {/* 체크 표시는 담겼을 때만. 빈 사각형이 '안 담김'을 말한다. */}
      {on && (
        <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden>
          <path
            d="M2.5 6.3 L4.8 8.6 L9.5 3.6"
            fill="none"
            stroke={onDark ? 'var(--rita-blue)' : '#fff'}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </span>
  );
}
