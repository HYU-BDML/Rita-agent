import type { Post } from './tikhub';

/**
 * 밈 축 — **따라 쓰는 말**을 센다. 이름이 아니라 문구다.
 *
 * 캐릭터 축(`names.ts`)과 세는 것이 다르다. names 는 LLM 에게 "이름처럼 보이는
 * 문자열"을 제안받고 코드가 원문 대조를 한다. 밈은 그 구조로 못 잡는다 —
 * **계정을 가로질러 같은 말이 몇 번 나왔는지**가 판정축인데 names 는 빈도를 안 센다.
 *
 * 그래서 여기서는 LLM 을 부르지 않는다. 본문을 어절로 끊어 2~5어절 묶음을 만들고,
 * 서로 다른 계정이 몇 곳이나 그 묶음을 썼는지 코드가 센다.
 *
 * ── 2026-09-17 조사에서 배운 것 ──────────────────────────────────
 * 스냅샷 663건(계정 580곳)에서 계정 3곳 이상이 쓴 문구가 237개 나왔는데
 * **따라 쓰는 말은 0개**였다. 갈래를 나눠 보니 이랬다.
 *
 *   검색어 반향 60 · 나열 의심 59 · 문법 조각 31 · 캐릭터 이름 7 · 남음 80
 *
 * 남은 80개도 전부 마케팅 상투어였다(프로필 링크 · 지금 바로 · 놓치지 마세요).
 * 로직이 틀린 게 아니라 **입력 검색어가 전부 "캐릭터"라 검색한 말이 되돌아온** 것이다.
 * 그래서 이번에는 검색어를 밈 쪽으로 바꾸고, 저 네 갈래를 필터로 세운다.
 *
 * 마케팅 상투어는 **거르지 않고 표시만 한다.** 거르면 남는 게 0이 될 때 그게
 * 필터 탓인지 자료 탓인지 알 수 없게 된다. 판단은 숫자를 보고 사람이 한다.
 */

/** 문구 하나를 후보로 세우는 데 필요한 서로 다른 계정 수. 이게 판정축이다. */
export const MIN_ACCOUNTS = 3;
/** 어절 수. 1어절은 단어라 문구가 아니고, 6어절이면 문장이라 따라 쓰지 않는다. */
export const MIN_WORDS = 2;
export const MAX_WORDS = 5;

export type DropWhy = '검색어 반향' | '나열 의심' | '문법 조각' | '이름';

export interface Phrase {
  text: string;
  /** 이 문구를 쓴 서로 다른 계정. 길이가 판정축이다. */
  accounts: string[];
  platforms: string[];
  posts: Post[];
  views: number;
  /** 마케팅 상투어로 보이나. **거르지는 않는다** — 표시만 한다. */
  boilerplate: boolean;
}

export interface PhraseReport {
  kept: Phrase[];
  dropped: { text: string; accounts: number; why: DropWhy }[];
  /** 문턱을 넘기 전에 몇 개였나. 필터가 얼마나 먹었는지 보려면 이게 필요하다. */
  total: number;
}

/* ─────────────────────── 본문 씻기 ─────────────────────── */

const URL_RE = /https?:\/\/\S+/g;
const MENTION_RE = /@[\w.]+/g;
const TAG_RE = /#[^\s#]+/g;
/** 이모지·기호. 어절을 가르는 자리지 말이 아니다. */
const SYMBOL_RE = /[\p{Extended_Pictographic}\p{S}\p{P}]/gu;

/**
 * 해시태그·멘션·URL·이모지를 뺀 본문만 남긴다.
 *
 * 해시태그를 빼는 이유: 태그는 따라 쓰는 게 아니라 **붙이는** 것이라 유행어와
 * 성격이 다르고, 검색어가 그대로 태그로 돌아오는 일이 잦다.
 */
export function bodyWords(text: string): string[] {
  return text
    .replace(URL_RE, ' ')
    .replace(MENTION_RE, ' ')
    .replace(TAG_RE, ' ')
    .replace(SYMBOL_RE, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);
}

const compact = (s: string): string =>
  s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/* ─────────────────────── 네 갈래 필터 ─────────────────────── */

/**
 * 1) 검색어 반향. **무엇으로 검색하든 그 말이 1등으로 올라온다.**
 *
 * 2026-09-19 까지 "검색어를 **품으면** 버린다"였다. 너무 뭉툭했다 —
 * 검색어가 `캐릭터` 라는 이유로 **`픽셀 캐릭터`** 가 같이 버려졌다. 그 문구는
 * 계정 5곳이 쓴 실제 유행이었고(챗GPT 로 픽셀 캐릭터 만들기), 우리는 그걸 세 번
 * 놓쳤다. 검색어 **그 자체**와 검색어를 **품은 새 조합**은 다른 것이다.
 *
 * 그래서 이제 **검색어 낱말만으로 이뤄진 문구만** 버린다. 한 어절이라도 새 말이
 * 붙으면 그건 우리가 넣은 말이 아니라 사람들이 붙인 말이다.
 *
 *   캐릭터 굿즈   → 버린다 (둘 다 검색어 낱말)
 *   픽셀 캐릭터   → 남긴다 ('픽셀' 이 새 말이다)
 */
function echoesQuery(phrase: string, queries: string[]): boolean {
  // 띄어쓰기만 다른 것도 같은 말이다. `요즘유행` 으로 검색했는데 `요즘 유행` 이
  // 1등으로 올라오는 식이라, 낱말 단위로만 보면 이게 통과한다.
  const flat = compact(phrase);
  if (queries.some((q) => compact(q) === flat)) return true;

  const words = new Set<string>();
  for (const q of queries) for (const w of q.split(/\s+/)) {
    const k = compact(w);
    if (k.length >= 2) words.add(k);
  }
  if (!words.size) return false;
  const parts = phrase.split(/\s+/).map(compact).filter((w) => w.length >= 1);
  if (!parts.length) return false;
  // 전부 검색어 낱말이면 되돌아온 말이다. 하나라도 새 말이 있으면 남긴다.
  return parts.every((w) => words.has(w));
}

/**
 * 2) 나열 의심. 굿즈 가게가 파는 것을 늘어놓은 자리다 —
 * `산리오•지브리•모루카•짱구` 처럼 말과 말이 구분자로 이어져 있으면 문장이 아니라 목록이다.
 *
 * **원문을 그대로 찾으면 안 된다.** 본문을 씻으면서 `•` 가 공백이 되어 문구는
 * `모루카 쿠키런` 인데 원문은 `모루카•쿠키런` 이라 찾지 못한다(2026-09-18 에 이걸로
 * 한 번 틀렸다). 그래서 어절 사이를 구분자까지 허용하는 자리로 보고, 실제로 그
 * 자리에 구분자가 있었는지를 본다.
 */
const SEPARATOR = '[\\s·•,/、|+]+';
const SEP_RE = /[·•,\/、|+]/;
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function joinedBySeparator(phrase: string, text: string): boolean {
  const words = phrase.split(' ').map(escapeRe);
  if (words.length < 2) return false;
  let re: RegExp;
  try {
    re = new RegExp(words.join(`(${SEPARATOR})`), 'u');
  } catch {
    return false;
  }
  const m = re.exec(text);
  return Boolean(m && m.slice(1).some((gap) => SEP_RE.test(gap ?? '')));
}

function looksListed(phrase: string, posts: Post[]): boolean {
  const listed = posts.filter((p) => joinedBySeparator(phrase, p.text || '')).length;
  // 대부분의 자리가 목록이면 나열이다. 한 번쯤 목록에 섞인 건 봐준다.
  return posts.length > 0 && listed / posts.length > 0.5;
}

/**
 * 3) 문법 조각. `수 있습니다`·`만나볼 수`·`to the` 처럼 뜻을 나르지 않는 묶음이다.
 *
 * **"전부 기능어일 때"로는 안 걸린다.** 한국어는 의존명사(수·것·때)와 보조용언이
 * 실질어에 붙어 한 어절을 이루기 때문에, `만나볼 수` 는 두 어절 중 하나가 실질어라
 * 통과해 버린다. 실제로 2026-09-18 검증에서 31개로 잡아야 할 갈래를 2개만 걸렀다.
 *
 * 그래서 **하나라도 들어 있으면 조각으로 본다.** 따라 쓰는 말이 의존명사나 영어
 * 관사·전치사를 품는 일은 드물고, 품었다면 그건 문장의 일부를 잘라 온 것이다.
 */
const FRAGMENT_TOKENS = new Set(
  [
    // 의존명사·수량사 — 혼자 못 서는 말
    '수', '것', '거', '중', '때', '등', '및', '점', '분', '개', '명',
    // 보조용언·서술어 꼬리
    '있습니다', '있어요', '있는', '있을', '있고', '있다', '없습니다', '없어요', '없는',
    '합니다', '해요', '하는', '하실', '하시는', '할', '함', '됩니다', '되는', '된',
    '입니다', '이에요', '예요', '드립니다', '주세요', '보세요', '가능', '가능합니다',
    '만나볼', '확인하실', '같아요', '같은', '같습니다',
    // 접속·지시
    '그리고', '그런데', '근데', '하지만', '그래서', '그러면', '그냥', '이런', '저런', '그런',
    '이거', '저거', '그거', '이건', '저건', '그건', '이게', '저게', '그게',
    // 영어 기능어
    'the', 'a', 'an', 'to', 'of', 'in', 'on', 'at', 'for', 'and', 'or', 'but',
    'is', 'are', 'was', 'were', 'be', 'been', 'this', 'that', 'these', 'those',
    'with', 'from', 'by', 'as', 'it', 'its', 'my', 'your', 'our', 'their', 'i', 'you',
  ].map(compact),
);
function isGrammar(words: string[]): boolean {
  return words.some((w) => FRAGMENT_TOKENS.has(compact(w)));
}

/**
 * 4) 이름. 캐릭터·브랜드 이름이 든 문구는 그 캐릭터 이야기지 밈이 아니다.
 * 캐릭터 축이 이미 세는 것을 여기서 또 세면 같은 것이 두 표에 오른다.
 */
function hasName(phrase: string, names: string[]): boolean {
  const k = compact(phrase);
  return names.some((n) => {
    const nk = compact(n);
    return nk.length >= 2 && k.includes(nk);
  });
}

/**
 * 마케팅 상투어. **거르지 않고 표시만 한다** (위 주석 참고).
 * 어제 남은 80개가 전부 이것이었다 — 계정이 많이 쓰지만 유행해서가 아니라
 * 장사하는 계정이 다 같은 말을 쓰기 때문이다.
 */
const BOILERPLATE = [
  '프로필 링크', '프로필링크', '링크 참고', '링크 확인', '지금 바로', '놓치지 마세요',
  '저장 공유', '좋아요 부탁', '팔로우 하고', '댓글 남겨', '자세한 내용', '문의 주세요',
  '한정 수량', '수량 소진', '재입고', '무료 배송', '이벤트 참여', '선착순',
  'link in bio', 'dm for', 'shop now', 'follow for',
].map(compact);
function isBoilerplate(phrase: string): boolean {
  const k = compact(phrase);
  return BOILERPLATE.some((b) => k.includes(b));
}

/* ─────────────────────── 세기 ─────────────────────── */

/**
 * 계정을 가로질러 같은 문구가 몇 번 나왔나.
 *
 * **한 계정이 같은 말을 백 번 써도 1이다.** 장사 계정이 같은 문구를 매일 올리는
 * 것과 여러 사람이 따라 쓰는 것을 가르는 자리가 여기다.
 */
export function countPhrases(
  posts: Post[],
  opts: { queries?: string[]; names?: string[] } = {},
): PhraseReport {
  const queries = opts.queries ?? [];
  const names = opts.names ?? [];

  const byPhrase = new Map<string, { accounts: Set<string>; posts: Post[] }>();
  for (const p of posts) {
    const words = bodyWords(p.text || '');
    const account = p.authorId || p.authorName;
    if (!account) continue;
    // 한 게시물 안에서 같은 문구가 여러 번 나와도 한 번만 센다.
    const seen = new Set<string>();
    for (let n = MIN_WORDS; n <= MAX_WORDS; n++) {
      for (let i = 0; i + n <= words.length; i++) {
        const phrase = words.slice(i, i + n).join(' ');
        if (compact(phrase).length < 4) continue; // 두 글자짜리 묶음은 말이 아니다
        if (seen.has(phrase)) continue;
        seen.add(phrase);
        const at = byPhrase.get(phrase) ?? { accounts: new Set<string>(), posts: [] };
        at.accounts.add(account);
        at.posts.push(p);
        byPhrase.set(phrase, at);
      }
    }
  }

  const over = [...byPhrase].filter(([, v]) => v.accounts.size >= MIN_ACCOUNTS);

  const kept: Phrase[] = [];
  const dropped: PhraseReport['dropped'] = [];
  for (const [text, v] of over) {
    const words = text.split(' ');
    const why: DropWhy | null = echoesQuery(text, queries)
      ? '검색어 반향'
      : hasName(text, names)
        ? '이름'
        : isGrammar(words)
          ? '문법 조각'
          : looksListed(text, v.posts)
            ? '나열 의심'
            : null;
    if (why) {
      dropped.push({ text, accounts: v.accounts.size, why });
      continue;
    }
    kept.push({
      text,
      accounts: [...v.accounts],
      platforms: [...new Set(v.posts.map((p) => p.platform))],
      posts: v.posts,
      views: v.posts.reduce((s, p) => s + (p.views || 0), 0),
      boilerplate: isBoilerplate(text),
    });
  }

  /*
   * 긴 문구가 짧은 문구를 품고 있으면 짧은 쪽을 버린다. `요즘 이거 유행` 과
   * `이거 유행` 이 같은 자리에서 나왔는데 둘 다 세면 한 유행이 둘로 보인다.
   * 계정 수가 같을 때만 접는다 — 짧은 쪽이 더 넓게 퍼졌으면 그건 다른 사실이다.
   */
  const folded = kept.filter(
    (a) =>
      !kept.some(
        (b) => b !== a && b.text.includes(a.text) && b.accounts.length === a.accounts.length,
      ),
  );

  folded.sort(
    (a, b) => b.accounts.length - a.accounts.length || b.platforms.length - a.platforms.length || b.views - a.views,
  );
  return { kept: folded, dropped, total: byPhrase.size };
}
