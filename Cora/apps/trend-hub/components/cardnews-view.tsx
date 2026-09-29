'use client';

import { useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import type { Baked, Card } from '@/lib/producers/cardnews-native';
import { THEMES, LAYOUTS, type LayoutName, type Theme } from '@/lib/cardnews/themes';

/**
 * 카드뉴스 시안.
 *
 * Dify 는 렌더를 별도 서버(112.157.39.231:8787)로 넘겼는데, 카드 한 장은 결국
 * 텍스트와 사각형이라 브라우저가 그리면 된다. 서버도 키도 필요 없고, 보면서 고칠 수 있다.
 *
 * 인스타 세로 4:5 (1080×1350) 기준. 화면에는 270×337 로 그리고 저장할 때 4배로 키운다.
 */

const W = 270;
const H = 337;

export function CardnewsView({
  cards,
  caption,
  account,
  서버,
}: {
  cards: Card[];
  caption: string;
  account?: string;
  /** 렌더 서버가 구운 카드. 브라우저 시안을 대체하지 않고 나란히 둔다. */
  서버?: Baked;
}) {
  const [theme, setTheme] = useState<Theme>(THEMES[0]);
  const [layout, setLayout] = useState<LayoutName>('기본');
  const [busy, setBusy] = useState<string | null>(null);
  const sheet = useRef<HTMLDivElement>(null);

  async function saveAll() {
    if (!sheet.current) return;
    const nodes = Array.from(sheet.current.querySelectorAll<HTMLElement>('[data-card]'));
    try {
      for (const [i, node] of nodes.entries()) {
        setBusy(`${i + 1}/${nodes.length}`);
        // 4배 = 1080×1348. 인스타 권장 크기에 맞는다.
        const url = await toPng(node, { pixelRatio: 4, cacheBust: true, backgroundColor: theme.bg });
        const a = document.createElement('a');
        a.href = url;
        a.download = `card-${String(i + 1).padStart(2, '0')}.png`;
        a.click();
        // 브라우저가 연속 저장을 막는 경우가 있어 간격을 둔다.
        await new Promise((r) => setTimeout(r, 250));
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      {/* 색 */}
      <Row label="색">
        {THEMES.map((t) => (
          <button
            key={t.name}
            onClick={() => setTheme(t)}
            title={t.name}
            aria-label={t.name}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] transition-colors"
            style={
              theme.name === t.name
                ? { background: 'var(--ink)', color: 'var(--surface)' }
                : { border: '1px solid var(--hairline)', color: 'var(--ink-2)' }
            }
          >
            <span
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ background: t.bg, boxShadow: `inset 0 0 0 1px ${t.sub}` }}
            />
            {t.name}
          </button>
        ))}
      </Row>

      {/* 짜임 */}
      <Row label="짜임">
        {LAYOUTS.map((l) => (
          <button
            key={l}
            onClick={() => setLayout(l)}
            className="rounded-lg px-2.5 py-1.5 text-[12px] transition-colors"
            style={
              layout === l
                ? { background: 'var(--ink)', color: 'var(--surface)' }
                : { border: '1px solid var(--hairline)', color: 'var(--ink-2)' }
            }
          >
            {l}
          </button>
        ))}
        <button
          onClick={saveAll}
          disabled={busy !== null}
          className="ml-auto rounded-lg px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-50"
          style={{ background: 'var(--up)' }}
        >
          {busy ? `저장 중 ${busy}` : `PNG ${cards.length}장 저장`}
        </button>
      </Row>

      <div ref={sheet} className="flex gap-3 overflow-x-auto pb-2">
        {cards.map((c) => (
          <CardFace key={c.no} card={c} total={cards.length} theme={theme} layout={layout} account={account} />
        ))}
      </div>

      {/*
        서버가 구운 카드. 시안과 나란히 둔다 —
        시안은 문구를 고치며 판단하는 자리고, 이쪽이 실제로 올릴 그림이다.
      */}
      {서버 && (
        서버.오류 ? (
          <p className="rounded-md px-2 py-1.5 text-[12px]" style={{ background: 'var(--flat)', color: 'var(--down)' }}>
            렌더 서버에 굽지 못했습니다: {서버.오류}
          </p>
        ) : 서버.slides?.length ? (
          <div className="space-y-2">
            <div className="flex items-baseline gap-2">
              <span className="text-[12px] font-medium">서버가 구운 카드</span>
              <span className="num text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                {서버.slides.length}장 · {서버.slides[0].w}×{서버.slides[0].h}
              </span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {서버.slides.map((s) => (
                <a key={s.index} href={s.url} target="_blank" rel="noreferrer" className="shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={s.url}
                    alt={`${s.index}번째 장`}
                    style={{ height: 337, borderRadius: 8, border: '1px solid var(--hairline)' }}
                  />
                </a>
              ))}
            </div>
          </div>
        ) : null
      )}

      {caption && (
        <div className="rounded-lg p-3" style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
          <div className="mb-1 text-[11px]" style={{ color: 'var(--ink-muted)' }}>캡션</div>
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{caption}</p>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 w-7 shrink-0 text-[11px]" style={{ color: 'var(--ink-muted)' }}>
        {label}
      </span>
      {children}
    </div>
  );
}

function CardFace({
  card,
  total,
  theme,
  layout,
  account,
}: {
  card: Card;
  total: number;
  theme: Theme;
  layout: LayoutName;
  account?: string;
}) {
  const cover = card.kind === '표지';
  // 짜임마다 제목 크기와 정렬이 다르다. 글자가 넘치지 않게 표지만 키운다.
  const size =
    layout === '큰글씨' ? (cover ? 34 : 27) : layout === '인용' ? (cover ? 26 : 22) : cover ? 25 : 20;

  const base: React.CSSProperties = {
    width: W,
    height: H,
    background: theme.bg,
    color: theme.fg,
    padding: 24,
    borderRadius: 12,
    border: '1px solid var(--hairline)',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'system-ui, -apple-system, "Malgun Gothic", sans-serif',
  };

  const headline = (
    <p
      style={{
        fontSize: size,
        lineHeight: 1.3,
        fontWeight: layout === '인용' ? 600 : 700,
        letterSpacing: '-0.02em',
        wordBreak: 'keep-all',
        fontStyle: layout === '인용' ? 'italic' : 'normal',
      }}
    >
      {layout === '인용' && <span style={{ color: theme.accent }}>“</span>}
      {card.headline}
      {layout === '인용' && <span style={{ color: theme.accent }}>”</span>}
    </p>
  );

  const body = card.body ? (
    <p style={{ marginTop: 10, fontSize: 12.5, lineHeight: 1.62, color: theme.sub, wordBreak: 'keep-all' }}>
      {card.body}
    </p>
  ) : null;

  const footer = (
    <div style={{ fontSize: 9.5, color: theme.sub, display: 'flex', justifyContent: 'space-between' }}>
      {/* 출처는 카드에 남긴다. 원고에서 대조한 걸 시안에서 잃지 않게. */}
      <span>{card.sourceName ? `출처 ${card.sourceName}` : card.kind === '본문' ? '출처 없음' : ''}</span>
      {account && <span style={{ color: theme.accent }}>{account}</span>}
    </div>
  );

  if (layout === '번호강조') {
    return (
      <figure className="shrink-0">
        <div data-card style={base}>
          <div style={{ fontSize: 54, fontWeight: 800, lineHeight: 1, color: theme.accent, opacity: 0.9 }}>
            {String(card.no).padStart(2, '0')}
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            {headline}
            {body}
          </div>
          {footer}
        </div>
      </figure>
    );
  }

  return (
    <figure className="shrink-0">
      <div data-card style={base}>
        <div style={{ fontSize: 10, color: theme.sub, display: 'flex', justifyContent: 'space-between' }}>
          <span>{card.kind}</span>
          <span>{card.no}/{total}</span>
        </div>
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: layout === '큰글씨' ? 'center' : 'flex-end',
            paddingBottom: layout === '큰글씨' ? 0 : 6,
            textAlign: layout === '인용' ? 'center' : 'left',
          }}
        >
          {headline}
          {body}
        </div>
        {footer}
      </div>
    </figure>
  );
}
