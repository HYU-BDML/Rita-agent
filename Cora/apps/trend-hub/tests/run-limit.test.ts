import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_MAX_AUTOMATIC_RUNS_PER_DAY,
  DEFAULT_MAX_RUNS_PER_DAY,
  DEFAULT_MAX_RUNS_PER_DISCOVERY,
  maxAutomaticRunsPerDay,
  maxRunsPerDay,
  maxRunsPerDiscovery,
  quotaBlock,
  type RunQuota,
} from '../lib/core/run-limit';

const quota = (over: Partial<RunQuota> = {}): RunQuota => ({
  discoveryId: 'news',
  used: 0,
  max: 3,
  left: 3,
  totalUsed: 0,
  totalMax: 10,
  totalLeft: 10,
  automaticUsed: 0,
  automaticMax: 3,
  ...over,
});

/** env 를 건드리는 검사는 원래 값으로 되돌려 놓는다. 다음 검사가 물려받으면 안 된다. */
function withEnv(name: string, value: string | undefined, run: () => void): void {
  const before = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    run();
  } finally {
    if (before === undefined) delete process.env[name];
    else process.env[name] = before;
  }
}

test('상한: 남아 있으면 막지 않는다', () => {
  assert.equal(quotaBlock(quota({ used: 1, left: 2, totalUsed: 4, totalLeft: 6 }), 'manual'), null);
  assert.equal(quotaBlock(quota({ used: 1, left: 2, automaticUsed: 1 }), 'automatic'), null);
});

test('상한: 한 축을 다 써도 다른 축은 열려 있다고 말한다', () => {
  // 이게 판정기별로 세는 이유다 — 뉴스를 다 쓴 날 캐릭터를 못 돌리면 안 된다.
  const blocked = quotaBlock(quota({ used: 3, left: 0, totalUsed: 3, totalLeft: 7 }), 'manual');
  assert.ok(blocked);
  assert.match(blocked, /다른 축/);
  assert.match(blocked, /7회/);
});

test('상한: 전체 천장에 닿으면 다른 축도 못 돌린다', () => {
  const blocked = quotaBlock(
    quota({ used: 3, left: 0, totalUsed: 10, totalMax: 10, totalLeft: 0 }),
    'manual',
  );
  assert.ok(blocked);
  assert.doesNotMatch(blocked, /다른 축/);
  assert.match(blocked, /자정/);
});

test('상한: 판정기는 남았는데 전체가 찼으면 전체를 이유로 든다', () => {
  const blocked = quotaBlock(
    quota({ used: 1, left: 2, totalUsed: 10, totalMax: 10, totalLeft: 0 }),
    'manual',
  );
  assert.ok(blocked);
  assert.match(blocked, /전체 실행 한도 10회/);
});

test('상한: 자동 몫만 떨어지면 사람이 누를 자리는 남는다', () => {
  const state = quota({ used: 1, left: 2, totalUsed: 3, totalLeft: 7, automaticUsed: 3 });
  const blocked = quotaBlock(state, 'automatic');
  assert.ok(blocked);
  assert.match(blocked, /자동 실행 한도 3회/);
  assert.equal(quotaBlock(state, 'manual'), null);
});

test('상한: 판정기를 안 주고 물으면 전체 기준으로만 막는다', () => {
  const all = quota({ discoveryId: undefined, used: 10, max: 10, left: 0, totalUsed: 10, totalLeft: 0 });
  const blocked = quotaBlock(all, 'manual');
  assert.ok(blocked);
  assert.match(blocked, /전체 실행 한도/);
});

test('상한: 값을 안 주면 기본값, 숫자가 아니면 기본값', () => {
  for (const bad of [undefined, '', '많이', '-1']) {
    withEnv('TREND_HUB_MAX_RUNS_PER_DISCOVERY', bad, () => {
      assert.equal(maxRunsPerDiscovery(), DEFAULT_MAX_RUNS_PER_DISCOVERY);
    });
    withEnv('TREND_HUB_MAX_RUNS_PER_DAY', bad, () => {
      assert.equal(maxRunsPerDay(), DEFAULT_MAX_RUNS_PER_DAY);
    });
  }
  withEnv('TREND_HUB_MAX_AUTOMATIC_RUNS_PER_DAY', undefined, () => {
    assert.equal(maxAutomaticRunsPerDay(), DEFAULT_MAX_AUTOMATIC_RUNS_PER_DAY);
  });
});

test('상한: 0 은 기본값으로 되돌리지 않는다 — 수집을 잠그는 값이다', () => {
  withEnv('TREND_HUB_MAX_RUNS_PER_DISCOVERY', '0', () => {
    assert.equal(maxRunsPerDiscovery(), 0);
    assert.ok(quotaBlock(quota({ used: 0, max: 0, left: 0 }), 'manual'));
  });
});
