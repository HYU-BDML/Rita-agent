import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Candidate } from '../lib/core/candidate';
import type { PostRecord } from '../lib/core/post-record';
import {
  GRAMMARS,
  type GrammarKind,
  canDo,
  classify,
  evidenceLine,
  grammarsWithEvidence,
  missingLabel,
  opensWithItem,
} from '../lib/core/grammar';
import { KIND_ASK, NO_FORM_TITLE, boardTitle } from '../components/grammar-style';

/*
 * 방식(문법)과 근거 결박 (세션 2).
 *
 * 여기서 지키는 것 둘.
 *   1. **판정기 메모가 화면으로 새지 않는다.** 배포본에서 카드 두 장이 "독립 출처가
 *      부족함" 이라는 같은 문장을 달고 나갔다. 그건 내부용이다.
 *   2. **근거 2건은 서로 다른 게시물 2건이다.** 한 게시물에서 캐릭터 여러 개를 뽑으면
 *      후보는 늘지만 근거는 하나다. `이름 놀이` 가 이렇게 잘못 만들어져 탈락했다.
 */

function cand(p: {
  id: string;
  subject: string;
  angle?: string;
  url?: string;
  raw?: Record<string, unknown>;
  lifecycle?: 'active' | 'archived' | 'retired';
}): Candidate {
  return {
    id: p.id,
    unit: 'topic',
    subject: p.subject,
    evidence: p.url ? [{ url: p.url, source: 's', title: p.subject }] : [],
    hint: p.angle ? { angle: p.angle } : {},
    lifecycle: p.lifecycle ?? 'active',
    ...(p.raw ? { raw: p.raw } : {}),
  } as unknown as Candidate;
}

function post(candidateId: string, postedAt: string): PostRecord {
  return {
    id: `p-${candidateId}-${postedAt}-${Math.random()}`,
    platform: 'tiktok',
    url: 'https://t/1',
    postedAt,
    account: 'a',
    views: null,
    candidateId,
    discoveryId: 'character-native',
    runId: 'r',
    runAt: '2026-09-24T00:00:00.000Z',
  };
}

const ASOF = '2026-09-24T00:00:00Z';

/* ── 목록 ──────────────────────────────────────────────────────────── */

test('방식: 12개이고 id 가 겹치지 않는다', () => {
  assert.equal(GRAMMARS.length, 12);
  assert.equal(new Set(GRAMMARS.map((g) => g.id)).size, 12);
  assert.equal(new Set(GRAMMARS.map((g) => g.name)).size, 12);
});

test('방식: 이름 놀이·표기 흔들림은 목록에 없다', () => {
  // 마이멜로디·쿠로미·시나모롤이 같은 틱톡 영상 한 편에서 나와 고유 출처가 1건이었다.
  assert.equal(
    GRAMMARS.some((g) => /이름 놀이|표기 흔들림/.test(g.name)),
    false,
  );
});

test('방식: 표기 흔들림 후보는 다른 방식이 주워 가지 않는다', () => {
  // 쿠로미의 "이름 잘못 부르기 밈" 이 「반응 편집」에 붙어 근거가 4건에서 5건으로 부풀었다.
  const c = cand({
    id: 'k',
    subject: '쿠로미',
    angle: '콜라보 굿즈 신상 리뷰 + 이름 잘못 부르기 밈',
    url: 'https://t/k',
  });
  assert.equal(classify(c), null);
});

/* ── 판정 메모 ─────────────────────────────────────────────────────── */

test('근거 문장: 메모뿐인 후보는 근거가 아니다', () => {
  const c = cand({
    id: 'cc',
    subject: 'C.C.',
    angle: '동일 명칭이 개인 자캐 선언과 기업 IP 양쪽에서 나타나 귀속 확인 전까지 제작 보류',
  });
  assert.equal(evidenceLine(c), null);
});

test('근거 문장: 메모 문장만 떼고 각도는 남긴다', () => {
  const c = cand({
    id: 'j',
    subject: '짱구',
    angle:
      '공식 굿즈 라인업과 캐릭터 잡화 언박싱·소개 각도. 외형 근거 없어 프롬프트 생략',
  });
  const said = evidenceLine(c)!;
  assert.equal(said.line, '공식 굿즈 라인업과 캐릭터 잡화 언박싱·소개 각도.');
  assert.match(said.line, /언박싱/);
  assert.doesNotMatch(said.line, /프롬프트|외형 근거/);
});

test('근거 문장: 문장 끝 메모 꼬리는 문장째 버리지 않고 꼬리만 뗀다', () => {
  // 문장째 버리면 굿즈깡 근거가 13건에서 9건으로 줄었다.
  const c = cand({
    id: 'l',
    subject: 'Lelouch',
    angle: '다이소 애니 콜라보 블라인드 굿즈 발견·개봉 포맷만 참고',
  });
  const said = evidenceLine(c)!;
  assert.equal(said.line, '다이소 애니 콜라보 블라인드 굿즈 발견·개봉 포맷');
  assert.doesNotMatch(said.line, /참고/);
});

test('근거 문장: 원문 인용이 있으면 그것을 쓰고 인용으로 표시한다', () => {
  const c = cand({
    id: 'h',
    subject: 'Homura Akemi',
    angle:
      '본문 "genuinely i want one BUT it costs 93k IN MY COUNTRY" — 가격 장벽을 토로하는 팬 리액션. 공식 레퍼런스 잠금 후 제작',
  });
  const said = evidenceLine(c)!;
  assert.equal(said.line, 'genuinely i want one BUT it costs 93k IN MY COUNTRY');
  assert.equal(said.quote, true);
});

test('근거 문장: 밈 후보는 계정 수를 사람 말로 낸다', () => {
  const c = cand({ id: 'm', subject: '야차룰', raw: { accounts: 14, kind: 'challenge' } });
  assert.deepEqual(evidenceLine(c), { line: '계정 14곳이 따라 했습니다', quote: false });
});

/* ── 근거 결박 ─────────────────────────────────────────────────────── */

test('근거: 같은 게시물에서 나온 후보 여럿은 1건으로 센다', () => {
  // 후보 2건이 아니라 서로 다른 게시물 2건이 근거 2건이다.
  const same = 'https://www.tiktok.com/@one/video/1';
  const cs = [
    cand({ id: 'a', subject: '우사기', angle: '캐릭터별 행동 설정 비교', url: same }),
    cand({ id: 'b', subject: '하치와레', angle: '캐릭터별 성격 비교', url: same }),
    cand({ id: 'c', subject: '모몽가', angle: '시리즈 서브 캐릭터 구성 소개', url: same }),
  ];
  // 저장된 게시물이 0건인 소재는 근거가 아니므로 셋 다 한 건씩 준다.
  const ps = cs.flatMap((c) => [post(c.id, '2026-09-20T00:00:00Z')]);
  const g = grammarsWithEvidence(cs, ps, ASOF).find((x) => x.id === 'compare')!;
  assert.equal(g.evidence.length, 1);
});

test('근거: 원문 링크가 없는 후보는 근거가 아니다', () => {
  const cs = [cand({ id: 'a', subject: '우사기', angle: '캐릭터별 행동 설정 비교' })];
  const g = grammarsWithEvidence(cs, [], ASOF).find((x) => x.id === 'compare')!;
  assert.equal(g.evidence.length, 0);
});

test('근거: retired 는 빼고 archived 는 센다', () => {
  // 보관은 사람이 일부러 남긴 것이라 근거로 더 세다. 내려간 것만 뺀다.
  const cs = [
    cand({ id: 'a', subject: '포차코', angle: '랜덤박스 개봉 결과 인증', url: 'https://t/1', lifecycle: 'archived' }),
    cand({ id: 'b', subject: '기유', angle: '굿즈 랜덤 개봉 각도', url: 'https://t/2', lifecycle: 'retired' }),
  ];
  const ps = cs.flatMap((c) => [post(c.id, '2026-09-20T00:00:00Z')]);
  const g = grammarsWithEvidence(cs, ps, ASOF).find((x) => x.id === 'randombox')!;
  assert.deepEqual(g.evidence.map((e) => e.subject), ['포차코']);
});

test('근거: 한 후보가 두 방식에 붙지 않는다', () => {
  // 붙으면 같은 게시물이 두 번 세어져 근거가 부푼다.
  const cs = [
    cand({ id: 'a', subject: '페포', angle: "굿즈 언박싱, '가장 갖고 싶은 굿즈' 투표 각도", url: 'https://t/1' }),
  ];
  const ps = [post('a', '2026-09-20T00:00:00Z')];
  const hit = grammarsWithEvidence(cs, ps, ASOF).filter((g) => g.evidence.length > 0);
  assert.equal(hit.length, 1);
  // 넓은 신호(언박싱)보다 좁은 신호(투표)가 이긴다.
  assert.equal(hit[0].id, 'compare');
});

test('근거: 12개를 항상 같은 순서로 낸다', () => {
  const gs = grammarsWithEvidence([], [], ASOF);
  assert.deepEqual(gs.map((g) => g.id), GRAMMARS.map((g) => g.id));
});

/* ── 신선도 ────────────────────────────────────────────────────────── */

test('방식 신선도: 내림차순으로 놓고 가운데, 짝수면 위쪽', () => {
  // 100·94·93·90 이면 94 다. 평균(94.25)도 아래 중위(91.5)도 아니다.
  const cs = [90, 93, 94, 100].map((f, i) =>
    cand({ id: `c${i}`, subject: '버스밈', url: `https://t/${i}`, raw: { accounts: 9, kind: 'x' } }),
  );
  const posts: PostRecord[] = [];
  const fresh = [90, 93, 94, 100];
  cs.forEach((c, i) => {
    // 12건 중 fresh[i] 퍼센트만 최근으로: 반올림이 값을 흔들지 않게 25 의 배수를 쓴다.
    const recent = Math.round((fresh[i] / 100) * 100);
    for (let k = 0; k < 100; k++) {
      posts.push(post(c.id, k < recent ? '2026-09-20T00:00:00Z' : '2026-01-01T00:00:00Z'));
    }
  });
  const g = grammarsWithEvidence(cs, posts, ASOF).find((x) => x.id === 'reaction')!;
  assert.deepEqual(
    g.evidence.map((e) => e.freshness),
    [100, 94, 93, 90],
  );
  assert.equal(g.freshness, 94);
});

test('방식 신선도: 모르는 후보는 0 으로 치지 않고 아예 뺀다', () => {
  // 표본 10건을 못 채운 후보를 0 으로 치면 평균이 절반으로 꺾인다.
  const cs = [
    cand({ id: 'a', subject: '버스밈', url: 'https://t/1', raw: { accounts: 9, kind: 'x' } }),
    cand({ id: 'b', subject: '베놈 밈', url: 'https://t/2', raw: { accounts: 9, kind: 'x' } }),
  ];
  const posts = Array.from({ length: 12 }, () => post('a', '2026-09-20T00:00:00Z'));
  posts.push(post('b', '2026-09-20T00:00:00Z')); // 1 건뿐 → null
  const g = grammarsWithEvidence(cs, posts, ASOF).find((x) => x.id === 'reaction')!;
  assert.deepEqual(g.evidence.map((e) => e.freshness), [100, null]);
  assert.equal(g.freshness, 100);
});

test('방식 신선도: 아는 후보가 하나도 없으면 null 이다', () => {
  const cs = [cand({ id: 'a', subject: '버스밈', url: 'https://t/1', raw: { accounts: 9, kind: 'x' } })];
  const g = grammarsWithEvidence(cs, [], ASOF).find((x) => x.id === 'reaction')!;
  assert.equal(g.freshness, null);
});

/* ── 토글 ──────────────────────────────────────────────────────────── */

type GrammarNeedT = import('../lib/core/grammar').GrammarNeed;
const NONE: GrammarNeedT = { item: false };
const HAS: GrammarNeedT = { item: true };

test('토글: 물건이 없으면 일곱 개가 남는다', () => {
  const can = GRAMMARS.filter((g) => canDo(g, NONE));
  assert.deepEqual(can.map((g) => g.id), [
    'challenge', 'catchphrase', 'reaction', 'pick', 'compare', 'derivative', 'oc',
  ]);
});

test('토글: 물건이 있으면 12개가 다 열린다', () => {
  assert.equal(GRAMMARS.filter((g) => canDo(g, HAS)).length, 12);
});

test('토글: 물건이 필요한 방식은 다섯이다', () => {
  // 수용 문장 — 지출 고백 · 굿즈깡 · 손 클로즈업 · 참여 이벤트 · 입고 정보.
  assert.deepEqual(
    GRAMMARS.filter((g) => g.need.item).map((g) => g.name),
    ['지출 고백', '굿즈깡', '손 클로즈업', '참여 이벤트', '입고 정보'],
  );
});

test('토글: 못 하는 이유는 "물건 필요" 하나다', () => {
  // 걸린 방식을 목록에서 없애지 않는다. 칩에 이유를 달아 남긴다 (PROMPT.md §4).
  const box = GRAMMARS.find((g) => g.id === 'randombox')!;
  const chal = GRAMMARS.find((g) => g.id === 'challenge')!;
  assert.equal(missingLabel(box, NONE), '물건 필요');
  assert.equal(missingLabel(box, HAS), null);
  assert.equal(missingLabel(chal, NONE), null); // 물건이 필요 없으면 이유가 없다
});

test('토글: 물건이 생기면 열리는 방식을 데이터에서 뽑는다', () => {
  // 안내 박스가 이름을 하드코딩하지 않는다 (PROMPT.md §4).
  assert.deepEqual(
    opensWithItem(GRAMMARS, 'video').map((g) => g.name),
    ['굿즈깡', '손 클로즈업'],
  );
  assert.deepEqual(opensWithItem(GRAMMARS, 'copy').map((g) => g.name), ['지출 고백']);
});

/* ── 산출 종류 ─────────────────────────────────────────────────────── */

test('종류: video 6 · photo 4 · copy 2', () => {
  // 수용 문장. 「뭘로 만들 거예요?」 의 답 셋과 1:1 이다.
  const n = (k: string) => GRAMMARS.filter((g) => g.kind === k).length;
  assert.deepEqual([n('video'), n('photo'), n('copy')], [6, 4, 2]);
  assert.equal(n('video') + n('photo') + n('copy'), GRAMMARS.length);
});

test('종류: info·compare 였던 것이 photo 로 묶였다', () => {
  const photo = GRAMMARS.filter((g) => g.kind === 'photo').map((g) => g.name);
  assert.deepEqual(photo, ['질문·선택', '참여 이벤트', '비교·투표', '입고 정보']);
});

/* ── 목업 대조 ─────────────────────────────────────────────────────── */

/*
 * `docs/ui/home-1-initial` · `home-2-form-picked` · `home-3-no-item` · `home-4-has-item`
 * 네 장이 그대로 나오나.
 *
 * 네 장을 diff 해서 규칙을 역산했다.
 *   정렬   신선도 내림차순 (GRAMMARS 순서)
 *   카드   고른 종류로 거르고, 「없어요」일 때만 물건도 거른 뒤 앞 셋
 *   칩     나머지 아홉. 이유는 종류가 다르면 종류 이름, 종류는 맞는데 물건이 없으면 「물건 필요」
 *   답 안 함  물건이 필요한 방식도 카드에 오른다 — home-2 의 굿즈깡이 그렇다
 *
 * 나중에 정렬이나 거르기를 만지면 이 테스트가 먼저 깨진다.
 */
type Row = { id: string; name: string; kind: GrammarKind; need: GrammarNeedT };

/** 화면이 하는 계산과 같은 것. `components/grammar-board.tsx` 와 한 벌로 읽는다. */
function board(gs: Row[], form?: GrammarKind, item?: 'yes' | 'no') {
  const inForm = form ? gs.filter((g) => g.kind === form) : gs;
  const able = item === 'no' ? inForm.filter((g) => !g.need.item) : inForm;
  const cards = able.slice(0, 3);
  const shown = new Set(cards.map((g) => g.id));
  const why = (g: Row) =>
    form && g.kind !== form
      ? ` (${KIND_ASK[g.kind]})`
      : item === 'no' && g.need.item
        ? ' (물건 필요)'
        : '';
  return {
    able: able.length,
    cards: cards.map((g) => g.name),
    chips: gs.filter((g) => !shown.has(g.id)).map((g) => g.name + why(g)),
  };
}

test('목업 home-1: 아무것도 안 고르면 12개를 다 낸다', () => {
  // "첫 화면이 절대 비어 있으면 안 된다" (PROMPT.md §4).
  const b = board(GRAMMARS);
  assert.equal(b.able, 12); // "12개 중 3개"
  assert.deepEqual(b.cards, ['동작 따라하기', '말투·유행어', '반응 편집']);
  // 아무것도 안 골랐으면 못 하는 이유도 없다. 칩 아홉 개에 꼬리말이 없다.
  assert.deepEqual(b.chips, [
    '지출 고백', '질문·선택', '굿즈깡', '손 클로즈업', '참여 이벤트',
    '비교·투표', '입고 정보', '2차 창작', '자캐 공개',
  ]);
});

test('목업 home-2: 영상만 고르면 물건이 필요한 방식도 카드에 오른다', () => {
  // 물건을 아직 안 물었으므로 거르지 않는다. 카드가 "물건 필요"를 달고 알린다.
  const b = board(GRAMMARS, 'video');
  assert.equal(b.able, 6); // "6개 중 3개"
  assert.deepEqual(b.cards, ['동작 따라하기', '반응 편집', '굿즈깡']);
  assert.deepEqual(b.chips, [
    '말투·유행어 (글만)',
    '지출 고백 (글만)',
    '질문·선택 (사진·카드뉴스)',
    '손 클로즈업', // 영상이고 물건은 안 물었다 — 이유가 없다
    '참여 이벤트 (사진·카드뉴스)',
    '비교·투표 (사진·카드뉴스)',
    '입고 정보 (사진·카드뉴스)',
    '2차 창작',
    '자캐 공개',
  ]);
});

test('목업 home-3: 영상 + 없어요면 4개 중 3개다', () => {
  const b = board(GRAMMARS, 'video', 'no');
  assert.equal(b.able, 4); // "4개 중 3개"
  assert.deepEqual(b.cards, ['동작 따라하기', '반응 편집', '2차 창작']);
  // 걸린 것을 없애지 않는다. 칩에 이유를 달아 남긴다.
  assert.deepEqual(b.chips, [
    '말투·유행어 (글만)',
    '지출 고백 (글만)', // 종류가 먼저다. 물건도 필요하지만 글만이라 애초에 안 걸린다
    '질문·선택 (사진·카드뉴스)',
    '굿즈깡 (물건 필요)',
    '손 클로즈업 (물건 필요)',
    '참여 이벤트 (사진·카드뉴스)',
    '비교·투표 (사진·카드뉴스)',
    '입고 정보 (사진·카드뉴스)',
    '자캐 공개',
  ]);
});

test('목업 home-4: 영상 + 있어요면 home-2 와 같은 배치다', () => {
  const yes = board(GRAMMARS, 'video', 'yes');
  const unasked = board(GRAMMARS, 'video');
  assert.deepEqual(yes, unasked);
  assert.deepEqual(yes.cards, ['동작 따라하기', '반응 편집', '굿즈깡']);
});

test('질문 2 는 걸리는 방식이 있을 때만 낸다', () => {
  // 없는데 물으면 답이 아무것도 바꾸지 않는다.
  for (const k of ['video', 'photo', 'copy'] as GrammarKind[]) {
    const gated = opensWithItem(GRAMMARS, k);
    assert.ok(gated.length > 0, `${k} 에 걸리는 방식이 없다`);
  }
  // home-2 의 귀띔이 "2개 방식이 여기에 걸립니다" 였다.
  assert.equal(opensWithItem(GRAMMARS, 'video').length, 2);
  assert.equal(opensWithItem(GRAMMARS, 'photo').length, 2);
  assert.equal(opensWithItem(GRAMMARS, 'copy').length, 1);
});

test('어떤 답에도 카드가 비지 않는다', () => {
  // 첫 화면이 절대 비어 있으면 안 된다. 「글만 + 없어요」가 가장 좁은 조합이다.
  for (const k of [undefined, 'video', 'photo', 'copy'] as (GrammarKind | undefined)[]) {
    for (const i of [undefined, 'yes', 'no'] as (undefined | 'yes' | 'no')[]) {
      assert.ok(board(GRAMMARS, k, i).cards.length > 0, `${k}/${i} 가 비었다`);
    }
  }
});

test('카드 묶음 제목: 답에 따라 넷이 다르다', () => {
  // `docs/WORDS.md` §4 의 표 그대로. 조사가 낱말마다 갈려 문장째 적어 둔다.
  assert.equal(boardTitle(), NO_FORM_TITLE);
  assert.equal(boardTitle(), '지금 할 수 있는 방식');
  assert.equal(boardTitle('video'), '영상으로 만들 수 있는 방식');
  assert.equal(boardTitle('photo'), '사진·카드뉴스로 만들 수 있는 방식');
  // 「글만」은 제목에서 「글」로 쓴다. 받침이 ㄹ 이라 `으로`가 아니라 `로` 다.
  assert.equal(boardTitle('copy'), '글로 만들 수 있는 방식');
  assert.equal(new Set(['video', 'photo', 'copy'].map((k) => boardTitle(k as GrammarKind))).size, 3);
});

test('카드 묶음 제목: 개수가 WORDS.md 표와 맞는다', () => {
  // 안 고름 12개 중 3개 · 영상 6개 중 3개 · 사진·카드뉴스 4개 중 3개 · 글만 2개 중 2개
  assert.deepEqual(
    [undefined, 'video', 'photo', 'copy'].map((k) => {
      const b = board(GRAMMARS, k as GrammarKind | undefined);
      return `${b.able}개 중 ${b.cards.length}개`;
    }),
    ['12개 중 3개', '6개 중 3개', '4개 중 3개', '2개 중 2개'],
  );
});

test('근거: 저장된 게시물이 0건인 소재는 근거가 아니다', () => {
  /*
   * 원문 링크만 있고 게시물 레코드가 없으면 카드에 채울 것이 없다 — 조회도 썸네일도
   * 캡션도 못 낸다. 「지금 이걸 하고 있는 것」에 `계정 0곳` 이 앉으면 뜻이 거꾸로 읽힌다.
   * 세지도 않는다. 하단 「근거 N건」이 화면의 카드 수와 같아야 한다.
   */
  const cs = [
    cand({ id: 'a', subject: '오토레이니', angle: "굿즈 수집 현황 점검('굿즈체크') 각도", url: 'https://t/1' }),
    cand({ id: 'b', subject: '리락쿠마', angle: '대형 말랑이 굿즈 발견 리뷰', url: 'https://t/2' }),
  ];
  const g = grammarsWithEvidence(cs, [post('b', '2026-09-20T00:00:00Z')], ASOF).find(
    (x) => x.id === 'unboxing',
  )!;
  assert.deepEqual(g.evidence.map((e) => e.subject), ['리락쿠마']);
});

test('근거: 게시물 없는 쪽이 URL 을 선점하지 않는다', () => {
  // 오토레이니와 로보프로스터가 같은 틱톡 영상을 공유한다. 게시물이 있는 쪽이 대표다.
  const same = 'https://www.tiktok.com/@o.ro_t/video/7680101013491076359';
  const cs = [
    cand({ id: 'a', subject: '오토레이니', angle: "굿즈 수집 현황 점검('굿즈체크') 각도", url: same }),
    cand({ id: 'b', subject: '로보프로스터', angle: "굿즈 수집 현황 점검('굿즈체크') 각도", url: same }),
  ];
  const g = grammarsWithEvidence(cs, [post('b', '2026-09-20T00:00:00Z')], ASOF).find(
    (x) => x.id === 'unboxing',
  )!;
  assert.deepEqual(g.evidence.map((e) => e.subject), ['로보프로스터']);
});
