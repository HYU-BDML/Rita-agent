'use client';

import Link from 'next/link';
import { usePick } from './pick';

/**
 * 하단 담기 바 (docs/UI-지시서.md 4장).
 *
 * 담기 아이콘만 있고 이 줄이 없으면 **담은 것이 어디로 갔는지 알 수가 없다.**
 * 아이콘 모양만 바뀌고 끝나면 사람은 담긴 건지 확신하지 못해 한 번 더 누른다.
 *
 * 0건이면 통째로 숨긴다 — 늘 떠 있으면 화면 아래 88px 을 영영 먹는다.
 */
export function PickBar() {
  const { ids, clear, ready } = usePick();
  if (!ready || ids.length === 0) return null;

  return (
    <>
      {/* 바가 마지막 카드를 덮지 않게 자리를 만든다. 바가 있을 때만 준다. */}
      <div style={{ height: 88 }} aria-hidden />
      <div
        className="fixed inset-x-0 bottom-0 z-20"
        style={{ background: 'var(--surface)', borderTop: '1px solid var(--line)' }}
      >
        <div
          className="mx-auto flex flex-wrap items-center gap-x-3 gap-y-2 px-8 py-3.5"
          style={{ maxWidth: 1140 }}
        >
          <span className="text-[13px]" style={{ color: 'var(--ink-2)' }}>
            <strong className="num font-semibold" style={{ color: 'var(--rita-blue)' }}>
              {ids.length}건
            </strong>{' '}
            담음
          </span>
          <span className="text-[12px]" style={{ color: 'var(--dim)' }}>
            이 브라우저에만 저장됩니다
          </span>
          <button
            type="button"
            onClick={clear}
            className="rounded-lg px-3 py-1.5 text-[12.5px] transition-colors"
            style={{ border: '1px solid var(--line)', color: 'var(--ink-2)' }}
          >
            비우기
          </button>
          {/* 주 버튼만 그라데이션. 그라데이션을 쓰는 네 자리 중 넷째다. */}
          <Link
            href="/library"
            className="ml-auto rounded-lg px-4 py-2 text-[13px] font-semibold"
            style={{ background: 'var(--grad)', color: '#fff' }}
          >
            보관함에서 보기
          </Link>
        </div>
      </div>
    </>
  );
}
