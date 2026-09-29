import type { EvidenceCard as Card } from '@/lib/core/evidence-card';
import { manCount } from '@/lib/core/evidence-card';
import { ACCENT, CARD_LINE, INK, LINKC, MUTED } from './grammar-style';

/**
 * 근거 카드 (`docs/WORDS.md` §19).
 *
 * ```
 * {소재 이름}                최고 {조회} · 계정 {N}곳        [원문]
 * [썸네일 3장 가로]
 * "{대표 캡션}"
 * ```
 *
 * 방식 상세의 근거 목록과 브리프 항목의 근거 한 건이 같은 컴포넌트를 쓴다. 한쪽만
 * 고쳐지는 일이 없게 하려고 하나로 둔다.
 *
 * **없는 줄은 안 그린다.** 조회가 없으면 「최고 …」 토막을 빼고, 썸네일이 0 장이면 그
 * 줄을, 이름을 온전히 포함한 캡션이 없으면 캡션 줄을 안 그린다. 자리 표시자도 회색
 * 박스도 두지 않는다 — 빈 상자는 "아직 안 불러왔나" 로 읽혀서 없는 것보다 나쁘다.
 */
export function EvidenceCard({ e }: { e: Card }) {
  return (
    <article className="rounded-[13px] px-5 py-4" style={{ background: '#fff', border: `1px solid ${CARD_LINE}` }}>
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="flex-grow text-[15px] font-bold" style={{ color: INK }}>
          {e.subject}
        </span>
        <span className="text-[12px]" style={{ color: MUTED }}>
          {/* 조회수가 하나도 없으면 이 토막 자체를 뺀다. 「최고 0」이라고 적지 않는다. */}
          {e.topViews !== null && (
            <>
              최고 <span className="num">{manCount(e.topViews)}</span> ·{' '}
            </>
          )}
          계정 <span className="num">{e.accounts}</span>곳
        </span>
        <a href={e.url} target="_blank" rel="noreferrer" className="text-[13px] underline" style={{ color: LINKC }}>
          원문
        </a>
      </div>

      {/* 영상 첫 화면이라 한 장만 봐도 무엇인지 안다. 0 장이면 이 줄이 아예 없다. */}
      {e.thumbs.length > 0 && (
        <div className="mt-3 flex gap-2">
          {e.thumbs.map((src) => (
            <img
              key={src}
              src={src}
              alt=""
              loading="lazy"
              className="h-[72px] flex-1 rounded-[7px] object-cover"
              style={{ background: '#EFEDF7', minWidth: 0 }}
            />
          ))}
        </div>
      )}

      {/* 소재 이름을 온전히 포함한 캡션만 온다. 없으면 이 줄이 아예 없다. */}
      {e.caption && (
        <p
          className="mt-3 text-[14px] leading-[1.55]"
          style={{ paddingLeft: 11, borderLeft: `3px solid ${ACCENT}`, color: INK }}
        >
          “{e.caption}”
        </p>
      )}
    </article>
  );
}
