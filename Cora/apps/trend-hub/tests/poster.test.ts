import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  RATIOS,
  강조색들,
  별표,
  STYLES,
  assertNoLikeness,
  buildVisualPrompt,
  likenessHits,
  pickSource,
  posterNativeProducer,
} from '../lib/producers/poster-native';
import type { Candidate } from '../lib/core/candidate';
import { newsDiscovery } from '../lib/discoveries/news';
import { characterNativeDiscovery } from '../lib/discoveries/character-native';

/*
 * 주제 포스터.
 *
 * 주제 후보에는 실존 인물이 그대로 들어 있다 — 정치인·연예인·피의자.
 * 그 얼굴을 만들어 붙이면 그건 포스터가 아니라 조작된 사진이다.
 * 모델에게 하지 말라고 시키는 것만으로는 부족해서 나온 프롬프트를 코드가 한 번 더 본다.
 * 그 검사가 이 파일의 중심이다.
 */

test('초상: 얼굴을 그리려는 프롬프트를 막는다', () => {
  const bad = [
    'photorealistic portrait of a Korean politician at a podium',
    'close-up facial expression of the president',
    'a celebrity headshot in dramatic lighting',
    'a lookalike of the accused standing in court',
  ];
  for (const p of bad) {
    assert.ok(likenessHits(p).length > 0, `놓쳤다: ${p}`);
    assert.throws(() => assertNoLikeness(p), /실존 인물/);
  }
});

test('초상: 사람이 없는 장면은 통과한다', () => {
  const ok = [
    'an empty podium under harsh stage light, folded paper program on the floor',
    'a crowd seen from far above at dusk, figures reduced to silhouettes',
    'stacked shipping containers at a port, morning haze, long shadows',
  ];
  for (const p of ok) {
    assert.deepEqual(likenessHits(p), [], `괜히 막았다: ${p}`);
    assert.doesNotThrow(() => assertNoLikeness(p));
  }
});

test('초상: 검사는 대소문자를 가리지 않는다', () => {
  assert.throws(() => assertNoLikeness('PORTRAIT of a man in a suit'), /실존 인물/);
});

test('프롬프트: 글자 금지와 인물 금지가 항상 붙는다', () => {
  // FLUX 는 한글 자모를 뭉갠다. 한글은 CSS 로 얹으므로 이미지에 글자가 들어오면 겹쳐서 못 쓴다.
  const p = buildVisualPrompt('stacked shipping containers at a port', '미니멀');
  assert.match(p, /no text, no letters/);
  assert.match(p, /no identifiable people, no faces/);
  assert.ok(p.startsWith('stacked shipping containers at a port'), '모델이 쓴 문장이 앞에 온다');
  assert.ok(p.includes(STYLES['미니멀']), '고른 결이 실제로 실린다');
});

test('프롬프트: 모르는 결이 와도 빈 채로 나가지 않는다', () => {
  const p = buildVisualPrompt('a port at dawn', '없는결');
  assert.ok(p.includes(STYLES['그래픽 추상']));
});

test('비율: 네 가지가 모두 fal 크기로 옮겨진다', () => {
  for (const name of ['1:1', '4:5', '9:16', '16:9'] as const) {
    const r = RATIOS[name];
    assert.ok(r, `${name} 이 빠졌다`);
    assert.ok(r.aspect > 0);
  }
  // 4:5 는 fal 프리셋에 없어 픽셀로 준다. 인스타 세로 1080×1350 과 같은 비.
  assert.deepEqual(RATIOS['4:5'].fal, { width: 1024, height: 1280 });
  assert.equal(RATIOS['1:1'].aspect, 1);
});

test('비율 선택지가 실제 표와 어긋나지 않는다', () => {
  const field = posterNativeProducer.extraInputs.find((f) => f.name === 'ratio')!;
  for (const o of field.options ?? []) {
    assert.ok(o in RATIOS, `화면에는 있는데 표에 없는 비율: ${o}`);
  }
  assert.ok(field.default && field.default in RATIOS);
});

test('출처: 후보 근거에 없는 링크는 버린다', () => {
  // 있는 척하는 출처가 제일 나쁘다. 카드뉴스 원고와 같은 규칙이다.
  const evidence: Candidate['evidence'] = [
    { source: '연합뉴스', title: '기사', url: 'https://a.example/1' },
  ];
  assert.deepEqual(pickSource('https://a.example/1', evidence), {
    sourceUrl: 'https://a.example/1',
    sourceName: '연합뉴스',
  });
  assert.deepEqual(pickSource('https://지어낸.example/9', evidence), {});
  assert.deepEqual(pickSource('', evidence), {});
});

/* 게이트 — 어떤 후보를 받는가 */

const ctx = { runId: 'test-run', runAt: '2026-09-05T00:00:00.000Z', mock: true };

test('근거가 없는 후보는 받지 않는다', () => {
  const bare = {
    evidence: [],
    unit: 'topic',
  } as unknown as Candidate;
  const g = posterNativeProducer.gate(bare);
  assert.equal(g.ok, false);
  assert.match(g.ok === false ? g.reason : '', /근거/);
});

test('주제 후보만 받는다 — 캐릭터는 다른 길이다', () => {
  assert.deepEqual(posterNativeProducer.accepts, ['topic']);
  // 캐릭터는 외형이 곧 남의 권리라 공식 레퍼런스를 물려야 한다. 여기서 다루지 않는다.
  assert.equal(characterNativeDiscovery.unit, 'subject');
  assert.equal(newsDiscovery.unit, 'topic');
  void ctx;
});

test('키 없이도 목 모드로 한 장이 나온다', async () => {
  const c: Candidate = {
    id: 'news:test',
    unit: 'topic',
    subject: '수출 1조달러 눈앞',
    verdict: '지금 오르는',
    why: '9월 초 수출 누계가 작년 연간 실적을 넘어섰다',
    grounded: true,
    momentum: { surge: 1.69, mediaCount: 2 },
    evidence: [{ source: '연합뉴스', title: '기사', url: 'https://a.example/1' }],
    rights: { basis: 'not_applicable' },
    hint: {},
    review: 'pending',
    lifecycle: 'active',
    origin: { discoveryId: 'news', runId: 'r', runAt: ctx.runAt },
  };
  const out = await posterNativeProducer.run(
    { ...posterNativeProducer.mapInputs(c), ratio: '9:16', style: '미니멀', account: '@테스트' },
    c,
    { ...ctx, mock: true },
  );
  const poster = (out.output as { poster: { ratio: string; imageUrl: string; sourceName?: string } }).poster;
  assert.equal(poster.ratio, '9:16');
  assert.equal(poster.imageUrl, '', '목 모드는 fal 을 부르지 않는다');
  assert.equal(poster.sourceName, '연합뉴스');
});


/*
 * 렌더 서버로 넘길 때.
 *
 * 서버는 제목에서 별표로 감싼 곳을 강조색으로 칠한다. 모델이 짚은 구절이
 * 헤드라인에 실제로 없을 수 있는데, 그때 억지로 끼우면 문장이 깨진다.
 */

test('강조: 헤드라인에 있는 구절만 별표로 감싼다', () => {
  assert.equal(별표('9월에 벌써 작년을 넘었다', '작년을 넘었다'), '9월에 벌써 *작년을 넘었다*');
  assert.equal(별표('1등 16명, 각 17억9천만원', '17억9천만원'), '1등 16명, 각 *17억9천만원*');
});

test('강조: 없는 구절은 끼우지 않는다', () => {
  // 모델이 지어낸 구절을 문장에 밀어 넣으면 헤드라인이 망가진다.
  assert.equal(별표('수출이 늘었다', '없는 말'), '수출이 늘었다');
  assert.equal(별표('수출이 늘었다', ''), '수출이 늘었다');
});

test('강조: 같은 말이 여러 번 나와도 한 번만 감싼다', () => {
  assert.equal(별표('수출 또 수출', '수출'), '*수출* 또 수출');
});

test('강조색은 서버가 아는 것만 고르게 한다', () => {
  // 서버는 임의 색을 안 받는다. 화면에서 아무 색이나 고르면 굽는 순간 거절당한다.
  const f = posterNativeProducer.extraInputs.find((x) => x.name === '강조색')!;
  assert.deepEqual(f.options, [...강조색들]);
  assert.equal(f.default, '없음');
});

test('서버 굽는 옵션이 화면에 다 나와 있다', () => {
  const names = posterNativeProducer.extraInputs.map((f) => f.name);
  for (const n of ['자리', '글자크기', '사진어둡게', '강조색']) {
    assert.ok(names.includes(n), `${n} 칸이 없다`);
  }
});
