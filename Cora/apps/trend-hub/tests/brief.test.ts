import { test } from 'node:test';
import assert from 'node:assert/strict';

import { toRecord, type PostRecord } from '../lib/core/post-record';
import { toBrief, toTopic } from '../lib/core/brief';
import type { Candidate } from '../lib/core/candidate';

/*
 * 계약 JSON(P1)과 게시물 레코드(P2).
 *
 * 여기서 지키려는 것은 하나다 — **나중에 붙일 것 때문에 상대가 코드를 고치지 않는 것.**
 * 그래서 "빈 칸을 어떻게 비우는가"를 테스트한다. url:"" 이 새어 나가면 상대는
 * 깨진 이미지를 그리고, 그걸 발견할 때쯤엔 이미 템플릿이 그 위에 얹혀 있다.
 */

const RUN = { runId: 'run-1', runAt: '2026-09-17T00:00:00.000Z', discoveryId: 'character-native' };

function candidate(over: Partial<Candidate> = {}): Candidate {
  return {
    id: 'character:치이카와',
    unit: 'subject',
    subject: '치이카와',
    verdict: '기업 IP — 라이선스 필요',
    why: '편의점 신상과 극장판이 동시에 확산',
    grounded: true,
    momentum: { views: 100, accounts: 3 },
    evidence: [{ source: 'tiktok', title: '제목', url: 'https://x.test/1' }],
    rights: { basis: 'reference_required', ownership: 'corporate' },
    hint: {},
    review: 'pending',
    lifecycle: 'active',
    origin: { discoveryId: 'character-native', runId: 'run-1', runAt: RUN.runAt },
    ...over,
  };
}

const post = {
  sourceId: 'tt:1',
  platform: 'tiktok',
  url: 'https://www.tiktok.com/@a/video/1',
  thumbnail: 'https://cdn.test/cover.jpeg',
  postedAt: '2026-09-15T00:00:00.000Z',
  authorName: '애플파이',
  authorId: 'xtcylsd777',
  views: 2513,
};

test('레코드: 수집이 준 값을 그대로 옮긴다', () => {
  const r = toRecord(post, 'character:치이카와', RUN);
  assert.ok(r);
  assert.equal(r.id, 'tt:1');
  assert.equal(r.thumbnailUrl, 'https://cdn.test/cover.jpeg');
  assert.equal(r.postedAt, '2026-09-15T00:00:00.000Z');
  assert.equal(r.views, 2513);
  assert.equal(r.candidateId, 'character:치이카와');
  assert.equal(r.runId, 'run-1');
});

test('레코드: url 이 없으면 레코드가 아니다', () => {
  assert.equal(toRecord({ ...post, url: '' }, 'c', RUN), null);
  assert.equal(toRecord({ ...post, sourceId: '' }, 'c', RUN), null);
});

test('레코드: 썸네일이 없으면 칸 자체를 만들지 않는다', () => {
  const r = toRecord({ ...post, thumbnail: '' }, 'c', RUN)!;
  assert.equal('thumbnailUrl' in r, false, 'thumbnailUrl:"" 이 새어 나가면 안 된다');
});

test('레코드: 조회수를 안 쟀으면 0 이 아니라 null 이다', () => {
  const r = toRecord({ ...post, views: undefined }, 'c', RUN)!;
  assert.equal(r.views, null);
});

test('계약: 썸네일이 있는 레코드만 images 가 된다', () => {
  const records: PostRecord[] = [
    toRecord(post, 'character:치이카와', RUN)!,
    toRecord({ ...post, sourceId: 'tt:2', url: 'https://t.test/2', thumbnail: '' }, 'character:치이카와', RUN)!,
  ];
  const t = toTopic(candidate(), records);
  assert.equal(t.images.length, 1, '썸네일 없는 레코드는 항목을 만들지 않는다');
  assert.equal(t.images[0].role, 'evidence');
  assert.equal(t.images[0].type, 'thumbnail');
  assert.equal(t.images[0].url, 'https://cdn.test/cover.jpeg');
  assert.equal(t.images[0].source_url, 'https://www.tiktok.com/@a/video/1');
});

test('계약: 생성 이미지는 키를 넣기 전까지 나오지 않는다', () => {
  const t = toTopic(candidate(), [toRecord(post, 'character:치이카와', RUN)!]);
  assert.equal(t.images.some((i) => i.role === 'material'), false);
  // 그리고 빈 url 로 자리를 잡아 두지도 않는다.
  assert.equal(t.images.every((i) => Boolean(i.url)), true);
});

test('계약: 근거 없는 후보는 내보내지 않는다', () => {
  const b = toBrief([candidate({ evidence: [] })], []);
  assert.equal(b.topics.length, 0);
  assert.match(b.note, /근거 있는 후보가 0건/);
});

test('계약: 3안을 억지로 채우지 않는다', () => {
  const b = toBrief([candidate()], []);
  assert.equal(b.topics.length, 1);
  assert.match(b.note, /억지로/);
});

test('계약: 권리는 차단이 아니라 표시다', () => {
  const b = toBrief([candidate()], []);
  assert.equal(b.topics.length, 1, 'corporate 라고 빼면 안 된다 — 교육 목적이다');
  assert.equal(b.topics[0].rights.ownership, 'corporate');
  assert.equal(b.topics[0].rights.reference_required, true);
});

test('계약: 남의 후보 레코드가 섞이지 않는다', () => {
  const mine = toRecord(post, 'character:치이카와', RUN)!;
  const other = toRecord({ ...post, sourceId: 'tt:9' }, 'character:리락쿠마', RUN)!;
  const b = toBrief([candidate()], [mine, other]);
  assert.equal(b.topics[0].images.length, 1);
});

test('계약: 목 데이터는 내보내지 않는다', () => {
  const mock = candidate({
    origin: { discoveryId: 'character-native', runId: 'r', runAt: RUN.runAt, mock: true },
  });
  assert.equal(toBrief([mock], []).topics.length, 0);
});

/* ── 참조 이미지 (지시서 4-3) ──────────────────────────────────────── */

test('참조: 플랫폼을 흩어 담는다 — 같은 계정 4장은 한 장과 다를 게 없다', async () => {
  const { referencesFor } = await import('../lib/core/reference');
  const mk = (id: string, platform: string, at: string): PostRecord =>
    toRecord(
      { ...post, sourceId: id, platform, url: `https://t.test/${id}`, postedAt: at },
      'character:치이카와',
      RUN,
    )!;
  const refs = referencesFor(candidate(), [
    mk('a1', 'youtube', '2026-09-17T00:00:00.000Z'),
    mk('a2', 'youtube', '2026-09-16T00:00:00.000Z'),
    mk('a3', 'youtube', '2026-09-15T00:00:00.000Z'),
    mk('b1', 'tiktok', '2026-09-10T00:00:00.000Z'),
  ]);
  assert.equal(refs.length, 4);
  // 유튜브만 3장 몰아 담지 않는다. 두 번째에 다른 플랫폼이 온다.
  assert.equal(refs[0].platform, 'youtube');
  assert.equal(refs[1].platform, 'tiktok');
});

test('참조: 썸네일 없는 레코드는 참조가 아니다', async () => {
  const { referencesFor } = await import('../lib/core/reference');
  const bare = toRecord({ ...post, thumbnail: '' }, 'character:치이카와', RUN)!;
  assert.deepEqual(referencesFor(candidate(), [bare]), []);
});

test('참조: 참조가 없으면 빈 배열이다 — 부르는 쪽이 생성을 건너뛴다', async () => {
  const { referencesFor, needsReference } = await import('../lib/core/reference');
  const c = candidate();
  assert.equal(needsReference(c), true, 'reference_required 는 참조를 물려야 한다');
  assert.deepEqual(referencesFor(c, []), []);
});

test('참조: 남의 후보 레코드를 물지 않는다', async () => {
  const { referencesFor } = await import('../lib/core/reference');
  const other = toRecord(post, 'character:리락쿠마', RUN)!;
  assert.deepEqual(referencesFor(candidate(), [other]), []);
});

test('레코드: 어느 판정기가 적었는지 남는다', () => {
  // 이게 없으면 재정규화가 후보 단위로 갈아엎으면서 남의 경로 레코드를 날린다.
  const r = toRecord(post, 'c', { runId: 'r', runAt: RUN.runAt, discoveryId: 'benchmark-native' })!;
  assert.equal(r.discoveryId, 'benchmark-native');
});

test('중복: 같은 게시물 id 는 하나만 남고, discoveryId 가 있는 쪽이 이긴다', async () => {
  // 25쌍이 실제로 이렇게 생겼다 — 백업에서 되살린 레코드에 discoveryId 가 없었고,
  // 재정규화가 "남의 판정기 것"으로 보고 남기는 사이 같은 게시물이 다시 들어왔다.
  const { dedupePosts } = await import('../lib/core/store');
  const fresh = toRecord(post, 'c', RUN)!;
  const legacy = { ...fresh, discoveryId: undefined as unknown as string };

  assert.deepEqual(dedupePosts([legacy, fresh]), [fresh], '옛 레코드가 새 것에 밀린다');
  assert.deepEqual(dedupePosts([fresh, legacy]), [fresh], '순서가 반대여도 같다');
  assert.equal(dedupePosts([legacy]).length, 1, '짝이 없으면 그대로 둔다');
});

/*
 * 넘길 물건에 판정 메모가 섞이지 않는 것 (2026-09-17).
 *
 * 로빈 카드 6장에 "독립 출처는 확인되지 않았습니다"가 박힌 적이 있다. summary 칸에
 * 판정기 메모가 들어앉아 있었고, 상대는 그게 본문인 줄 알고 템플릿에 꽂았다.
 */

test('계약: 판정 메모는 why_now 로 안 나간다 — 칸 자체가 없다', () => {
  const t = toTopic(candidate({ why: '최근 확산 원인을 단정할 독립 출처가 부족함' }));
  assert.equal('why_now' in t, false, '빈 문자열이 아니라 칸이 없어야 한다');
});

test('계약: why 가 비어도 칸을 만들지 않는다', () => {
  // 캐릭터 후보 27건 중 10건이 실제로 빈 문자열이다.
  assert.equal('why_now' in toTopic(candidate({ why: '' })), false);
});

test('계약: 멀쩡한 까닭은 그대로 나간다', () => {
  // grounded 로 가르면 안 된다 — 뉴스는 grounded:false 인데 why 가 멀쩡하다.
  const t = toTopic(candidate({ why: '교육부가 구제 414건 인정·354건 확정', grounded: false }));
  assert.equal(t.why_now, '교육부가 구제 414건 인정·354건 확정');
});

test('계약: why 가 summary 자리로 새지 않는다', () => {
  // 2026-09-18 본문 요약 경로가 붙었다. 그래도 why 를 summary 에 넣지 않는다 —
  // 그게 로빈 카드에 판정 메모가 박히던 경로다. 요약은 summaries.ts 만 채운다.
  assert.equal('summary' in toTopic(candidate({ why: '극장판 개봉·굿즈 전개가 확인된다' })), false);
});

test('계약: caveat 은 rights.note 하나로만 나간다', () => {
  const t = toTopic(
    candidate({
      grounded: false,
      rights: { basis: 'reference_required', ownership: 'corporate', note: '라이선스 확인이 필요합니다.' },
    }),
  );
  assert.equal('caveat' in t, false, '같은 문장을 두 칸에 싣지 않는다');
  assert.ok(t.rights.note, '경고 자체는 rights.note 에 남아 있어야 한다');
});

test('계약: toTopic 에 전체 레코드를 넘겨도 남의 썸네일이 안 섞인다', () => {
  // 부르는 쪽이 갈라 넘긴다는 전제가 시그니처에 안 드러나서 실제로 섞인 적이 있다.
  const mine = toRecord(post, 'character:치이카와', RUN)!;
  const other = toRecord({ ...post, sourceId: 'tt:9' }, 'character:로빈', RUN)!;
  const t = toTopic(candidate(), [mine, other]);
  assert.equal(t.images.length, 1);
  assert.equal(t.images[0].source_url, mine.url);
});
