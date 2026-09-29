'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PickCheck } from './pick-check';
import { type GrammarKind, type GrammarView, opensWithItem } from '@/lib/core/grammar';
import {
  ACCENT,
  BODY,
  CARD_LINE,
  CHIP_INK,
  CHIP_LINE,
  FAINT,
  INK,
  INNER_LINE,
  KIND_ASK,
  KIND_LABEL,
  LINKC,
  MUTED,
  OFF_BG,
  OFF_INK,
  OFF_LINE,
  SUB,
  boardTitle,
} from './grammar-style';

/** 카드로 올릴 방식 수. 세 장이 스크롤 없이 한 줄에 들어간다. */
const CARDS = 3;
/** 카드에 올리려면 서로 다른 게시물 이만큼. 얇은 것은 칩으로만 보인다. */
const MIN_SOURCES = 2;

/** 질문 1 의 답. 「뭘로 만들 거예요?」 (`docs/WORDS.md` §4) */
const FORMS: GrammarKind[] = ['video', 'photo', 'copy'];
/** 질문 2 의 답. 「소개할 물건이나 가게가 있나요?」 */
const ITEMS = [
  { value: 'yes', label: '있어요' },
  { value: 'no', label: '없어요' },
] as const;

export type ItemAnswer = (typeof ITEMS)[number]['value'];

/**
 * 묻고 방식을 고르는 자리. 브리프(`/`)와 방식 목록(`/grammars`)이 함께 쓴다.
 *
 * **답은 URL 에 있다.** `useState` 를 쓰지 않는다 — 새로고침하면 사라지고, 북마크하거나
 * 옆자리에 보낼 수도 없다. 답을 `?form=video&item=no` 로 두면 그 세 가지가 공짜로 된다.
 * 서버에 쓰지 않고 로그인도 만들지 않는다. 옵션은 전부 `<Link>` 라 자바스크립트가 아직
 * 안 붙었을 때도 눌린다.
 *
 * **거르기는 순수 계산이다.** 누를 때마다 LLM 을 부르지 않는다 — 배포본에 로그인이 없어
 * 조회당 호출을 만들면 비용 천장이 사라진다.
 *
 * **첫 화면이 비지 않는다.** 아무것도 안 고른 상태에서 12개를 다 낸다. 고르기 전에는
 * 아무것도 안 보여주는 화면은 무엇을 고르면 무엇이 나오는지 알려주지 않는다.
 *
 * **걸린 방식을 목록에서 없애지 않는다.** 칩에 이유를 달아 남긴다 — 없애면 "나중에
 * 열릴 것"이 안 보여 다시 올 이유가 사라진다.
 */
export function GrammarBoard({
  grammars,
  more = 'grammars',
  form,
  item,
}: {
  grammars: GrammarView[];
  /** 아래 링크가 어디로 가나. 방식 목록에서는 소재로, 브리프에서는 방식 목록으로 (WORDS.md §10). */
  more?: 'grammars' | 'explore';
  /** 질문 1 의 답. 안 고르면 `undefined` 이고 12개가 다 나온다. */
  form?: GrammarKind;
  /** 질문 2 의 답. 질문 1 을 고른 뒤에만 뜻이 있다. */
  item?: ItemAnswer;
}) {
  const path = usePathname() ?? '/';
  /** 답 두 개를 주소로. 같은 것을 다시 누르면 답을 지운다 — 되돌릴 길이 있어야 한다. */
  const href = (next: { form?: GrammarKind; item?: ItemAnswer }) => {
    const p = new URLSearchParams();
    if (next.form) p.set('form', next.form);
    if (next.item) p.set('item', next.item);
    const q = p.toString();
    return q ? `${path}?${q}` : path;
  };

  /*
   * 고른 종류로 먼저 거르고, 물건은 「없어요」일 때만 거른다.
   *   답 안 함  물건이 필요한 방식도 카드에 올린다. 카드가 "물건 필요"를 달고 알린다
   *   있어요    거르지 않는다
   *   없어요    물건이 필요한 방식을 카드에서 내린다. 칩에는 남는다
   */
  const inForm = form ? grammars.filter((g) => g.kind === form) : grammars;
  const able = item === 'no' ? inForm.filter((g) => !g.need.item) : inForm;
  const cards = able.filter((g) => g.evidence.length >= MIN_SOURCES).slice(0, CARDS);
  const shown = new Set(cards.map((g) => g.id));
  const rest = grammars.filter((g) => !shown.has(g.id));

  /** 이 종류 안에서 물건이 필요한 방식. 질문 2 를 낼지와 「N개가 걸립니다」의 N 이다. */
  const gated = form ? opensWithItem(grammars, form) : [];
  /** 「없어요」 안내 박스에서 이름을 부를 방식. 데이터에서 뽑는다 — 하드코딩하지 않는다. */
  const opens = gated.map((g) => g.name).join(' · ');

  return (
    <>
      <section className="flex flex-col gap-3.5" aria-label="방식 고르기">
        <Question
          n={1}
          done={Boolean(form)}
          ask="뭘로 만들 거예요?"
          hint={form ? null : '고르지 않으면 전부 보여드립니다'}
        >
          {FORMS.map((k) => (
            <Opt
              key={k}
              on={form === k}
              /*
               * 종류를 바꾸면 질문 2 의 답을 지운다. 걸리는 방식 수가 종류마다 달라서
               * (영상 2개 · 글만 1개) 답이 남아 있으면 「N개 방식이 여기에 걸립니다」를
               * 못 보고 지나간다 — 답한 적 없는 질문에 답이 들어가 있게 된다.
               * 고른 것을 다시 누르면 둘 다 지워지고 12개로 돌아간다.
               */
              href={form === k ? href({}) : href({ form: k })}
              label={KIND_ASK[k]}
            />
          ))}
        </Question>

        {/*
          질문 2 는 조건부다. 질문 1 을 고른 뒤에만, 그리고 그 종류 안에 물건이 필요한
          방식이 실제로 있을 때만 낸다. 없는데 물으면 답이 아무것도 바꾸지 않는다.
        */}
        {form && gated.length > 0 && (
          <Question
            n={2}
            done={Boolean(item)}
            ask="소개할 물건이나 가게가 있나요?"
            hint={item ? null : `${gated.length}개 방식이 여기에 걸립니다`}
          >
            {ITEMS.map((o) => (
              <Opt
                key={o.value}
                on={item === o.value}
                href={item === o.value ? href({ form }) : href({ form, item: o.value })}
                label={o.label}
              />
            ))}
          </Question>
        )}

        {/* 「없어요」는 막다른 길이 아니다. 무엇이 남았고 무엇이 나중에 열리는지 말한다. */}
        {form && item === 'no' && gated.length > 0 && (
          <div className="rounded-[10px] px-[18px] py-4" style={{ background: '#26264C' }}>
            <p className="text-[15px] font-semibold text-white">
              물건 없이 할 수 있는 {KIND_ASK[form]} 방식 <span className="num">{able.length}</span>개를 골랐습니다
            </p>
            {/* 두 번째 줄에 훈계를 덧붙이지 않는다 (`docs/WORDS.md` §4). */}
            <p className="mt-1.5 text-[13px] leading-[1.5]" style={{ color: SUB }}>
              물건이 생기면 <b className="text-white">{opens}</b> 도 열립니다.
            </p>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-[18px]">
        <div className="flex items-baseline gap-2.5">
          {/* 고른 답에 따라 바뀐다 (`docs/WORDS.md` §4). */}
          <b className="text-[18px]" style={{ color: INK }}>
            {boardTitle(form)}
          </b>
          <span className="text-[14px]" style={{ color: MUTED }}>
            <span className="num">{able.length}</span>개 중 <span className="num">{cards.length}</span>개
          </span>
        </div>
        <div className="grid gap-[18px] md:grid-cols-2 xl:grid-cols-3">
          {cards.map((g) => (
            <Card key={g.id} g={g} />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-[11px]">
        <div className="text-[14px] font-bold" style={{ color: INK }}>
          다른 방식 <span className="num">{rest.length}</span>개
        </div>
        <div className="flex flex-wrap gap-[9px]">
          {rest.map((g) => {
            /*
             * 왜 지금 못 하나. 고른 종류와 다르면 그 방식의 종류 이름을, 종류는 맞는데
             * 물건이 없다고 답했으면 「물건 필요」를 붙인다. 종류가 먼저다 — 물건을
             * 구해도 글만 쓰는 방식이 영상이 되지는 않는다.
             */
            const why =
              form && g.kind !== form
                ? KIND_ASK[g.kind]
                : item === 'no' && g.need.item
                  ? '물건 필요'
                  : null;
            return (
              <Link
                key={g.id}
                href={`/grammars/${g.id}`}
                className="rounded-[9px] px-4 py-2.5 text-[15px] transition-shadow hover:shadow-sm"
                style={
                  why
                    ? { background: OFF_BG, border: `1px solid ${OFF_LINE}`, color: OFF_INK, fontWeight: 500 }
                    : { background: '#fff', border: `1px solid ${CHIP_LINE}`, color: CHIP_INK, fontWeight: 600 }
                }
              >
                {g.name}
                {why && (
                  <span className="ml-[7px] text-[12px] font-normal" style={{ color: OFF_INK }}>
                    {why}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-4">
        {cards[0] && (
          <Link
            href={`/grammars/${cards[0].id}`}
            className="rounded-[9px] px-6 py-3 text-[15px] font-bold text-white"
            style={{ background: ACCENT }}
          >
            방식 하나 열어보기
          </Link>
        )}
        {more === 'grammars' ? (
          <Link href="/grammars" className="text-[14px] underline" style={{ color: LINKC }}>
            <span className="num">{grammars.length}</span>개 전체 보기 →
          </Link>
        ) : (
          <Link href="/explore" className="text-[14px] underline" style={{ color: LINKC }}>
            소재 더 보기 →
          </Link>
        )}
      </div>
    </>
  );
}

/** 질문 한 줄 — 번호 · 묻는 말 · 답 · 답하기 전 오른쪽 귀띔. */
function Question({
  n,
  done,
  ask,
  hint,
  children,
}: {
  n: number;
  done: boolean;
  ask: string;
  hint: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-[11px]">
      <span
        className="flex h-[21px] w-[21px] shrink-0 items-center justify-center rounded-full text-[12px] font-bold"
        style={done ? { background: ACCENT, color: '#fff' } : { background: OFF_BG, color: OFF_INK }}
      >
        {n}
      </span>
      <span className="text-[14px] font-bold" style={{ color: INK }}>
        {ask}
      </span>
      {children}
      {hint && (
        <span className="text-[13px] sm:ml-auto" style={{ color: MUTED }}>
          {hint}
        </span>
      )}
    </div>
  );
}

/** 답 하나. 주소를 바꾸는 링크라 새로고침해도 같은 상태로 열린다. */
function Opt({ on, href, label }: { on: boolean; href: string; label: string }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={on ? 'true' : undefined}
      className="rounded-full px-[18px] py-2.5 text-[14px] transition-colors"
      style={
        on
          ? { background: ACCENT, border: `1px solid ${ACCENT}`, color: '#fff', fontWeight: 700 }
          : { background: '#fff', border: `1px solid ${CHIP_LINE}`, color: BODY, fontWeight: 500 }
      }
    >
      {label}
    </Link>
  );
}

/**
 * 방식 카드.
 *
 * **높이를 고정한다(300px).** 배포본은 썸네일 없는 카드에 큰 빈 공간이 생겨 그리드가
 * 어긋났다. 근거 블록을 `mt-auto` 로 바닥에 붙이면 본문 길이가 달라도 줄이 맞는다.
 *
 * **이름이 제일 크다(30px/700/-0.8px).** 이름이 이 제품의 상품이다 — 사람이 가져가는
 * 것은 소재가 아니라 "이 방식" 이라는 이름이다.
 */
function Card({ g }: { g: GrammarView }) {
  const lead = g.evidence[0];
  return (
    /*
     * 카드 전체를 링크로 감싸지 않는다. 근거에 원문 링크가 들어 있어 `<a>` 가 겹친다.
     * 이름을 링크로 두고 카드 전체를 덮게 한다 (`after:absolute`) — 눌리는 넓이는 카드
     * 전체인데 마크업상 원문 링크는 그 위에 따로 선다.
     */
    <div
      className="relative flex h-[300px] flex-col rounded-[13px] px-6 pb-5 pt-6 transition-shadow hover:shadow-md"
      style={{ background: '#fff', border: `1px solid ${CARD_LINE}` }}
    >
      {/* 담기는 카드 전체 링크와 겹치지 않게 모서리로 뺀다. 브라우저에만 저장된다. */}
      <PickCheck id={g.id} name={g.name} />
      <Link
        href={`/grammars/${g.id}`}
        className="text-[30px] font-bold leading-[1.2] tracking-[-0.8px] after:absolute after:inset-0 after:rounded-[13px] after:content-['']"
        style={{ color: INK }}
      >
        {g.name}
      </Link>
      <div className="mt-2 text-[12px]" style={{ color: MUTED }}>
        {KIND_LABEL[g.kind]} · 근거 <span className="num">{g.evidence.length}</span>건
        {g.freshness !== null && (
          <> · 최근 한 달 <span className="num">{g.freshness}</span>%</>
        )}
        {/* 물건이 필요한 방식은 카드에서도 말한다. 답을 안 했어도 미리 알아야 고를 수 있다. */}
        {g.need.item && <> · 물건 필요</>}
      </div>
      <p className="mt-3.5 text-[15px] leading-[1.62]" style={{ color: BODY }}>
        {g.desc}
      </p>
      {lead && (
        <div className="mt-auto border-t pt-3.5" style={{ borderColor: INNER_LINE }}>
          <div className="text-[11px] tracking-[0.3px]" style={{ color: FAINT }}>
            근거 {g.evidence.length}건 중 하나
          </div>
          <div className="mt-1.5 text-[14px] font-bold" style={{ color: INK }}>
            {lead.subject}
          </div>
          <p
            className="mt-1.5 line-clamp-2 text-[13px] leading-[1.55]"
            style={
              lead.quote
                ? { paddingLeft: 10, borderLeft: `3px solid ${ACCENT}`, color: INK }
                : { color: BODY }
            }
          >
            {lead.line}
          </p>
          <a
            href={lead.url}
            target="_blank"
            rel="noreferrer"
            className="relative z-10 mt-2 inline-block text-[13px] underline"
            style={{ color: LINKC }}
          >
            원문 보기
          </a>
        </div>
      )}
    </div>
  );
}
