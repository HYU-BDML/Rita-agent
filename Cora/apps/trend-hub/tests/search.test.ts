import test from 'node:test';
import assert from 'node:assert/strict';
import { search, searchRank } from '../lib/core/search';
import type { Candidate } from '../lib/core/candidate';

const make = (over: Partial<Candidate> & { subject: string }): Candidate => ({
  id: `character:${over.subject}`,
  unit: 'subject',
  verdict: '판정 전',
  why: '',
  evidence: [],
  rights: { basis: 'none', ownership: 'unknown' },
  review: 'pending',
  lifecycle: 'active',
  origin: { discoveryId: 'character-native', runId: 'run', runAt: '2026-09-20T00:00:00Z' },
  ...over,
} as Candidate);

test('검색: 별칭으로도 자기 후보가 나온다', () => {
  // 실제로 걸렸다 — 'chiikawa' 로 치이카와가 안 나왔다. 별칭이 근거 본문에 우연히
  // 섞여 있을 때만 걸렸고, 섞이지 않은 여섯 건은 통째로 안 나왔다.
  const chiikawa = make({ subject: '치이카와', aliases: ['먼작귀', 'chiikawa'] });
  const other = make({ subject: '하치와레' });
  assert.deepEqual(search([chiikawa, other], 'chiikawa').map((c) => c.subject), ['치이카와']);
  assert.deepEqual(search([chiikawa, other], '먼작귀').map((c) => c.subject), ['치이카와']);
});

test('검색: 별칭이 정확히 맞으면 제목에 스치기만 한 것보다 앞선다', () => {
  const byAlias = make({ subject: '리락쿠마', aliases: ['코리락쿠마'] });
  const byMention = make({
    subject: '산리오 신상',
    why: '코리락쿠마 키링이 같이 놓여 있었다',
    origin: { discoveryId: 'character-native', runId: 'r', runAt: '2026-09-22T00:00:00Z' },
  });
  // 최신순으로는 byMention 이 앞이다. 관련도가 그것을 이겨야 한다.
  assert.deepEqual(
    search([byMention, byAlias], '코리락쿠마').map((c) => c.subject),
    ['리락쿠마', '산리오 신상'],
  );
  assert.equal(searchRank(byAlias, '코리락쿠마'), 3);
  assert.equal(searchRank(byMention, '코리락쿠마'), 0);
});

test('검색: 전각·반각과 대소문자를 가리지 않는다', () => {
  const full = make({ subject: 'ＰＰＧ', aliases: [] });
  assert.equal(search([full], 'ppg').length, 1);
  assert.equal(search([full], 'PPG').length, 1);
});

test('검색: 낱말을 모두 포함해야 걸린다', () => {
  const c = make({ subject: '치이카와', why: '산리오 협업 굿즈가 나왔다' });
  assert.equal(search([c], '치이카와 산리오').length, 1);
  assert.equal(search([c], '치이카와 포차코').length, 0);
});

test('검색: 근거 제목과 본문도 훑는다', () => {
  const c = make({
    subject: '9월 수출 최대 실적',
    evidence: [{ source: '연합뉴스', title: '반도체 수출 급증', url: 'https://example.com/1', excerpt: '메모리 가격이 올랐다' }],
  });
  assert.equal(search([c], '반도체').length, 1);
  assert.equal(search([c], '메모리').length, 1);
});

test('검색: 자르지 않는다 — 세는 쪽이 같은 결과를 쓴다', () => {
  const many = Array.from({ length: 30 }, (_, i) => make({ subject: `챌린지 ${i}`, id: `meme:${i}` }));
  assert.equal(search(many, '챌린지').length, 30);
});
