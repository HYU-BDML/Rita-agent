'use client';

import { useEffect, useRef, useState } from 'react';
import type { CandidateImage } from '@/lib/core/candidate-images';

/**
 * 틀의 가로세로 비. **16:9 로 둔다.**
 *
 * 2026-09-24 실측 — 저장된 썸네일 1,986장 중 1,559장(88%)이 유튜브이고 전부 1280×720 이다.
 * 나머지는 틱톡 500×800(0.63:1) · 인스타 360×639(0.56:1) · X 제각각이라 맞출 기준이 없다.
 * 제일 많은 쪽에 틀을 맞추면 그것들은 한 픽셀도 안 잘린다.
 *
 * 전에는 높이를 126px 로 박았다. 카드 폭이 350px 쯤이라 2.78:1 이 되는데, 들어오는
 * 사진이 **전부 그보다 세로로 길어서 예외 없이 잘렸다** — 유튜브는 높이의 36%,
 * 틱톡은 78% 가 날아갔다. 비율로 두면 카드 폭이 달라져도 따라간다.
 */
const RATIO = '16 / 9';

interface Props {
  images: CandidateImage[];
  /**
   * 한 번에 그릴 장 수. 넘겨받은 것이 더 많으면 나머지는 **대비책**으로 남는다 —
   * 앞엣것이 죽으면 뒤엣것이 그 자리에 들어선다. 한 장만 받던 때는 그 장이 죽으면
   * 카드가 통째로 비었다. 기본 3 은 종전 동작 그대로다.
   */
  max?: number;
  className?: string;
  eyebrow?: string;
  countLabel?: string;
}

interface PanelProps {
  images: CandidateImage[];
  title: string;
  caption: string;
}

/**
 * 이미지마다 원문 링크를 제공하고, 만료된 CDN 이미지는 즉시 목록에서 뺀다.
 * 전부 실패하면 영역 자체를 없애 기존 텍스트 카드 모양으로 돌아간다.
 */
export function LinkedImageGrid({ images, max = 3, className = '', eyebrow, countLabel }: Props) {
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const visible = images.filter((image) => !failed.has(image.src));

  if (!visible.length) return null;

  const fail = (src: string) => {
    setFailed((current) => {
      const next = new Set(current);
      next.add(src);
      return next;
    });
  };

  return <Grid visible={visible.slice(0, max)} className={className} eyebrow={eyebrow} countLabel={countLabel} onError={fail} />;
}

/** 상세 화면용. 이미지가 전부 실패하면 제목과 설명까지 함께 사라진다. */
export function LinkedImagePanel({ images, title, caption }: PanelProps) {
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const visible = images.filter((image) => !failed.has(image.src));
  if (!visible.length) return null;

  const fail = (src: string) => {
    setFailed((current) => {
      const next = new Set(current);
      next.add(src);
      return next;
    });
  };

  return (
    <section className="mt-4 max-w-2xl">
      <h2 className="text-[13px] font-semibold">{title}</h2>
      <Grid visible={visible} className="mt-2 rounded-xl" onError={fail} />
      <p className="mt-1.5 text-[11px]" style={{ color: 'var(--ink-muted)' }}>
        {caption}
      </p>
    </section>
  );
}

function Grid({
  visible,
  className = '',
  eyebrow,
  countLabel,
  onError,
}: {
  visible: CandidateImage[];
  className?: string;
  eyebrow?: string;
  countLabel?: string;
  onError: (src: string) => void;
}) {
  return (
    <div
      className={`relative grid overflow-hidden ${className}`}
      style={{
        aspectRatio: RATIO,
        gap: 2,
        gridTemplateColumns: visible.length === 1 ? '1fr' : visible.length === 2 ? '1fr 1fr' : '2fr 1fr',
        background: 'var(--line)',
      }}
    >
      <Shot image={visible[0]} onError={onError} compact={visible.length > 1} />
      {visible.length === 2 && <Shot image={visible[1]} onError={onError} compact />}
      {visible.length >= 3 && (
        <div className="grid min-h-0 gap-0.5" style={{ gridTemplateRows: '1fr 1fr' }}>
          <Shot image={visible[1]} onError={onError} compact />
          <Shot image={visible[2]} onError={onError} compact />
        </div>
      )}
      {eyebrow && (
        <span
          className="pointer-events-none absolute left-1.5 top-1.5 rounded px-1.5 py-0.5 text-[11px] font-semibold"
          style={{ background: 'var(--rita-blue)', color: '#fff' }}
        >
          {eyebrow}
        </span>
      )}
      {countLabel && (
        <span
          className="pointer-events-none absolute bottom-1.5 right-1.5 rounded px-1.5 py-0.5 text-[11px] font-medium"
          style={{ background: 'rgba(21,22,58,0.76)', color: '#fff' }}
        >
          {countLabel}
        </span>
      )}
    </div>
  );
}

function Shot({
  image,
  onError,
  compact,
}: {
  image: CandidateImage;
  onError: (src: string) => void;
  compact: boolean;
}) {
  const imageRef = useRef<HTMLImageElement>(null);

  /* SSR 직후 hydration 전에 실패한 이미지는 React onError가 놓칠 수 있다. */
  useEffect(() => {
    const element = imageRef.current;
    if (element?.complete && element.naturalWidth === 0) onError(image.src);
  }, [image.src, onError]);

  return (
    <a
      href={image.href}
      target="_blank"
      rel="noreferrer"
      aria-label={`${image.alt} 원문 보기`}
      title="원문 게시물 열기"
      className="group/image relative block min-h-0 overflow-hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
      style={{ background: 'var(--line2)', outlineColor: 'var(--rita-blue)' }}
    >
      {/*
        외부 CDN은 서명 만료가 있어 next/image 프록시를 거치지 않는다.
        **자르지 않는다(contain).** cover 로 채우면 틀보다 세로로 긴 사진이 위아래로
        잘려 나가는데, 유튜브 썸네일은 제목 글자가 거기 있고 틱톡은 얼굴이 거기 있다.
        비율이 안 맞는 사진은 좌우에 여백이 생긴다 — 잘려서 뭘 찍었는지 모르게 되는
        것보다 작게라도 온전히 보이는 쪽이 낫다.
      */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imageRef}
        src={image.src}
        alt={image.alt}
        loading="lazy"
        onError={() => onError(image.src)}
        className="h-full w-full object-contain transition-transform duration-200 group-hover/image:scale-[1.02]"
      />
      <span
        className="pointer-events-none absolute bottom-1.5 left-1.5 rounded px-1.5 py-0.5 text-[10px] font-medium opacity-90 transition-opacity group-hover/image:opacity-100"
        style={{ background: 'rgba(21,22,58,0.76)', color: '#fff' }}
      >
        {compact ? '↗' : '원문 ↗'}
      </span>
    </a>
  );
}
