import { test } from 'node:test';
import assert from 'node:assert/strict';

import { countPhrases, bodyWords, MIN_ACCOUNTS } from '../lib/collect/phrases';
import type { Post } from '../lib/collect/tikhub';

/*
 * 밈 축 — 따라 쓰는 말 세기.
 *
 * 지키려는 것은 둘이다.
 *   1. **계정을 센다, 횟수가 아니라.** 장사 계정 하나가 같은 말을 매일 올리는 것과
 *      여러 사람이 따라 쓰는 것은 다르다. 이걸 놓치면 표가 광고로 찬다.
 *   2. **검색한 말이 되돌아오는 것을 1등으로 세우지 않는다.** 2026-09-17 조사에서
 *      237개 중 60개가 검색어 반향이었다.
 */

let n = 0;
const post = (account: string, text: string, platform = 'tiktok'): Post =>
  ({
    sourceId: `p${n++}`,
    platform,
    authorName: account,
    authorId: account,
    tags: [],
    title: '',
    text,
    views: 10,
    reactions: 0,
    followers: 0,
    url: `https://t.test/${account}${n}`,
    postedAt: '2026-09-18T00:00:00.000Z',
  }) as Post;

test('문구: 서로 다른 계정 수로 센다 — 한 계정이 백 번 써도 1이다', () => {
  const spam = [...Array(5)].map(() => post('shop', '오늘부터 반값 세일'));
  const r = countPhrases(spam);
  assert.equal(r.kept.length, 0, '한 계정뿐이면 따라 쓴 것이 아니다');

  const many = ['a', 'b', 'c'].map((x) => post(x, '오늘부터 반값 세일'));
  const r2 = countPhrases(many);
  assert.ok(r2.kept.some((p) => p.text.includes('반값 세일')));
});

test(`문구: 계정 ${MIN_ACCOUNTS}곳 미만은 세지 않는다`, () => {
  const r = countPhrases(['a', 'b'].map((x) => post(x, '춤추는 고양이 영상')));
  assert.equal(r.kept.length, 0);
});

test('문구: 검색어가 되돌아온 것은 거른다', () => {
  // 2026-09-19 규칙을 좁혔다. 검색어 낱말만으로 된 문구만 버린다 —
  // 전에는 '품으면' 버려서 '픽셀 캐릭터' 같은 새 조합까지 죽였다.
  // 그래서 '요즘 캐릭터 굿즈'(요즘이 새 말)는 이제 살아남는 것이 맞다.
  const posts = ['a', 'b', 'c'].map((x) => post(x, '요즘 캐릭터 굿즈 샀어요'));
  const r = countPhrases(posts, { queries: ['캐릭터 굿즈'] });
  assert.ok(r.dropped.some((d) => d.text === '캐릭터 굿즈' && d.why === '검색어 반향'));
  assert.ok(!r.kept.some((p) => p.text === '캐릭터 굿즈'));
});

test('문구: 문법 조각은 의존명사 하나만 있어도 거른다', () => {
  // '만나볼 수' 는 두 어절 중 하나가 실질어라 "전부 기능어" 규칙으로는 안 걸린다.
  const posts = ['a', 'b', 'c'].map((x) => post(x, '여기서 만나볼 수 있습니다'));
  const r = countPhrases(posts);
  assert.equal(r.kept.length, 0, '조각만 남는 자료에서는 아무것도 안 남아야 한다');
  assert.ok(r.dropped.some((d) => d.why === '문법 조각'));
});

test('문구: 캐릭터 이름이 든 것은 밈으로 안 센다', () => {
  const posts = ['a', 'b', 'c'].map((x) => post(x, '치이카와 너무 귀엽다'));
  const r = countPhrases(posts, { names: ['치이카와'] });
  assert.ok(r.dropped.some((d) => d.why === '이름'));
  assert.ok(!r.kept.some((p) => p.text.includes('치이카와')));
});

test('문구: 나열 안에 있는 말은 거른다', () => {
  const posts = ['a', 'b', 'c'].map((x) =>
    post(x, '산리오•지브리•모루카•쿠키런 입고했어요'),
  );
  const r = countPhrases(posts);
  assert.ok(!r.kept.some((p) => p.text.includes('모루카')), '가게가 늘어놓은 목록이다');
});

test('문구: 마케팅 상투어는 거르지 않고 표시만 한다', () => {
  const posts = ['a', 'b', 'c'].map((x) => post(x, '프로필 링크 걸어뒀어요'));
  const r = countPhrases(posts);
  const hit = r.kept.find((p) => p.text.includes('프로필 링크'));
  assert.ok(hit, '거르면 0건이 됐을 때 필터 탓인지 자료 탓인지 알 수 없다');
  assert.equal(hit.boilerplate, true);
});

test('문구: 해시태그·멘션·URL 은 본문으로 안 센다', () => {
  assert.deepEqual(bodyWords('좋아요 #캐릭터굿즈 @shop https://a.test/1 진짜'), ['좋아요', '진짜']);
});

test('문구: 짧은 쪽이 긴 쪽에 통째로 들어 있으면 접는다', () => {
  // 같은 자리에서 나온 한 유행을 둘로 세면 표가 부푼다. 계정 수가 같을 때만 접는다.
  const posts = ['a', 'b', 'c'].map((x) => post(x, '춤추는 고양이 따라했다'));
  const r = countPhrases(posts);
  assert.ok(!r.kept.some((p) => p.text === '춤추는 고양이'), '더 긴 쪽이 남는다');
  assert.ok(r.kept.some((p) => p.text.startsWith('춤추는 고양이')));
});

test('문구: 플랫폼을 가로지르면 더 위로 온다', () => {
  const posts = [
    post('a', '춤추는 고양이 따라했다', 'tiktok'),
    post('b', '춤추는 고양이 따라했다', 'instagram'),
    post('c', '춤추는 고양이 따라했다', 'x'),
    post('d', '오늘 날씨 참 좋다', 'tiktok'),
    post('e', '오늘 날씨 참 좋다', 'tiktok'),
    post('f', '오늘 날씨 참 좋다', 'tiktok'),
  ];
  const r = countPhrases(posts);
  assert.ok(r.kept[0].text.includes('춤추는 고양이'), '계정 수가 같으면 플랫폼 수로 가른다');
});

/* ── 반향 필터를 고친 뒤 (2026-09-19) ────────────────────────────────── */

test('반향: 검색어 낱말만으로 된 문구는 버린다', () => {
  const posts = ['a', 'b', 'c'].map((x) => post(x, '오늘 캐릭터 굿즈 샀어요'));
  const r = countPhrases(posts, { queries: ['캐릭터 굿즈', '캐릭터', '굿즈'] });
  assert.ok(r.dropped.some((d) => d.text === '캐릭터 굿즈' && d.why === '검색어 반향'));
});

test('반향: 새 말이 한 어절이라도 붙으면 살린다 — 픽셀 캐릭터', () => {
  // 실제로 놓쳤던 것이다. 계정 5곳이 쓴 "픽셀 캐릭터"(챗GPT 로 만들기)가
  // 검색어 '캐릭터' 를 품었다는 이유로 세 번 지워졌다.
  const posts = ['a', 'b', 'c'].map((x) => post(x, '요즘 유행하는 픽셀 캐릭터 만들기'));
  const r = countPhrases(posts, { queries: ['캐릭터 굿즈', '캐릭터', '굿즈'] });
  assert.ok(
    r.kept.some((p) => p.text.includes('픽셀 캐릭터')),
    '검색어를 품었다는 이유로 버리면 안 된다',
  );
  assert.ok(!r.dropped.some((d) => d.text === '픽셀 캐릭터'));
});

test('반향: 포맷 문구는 문법 조각으로도 안 걸린다 — 만드는 방법', () => {
  const posts = ['a', 'b', 'c'].map((x) => post(x, '픽셀 캐릭터 만드는 방법 공유'));
  const r = countPhrases(posts, { queries: ['캐릭터'] });
  assert.ok(r.kept.some((p) => p.text.includes('만드는 방법')), '포맷을 가리키는 말이다');
});

test('반향: 띄어쓰기만 다른 것도 되돌아온 말이다', () => {
  // '요즘유행' 으로 검색하면 '요즘 유행' 이 1등으로 올라온다. 낱말 단위로만 보면
  // 두 낱말 다 검색어에 없는 것으로 읽혀 통과해 버린다.
  const posts = ['a', 'b', 'c'].map((x) => post(x, '이게 요즘 유행 이더라구요'));
  const r = countPhrases(posts, { queries: ['요즘유행', '밈', '챌린지'] });
  assert.ok(r.dropped.some((d) => d.text === '요즘 유행' && d.why === '검색어 반향'));
});
