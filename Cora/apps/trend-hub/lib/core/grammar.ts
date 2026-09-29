import type { Candidate } from './candidate';
import type { PostRecord } from './post-record';
import { type EvidenceCard, evidenceCard } from './evidence-card';
import { freshness } from './series';

/**
 * 방식(문법) — 이 제품이 내놓는 것.
 *
 * **왜 소재가 아니라 방식인가.** 캐릭터 후보 75건 중 대부분이 기업 IP다. 소재를 보여주면
 * "이건 못 씁니다"로 끝난다. 형식·아이디어는 저작권 보호 대상이 아니므로 방식은 그대로
 * 쓸 수 있다. 막다른 길이 출구가 된다.
 *
 * **정적 정의다.** 방식은 느리게 변한다 — 「언박싱」이 다음 주에 사라지지 않는다. 그래서
 * 목록은 손으로 적고, 근거만 런타임에 후보를 대조해 붙인다. 조회할 때마다 LLM 을 부르지
 * 않는다 (배포본에 로그인이 없어 비용 천장이 없다).
 *
 * 12개의 근거·신선도·분류 규칙의 출처는 `docs/grammars.md` 다.
 */

/**
 * 무엇으로 만드나. 「뭘로 만들 거예요?」 의 답 셋과 1:1 이다 (`docs/PROMPT.md` §4).
 *
 * 전에는 `video | copy | info | compare` 넷이었다. `info`(채울 항목)와 `compare`(비교축)는
 * **만드는 결과물이 같다** — 둘 다 사진이나 카드뉴스로 나간다. 사용자가 고르는 것은
 * 결과물의 꼴이므로 묻는 쪽에 맞춰 셋으로 줄인다. 넷으로 물으면 "정보형과 비교형이
 * 무슨 차이냐"를 사용자가 판단해야 한다.
 */
export type GrammarKind = 'video' | 'photo' | 'copy';

/**
 * 이 방식을 하려면 **소개할 물건이나 가게**가 있어야 하나.
 *
 * 전에는 `{ physical, video, offline }` 셋이었다. 둘을 접었다.
 *   `video` 는 버린다 — `kind === 'video'` 가 이미 같은 말이라 두 곳에 같은 사실이 있었다.
 *   `physical`(실물)과 `offline`(매장)은 사용자에게 **한 질문**이다. 굿즈깡에 물건이
 *   필요한 것과 입고 정보에 가게가 필요한 것은 "남의 것을 소개할 대상이 손에 있나"라는
 *   같은 조건이고, 둘로 물으면 답이 같은 질문을 두 번 하게 된다.
 */
export interface GrammarNeed {
  item: boolean;
}

export interface Grammar {
  id: string;
  /**
   * 화면에서 제일 큰 글자. **이름이 이 제품의 상품이다.**
   *
   * `docs/grammars.md` 의 긴 이름(「랜덤 개봉 (굿즈깡)」)이 아니라 목업의 짧은 이름
   * (「굿즈깡」)을 쓴다. 카드에서 30px 로 두 줄이 되면 이름이 아니라 설명처럼 읽힌다.
   * 문구는 확정이 아니다 (`docs/HANDOVER.md` §6-1).
   */
  name: string;
  kind: GrammarKind;
  need: GrammarNeed;
  /** 카드 본문 한 줄. `docs/WORDS.md` §5 의 문장 그대로다 — 다듬지 않는다. */
  desc: string;
  /**
   * 후보를 이 방식에 붙이는 규칙. 캐릭터 축은 `hint.angle`, 밈 축은 `subject` 를 본다.
   *
   * **먼저 맞은 방식이 가져간다** (`classify`). 한 후보가 두 방식에 걸리면 근거가
   * 부풀어 같은 게시물이 두 번 세어진다.
   */
  match: RegExp;
  /** 밈 축은 `raw.kind` 가 이미 갈라져 있어 정규식 없이 붙는다. */
  memeKind?: string;
}

/**
 * 확정 12개. **순서가 곧 화면 순서다** — 신선도 내림차순 (`docs/grammars.md` 요약 표).
 *
 * `이름 놀이·표기 흔들림` 은 여기 없다. 마이멜로디·쿠로미·시나모롤이 **같은 틱톡 영상
 * 한 편**에서 나와 고유 출처가 1건이었다. 근거 2건은 서로 다른 게시물 2건을 뜻한다.
 */
export const GRAMMARS: Grammar[] = [
  {
    id: 'challenge',
    name: '동작 따라하기',
    kind: 'video',
    need: { item: false },
    desc: '같은 동작과 음원을 그대로 따라 한다',
    match: /챌린지|challenge|플레이댄스|변신|따라하기/i,
    memeKind: 'challenge',
  },
  {
    id: 'catchphrase',
    name: '말투·유행어',
    kind: 'copy',
    need: { item: false },
    desc: '특정 말투나 한 마디를 반복해서 쓴다',
    match: /말투|유행어|한 단어로/,
    memeKind: 'catchphrase',
  },
  {
    id: 'reaction',
    name: '반응 편집',
    kind: 'video',
    need: { item: false },
    desc: '정해진 장면에 내 반응을 얹어 편집한다',
    match: /밈$|밈\s|meme/i,
  },
  {
    id: 'spend',
    name: '지출 고백',
    kind: 'copy',
    need: { item: true },
    desc: '“갖고 싶은데 비싸다”를 콘텐츠 맨 앞에 세운다',
    match: /비싸|가격 장벽|비용|가성비|costs?\b|cost me/i,
  },
  {
    id: 'pick',
    name: '질문·선택',
    kind: 'photo',
    need: { item: false },
    desc: '둘 중 하나를 고르게 해서 답을 받는다',
    match: /밸런스|우정박|행진곡|AI가 보는|질문·선택|둘 중/i,
  },
  {
    id: 'randombox',
    name: '굿즈깡',
    kind: 'video',
    need: { item: true },
    desc: '결과를 모르는 채로 뽑고, 결과에 반응한다',
    match: /랜덤|굿즈깡|블라인드|뽑기|캔뱃지 대량|처분 판매/,
  },
  {
    id: 'unboxing',
    name: '손 클로즈업',
    kind: 'video',
    need: { item: true },
    desc: '물건을 손으로 들고 개봉해 보여준다',
    match: /언박싱|손 클로즈업|手元|굿즈체크|痛バ|이타바|수령|개봉·소개|발견 리뷰|인형 리뷰|목업/,
  },
  {
    id: 'event',
    name: '참여 이벤트',
    kind: 'photo',
    need: { item: true },
    desc: '해시태그와 추첨으로 참여를 만든다',
    match: /이벤트|추첨|참여 유도|해시태그 참여|쇼케이스|업데이트 (공지|신상)|스킨 컬렉션/,
  },
  {
    id: 'compare',
    name: '비교·투표',
    kind: 'photo',
    need: { item: false },
    desc: '여러 개를 나란히 놓고 고르게 한다',
    match: /비교|투표|나열|묶이는|묶음|유행 묶음|정리 콘텐츠|구성 소개|시리즈 (서브 )?캐릭터/,
  },
  {
    id: 'restock',
    name: '입고 정보',
    kind: 'photo',
    need: { item: true },
    desc: '어디서, 언제, 얼마에 살 수 있는지 알린다',
    match: /입고|유통|구매처|판매 (오픈|공지)|예약 정보|출시|진열|안내형|통판/,
  },
  {
    id: 'derivative',
    name: '2차 창작',
    kind: 'video',
    need: { item: false },
    desc: '남의 캐릭터를 그리거나 커버하는 과정을 보여준다',
    match: /2차 (드로잉|창작)|드로잉|커버 포맷|음악 커버|커미션|제작 과정/,
  },
  {
    id: 'oc',
    name: '자캐 공개',
    kind: 'video',
    need: { item: false },
    desc: '내가 만든 캐릭터를 캐릭터 입장에서 올린다',
    match: /자캐|OC\b|계정명=캐릭터명|개인 창작|커스텀 돌|캐릭터 입장에서/i,
  },
];

const BY_ID = new Map(GRAMMARS.map((g) => [g.id, g]));
export const grammarById = (id: string): Grammar | undefined => BY_ID.get(id);

/* ── 판정 메모 걸러내기 ────────────────────────────────────────────── */

/**
 * 사용자 화면에 나가면 안 되는 문장.
 *
 * `hint.angle` 은 **판정기가 자기에게 적은 메모**와 콘텐츠 각도가 한 칸에 섞여 있다.
 * 배포본에서 로빈·우땅이 카드 두 장이 "최근 확산 원인을 단정할 독립 출처가 부족함" 이라는
 * 같은 문장을 달고 나갔다. 그건 내부용이다 — 뺄 문장이 아니라 **뺄 카드**다.
 */
const MEMO =
  /공식 (레퍼런스|상품 이미지|상품)|레퍼런스 (확보|확인|잠금|필요)|제작 (보류|검토|금지)|생성 (보류|금지)|프롬프트 (생략|없음|작성 보류)|외형 (근거|확인|묘사|요소)|권리(자|\s*귀속)|귀속 (확인|판정)|독립 출처|미확인|확인 (불가|전|필요)|자료에 (없|확인)|기업 IP|승인·레퍼런스|시각(물|화) (생성|진행)|판정 불가|제작 정보 부족/;

/**
 * 문장 **끝에 붙은** 메모 꼬리. 문장째 버리지 않고 꼬리만 뗀다.
 *
 * "다이소 애니 콜라보 블라인드 굿즈 발견·개봉 포맷만 참고" 는 앞이 콘텐츠 각도고 뒤가
 * 메모다. 문장째 버리면 근거 넷이 사라진다 — 실제로 굿즈깡이 13건에서 9건으로 줄었다.
 * 꼬리만 떼면 "…발견·개봉 포맷" 이 남아 화면에 낼 수 있다.
 */
const MEMO_TAIL =
  /[,·]?\s*(으?로)?만?\s*(자료에?\s*)?(참고|자료로 확인됨|확인됨|근거가 있음|다룰 수 있음|전개 가능)[.…]?$/;

/** 문장 끝의 남은 조각. 꼬리를 뗀 뒤 "…관점으로" 처럼 붙어 있는 것을 정리한다. */
const DANGLING = /[,·]?\s*(으?로|와|과|에|만)?\s*$/;

/**
 * 문장 단위로 자른다. `·` 로 이은 나열은 한 문장이다.
 *
 * **종결 `다` 뒤에 공백을 요구한다.** 안 그러면 「다이소」가 「다」+「이소」로 갈린다 —
 * 실제로 화면 문장이 "다 이소 보카로 굿즈…" 로 나가고 있었다.
 */
function sentences(s: string): string[] {
  return s
    .split(/(?<=[.。])\s+|(?<=다)\s+(?=[A-Z가-힣“"])/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** 큰따옴표 안의 원문 인용. 있으면 그게 제일 좋은 근거 문장이다. */
function quoteOf(angle: string): string | null {
  const m = angle.match(/["“]([^"”]{6,})["”]/);
  return m ? m[1].trim() : null;
}

/**
 * 후보 하나를 화면 문장 하나로.
 *
 * 인용문이 있으면 그것을 쓰고, 없으면 메모 문장을 떼고 남은 것을 쓴다.
 * **남는 게 없으면 `null` 이다** — 그 후보는 근거에서 빠진다.
 */
export function evidenceLine(c: Candidate): { line: string; quote: boolean } | null {
  const raw = c.raw as { accounts?: number; kind?: string } | undefined;
  if (typeof raw?.accounts === 'number' && raw.accounts > 0) {
    return { line: `계정 ${raw.accounts}곳이 따라 했습니다`, quote: false };
  }
  const angle = c.hint?.angle?.trim();
  if (!angle) return null;
  const q = quoteOf(angle);
  if (q) return { line: q, quote: true };
  const kept = sentences(angle)
    .map((s) => s.replace(MEMO_TAIL, '').replace(DANGLING, '').trim())
    .filter((s) => s.length >= 6 && !MEMO.test(s));
  const line = kept.join(' ').trim();
  return line.length >= 6 ? { line, quote: false } : null;
}

/* ── 근거 붙이기 ───────────────────────────────────────────────────── */

export interface GrammarEvidence extends EvidenceCard {
  line: string;
  /** 원문 인용이면 화면에서 따옴표 블록으로 그린다. */
  quote: boolean;
  freshness: number | null;
}

export interface GrammarWithEvidence extends Grammar {
  /** 고유 출처. 같은 URL 은 1건이다. */
  evidence: GrammarEvidence[];
  /**
   * 대표 신선도 — 근거들의 신선도를 내림차순으로 놓고 가운데 것.
   *
   * 평균이 아니다. 「동작 따라하기」는 100% 가 여덟 건인데 표본 10건을 못 채운 후보가
   * 여섯 건 섞여 있어, 그것들을 0 으로 치면 평균이 절반으로 꺾인다. 모르는 것은 아예
   * 빼고 센다 (`freshness()` 가 `null` 을 내는 이유와 같다).
   */
  freshness: number | null;
}

/** 한 후보의 대표 링크. `evidence[0]` 이 없으면 근거로 쓸 수 없다. */
function urlOf(c: Candidate): string | null {
  const e = c.evidence?.find((x) => x.url);
  return e?.url ?? null;
}

/** 내림차순으로 놓고 가운데. n 이 짝수면 위쪽을 쓴다. */
function upperMedian(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => b - a);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

/**
 * 방식이 아닌 것.
 *
 * `이름 놀이·표기 흔들림` 은 방식 목록에서 탈락했다 — 마이멜로디·쿠로미·시나모롤이
 * **같은 틱톡 영상 한 편**에서 나와 고유 출처가 1건이었다. 그런데 이것을 그냥 두면
 * 다른 방식이 주워 간다: 쿠로미의 "이름 잘못 부르기 밈" 이 「반응 편집」에 붙어 근거가
 * 4건에서 5건으로 부풀었다.
 *
 * 버리는 게 아니라 **자리가 다르다.** 같은 IP 를 다른 이름으로 찾는 사람이 있다는
 * 뜻이므로 소재 상세의 "이렇게도 불립니다" 자리로 간다 (`docs/grammars.md`).
 */
const NOT_A_GRAMMAR = /이름 (잘못|오답)|표기 (차이|흔들림)/;

/**
 * 대조 순서. **화면 순서(`GRAMMARS`)와 다르다.**
 *
 * 「손 클로즈업」의 `언박싱` 은 굿즈를 다루는 거의 모든 각도에 얹혀 있다. 화면 순서대로
 * 대조하면 그게 먼저 가져가서, 「진열」이나 「투표」처럼 **더 좁은 신호**를 가진 후보를
 * 빼앗는다. 실제로 그랬다 — 하츠네 미쿠("굿즈 진열 언박싱/픽업")와 페포("굿즈 언박싱,
 * '가장 갖고 싶은 굿즈' 투표")가 둘 다 손 클로즈업으로 붙었다.
 *
 * 그래서 넓은 것을 마지막에 본다. 남은 것을 받는 자리다.
 */
const CLASSIFY_ORDER = [
  ...GRAMMARS.filter((g) => g.id !== 'unboxing'),
  ...GRAMMARS.filter((g) => g.id === 'unboxing'),
];

/** 이 후보가 어느 방식인가. 먼저 맞은 것이 가져간다 — 두 번 세지 않게. */
export function classify(c: Candidate): Grammar | null {
  const memeKind = (c.raw as { kind?: string } | undefined)?.kind;
  const subject = c.subject ?? '';
  const angle = c.hint?.angle ?? '';
  if (NOT_A_GRAMMAR.test(angle)) return null;
  for (const g of CLASSIFY_ORDER) {
    if (g.match.test(subject)) return g;
  }
  for (const g of CLASSIFY_ORDER) {
    if (angle && g.match.test(angle)) return g;
  }
  // 정규식이 못 잡은 밈 후보는 raw.kind 로 떨어뜨린다. subject 가 방식을 안 말하는 것들이다.
  if (memeKind) {
    const g = GRAMMARS.find((x) => x.memeKind === memeKind);
    if (g) return g;
    // kind 가 'format'·'ambiguous' 인 것은 질문·선택으로 남는다 (docs/grammars.md 분류).
    return BY_ID.get('pick') ?? null;
  }
  return null;
}

/**
 * 12개에 근거를 붙여 낸다.
 *
 * **고유 출처 2건 미만인 방식은 빼지 않고 `evidence.length` 로 알린다.** 부르는 쪽이
 * 화면에서 뺄지 정한다 — 목록 12개의 이름 칩은 근거가 얇아도 보여야 범위가 읽힌다.
 * 카드로 올릴 때만 2건 문턱을 건다.
 *
 * `asOf` 는 신선도의 기준일이다. 수집이 멈춘 뒤 오늘을 넣으면 값이 계속 내려간다.
 */
export function grammarsWithEvidence(
  candidates: Candidate[],
  posts: PostRecord[],
  asOf: string,
): GrammarWithEvidence[] {
  const postsBy = new Map<string, PostRecord[]>();
  for (const p of posts) {
    const a = postsBy.get(p.candidateId);
    if (a) a.push(p);
    else postsBy.set(p.candidateId, [p]);
  }

  const buckets = new Map<string, GrammarEvidence[]>(GRAMMARS.map((g) => [g.id, []]));
  const seen = new Map<string, Set<string>>(GRAMMARS.map((g) => [g.id, new Set()]));

  for (const c of candidates) {
    // `retired` 만 뺀다. `archived` 는 사람이 일부러 보관해 둔 것이라 근거로 더 세다.
    if (c.lifecycle === 'retired') continue;
    const g = classify(c);
    if (!g) continue;
    const url = urlOf(c);
    if (!url) continue;
    const urls = seen.get(g.id)!;
    if (urls.has(url)) continue; // 같은 게시물에서 캐릭터 여럿을 뽑으면 근거는 하나다
    const said = evidenceLine(c);
    if (!said) continue; // 판정 메모뿐인 후보는 근거가 아니다
    const mine = postsBy.get(c.id) ?? [];
    /*
     * **저장된 게시물이 0건이면 근거가 아니다.**
     *
     * 원문 링크만 있고 게시물 레코드가 없으면 카드에 채울 것이 없다 — 조회도 썸네일도
     * 캡션도 못 낸다. 그러면 「지금 이걸 하고 있는 것」 목록에 `계정 0곳` 이 앉아서 뜻이
     * 거꾸로 읽힌다.
     *
     * 세지도 않는다. 하단의 「근거 N건」이 화면의 카드 수와 달라지면 어느 쪽이 맞는지
     * 알 수 없다. 해당 후보는 90건인데(radar 12 · news 77 · character 1) 그 축들은
     * 애초에 근거로 안 쓰여서 실제로 빠지는 카드는 한 장이다.
     */
    if (mine.length === 0) continue;
    urls.add(url);
    buckets.get(g.id)!.push({
      /* 썸네일·조회·계정·캡션은 전부 db 에서 온다 (`docs/WORDS.md` §19). */
      ...evidenceCard(c, mine, url),
      line: said.line,
      quote: said.quote,
      freshness: freshness(mine, asOf),
    });
  }

  return GRAMMARS.map((g) => {
    const evidence = buckets.get(g.id)!;
    evidence.sort((a, b) => (b.freshness ?? -1) - (a.freshness ?? -1));
    return {
      ...g,
      evidence,
      freshness: upperMedian(
        evidence.map((e) => e.freshness).filter((v): v is number => v !== null),
      ),
    };
  });
}

/**
 * 화면으로 넘기는 형태.
 *
 * `match` 를 뺀다. 정규식은 **서버 컴포넌트에서 클라이언트 컴포넌트로 못 넘어간다**
 * ("Only plain objects … can be passed to Client Components"). 분류는 서버에서 이미
 * 끝났으므로 화면이 정규식을 볼 일도 없다.
 */
export type GrammarView = Omit<GrammarWithEvidence, 'match' | 'memeKind'>;

export function toView(g: GrammarWithEvidence): GrammarView {
  const { match: _m, memeKind: _k, ...rest } = g;
  return rest;
}

/* ── 토글 ──────────────────────────────────────────────────────────── */

/** 칩에 붙는 낱말. "물건 필요" 가 된다 (`docs/PROMPT.md` §9-5). */
export const NEED_LABEL: Record<keyof GrammarNeed, string> = {
  item: '물건',
};

/** 이 방식을 할 수 있나. 순수 계산이다 — 조회당 LLM 을 부르지 않는다. */
export function canDo(g: { need: GrammarNeed }, have: GrammarNeed): boolean {
  return !g.need.item || have.item;
}

/**
 * 못 하는 이유. 없으면 `null`.
 *
 * **걸린 방식을 목록에서 없애지 않는다.** 칩에 이유를 달아 남긴다 — 없애면 "나중에
 * 열릴 것"이 안 보여 다시 올 이유가 사라진다 (`docs/PROMPT.md` §4).
 */
export function missingLabel(g: { need: GrammarNeed }, have: GrammarNeed): string | null {
  return g.need.item && !have.item ? `${NEED_LABEL.item} 필요` : null;
}

/** 물건이 생기면 열리는 방식들. 안내 박스가 이름을 데이터에서 뽑는다 — 하드코딩 금지. */
export function opensWithItem<T extends { need: GrammarNeed; kind: GrammarKind; name: string }>(
  grammars: T[],
  kind?: GrammarKind,
): T[] {
  return grammars.filter((g) => g.need.item && (!kind || g.kind === kind));
}
