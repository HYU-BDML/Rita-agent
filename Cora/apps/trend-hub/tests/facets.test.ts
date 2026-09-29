import test from 'node:test';
import assert from 'node:assert/strict';
import { FACETS, OTHER, facetOf, isFacet } from '../lib/core/facets';
import type { Candidate } from '../lib/core/candidate';

const make = (over: Partial<Candidate> & { subject: string }): Candidate => ({
  id: `x:${over.subject}`,
  unit: 'topic',
  verdict: '판정 전',
  why: '',
  evidence: [],
  rights: { basis: 'none' },
  review: 'pending',
  lifecycle: 'active',
  origin: { discoveryId: 'news', runId: 'r', runAt: '2026-09-20T00:00:00Z' },
  ...over,
} as Candidate);

test('세부: 뉴스는 raw.category 를 읽는다', () => {
  const c = make({ subject: '이노션 캠페인', raw: { category: '마케팅·광고' } });
  assert.equal(facetOf(c), '마케팅·광고');
});

test('세부: 물어본 적 없는 것도 기타로 간다', () => {
  // 2026-09-22 사용자 결정 — '미분류'를 따로 두지 않고 기타에 담는다.
  // 레이더 후보가 그렇다. 뉴스 회차를 거치지 않아 갈래가 없다.
  const radar = make({ subject: '한동훈', origin: { discoveryId: 'radar', runId: 'r', runAt: '2026-09-20T00:00:00Z' } });
  assert.equal(facetOf(radar), OTHER);
  const answered = make({ subject: '무엇', raw: { category: '기타' } });
  assert.equal(facetOf(answered), OTHER);
});

test('세부: 없는 갈래가 적혀 있으면 믿지 않는다', () => {
  const c = make({ subject: '엉뚱', raw: { category: '아무거나' } });
  assert.equal(facetOf(c), OTHER);
});

test('세부: 캐릭터는 권리로 가른다', () => {
  const base = { unit: 'subject' as const, origin: { discoveryId: 'character-native', runId: 'r', runAt: '2026-09-20T00:00:00Z' } };
  assert.equal(facetOf(make({ subject: '치이카와', ...base, rights: { basis: 'none', ownership: 'corporate' } })), '기업 IP');
  assert.equal(facetOf(make({ subject: '토랩이', ...base, rights: { basis: 'none', ownership: 'individual' } })), '개인 창작');
  assert.equal(facetOf(make({ subject: '다툼', ...base, rights: { basis: 'none', ownership: 'disputed' } })), '권리 분쟁');
  // 못 가린 것은 기타로 간다. '권리 분쟁'(가렸는데 다툼이 있다)과는 여전히 다른 칸이다.
  assert.equal(facetOf(make({ subject: '모름', ...base, rights: { basis: 'none' } })), OTHER);
});

test('세부: 포맷은 raw.kind 를 읽고, 없으면 기타로 둔다', () => {
  const base = { origin: { discoveryId: 'meme-native', runId: 'r', runAt: '2026-09-20T00:00:00Z' } };
  assert.equal(facetOf(make({ subject: 'A', ...base, raw: { kind: 'challenge' } })), '챌린지');
  assert.equal(facetOf(make({ subject: 'B', ...base, raw: { kind: 'catchphrase' } })), '유행어·말');
  assert.equal(facetOf(make({ subject: 'C', ...base })), '기타');
});

test('세부: 모든 축의 칸은 그 축의 목록 안에 있다', () => {
  // facetOf 가 FACETS 에 없는 말을 내면 칩이 안 그려지고 후보가 조용히 사라진다.
  const samples: Candidate[] = [
    make({ subject: 'n', raw: { category: '정치' } }),
    make({ subject: 'r', origin: { discoveryId: 'radar', runId: 'r', runAt: '2026-09-20T00:00:00Z' } }),
    make({ subject: 'c', unit: 'subject', origin: { discoveryId: 'character-native', runId: 'r', runAt: '2026-09-20T00:00:00Z' }, rights: { basis: 'none', ownership: 'corporate' } }),
    make({ subject: 'm', origin: { discoveryId: 'meme-native', runId: 'r', runAt: '2026-09-20T00:00:00Z' }, raw: { kind: 'format' } }),
  ];
  const all = [...FACETS.issue, ...FACETS.character, ...FACETS.meme];
  for (const c of samples) assert.ok(all.includes(facetOf(c)), `${c.subject} -> ${facetOf(c)}`);
});

test('세부: 주소창으로 들어온 값을 그대로 믿지 않는다', () => {
  assert.ok(isFacet('issue', '정치'));
  assert.ok(!isFacet('character', '정치'));   // 축이 다르면 뜻이 없다
  assert.ok(!isFacet('issue', '없는칸'));
});
