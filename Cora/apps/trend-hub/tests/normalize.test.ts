import { test } from 'node:test';
import assert from 'node:assert/strict';

import { characterDiscovery } from '../lib/discoveries/character';
import { materialDiscovery } from '../lib/discoveries/material';
import { scrapeReferences } from '../lib/discoveries/benchmark';
import { parseJsonField, num, str } from '../lib/core/dify';
import characterMock from '../mock/character.json';
import materialMock from '../mock/material.json';

const ctx = { runId: 'test-run', runAt: '2026-09-03T00:00:00.000Z', mock: true };

/*
 * 이 파일이 존재하는 것이 Dify 를 벗어나는 이유다.
 * 저 46KB 짜리 판정 코드를 Dify 텍스트박스 안에 두는 한 이런 검사를 붙일 수 없고,
 * 확인하려면 매번 전체 실행(API 20콜 + LLM 3콜)을 돌려야 했다.
 */

test('캐릭터: 판정 결과를 공통 후보로 옮긴다', () => {
  const out = characterDiscovery.normalize(characterMock, ctx);
  assert.equal(out.length, 3);

  const a = out[0];
  assert.equal(a.subject, '햄보기네');
  assert.equal(a.unit, 'subject');
  assert.equal(a.verdict, '가능(허락 확인 후)');
  assert.equal(a.rights.basis, 'source_grounded');
  assert.equal(a.rights.ownership, 'individual');
  assert.equal(a.momentum.accounts, 6);
  assert.deepEqual(a.momentum.platforms, ['instagram', 'tiktok']);
  assert.equal(a.evidence.length, 3);
  assert.ok(a.hint.imagePrompt);
  assert.equal(a.grounded, true);
});

test('캐릭터: 기업 IP 는 reference_required 로 넘어오고 프롬프트가 비어 있다', () => {
  const labubu = characterDiscovery.normalize(characterMock, ctx).find((c) => c.subject === '라부부')!;
  assert.equal(labubu.rights.basis, 'reference_required');
  assert.equal(labubu.rights.ownership, 'corporate');
  // 외형을 지어내지 않았다는 뜻이다. 비어 있는 게 정상이다.
  assert.equal(labubu.hint.imagePrompt, undefined);
});

test('캐릭터: 계정 하나짜리는 근거가 얇다고 표시된다', () => {
  const thin = characterDiscovery.normalize(characterMock, ctx).find((c) => c.subject === '왕왕이')!;
  assert.equal(thin.grounded, false);
  assert.equal(thin.rights.basis, 'none');
});

test('소재: 주제별 판정이 각각 후보가 된다', () => {
  const out = materialDiscovery.normalize(materialMock, ctx);
  assert.equal(out.length, 3);
  assert.deepEqual(
    out.map((c) => c.subject),
    ['제로슈가 음료', '단백질 간식', '저속노화 식단'],
  );
  assert.ok(out.every((c) => c.unit === 'topic'));
});

test('소재: 근거는 고른 주제에만 붙어 온다 — 나머지는 근거 얇음', () => {
  // for_next 가 그렇게 만들어져 있다. 숨기지 않고 드러내는 게 맞다.
  const out = materialDiscovery.normalize(materialMock, ctx);
  const chosen = out.find((c) => c.subject === '제로슈가 음료')!;
  const other = out.find((c) => c.subject === '단백질 간식')!;

  assert.equal(chosen.grounded, true);
  assert.equal(chosen.evidence.length, 3);
  assert.equal(chosen.hint.references?.length, 2);

  assert.equal(other.grounded, false);
  assert.equal(other.evidence.length, 0);
  assert.ok(other.rights.note?.includes('붙어 오지 않았습니다'));
});

test('소재: 재는 축이 없으면 0 이 아니라 null 이다', () => {
  const out = materialDiscovery.normalize(materialMock, ctx);
  const chosen = out[0];
  assert.equal(chosen.momentum.surge, 2.4);
  // 캐릭터 쪽 축은 이 판정기가 재지 않는다. 0 으로 채우면 거짓말이 된다.
  assert.equal(chosen.momentum.accounts, undefined);
});

test('빈 응답에도 터지지 않는다', () => {
  assert.deepEqual(characterDiscovery.normalize({}, ctx), []);
  assert.deepEqual(materialDiscovery.normalize({}, ctx), []);
  assert.deepEqual(characterDiscovery.normalize(null, ctx), []);
});

test('Dify 출력 파싱: 문자열 JSON · 코드펜스 · 쓰레기값', () => {
  assert.deepEqual(parseJsonField('[{"a":1}]', []), [{ a: 1 }]);
  assert.deepEqual(parseJsonField('```json\n{"a":2}\n```', {}), { a: 2 });
  assert.deepEqual(parseJsonField('설명이 앞에 붙음 {"a":3}', {}), { a: 3 });
  assert.deepEqual(parseJsonField('망가진 값', { fallback: true }), { fallback: true });
  assert.deepEqual(parseJsonField(undefined, []), []);
});

test('숫자: Dify 는 숫자도 문자열로 준다. 빈 값과 0 을 구분한다', () => {
  assert.equal(num('12'), 12);
  assert.equal(num('1,234'), 1234);
  assert.equal(num(0), 0);
  assert.equal(num(''), null);
  assert.equal(num(null), null);
  assert.equal(num('숫자아님'), null);
  assert.equal(str(null), '');
});

test('벤치마크: 텍스트 보고서에서 본보기를 건진다', () => {
  const refs = scrapeReferences(
    [
      '  · 제로 음료 6종 blind test  (구독대비 8.6배)',
      '    https://www.youtube.com/watch?v=aaa111',
      '',
      '  · 제로슈가 진짜 괜찮을까  (구독대비 7.3배)',
      '    https://www.youtube.com/watch?v=bbb222',
    ].join('\n'),
  );
  assert.equal(refs.length, 2);
  assert.equal(refs[0].url, 'https://www.youtube.com/watch?v=aaa111');
  assert.ok(refs[0].title.includes('blind test'));
});

test('벤치마크: 안 된 쪽을 본보기로 내놓지 않는다', () => {
  // 벤치마크는 잘된 것과 안 된 것을 나란히 놓는다.
  // 무차별로 긁으면 정확히 반대를 시키게 된다.
  const refs = scrapeReferences(
    [
      '  · 제로 음료 6종 blind test  (구독대비 8.6배)',
      '    https://www.youtube.com/watch?v=aaa111',
      '',
      '  · 편의점 음료 리뷰 모음  (구독대비 0.4배)',
      '    https://www.youtube.com/watch?v=ccc333',
    ].join('\n'),
  );
  assert.equal(refs.length, 2);
  assert.equal(refs[0].subRatio, 8.6);
  assert.equal(refs[0].title, '제로 음료 6종 blind test', '배수 표기는 제목에서 뺀다');
  assert.equal(refs[0].takeaway, undefined);

  assert.equal(refs[1].subRatio, 0.4);
  assert.ok(refs[1].takeaway?.includes('따라 할 대상이 아님'));
});

test('뉴스: 근거를 매체별로 돌아가며 뽑는다', async () => {
  // 앞에서부터 자르면 기사 많은 한 곳이 근거를 다 차지해서
  // '여러 곳이 다뤘다'는 판정이 근거 목록에서 보이지 않는다.
  const { newsDiscovery } = await import('../lib/discoveries/news');
  const mk = (sourceName: string, n: number) =>
    Array.from({ length: n }, (_, i) => ({
      sourceId: sourceName,
      sourceName,
      kind: 'news' as const,
      title: `${sourceName} 기사 ${i}`,
      url: `https://e.com/${sourceName}/${i}`,
      publishedAt: '2026-09-05T00:00:00.000Z',
      summary: '',
    }));
  const articles = [...mk('연합뉴스', 9), ...mk('매일경제', 2), ...mk('고구마팜', 1)];

  const out = newsDiscovery.normalize(
    {
      articles,
      drafts: [{ topic: '불꽃축제', why: '세 곳이 다룸', articleIndexes: articles.map((_, i) => i) }],
    },
    ctx,
  );

  assert.equal(out.length, 1);
  const srcs = out[0].evidence.map((e) => e.source);
  assert.equal(srcs.length, 8);
  // 앞 세 건에 세 매체가 모두 나와야 한다.
  assert.deepEqual(srcs.slice(0, 3), ['연합뉴스', '매일경제', '고구마팜']);
  assert.equal(new Set(srcs).size, 3);
});

test('뉴스: 매체가 하나뿐인 주제는 후보가 되지 않는다', async () => {
  const { newsDiscovery } = await import('../lib/discoveries/news');
  const articles = [
    { sourceId: 'yna', sourceName: '연합뉴스', kind: 'news' as const, title: 'a', url: 'https://e.com/1', publishedAt: null, summary: '' },
    { sourceId: 'yna', sourceName: '연합뉴스', kind: 'news' as const, title: 'b', url: 'https://e.com/2', publishedAt: null, summary: '' },
  ];
  const out = newsDiscovery.normalize(
    { articles, drafts: [{ topic: '단독보도', why: '한 곳만', articleIndexes: [0, 1] }] },
    ctx,
  );
  assert.deepEqual(out, []);
});

test('뉴스: LLM 이 지어낸 기사 번호는 세지 않는다', async () => {
  const { newsDiscovery } = await import('../lib/discoveries/news');
  const articles = [
    { sourceId: 'yna', sourceName: '연합뉴스', kind: 'news' as const, title: 'a', url: 'https://e.com/1', publishedAt: null, summary: '' },
    { sourceId: 'mk', sourceName: '매일경제', kind: 'news' as const, title: 'b', url: 'https://e.com/2', publishedAt: null, summary: '' },
  ];
  const out = newsDiscovery.normalize(
    { articles, drafts: [{ topic: '주제', why: '왜', articleIndexes: [0, 1, 77, 99] }] },
    ctx,
  );
  assert.equal(out[0].evidence.length, 2);
  assert.equal(out[0].momentum.extra?.버린기사번호, 2);
});

test('캐릭터: 한 게시물이 이름을 여럿 낳으면 목록 게시물로 보고 버린다', async () => {
  // 실제로 X 게시물 하나가 '기업 IP' 후보 4건을 만들어 냈다. 확산이 아니라 나열이다.
  const { verifyNames } = await import('../lib/collect/names');
  const post = (id: string, text: string, author: string) => ({
    sourceId: id, platform: 'x' as const, authorName: author, authorId: author,
    tags: [], title: '', text, views: 10, reactions: 1, followers: 5,
    url: `https://x.com/${author}/status/${id}`, postedAt: null,
  });
  const draft = (name: string, ids: string[]) => ({
    name, aliases: [], entityType: 'character_candidate' as const, foundIn: '본문',
    confidence: 0.8, sourceIds: ids, evidence: name, why: '',
  });

  const listPost = post('x:1', '알리시아 블랑쉐 메이린 피셔 벨라 피셔 엠마 로랑', 'someone');
  const spread = [post('x:2', '기봉이 좋아', 'a'), post('x:3', '기봉이 그렸어요', 'b')];

  const out = verifyNames(
    [listPost, ...spread],
    [
      draft('알리시아 블랑쉐', ['x:1']),
      draft('메이린 피셔', ['x:1']),
      draft('벨라 피셔', ['x:1']),
      draft('기봉이', ['x:2', 'x:3']),
    ],
    1,
  );

  const names = out.map((x) => x.name);
  assert.ok(names.includes('기봉이'), '여러 계정에서 확인된 이름은 남는다');
  assert.ok(!names.includes('메이린 피셔'), '목록 게시물 하나짜리는 버린다');
  assert.equal(out.find((x) => x.name === '기봉이')?.authors.length, 2);
});

test('캐릭터: 행위·장르어는 이름으로 세지 않는다', async () => {
  const { verifyNames } = await import('../lib/collect/names');
  const p = {
    sourceId: 'ig:1', platform: 'instagram' as const, authorName: '미묭', authorId: 'mimyong__',
    tags: ['자캐', '그림'], title: '', text: '자캐 만들기 챌린지 #자캐 #그림',
    views: 100, reactions: 5, followers: 10, url: 'https://instagram.com/reel/a', postedAt: null,
  };
  const out = verifyNames(
    [p],
    [{ name: '자캐', aliases: [], entityType: 'character_candidate' as const, foundIn: '태그',
       confidence: 0.9, sourceIds: ['ig:1'], evidence: '자캐', why: '' }],
    1,
  );
  assert.deepEqual(out, []);
});
