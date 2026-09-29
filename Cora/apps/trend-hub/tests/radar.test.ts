import { test } from 'node:test';
import assert from 'node:assert/strict';

import { radarDiscovery } from '../lib/discoveries/radar';
import { cardnewsNativeProducer } from '../lib/producers/cardnews-native';
import { posterNativeProducer } from '../lib/producers/poster-native';
import { benchmarkNativeDiscovery } from '../lib/discoveries/benchmark-native';
import { imageProducer } from '../lib/producers/visual';
import type { RadarRaw } from '../lib/discoveries/radar';

const ctx = { runId: 'radar-test', runAt: '2026-09-15T00:00:00.000Z', mock: false };

/*
 * 레이더는 판정까지 끝난 회차 파일을 읽어 온다. 여기서 검사하는 것은 옮기는 규칙이다 —
 * 무엇을 버리고, 없는 값을 어떻게 두고, 근거 링크가 없을 때 무슨 일이 일어나는가.
 */

function raw(trends: unknown[]): RadarRaw {
  return { runId: 'live-2026-09-14', runDir: '/x', trends } as RadarRaw;
}

const 링크있음 = {
  name: '태산',
  kind: '사건',
  stage: 'now',
  scale: '큼',
  stage_why: 'views_sum 900000 ≥ 800000 · 확산 검증 계정 3개',
  direction_source: '급상승 7일 곡선',
  direction_value: 0.68,
  evidence: '태풍 관련 급상승',
  source: 'tiktok_ads_hashtags',
  views: 900000,
  publish_count: 653,
  spread: {
    posts: 5,
    authors: 3,
    platforms: ['tiktok', 'x'],
    links: [
      { platform: 'tiktok', url: 'https://www.tiktok.com/@a/video/1', author: '가', text: '본문', views: 1200 },
      { platform: 'x', url: 'https://x.com/b/status/2', author: '나', text: '', views: 0 },
    ],
  },
};

test('레이더: 내린 것과 구간 미정은 후보로 올리지 않는다', () => {
  const out = radarDiscovery.normalize(
    raw([
      링크있음,
      { name: '가을', kind: '미분류', stage: 'now', held: 'LLM 이 상시어로 표시' },
      { name: '구간없음', kind: '사건', stage: null },
      { name: '   ', kind: '사건', stage: 'down' },
    ]),
    ctx,
  );
  assert.deepEqual(out.map((c) => c.subject), ['태산']);
});

test('레이더: 유형이 산출 단위를 가른다 — 모습만 subject', () => {
  const out = radarDiscovery.normalize(
    raw([
      { ...링크있음, name: '모습것', kind: '모습' },
      { ...링크있음, name: '사건것', kind: '사건' },
      { ...링크있음, name: '미분류것', kind: '미분류' },
    ]),
    ctx,
  );
  assert.deepEqual(out.map((c) => c.unit), ['subject', 'topic', 'topic']);
});

test('레이더: 게시물 수를 계정 수로 쓰지 않는다', () => {
  // 확산 검증을 돌지 않은 후보. publish_count 가 682 여도 계정 수는 모르는 것이다.
  // 2026-09-17 근거 0건은 후보가 안 되므로(P3-1) 뉴스로 근거가 선 쪽을 쓴다.
  // 재는 것은 그대로다 — spread 가 null 일 때 accounts 를 게시물 수로 채우지 않는지.
  const out = radarDiscovery.normalize(raw([뉴스만]), ctx);
  assert.equal(out[0].momentum.accounts, null);
  assert.equal(out[0].momentum.extra?.게시물수, 682);

  const verified = radarDiscovery.normalize(raw([링크있음]), ctx);
  assert.equal(verified[0].momentum.accounts, 3);
});

test('레이더: 근거는 확산 검증 링크에서만 온다', () => {
  const out = radarDiscovery.normalize(raw([링크있음]), ctx);
  assert.equal(out[0].evidence.length, 2);
  assert.equal(out[0].evidence[0].url, 'https://www.tiktok.com/@a/video/1');
  // 본문이 없으면 계정명으로 제목을 세운다. 빈 제목을 내보내지 않는다.
  assert.equal(out[0].evidence[1].title, '나 게시물');

  // 확산 링크도 뉴스도 없으면 근거가 0건이고, 그런 것은 후보로 세우지 않는다 (P3-1).
  const none = radarDiscovery.normalize(raw([{ ...링크있음, spread: null }]), ctx);
  assert.equal(none.length, 0);
});

test('레이더: 근거 링크가 없으면 생성기까지 가지도 않는다', () => {
  /*
   * 2026-09-17 (P3-1) 전에는 후보가 만들어지고 생성기 게이트가 막았다. 이제 후보가
   * 아예 안 선다. 게이트가 틀려서가 아니라 — 게이트는 맞게 막고 있었다 — 채울 링크가
   * 없는 것을 보드에 올려 두는 것이 사람을 헛돌게 해서다.
   *
   * 게이트 자체는 여전히 산다. `tests/gate.test.ts` 가 evidence: [] 인 후보로 직접 본다.
   */
  const out = radarDiscovery.normalize(raw([{ ...링크있음, spread: null }]), ctx);
  assert.equal(out.length, 0, '근거가 없으면 후보가 되지 않는다');

  // 근거가 있는 쪽은 그대로 열린다.
  const [ok] = radarDiscovery.normalize(raw([링크있음]), ctx);
  assert.equal(cardnewsNativeProducer.gate(ok).ok, true);
  assert.equal(posterNativeProducer.gate(ok).ok, true);
});

test('레이더: 링크가 있으면 카드뉴스·포스터가 열린다', () => {
  const [c] = radarDiscovery.normalize(raw([링크있음]), ctx);
  assert.equal(c.unit, 'topic');
  assert.equal(cardnewsNativeProducer.gate(c).ok, true);
  assert.equal(posterNativeProducer.gate(c).ok, true);
  assert.ok(cardnewsNativeProducer.accepts.includes(c.unit));
});

test('레이더: 권리 판정을 안 돌린 모습 후보는 형상 제작이 막힌다', () => {
  const [c] = radarDiscovery.normalize(raw([{ ...링크있음, kind: '모습' }]), ctx);
  assert.equal(c.unit, 'subject');
  // 레이더 collect 경로는 권리 귀속을 판정하지 않는다. 없는 판정을 있는 척하지 않는다.
  assert.equal(c.rights.basis, 'none');
  // 주제 후보만 받는 포스터는 단위에서 먼저 걸린다.
  assert.equal(posterNativeProducer.accepts.includes(c.unit), false);
});

test('레이더: 근거가 얇으면 grounded 를 세우지 않는다', () => {
  const [thin] = radarDiscovery.normalize(
    raw([{ ...링크있음, spread: { ...링크있음.spread, authors: 1 } }]),
    ctx,
  );
  assert.equal(thin.grounded, false);

  const [ok] = radarDiscovery.normalize(raw([링크있음]), ctx);
  assert.equal(ok.grounded, true);
});

test('레이더: 회차는 파일에서 온다 — 후보 id 는 이름으로 고정', () => {
  const out = radarDiscovery.normalize(raw([링크있음]), ctx);
  assert.equal(out[0].origin.runId, 'live-2026-09-14');
  assert.equal(out[0].origin.discoveryId, 'radar');
  assert.equal(out[0].id, 'radar:태산');
});


/*
 * 뉴스 근거. 확산 검증은 건당 과금이라 회차마다 돌지 않지만 뉴스는 공짜라 늘 돈다 —
 * 그래서 evidence 의 하한선이 여기서 생기고, 막혀 있던 생성기 게이트가 열린다.
 */
const 뉴스만 = {
  name: '한동훈',
  kind: '사건',
  stage: 'now',
  scale: '큼',
  direction_source: '급상승 7일 곡선',
  evidence: '정치 인물 이슈에 반응',
  source: 'tiktok_ads_hashtags',
  publish_count: 682,
  spread: null,
  news: {
    sources: ['연합뉴스', '매일경제', '플래텀'],
    kinds: ['news', 'trade'],
    articles: 5,
    one_kind: false,
    why: "'한동훈' 을(를) 뉴스 3곳이 다뤘습니다 (연합뉴스 · 매일경제 · 플래텀). 가장 이른 기사: 발언 논란",
    links: [
      { source: '연합뉴스', title: '발언 논란', url: 'https://ex.com/1', posted_at: 1_800_000_000 },
      { source: '매일경제', title: '업계 반응', url: 'https://ex.com/2', posted_at: 0 },
    ],
    matched: true,
  },
};

test('레이더: 확산 검증이 없어도 뉴스 기사가 근거가 된다', () => {
  const [c] = radarDiscovery.normalize(raw([뉴스만]), ctx);
  assert.equal(c.evidence.length, 2);
  assert.equal(c.evidence[0].source, '연합뉴스');
  assert.equal(c.evidence[0].url, 'https://ex.com/1');
  // 날짜가 없는 기사는 날짜를 지어내지 않는다.
  assert.equal(c.evidence[1].note, undefined);
  // 여기가 요점이다 — 근거가 있으니 생성기 게이트가 열린다.
  assert.equal(cardnewsNativeProducer.gate(c).ok, true);
  assert.equal(posterNativeProducer.gate(c).ok, true);
});

test("레이더: '왜 지금'은 뉴스에서 온다", () => {
  const [c] = radarDiscovery.normalize(raw([뉴스만]), ctx);
  assert.match(c.why, /뉴스 3곳이 다뤘습니다/);
  // 뉴스가 없으면 분류 근거로 대신한다. 이유를 지어내지 않는다.
  const [noNews] = radarDiscovery.normalize(raw([링크있음]), ctx);
  assert.equal(noNews.why, '태풍 관련 급상승');
});

test('레이더: 한 종류 매체만 다룬 것은 교차 확인으로 치지 않는다', () => {
  const [c] = radarDiscovery.normalize(
    raw([{ ...뉴스만, news: { ...뉴스만.news, one_kind: true } }]),
    ctx,
  );
  assert.equal(c.evidence.length, 2);      // 근거는 근거다 — 게이트는 열린다
  assert.equal(c.grounded, false);         // 다만 '여럿이 말한다'로는 안 친다
});

test('레이더: 구간 키를 이 앱의 말로 옮긴다', () => {
  const [c] = radarDiscovery.normalize(raw([링크있음]), ctx);
  assert.equal(c.verdict, '한창 · 규모 큼');
  assert.equal(c.momentum.extra?.['구간'], '한창');
});


test('레이더: 기사 본문이 근거에 실려 생성기까지 간다', () => {
  const withBody = {
    ...뉴스만,
    news: {
      ...뉴스만.news,
      links: [
        { source: '연합뉴스', title: '발언 논란', summary: '(서울=연합뉴스) 김승원 후보자의 배우자가…',
          url: 'https://ex.com/1', posted_at: 1_800_000_000 },
      ],
    },
  };
  const [c] = radarDiscovery.normalize(raw([withBody]), ctx);
  assert.equal(c.evidence[0].excerpt, '(서울=연합뉴스) 김승원 후보자의 배우자가…');
  // 여기가 요점이다 — 원고를 쓰는 LLM 이 헤드라인 말고 본문을 본다.
  const material = cardnewsNativeProducer.mapInputs(c).material as string;
  assert.match(material, /김승원 후보자의 배우자가/);
});

test('레이더: 제목과 본문이 같으면 두 번 싣지 않는다', () => {
  const same = {
    ...뉴스만,
    news: { ...뉴스만.news, links: [{ source: '연합뉴스', title: '발언 논란', summary: '', url: 'https://ex.com/1', posted_at: 0 }] },
  };
  const [c] = radarDiscovery.normalize(raw([same]), ctx);
  assert.equal(c.evidence[0].excerpt, undefined);
});

test('레이더: 벤치마킹이 쓸 검색어를 넘긴다', () => {
  // 뉴스 주제는 이름이 긴 제목이라 그대로 유튜브에 넣으면 엉뚱한 게 걸린다.
  const [c] = radarDiscovery.normalize(
    raw([{ ...뉴스만, name: '김승원 인사청문회 의혹', search_keyword: '김승원' }]),
    ctx,
  );
  assert.equal(c.momentum.extra?.['검색어'], '김승원');

  // 검색어가 없으면 이름이 곧 검색어다. 빈 칸으로 두지 않는다.
  const [noKw] = radarDiscovery.normalize(raw([링크있음]), ctx);
  assert.equal(noKw.momentum.extra?.['검색어'], '태산');
});

test('레이더: 벤치마킹이 그 검색어를 실제로 집어 간다', () => {
  const [c] = radarDiscovery.normalize(
    raw([{ ...뉴스만, name: '김승원 인사청문회 의혹', search_keyword: '김승원' }]),
    ctx,
  );
  assert.equal(benchmarkNativeDiscovery.inputsFrom!(c).keyword, '김승원');
});


/*
 * 형상 프롬프트. 레이더가 '모습' 카드에만 권리 귀속까지 판정해 넘긴다.
 * 이 칸이 비어 있어서 이미지 생성기가 '채우는 경로가 없다'며 세워져 있었다.
 */
const 모습후보 = {
  name: '토토',
  kind: '모습',
  stage: 'now',
  scale: '큼',
  direction_source: '급상승 7일 곡선',
  source: 'tiktok_ads_hashtags',
  ownership: 'individual',
  creator: '@toto',
  profile: {
    features: '둥근 몸 · 파스텔',
    tone: '귀엽게',
    content_angle: '창작자 인터뷰',
    prompt_basis: 'source_grounded',
    image_prompt: 'pastel round body, simple line art',
    motion_prompt: 'slow wave',
    negative_prompt: 'text, watermark',
    visual_grounded: true,
  },
  spread: 링크있음.spread,
};

test('레이더: 형상 프롬프트가 이미지 생성기까지 간다', () => {
  const [c] = radarDiscovery.normalize(raw([모습후보]), ctx);
  assert.equal(c.unit, 'subject');
  assert.equal(c.hint.imagePrompt, 'pastel round body, simple line art');
  assert.equal(c.rights.basis, 'source_grounded');
  assert.equal(c.rights.ownership, 'individual');
  // 세워 두지 않았으니 이제 게이트가 판단한다.
  assert.equal(imageProducer.held, undefined);
  assert.equal(imageProducer.gate(c).ok, true);
});

test('레이더: 판정하지 않은 회차는 여전히 막는다', () => {
  // 없는 판정을 있는 척하지 않는다. 프로필이 없으면 none 이고 형상 생성기가 막는다.
  const [c] = radarDiscovery.normalize(raw([{ ...모습후보, profile: null, ownership: null }]), ctx);
  assert.equal(c.rights.basis, 'none');
  assert.equal(imageProducer.gate(c).ok, false);
});

test('레이더: 기업 것이면 레퍼런스를 강제로 물린다', () => {
  const [c] = radarDiscovery.normalize(
    raw([{
      ...모습후보,
      ownership: 'corporate',
      profile: { ...모습후보.profile, prompt_basis: 'reference_required', image_prompt: '', basis_why: '권리 귀속이 기업' },
    }]),
    ctx,
  );
  assert.equal(c.rights.basis, 'reference_required');
  assert.equal(c.hint.imagePrompt, undefined);
  // 막지는 않는다 — 대신 잠금 문구가 프롬프트 앞에 붙는다.
  assert.equal(imageProducer.gate(c).ok, true);
  const prompt = String(imageProducer.mapInputs(c).prompt);
  assert.match(prompt, /officially supplied reference image of 토토/);
});

/*
 * 근거 레코드 0건은 후보로 세우지 않는다 (지시서 P3-1, 2026-09-17).
 *
 * 라벨(kind)로 거르지 않는 것이 요점이다. 미분류는 증상이고 원인은 근거 부재다 —
 * 실측에서 미분류로 걸면 4건, 근거 0건으로 걸면 9건이었고 미분류는 그 안에 다 들어 있었다.
 */
test('근거 링크가 없으면 후보로 세우지 않는다', () => {
  const raw = {
    trends: [
      // 레이더가 준 게 해시태그 순위 한 줄뿐인 것. 댈 근거가 없다.
      { name: 'l을가져가', stage: 'now', kind: '미분류', publish_count: 699, direction_source: '급상승 7일 곡선' },
      // 라벨은 멀쩡한데 근거가 없는 것. 라벨 필터로는 안 걸린다.
      { name: 'hypic', stage: 'now', kind: '모습', publish_count: 400 },
      { name: '코드컵에서 나온 세계 1위의 레전드 플레이', stage: 'now', kind: '사건' },
      // 근거가 있는 것은 남는다.
      {
        name: '치이카와',
        stage: 'now',
        kind: '모습',
        spread: { authors: 3, links: [{ platform: 'tiktok', url: 'https://t.test/1', text: '본문' }] },
      },
    ],
  };
  const out = radarDiscovery.normalize(raw, { runId: 'r', runAt: '2026-09-17T00:00:00.000Z', mock: false });
  assert.deepEqual(out.map((c) => c.subject), ['치이카와']);
});

test('라벨이 미분류여도 근거가 있으면 남는다 — 거르는 기준은 근거다', () => {
  const raw = {
    trends: [
      {
        name: '지우',
        stage: 'now',
        kind: '미분류',
        spread: { authors: 2, links: [{ platform: 'x', url: 'https://x.test/9', text: '본문' }] },
      },
    ],
  };
  const out = radarDiscovery.normalize(raw, { runId: 'r', runAt: '2026-09-17T00:00:00.000Z', mock: false });
  assert.equal(out.length, 1);
  assert.equal(out[0].subject, '지우');
});

test('레이더: 같은 회차를 여러 번 읽었으면 마지막 것이 완성본이다', () => {
  /*
   * 레이더는 판정 도중에도 trends.json 을 덮어쓴다. 3100 이 한 회차를 세 번 읽으면
   * 중간 상태가 스냅샷으로 남는다. 다시 세울 때 세우기만 하고 내리지는 않으므로,
   * 중간에 한 번 올라온 후보가 완성본이 내려도 표에 남는다.
   *
   * 실제로 그랬다 — `MONSTA X 'MAGIC' Dance Practice` 가 01:12 에 올라왔다가
   * 01:14 에 "유튜브 인기 영상의 제목입니다"로 내려갔는데 표에는 남아 있었다.
   */
  assert.equal(radarDiscovery.snapshotKey!({ runId: 'run-20260915T094710', trends: [] }), 'run-20260915T094710');
  // 열쇠를 못 내면 null 이다. 그런 스냅샷은 각자 별개로 둔다 — 뭉뚱그리면 안 된다.
  assert.equal(radarDiscovery.snapshotKey!({ trends: [] }), null);
  assert.equal(radarDiscovery.snapshotKey!(null), null);
});
