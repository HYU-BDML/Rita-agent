import Link from 'next/link';
import type { Candidate } from '@/lib/core/candidate';
import { GradeBadge } from './grade';
import { PickCheck } from './pick-check';
import { CrossCheckBadge } from './cross-check';
import { levelOf } from './surge';
import { crossCheckOf } from '@/lib/core/cross-check';
import type { Grade } from '@/lib/core/trend';
import type { CandidateImage } from '@/lib/core/candidate-images';
import { LinkedImageGrid } from './linked-image-grid';

/**
 * 후보 카드 — 다섯 층 (docs/UI-지시서.md 3장). **순서를 바꾸지 말 것.**
 *
 *   1 썸네일 16:9 (큰 것 1 + 작은 것 2, 우하단 "N장")
 *   2 이름 + 배지
 *   3 설명 두 줄
 *   4 태그 알약
 *   5 실선 아래 계정·조회
 *
 * **썸네일이 이번 작업에서 제일 큰 변화다.** `PostRecord.thumbnailUrl` 을 502건
 * 갖고 있으면서 화면에서 한 장도 쓰지 않고 있었다.
 *
 * 기존 `CandidateCard` 를 고치지 않고 새로 둔 이유: 그 카드는 이슈·밈 화면도 함께
 * 쓰는데 출신·썸네일은 캐릭터 축의 것이고, 지시서도 밈·이슈는 나중에 옮기라고 한다.
 */

/** 권리 배지. **개인 창작만 자홍이다** — 초록은 팔레트 밖이다(지시서 1장). */
const RIGHTS: Record<string, { label: string; bg: string; fg: string }> = {
  individual: { label: '개인 창작', bg: '#fae6f7', fg: '#8f2a86' },
  corporate: { label: '기업 IP', bg: 'var(--line2)', fg: 'var(--ink-2)' },
  disputed: { label: '권리 분쟁', bg: '#fdeaea', fg: '#9b2c2c' },
  unknown: { label: '권리 미확인', bg: 'var(--line2)', fg: 'var(--mute)' },
};

/**
 * 설명 한 줄. **요약의 첫 문장**을 쓰고, 없으면 까닭(`why`)을 쓴다.
 * 둘 다 없으면 빈 문자열 — 칸은 `min-height` 로 남겨 카드 높이를 맞춘다.
 */
function blurb(c: Candidate): string {
  const src = (c.summary ?? '').trim() || (c.why ?? '').trim();
  if (!src) return '';
  const m = src.match(/^[\s\S]*?[.!?。]\s|^[\s\S]*?다\.\s/);
  return (m ? m[0] : src).trim();
}

export function ThumbCard({
  c,
  grade,
  thumbs,
  shots,
  note,
  flag,
}: {
  c: Candidate;
  grade?: Grade;
  /** 캐릭터가 가장 크게 보이는 대표 이미지 한 장과 원문 링크. */
  thumbs: CandidateImage[];
  /** 이 후보가 가진 썸네일 총 장수. 우하단 배지. */
  shots: number;
  /** 눈에 띄는 것 하나. 없으면 안 붙인다 — 태그는 셋을 넘기지 않는다. */
  note?: string;
  /**
   * '오늘 들어온 것' 구획에서만 붙는 소식 딱지.
   *
   * 구획 안 22장이 다 같아 보이면 **왜 올라왔는지**가 안 읽힌다 — 새로 잡힌 것과
   * 사흘째 버텨 등급이 오른 것은 사람이 다르게 다뤄야 하는 물건이다.
   * 아래 '전체' 구획에서는 안 준다. 같은 카드가 두 번 나오는데 한쪽만 딱지가
   * 붙어야 두 구획이 구분된다.
   */
  flag?: '새로 포착' | '등급 오름';
}) {
  const rights = RIGHTS[c.rights.ownership ?? 'unknown'] ?? RIGHTS.unknown;
  const desc = blurb(c);

  return (
    <article
      className="group block overflow-hidden transition-shadow hover:shadow-[0_1px_3px_rgba(21,22,58,0.08),0_8px_20px_-8px_rgba(21,22,58,0.18)]"
      style={{ position: 'relative', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 13 }}
    >
      {/*
        담기. 여기 있던 별표(ArchiveButton)는 **서버에 수집 대상을 등록하는** 버튼이었다.
        카드 우상단에서 사람이 누르는 것은 "내가 나중에 볼 것"인데 실제로 하는 일이 달랐고,
        배포본에서는 A 가 누른 것이 B 화면에도 뜨고 재배포하면 말없이 비워졌다.
        그 기능은 `/settings/tracking` 으로 옮겼다 — 없앤 것이 아니다.
      */}
      <PickCheck id={c.id} name={c.subject} />

      {/* 1층 — charShot 최고점 한 장. 이미지는 원문, 아래 본문은 후보 상세로 간다. */}
      <LinkedImageGrid
        images={thumbs}
        max={1}
        eyebrow={flag}
        countLabel={shots > 0 ? `${shots}장` : undefined}
      />

      <Link href={`/candidates/${encodeURIComponent(c.id)}`} className="block p-3.5 focus-visible:outline-none">
        {/* 2층 — 이름 + 배지 */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {/* 썸네일이 한 장도 없으면 딱지를 얹을 자리가 없다. 그때만 이름 앞에 둔다. */}
          {flag && thumbs.length === 0 && (
            <span
              className="rounded px-1.5 py-0.5 text-[11px] font-semibold"
              style={{ background: 'var(--rita-blue)', color: '#fff' }}
            >
              {flag}
            </span>
          )}
          <h3 className="min-w-0 flex-1 truncate text-[16px] font-semibold leading-snug">{c.subject}</h3>
          {grade && <GradeBadge grade={grade} />}
          <span
            className="rounded px-1.5 py-0.5 text-[11px] font-medium"
            style={{ background: rights.bg, color: rights.fg }}
          >
            {rights.label}
          </span>
        </div>

        {/* 3층 — 설명 두 줄. 비어도 높이를 지켜 격자가 어긋나지 않게 한다. */}
        <p
          className="mt-1.5 line-clamp-2 text-[13px] leading-[1.45]"
          style={{ minHeight: 41, color: 'var(--ink-2)' }}
        >
          {desc}
        </p>

        {/* 4층 — 태그. 출신 + 눈에 띄는 것 하나. 셋을 넘기지 않는다. */}
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <Pill>
            {c.lineage?.kind ?? '모름'}
            {c.lineage?.basis === '지식' && (
              <span className="ml-1" style={{ color: 'var(--rita-blue)' }} title="자료에 없고 모델이 아는 것입니다.">
                추정
              </span>
            )}
          </Pill>
          {note && <Pill>{note}</Pill>}
          {/*
            교차 확인 라벨 — 만들어만 두고 화면에서 쓰지 않고 있었다(2026-09-19).
            계정 수만으로는 "1곳"이 공식 홍보인지 개인 한 명인지 안 갈린다.
          */}
          <CrossCheckBadge cross={crossCheckOf(c)} />
        </div>

        {/*
          5층 — 실선 아래 숫자. 값만 굵게.

          **규모 기준선(네이버 검색 추이)을 여기 글자로 둔다.** SurgeMeter(96px 트랙)를
          넣으면 층이 여섯이 되는데 지시서가 다섯으로 못 박았다. 뜻은 같고 자리만 아낀다.
          **못 잰 것은 아예 안 적는다** — 0배로 적으면 거짓말이고, 개인 창작은
          검색량이 데이터랩 임계 미만이라 값이 안 온다(68건 중 25건).
        */}
        <p
          className="mt-2.5 pt-2.5 text-[12px]"
          style={{ borderTop: '1px solid var(--line2)', color: 'var(--mute)' }}
        >
          계정 <strong className="font-semibold" style={{ color: 'var(--ink-2)' }}>{c.momentum.accounts ?? 0}</strong>곳
          {c.momentum.views != null && (
            <>
              {'  ·  '}조회{' '}
              <strong className="font-semibold" style={{ color: 'var(--ink-2)' }}>
                {c.momentum.views.toLocaleString('ko-KR')}
              </strong>
            </>
          )}
          {c.momentum.surge != null && (
            <>
              {'  ·  '}검색{' '}
              <strong className="font-semibold" style={{ color: surgeColor(c.momentum.surge) }}>
                {c.momentum.surge}배
              </strong>
              <span style={{ color: 'var(--dim)' }}> {SURGE_WORD[levelOf(c.momentum.surge)]}</span>
            </>
          )}
        </p>
      </Link>
    </article>
  );
}

/** 평소 대비를 말로도 적는다 — 색만으로 뜻을 전하지 않는다(급등 미터와 같은 규칙). */
const SURGE_WORD: Record<string, string> = {
  'up-strong': '크게 오름',
  up: '오르는 편',
  flat: '평소와 비슷',
  down: '식는 중',
  unknown: '',
};

function surgeColor(surge: number): string {
  const l = levelOf(surge);
  if (l === 'up-strong' || l === 'up') return 'var(--up)';
  if (l === 'down') return 'var(--down)';
  return 'var(--ink-2)';
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[11.5px]"
      style={{ background: 'var(--line2)', color: 'var(--ink-2)' }}
    >
      {children}
    </span>
  );
}
