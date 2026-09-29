'use client';

import Link from 'next/link';
import { usePick } from './pick';

/**
 * 담은 것 — 브라우저에 담아 둔 방식과 소재.
 *
 * **서버는 무엇이 담겼는지 모른다.** 담기는 localStorage 에 있다(`components/pick.tsx`).
 * 그래서 서버가 방식 12개와 소재 전체의 얇은 요약을 내려보내고, 거르는 일은 여기서 한다.
 * 담은 id 를 서버로 보내 물으면 그 목록이 서버 로그에 남는다 — 개인 상태를 브라우저에
 * 두기로 한 이유가 사라진다.
 *
 * **방식 id 와 소재 id 는 콜론으로 갈린다.** 소재 id 는 판정기 이름이 앞에 붙어 196건이
 * 전부 `radar:한동훈` 꼴이고, 방식 id 12개는 `challenge` 처럼 콜론이 없다. 한 바구니에
 * 둘을 담아도 섞이지 않는다.
 */
export interface PickedGrammar {
  id: string;
  name: string;
  kind: string;
  desc: string;
  sources: number;
  freshness: number | null;
}

export interface PickedTopic {
  id: string;
  subject: string;
  axis: string;
  blurb: string;
  rights?: string;
}

export function PickedList({
  grammars,
  topics,
}: {
  grammars: PickedGrammar[];
  topics: PickedTopic[];
}) {
  const { ids, remove, ready } = usePick();
  /*
   * 읽기 전에는 아무것도 그리지 않는다. 서버가 보낸 HTML 에는 담긴 것이 없으므로
   * 담긴 채로 먼저 그리면 hydration 이 깨진다.
   */
  if (!ready) return null;

  const picked = new Set(ids);
  const gs = grammars.filter((g) => picked.has(g.id));
  const ts = topics.filter((t) => picked.has(t.id));

  return (
    <div className="space-y-7">
      {gs.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[15px] font-semibold">
            방식 <span className="num font-normal" style={{ color: 'var(--ink-muted)' }}>{gs.length}</span>
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {gs.map((g) => (
              <article
                key={g.id}
                className="rounded-xl p-4"
                style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}
              >
                <div className="flex items-start gap-2">
                  <Link href={`/grammars/${g.id}`} className="text-[18px] font-bold hover:underline">
                    {g.name}
                  </Link>
                  <Remove onClick={() => remove(g.id)} name={g.name} />
                </div>
                <p className="mt-1 text-[12px]" style={{ color: 'var(--ink-muted)' }}>
                  {g.kind} · 근거 <span className="num">{g.sources}</span>건
                  {g.freshness === null ? (
                    <> · 아직 값이 없습니다</>
                  ) : (
                    <> · 최근 한 달 <span className="num">{g.freshness}</span>%</>
                  )}
                </p>
                <p className="mt-2 text-[13px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
                  {g.desc}
                </p>
              </article>
            ))}
          </div>
        </section>
      )}

      {ts.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[15px] font-semibold">
            소재 <span className="num font-normal" style={{ color: 'var(--ink-muted)' }}>{ts.length}</span>
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {ts.map((t) => (
              <article
                key={t.id}
                className="rounded-xl p-4"
                style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}
              >
                <div className="flex items-start gap-2">
                  <Link
                    href={`/candidates/${encodeURIComponent(t.id)}`}
                    className="text-[15px] font-semibold hover:underline"
                  >
                    {t.subject}
                  </Link>
                  <Remove onClick={() => remove(t.id)} name={t.subject} />
                </div>
                <p className="mt-1 text-[12px]" style={{ color: 'var(--ink-muted)' }}>
                  {t.axis}
                  {t.rights && <> · {t.rights}</>}
                </p>
                {t.blurb ? (
                  <p className="mt-2 text-[13px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
                    {t.blurb}
                  </p>
                ) : (
                  <p className="mt-2 text-[13px]" style={{ color: 'var(--ink-muted)' }}>
                    근거가 아직 얇습니다
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {/*
        빈 상태에 문구를 넣지 않았다. `docs/WORDS.md` §12 의 두 문장은 근거가 얇은 소재와
        값을 못 내는 소재를 가리키는 말이라 "아무것도 담지 않았다"에 맞지 않고, 이 경우의
        문장이 그 문서에 아직 없다. 지어내지 않는다.
      */}
    </div>
  );
}

/** 담은 것에서 빼기. `aria-label` 로만 말한다 — 격자에 낱말을 더 늘리지 않는다. */
function Remove({ onClick, name }: { onClick: () => void; name: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${name} 담기 취소`}
      className="ml-auto shrink-0 rounded-md px-2 py-1 text-[12px] transition-colors"
      style={{ border: '1px solid var(--line)', color: 'var(--ink-muted)' }}
    >
      ✕
    </button>
  );
}
