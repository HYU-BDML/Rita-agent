import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_MISS_DAYS, retireReason, sweep } from '../lib/core/retire';
import type { Candidate } from '../lib/core/candidate';

const NOW = new Date('2026-09-25T03:00:00Z');
const make = (over: Partial<Candidate> & { subject: string; discoveryId: string; runAt: string }): Candidate => ({
  id: `${over.discoveryId}:${over.subject}`,
  unit: 'topic',
  verdict: '판정 전',
  why: '',
  evidence: [],
  rights: { basis: 'none' },
  review: 'pending',
  lifecycle: 'active',
  origin: { discoveryId: over.discoveryId, runId: 'r', runAt: over.runAt },
  ...over,
} as Candidate);

test('내리기: 보관한 것은 기한이 지나도 안 내린다', () => {
  // 사람이 계속 보겠다고 손으로 누른 것이다. 기한으로 뒤집으면 그 뜻이 사라진다.
  const c = make({ subject: '칸라이언즈', discoveryId: 'news', runAt: '2026-08-01T00:00:00Z', lifecycle: 'archived' });
  assert.equal(retireReason(c, NOW), null);
  const old = make({ subject: '같은나이', discoveryId: 'news', runAt: '2026-08-01T00:00:00Z' });
  assert.ok(retireReason(old, NOW), '보관 안 한 같은 나이는 내려가야 한다');
});

test('내리기: 축마다 기한이 다르다 — 뉴스 7일, 캐릭터 30일', () => {
  const at = '2026-09-10T00:00:00Z'; // 15일 전
  assert.ok(retireReason(make({ subject: 'n', discoveryId: 'news', runAt: at }), NOW));
  assert.equal(retireReason(make({ subject: 'c', discoveryId: 'character-native', runAt: at }), NOW), null);
});

test('내리기: 사유에 언제 마지막으로 잡혔는지가 들어간다', () => {
  const why = retireReason(make({ subject: 'n', discoveryId: 'news', runAt: '2026-09-01T00:00:00Z' }), NOW);
  assert.ok(why);
  assert.match(why, /7일/);
  assert.match(why, /2026-09-01/);
});

test('내리기: 설정으로 기한을 바꾼다', () => {
  const c = make({ subject: 'n', discoveryId: 'news', runAt: '2026-09-10T00:00:00Z' });
  assert.ok(retireReason(c, NOW));
  assert.equal(retireReason(c, NOW, { maxAgeDays: { news: 60 } }), null);
  // 0 은 '기한을 안 본다'는 뜻이다 — 기본값으로 되돌리지 않는다.
  assert.equal(retireReason(c, NOW, { maxAgeDays: { news: 0 } }), null);
});

test('내리기: 회차가 못 물어온 날이 이어지면 내린다', () => {
  const c = make({ subject: 'c', discoveryId: 'character-native', runAt: '2026-09-24T00:00:00Z', misses: MAX_MISS_DAYS });
  const why = retireReason(c, NOW);
  assert.ok(why);
  assert.match(why, /연속/);
});

test('훑기: 같은 날 여러 번 돌려도 미포착은 하루 한 번만 센다', () => {
  // 손으로 세 번 눌러 본 것만으로 멀쩡한 후보가 내려가면 안 된다.
  let c = make({ subject: 'c', discoveryId: 'meme-native', runAt: '2026-09-24T00:00:00Z' });
  const run = { discoveryId: 'meme-native', seen: new Set<string>(), at: '2026-09-25T03:00:00Z' };
  const first = sweep([c], run);
  c = first.changed[0];
  assert.equal(c.misses, 1);
  const second = sweep([c], run);
  assert.equal(second.changed.length, 0, '같은 날 두 번째는 안 센다');
});

test('훑기: 이번에 잡히면 미포착이 0으로 돌아간다', () => {
  const c = make({ subject: 'c', discoveryId: 'meme-native', runAt: '2026-09-25T03:00:00Z', misses: 2, missDay: '2026-09-24' });
  const r = sweep([c], { discoveryId: 'meme-native', seen: new Set([c.id]), at: '2026-09-25T03:00:00Z' });
  assert.equal(r.changed[0].misses, 0);
  assert.equal(r.retired.length, 0);
});

test('훑기: 다른 판정기의 후보는 건드리지 않는다', () => {
  const news = make({ subject: 'n', discoveryId: 'news', runAt: '2026-08-01T00:00:00Z' });
  const r = sweep([news], { discoveryId: 'meme-native', seen: new Set(), at: '2026-09-25T03:00:00Z' });
  assert.equal(r.changed.length, 0);
  assert.equal(r.retired.length, 0);
});

test('훑기: 내려간 것에는 사유가 함께 남는다', () => {
  const c = make({ subject: '지난뉴스', discoveryId: 'news', runAt: '2026-09-01T00:00:00Z' });
  const r = sweep([c], { discoveryId: 'news', seen: new Set(), at: '2026-09-25T03:00:00Z' });
  assert.equal(r.retired.length, 1);
  assert.equal(r.retired[0].subject, '지난뉴스');
  assert.equal(r.changed[0].lifecycle, 'retired');
  assert.ok(r.retired[0].why);
});
