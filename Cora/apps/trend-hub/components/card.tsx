import Link from 'next/link';
import type { Candidate, CandidateUnit } from '@/lib/core/candidate';
import { GrowthDelta } from './growth';
import { PickCheck } from './pick-check';
import { SurgeMeter } from './surge';
import { GradeBadge } from './grade';
import { CrossCheckBadge } from './cross-check';
import { crossCheckOf } from '@/lib/core/cross-check';
import { comparableAcrossRuns, type Grade } from '@/lib/core/trend';
import { newsImages, type CandidateImage } from '@/lib/core/candidate-images';
import { LinkedImageGrid } from './linked-image-grid';

/**
 * 후보 한 건. 표의 한 줄이 아니라 카드다.
 *
 * 읽는 사람이 알아야 할 순서대로 놓는다 — 무엇이 / 왜 / 얼마나 뜨나 / 어디서 / 뭘 할까.
 * 표로 놓으면 이 순서가 사라지고 열 제목을 해석하는 일부터 해야 한다.
 */
const UNIT: Record<CandidateUnit, string> = { topic: '주제', subject: '캐릭터', format: '포맷' };

/**
 * 어느 판정기가 낳았나. **레이더만 표시한다.**
 *
 * 레이더는 재는 축이 다르다 — 나머지는 우리가 검색어를 던져 찾지만 레이더는 검색어
 * 없이 플랫폼 급상승 목록을 통째로 받는다. 우리가 생각 못 한 것이 들어올 수 있는
 * 유일한 통로라, 같은 목록에 섞여 있으면서 구분이 없으면 그 값어치가 안 읽힌다.
 *
 * 나머지 셋은 축(뉴스·캐릭터·포맷)이 곧 판정기라 따로 적으면 같은 말을 두 번 한다.
 */
/** 후보가 목록에서 내려갔거나 되살아났을 때 다는 표시. 검색으로만 닿는 자리라 말이 필요하다. */
const STATE: Record<string, { label: string; title: string; tone: 'muted' | 'up' }> = {
  retired: {
    label: '지나감',
    title: '회차가 더 이상 물어오지 않아 목록에서 내려갔습니다. 다시 잡히면 되살아납니다.',
    tone: 'muted',
  },
  revived: {
    label: '다시 잡힘',
    title: '내려갔다가 다시 잡힌 소재입니다. 한 번 식었다가 다시 오르는 것은 드뭅니다.',
    tone: 'up',
  },
};

const SOURCE: Record<string, { label: string; title: string }> = {
  radar: {
    label: '레이더',
    title: '검색어 없이 플랫폼 급상승 목록에서 온 후보입니다. 우리가 검색어를 던져 찾은 것이 아닙니다.',
  },
};

export function CandidateCard({
  c,
  images = [],
  grade,
  growth,
  runs = 0,
  products = 0,
}: {
  c: Candidate;
  /** 밈처럼 게시물 이미지가 있는 축에서 넘기는 실제 원문 연결 이미지. */
  images?: CandidateImage[];
  /** 몇 번 봤나. 급등을 못 재는 후보에서 이 자리가 비지 않게 한다. */
  grade?: Grade;
  /** 직전 관측일 대비. 관측일이 하루뿐이면 null 이다. */
  growth?: number | null;
  runs?: number;
  products?: number;
}) {
  // 주제는 매체 수, 캐릭터는 계정 수. 같은 칸에 다른 것을 넣지 않는다.
  const scale =
    c.momentum.accounts != null
      ? `계정 ${c.momentum.accounts}`
      : `매체 ${(c.momentum.mediaCount ?? c.evidence.length) || 0}곳`;
  const sources = [...new Set(c.evidence.map((e) => e.source))];
  const visuals = c.origin.discoveryId === 'news' ? newsImages(c) : images;
  // 캐릭터는 한 장만 그린다. 나머지는 그 장이 죽었을 때 들어설 대비책이다.
  const shown = c.origin.discoveryId === 'meme-native' ? 3 : 1;

  return (
    <article
      className="group block overflow-hidden rounded-xl transition-shadow hover:shadow-[0_1px_3px_rgba(0,0,0,0.08),0_6px_16px_-6px_rgba(0,0,0,0.12)]"
      style={{ position: 'relative', background: 'var(--surface)', border: '1px solid var(--hairline)' }}
    >
      {/*
        담기. 여기 있던 별표(ArchiveButton)는 **서버에 수집 대상을 등록하는** 버튼이었다.
        카드 우상단에서 사람이 누르는 것은 "내가 나중에 볼 것"인데 실제로 하는 일이 달랐고,
        배포본에서는 A 가 누른 것이 B 화면에도 뜨고 재배포하면 말없이 비워졌다.
        그 기능은 `/settings/tracking` 으로 옮겼다 — 없앤 것이 아니다.
      */}
      <PickCheck id={c.id} name={c.subject} />

      {/* 캐릭터 카드와 같은 상단 전체 폭 126px 구조. 이미지가 없으면 이 층만 사라진다. */}
      <LinkedImageGrid images={visuals} max={shown} />

      <Link href={`/candidates/${encodeURIComponent(c.id)}`} className="block p-4 focus-visible:outline-none">
        {/* 아이콘 자리를 비워 둔다. 안 비우면 긴 제목이 체크 밑으로 들어간다. */}
        <div className="flex items-start justify-between gap-3 pr-7">
        <h3 className="text-[15px] font-semibold leading-snug">
          {/* 종류를 제목에 붙인다. 채택 목록처럼 주제와 캐릭터가 한 칸에 섞이는 자리가 있어서다. */}
          <span
            className="mr-1.5 align-[1.5px] rounded px-1.5 py-0.5 text-[10.5px] font-medium"
            style={{ background: 'var(--flat)', color: 'var(--ink-2)' }}
          >
            {UNIT[c.unit]}
          </span>
          {c.subject}
        </h3>
        <div className="flex shrink-0 items-center gap-1.5">
          {(() => {
            // 내려간 것이 먼저다. 되살아난 것은 지금 표에 있으므로 둘이 겹치지 않는다.
            const state = c.lifecycle === 'retired' ? STATE.retired : c.revivedAt ? STATE.revived : null;
            if (!state) return null;
            return (
              <span
                className="rounded px-1.5 py-0.5 text-[11px] font-medium"
                style={state.tone === 'up'
                  ? { background: 'var(--up-bg, #dcfce7)', color: 'var(--up, #166534)' }
                  : { background: 'var(--track)', color: 'var(--ink-muted)' }}
                title={state.title}
              >
                {state.label}
              </span>
            );
          })()}
          {SOURCE[c.origin.discoveryId] && (
            <span
              className="rounded px-1.5 py-0.5 text-[11px] font-medium"
              style={{ background: 'var(--track)', color: 'var(--ink-2)' }}
              title={SOURCE[c.origin.discoveryId].title}
            >
              {SOURCE[c.origin.discoveryId].label}
            </span>
          )}
          {c.origin.mock && (
            <span
              className="rounded px-1.5 py-0.5 text-[11px] font-medium"
              style={{ background: '#fef3c7', color: '#78350f' }}
              title="가짜 데이터입니다. 판단 근거로 쓰지 마세요."
            >
              목 데이터
            </span>
          )}
        </div>
      </div>

      {/*
        출신. 작품 이름이 있으면 같이 보인다. **`지식` 이면 "추정"을 붙인다** —
        자료에 없고 모델이 아는 것이라는 뜻이라, 표시가 없으면 사람이 검증할 길이 없다.
        흐리게 처리하지 않는다. 그러면 못 보고 지나간다(2026-09-19 사용자 결정).
      */}
      {c.lineage && c.lineage.kind !== '모름' && (
        <p className="mt-1.5 text-[12px]" style={{ color: 'var(--ink-muted)' }}>
          {c.lineage.kind}
          {c.lineage.work && ` · ${c.lineage.work}`}
          {c.lineage.basis === '지식' && (
            <span
              className="ml-1.5 rounded px-1 py-0.5 text-[11px]"
              style={{ background: 'var(--track)', color: 'var(--ink-2)' }}
              title="자료에 없고 모델이 아는 것입니다. 확인해 주세요."
            >
              추정
            </span>
          )}
        </p>
      )}

      {/*
        `flagged` 만 표시한다. `blocked` 는 목록에 오지 않는다 — 카드가 뜨면
        요약이 같이 읽히고, 그러면 막은 뜻이 없어진다(2026-09-19).
        여기서 blocked 를 그리지 않는 것이 마지막 방어선이다.
      */}
      {c.safety?.level === 'flagged' && (
        <p
          className="mt-1.5 rounded px-2 py-1 text-[12px] leading-relaxed"
          style={{ background: '#fef3c7', color: '#78350f' }}
          title={c.safety.evidence}
        >
          ⚠ 확인 필요 — {c.safety.reason}
        </p>
      )}

      {/*
        목록에서는 '왜 지금인가'가 먼저다. 그게 없는 후보(판정기가 메모만 남겨 걸러진 경우)는
        빈칸으로 두지 않고 본문 요약을 대신 보인다 — 무엇에 대한 후보인지는 보여야 고를 수 있다.
      */}
      {(c.why || c.summary) && (
        <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
          {c.why || c.summary}
        </p>
      )}

      {/*
        등급이 먼저다. 급등은 잰 후보에만 붙는다(캐릭터는 그 축으로 안 본다) — 그래서
        이 자리가 통째로 비던 것이 T2 가 고치려는 빈칸이다. 등급은 어느 후보에나 있다.
      */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {grade && <GradeBadge grade={grade} />}
        {/* 교차 확인은 캐릭터 축에만. 주제는 수집 단계에서 매체 2곳을 이미 요구한다. */}
        {c.unit === 'subject' && <CrossCheckBadge cross={crossCheckOf(c)} />}
        <SurgeMeter surge={c.momentum.surge} />
      </div>

      {/*
        관측일이 이틀 이상이고 **재는 축이 성립할 때만.** 캐릭터는 회차마다 표본이 바뀌어
        조회수 합 비교가 안 된다 — 리락쿠마 카드에 "0.25× 지난 회차 대비 내림"이 찍히고
        있었는데 식은 게 아니라 다른 글을 잡은 것이었다. 까닭은 comparableAcrossRuns 에.
      */}
      {runs > 1 && comparableAcrossRuns(c.unit) && (
        <div className="mt-1.5">
          <GrowthDelta growth={growth ?? null} runs={runs} />
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]" style={{ color: 'var(--ink-muted)' }}>
        <span className="num">{scale}</span>
        {sources.length > 0 && (
          <>
            <span aria-hidden>·</span>
            <span className="truncate">{sources.slice(0, 3).join(' · ')}</span>
          </>
        )}
        {c.review !== 'pending' && (
          <>
            <span aria-hidden>·</span>
            <span style={{ color: 'var(--ink-2)' }}>
              {c.review === 'adopted' ? '채택함' : c.review === 'rejected' ? '기각함' : '보류'}
            </span>
          </>
        )}
        {/* 채택은 '만들겠다'는 뜻이다. 만들었는지까지 여기서 보여야 그 판단이 끝난다. */}
        {c.review === 'adopted' && (
          <>
            <span aria-hidden>·</span>
            <span className="num" style={{ color: products ? 'var(--ink-2)' : 'var(--down)' }}>
              {products ? `만든 것 ${products}` : '아직 안 만듦'}
            </span>
          </>
        )}
        </div>
      </Link>
    </article>
  );
}
