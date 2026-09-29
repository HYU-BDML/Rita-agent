import type { Card } from './cardnews-native';
import type { Poster } from './poster-shape';

/**
 * 우리 원고 → 렌더 서버가 아는 덱(deck).
 *
 * 생성기가 아니라 변환기다. 문구는 이미 cardnews-native · poster-native 가 썼고,
 * 여기서 하는 일은 서버가 알아듣는 모양으로 옮기는 것뿐이다.
 *
 * 모양은 지어낸 것이 아니라 Dify 「카드뉴스 만들기 (등록 디자인 연동)」 워크플로우의
 * weave 코드 노드에서 그대로 읽었다. 처음에 title·body·caption 으로 넘겨짚었다가
 * 전부 틀렸다 — 실제로는 headline·text·kicker 다.
 *
 *   POST {RENDER_BASE}/render
 *   {"template":…, "style":…, "deck":{"brand":{"wordmark":…}, "slides":[…]}, "photos":[…]}
 *
 * 그 워크플로우 주석이 남긴 경고도 함께 지킨다:
 *   "서버에 보내는 모양은 예전에 사진이 잘 나오던 판과 똑같이 둔다.
 *    photo_roles·photo_slots 같은 칸을 더 얹었더니 사진이 제대로 깔리지 않았다.
 *    서버가 모르는 칸을 무시하지 않고 다르게 받아들일 수 있다."
 * 그래서 아는 칸만 보낸다.
 */

/** 슬라이드 역할. 서버의 cover/body/outro 는 우리 표지/본문/마지막장과 1:1 이다. */
export type SlideRole = 'cover' | 'body' | 'outro';

export interface Slide {
  role: SlideRole;
  /** 크게 들어갈 말. */
  headline: string;
  /** 작은 글씨. */
  text?: string;
  /** 분류어. 서버가 강조색 알약으로 그린다. 안 쓰면 빈 문자열. */
  kicker?: string;
  /** 라벨 표(notice_table)용. 우리는 아직 안 쓴다. */
  rows?: unknown[];
  /* 마지막장에만 붙는 것들 */
  wordmark?: string;
  account_name?: string;
  account_intro?: string;
  cta?: string;
}

export interface Deck {
  template: string;
  style: string;
  deck: { brand?: { wordmark: string }; slides: Slide[] };
  /** 사진 주소 목록. 서버가 사진 들어갈 자리 차례로 가져다 쓴다. */
  photos?: string[];
}

const ROLE_OF: Record<Card['kind'], SlideRole> = {
  표지: 'cover',
  본문: 'body',
  마지막장: 'outro',
};

export interface DeckOptions {
  template: string;
  style: string;
  /** 계정·브랜드 이름. 마지막장 워드마크로 들어간다. */
  account?: string;
  /** 분류어를 어떻게 채울까. 서버 워크플로우와 같은 세 가지. */
  kicker?: '안 씀' | '계정 이름' | '순서';
}

const 순서말 = ['하나', '둘', '셋', '넷', '다섯', '여섯', '일곱', '여덟', '아홉'];

/**
 * 카드뉴스 원고 → 덱.
 *
 * 출처를 본문 글에 한 줄로 붙인다. 서버 슬라이드에 출처 칸이 따로 없어서다.
 * 안 붙이면 대조해 둔 것이 그림으로 넘어가며 사라진다 — 그건 이 앱이 하는 일의
 * 값어치를 그 자리에서 버리는 셈이다.
 */
export function deckFromCards(cards: Card[], opts: DeckOptions): Deck {
  const account = (opts.account ?? '').trim();
  const kicker = opts.kicker ?? '안 씀';
  let 본문번호 = 0;

  const slides: Slide[] = cards.map((c) => {
    const role = ROLE_OF[c.kind] ?? 'body';
    const 글 = [c.body?.trim(), c.sourceName ? `출처 ${c.sourceName}` : ''].filter(Boolean).join('\n');

    const s: Slide = { role, headline: c.headline.trim(), text: 글, kicker: '' };

    if (kicker === '계정 이름' && account && role !== 'outro') s.kicker = account;
    if (kicker === '순서' && role === 'body') {
      s.kicker = 순서말[본문번호] ?? String(본문번호 + 1);
      본문번호 += 1;
    }

    if (role === 'outro' && account) {
      // 마지막장은 계정 이름이 워드마크(원형 배지)로 가고 큰 글씨는 소개 문장이다.
      // 이름을 큰 글씨에 그대로 넣으면 원본과 구조가 뒤집힌다.
      s.wordmark = account;
      s.account_name = account;
      s.account_intro = c.body?.trim() || '';
    }
    return s;
  });

  return {
    template: opts.template,
    style: opts.style,
    deck: { ...(account ? { brand: { wordmark: account } } : {}), slides },
  };
}

/**
 * 포스터 → 덱.
 *
 * 포스터는 별개의 물건이 아니라 **장이 하나인 덱**이다. 서버의 photo_copy 틀이
 * '사진을 깔고 그 위에 글'이라 우리 포스터와 같은 구조다.
 *
 * 다만 지금 포스터는 `/image/타이틀` 로 굽고 있다. 그쪽은 사진 한 장에 글을 얹는
 * 전용 경로라 더 곧고, 이 함수는 카드뉴스와 한 벌로 묶어 낼 때 쓴다.
 */
export function deckFromPoster(
  poster: Poster,
  opts: Omit<DeckOptions, 'template'> & { template?: string },
): Deck {
  const account = (poster.account || opts.account || '').trim();
  const s: Slide = {
    role: 'cover',
    headline: poster.headline.trim(),
    text: [poster.subhead?.trim(), poster.sourceName ? `출처 ${poster.sourceName}` : '']
      .filter(Boolean)
      .join('\n'),
    kicker: poster.kicker?.trim() || '',
  };

  return {
    template: opts.template ?? 'photo_copy',
    style: opts.style,
    deck: { ...(account ? { brand: { wordmark: account } } : {}), slides: [s] },
    // 사진은 슬라이드가 아니라 photos 로 간다. 서버가 자리 차례로 가져다 쓴다.
    ...(poster.imageUrl ? { photos: [poster.imageUrl] } : {}),
  };
}

/**
 * 보내기 전 마지막 검사.
 *
 * 서버가 아는 틀·겉모습인지 여기서 본다. 굽는 데까지 가서 실패하면
 * 무엇이 틀렸는지 알아내는 데 왕복이 몇 번 더 든다(무료 티어는 깨우는 데만 20초다).
 */
export function checkDeck(
  deck: Deck,
  known: { templates: string[]; styles: string[] },
): { ok: true } | { ok: false; reason: string } {
  const slides = deck.deck.slides;
  if (!slides.length) return { ok: false, reason: 'deck.slides 가 비어 있습니다.' };
  if (known.templates.length && !known.templates.includes(deck.template)) {
    return { ok: false, reason: `서버가 모르는 배치 형식입니다: ${deck.template}` };
  }
  if (known.styles.length && !known.styles.includes(deck.style)) {
    return { ok: false, reason: `서버가 모르는 겉모습입니다: ${deck.style}` };
  }
  const 빈장 = slides.findIndex((s) => !s.headline && !s.rows);
  if (빈장 >= 0) return { ok: false, reason: `${빈장 + 1}번째 장에 제목도 표도 없습니다.` };
  return { ok: true };
}
