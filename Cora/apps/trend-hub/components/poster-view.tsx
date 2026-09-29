'use client';

import { useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { RATIOS, type Poster } from '@/lib/producers/poster-shape';

/**
 * 포스터 시안.
 *
 * fal 이 그린 키비주얼 위에 한글을 CSS 로 얹는다. 이미지 안에는 글자가 없다.
 * 그래서 문구가 마음에 안 들면 이미지를 다시 뽑지 않고 여기만 고치면 된다.
 *
 * 화면에는 320px 폭으로 그리고, 저장할 때 4배(1280px)로 키운다.
 */

const W = 320;

export function PosterView({
  poster,
  서버,
}: {
  poster: Poster;
  /** 렌더 서버에 구운 결과. 서버가 꺼져 있었으면 오류만 온다. */
  서버?: { 조각?: string; 주소?: string; 제목?: string; 오류?: string };
}) {
  const [tint, setTint] = useState<Tint>(TINTS[0]);
  const [busy, setBusy] = useState(false);
  const face = useRef<HTMLDivElement>(null);

  const H = Math.round(W / RATIOS[poster.ratio].aspect);

  async function save() {
    if (!face.current) return;
    setBusy(true);
    try {
      const url = await toPng(face.current, { pixelRatio: 4, cacheBust: true });
      const a = document.createElement('a');
      a.href = url;
      a.download = `poster-${poster.ratio.replace(':', 'x')}.png`;
      a.click();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 w-7 shrink-0 text-[11px]" style={{ color: 'var(--ink-muted)' }}>
          색
        </span>
        {TINTS.map((t) => (
          <button
            key={t.name}
            onClick={() => setTint(t)}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] transition-colors"
            style={
              tint.name === t.name
                ? { background: 'var(--ink)', color: 'var(--surface)' }
                : { border: '1px solid var(--hairline)', color: 'var(--ink-2)' }
            }
          >
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: t.accent }} />
            {t.name}
          </button>
        ))}
        <button
          onClick={save}
          disabled={busy || !poster.imageUrl}
          className="ml-auto rounded-lg px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-50"
          style={{ background: 'var(--up)' }}
        >
          {busy ? '저장 중…' : 'PNG 저장'}
        </button>
      </div>

      <div
        ref={face}
        style={{
          position: 'relative',
          width: W,
          height: H,
          overflow: 'hidden',
          borderRadius: 12,
          border: '1px solid var(--hairline)',
          background: tint.base,
          color: '#fff',
          fontFamily: 'system-ui, -apple-system, "Malgun Gothic", sans-serif',
        }}
      >
        {poster.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={poster.imageUrl}
            alt=""
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              fontSize: 11,
              color: 'rgba(255,255,255,0.55)',
            }}
          >
            목 모드 — 키비주얼 없음
          </div>
        )}

        {/* 글자가 어떤 그림 위에서도 읽히게. 이게 없으면 밝은 이미지에서 헤드라인이 사라진다. */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `linear-gradient(180deg, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0) 34%, rgba(0,0,0,0.28) 58%, ${tint.scrim} 100%)`,
          }}
        />

        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: 22,
          }}
        >
          {poster.kicker ? (
            <span
              style={{
                alignSelf: 'flex-start',
                fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: '0.04em',
                padding: '4px 8px',
                borderRadius: 999,
                background: tint.accent,
                color: tint.on,
              }}
            >
              {poster.kicker}
            </span>
          ) : (
            <span />
          )}

          <div>
            <p
              style={{
                fontSize: poster.headline.length > 12 ? 27 : 33,
                lineHeight: 1.22,
                fontWeight: 800,
                letterSpacing: '-0.03em',
                wordBreak: 'keep-all',
                textShadow: '0 1px 12px rgba(0,0,0,0.35)',
              }}
            >
              {poster.headline}
            </p>
            {poster.subhead && (
              <p
                style={{
                  marginTop: 9,
                  fontSize: 12.5,
                  lineHeight: 1.6,
                  color: 'rgba(255,255,255,0.86)',
                  wordBreak: 'keep-all',
                }}
              >
                {poster.subhead}
              </p>
            )}
            <div
              style={{
                marginTop: 14,
                paddingTop: 10,
                borderTop: '1px solid rgba(255,255,255,0.22)',
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 9.5,
                color: 'rgba(255,255,255,0.7)',
              }}
            >
              {/* 출처는 포스터에 남긴다. 대조해 둔 걸 시안에서 잃지 않게. */}
              <span>{poster.sourceName ? `출처 ${poster.sourceName}` : '출처 없음'}</span>
              {poster.account && <span style={{ color: tint.accent }}>{poster.account}</span>}
            </div>
          </div>
        </div>
      </div>

      {!poster.sourceUrl && (
        <p className="rounded-md px-2 py-1.5 text-[12px]" style={{ background: 'var(--flat)', color: 'var(--down)' }}>
          ⚠ 헤드라인이 후보 근거 링크를 대지 못했습니다. 그대로 올리지 마세요.
        </p>
      )}

      {서버 && (
        <p className="text-[12px]" style={{ color: 서버.오류 ? 'var(--down)' : 'var(--ink-muted)' }}>
          {서버.오류 ? (
            <>렌더 서버에 굽지 못했습니다: {서버.오류}</>
          ) : (
            <>
              렌더 서버 표지{' '}
              <a href={서버.주소} target="_blank" rel="noreferrer" className="underline">
                {서버.조각}
              </a>
              {서버.제목?.includes('*') && ' · 별표 안쪽이 강조색으로 칠해집니다'}
            </>
          )}
        </p>
      )}

      <details className="text-xs">
        <summary className="cursor-pointer" style={{ color: 'var(--ink-muted)' }}>
          키비주얼 프롬프트 보기
        </summary>
        <p className="mt-2 whitespace-pre-wrap rounded p-2 text-[12px] leading-relaxed" style={{ background: 'var(--plane)' }}>
          {poster.visualPrompt}
        </p>
      </details>
    </div>
  );
}

interface Tint {
  name: string;
  base: string;
  accent: string;
  /** 아래쪽 그늘. 진할수록 글자가 잘 읽히고 그림이 덜 보인다. */
  scrim: string;
  on: string;
}

const TINTS: Tint[] = [
  { name: '먹', base: '#141414', accent: '#f4f3ee', scrim: 'rgba(0,0,0,0.78)', on: '#141414' },
  { name: '남색', base: '#0f1b2e', accent: '#7fb2f0', scrim: 'rgba(8,17,32,0.82)', on: '#0f1b2e' },
  { name: '주홍', base: '#2a1310', accent: '#ff8a5c', scrim: 'rgba(36,14,10,0.8)', on: '#2a1310' },
];
