import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Candidate, CandidateLifecycle, CandidateTracking, ReviewState } from './candidate';
import type { Product } from './adapters';
import type { PostRecord } from './post-record';
import { keepTracked } from './tracking';
import { sweep, type RetireRule } from './retire';

/**
 * 파일 기반 저장소. 내부 도구라 DB 붙이는 마찰을 미룬다.
 * 인터페이스는 DB 로 갈아끼울 수 있게 좁게 유지한다.
 *
 * 시트(Apps Script)로 이력을 굴리던 걸 여기로 가져오는 게 요점이다.
 * delta.py 7.3KB 중 상당수가 시트 행 파싱이었는데, 그건 전부 사라진다.
 */

const DIR = path.join(process.cwd(), 'data');

interface Db {
  candidates: Candidate[];
  products: Product[];
  runs: { id: string; discoveryId: string; at: string; input: Record<string, string>; count: number; trigger?: 'manual' | 'automatic' }[];
  schedule?: CollectionSchedule;
  /** 정규화 규칙을 고친 뒤 다시 돌리려고 원본을 남긴다. */
  snapshots: { runId: string; discoveryId: string; at: string; raw: unknown }[];
  /** 게시물·영상 레코드 (지시서 P2). 후보로 요약되기 전의 낱개다. */
  posts: PostRecord[];
}

const EMPTY: Db = { candidates: [], products: [], runs: [], snapshots: [], posts: [] };

export interface CollectionSchedule {
  enabled: boolean;
  /** 안 뜨는 후보를 내리는 규칙 (`lib/core/retire.ts`). 축마다 소재가 죽는 속도가 달라 화면에서 고친다. */
  retire?: RetireRule;
  /**
   * 판정기별 하루 상한 (`discoveryId` → 횟수). 화면에서 고칠 수 있게 여기 둔다.
   *
   * 환경변수로만 두면 배포를 다시 해야 바뀐다. 돈이 걸린 값이라 **쓰는 사람이 그 자리에서
   * 조일 수 있어야** 한다. 비어 있는 판정기는 env, 그다음 기본값을 쓴다 (lib/core/run-limit.ts).
   */
  limits?: Record<string, number>;
  /** 판정기를 가리지 않은 하루 천장. 비면 env·기본값. */
  totalLimit?: number;
  newsTime: string;
  socialDays: number[];
  socialTime: string;
  newsDays: number[];
  characterDays: number[];
  characterTime: string;
  memeDays: number[];
  memeTime: string;
}

export const DEFAULT_COLLECTION_SCHEDULE: CollectionSchedule = {
  enabled: true,
  newsTime: '08:00',
  socialDays: [2, 5],
  newsDays: [1, 2, 3, 4, 5, 6, 0],
  socialTime: '20:30',
  characterDays: [2, 5],
  characterTime: '20:30',
  memeDays: [2, 5],
  memeTime: '20:30',
};

let cache: { mtimeMs: number; size: number; db: Db } | null = null;
export function dropCache(): void { cache = null; }

/** 데이터가 바뀌었는지 가리는 표. 파일이 그대로면 값도 그대로다. */
export async function version(): Promise<string> {
  try {
    const st = await fs.stat(path.join(DIR, 'db.json'));
    return `${st.mtimeMs}:${st.size}`;
  } catch {
    return '0';
  }
}

async function read(): Promise<Db> {
  const file = path.join(DIR, 'db.json');
  try {
    const st = await fs.stat(file);
    if (cache && cache.mtimeMs === st.mtimeMs && cache.size === st.size) return cache.db;
    const buf = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(buf) as Partial<Db>;
    const db = {
      ...EMPTY,
      ...parsed,
      candidates: (parsed.candidates ?? []).map((candidate) => ({
        ...candidate,
        lifecycle: candidate.lifecycle ?? 'active',
      })),
    };
    cache = { mtimeMs: st.mtimeMs, size: st.size, db };
    return db;
  } catch {
    return { ...EMPTY };
  }
}

/**
 * 게시물은 id 하나에 레코드 하나다. 쓰기 직전에 한 번 더 조인다.
 *
 * 왜 저장 쪽이냐. 중복을 만드는 경로가 백업 복원 하나가 아니다. `renormalize` 는 "남의
 * 판정기가 적은 것"을 남기는데(`p.discoveryId !== discoveryId`), **discoveryId 가 빈**
 * 옛 레코드는 어느 판정기 것도 아니어서 그 조건에 늘 걸려 살아남는다. 그 사이 같은
 * 게시물이 `fresh` 로 다시 들어오면 같은 id 가 둘이 된다. 실제로 25쌍이 그렇게 생겼다 —
 * 백업에서 되살린 레코드에 discoveryId 칸이 없었고, 그 뒤 character-native 를 다시
 * 세우자 짝이 생겼다. 근거를 두 번 세는 자리라 뒤따르는 판단이 전부 오염된다.
 *
 * 부르는 쪽마다 막으면 다음 경로에서 또 뚫린다(복원·수기 편집·병합). 저장의 불변식으로 둔다.
 *
 * 남기는 쪽: **discoveryId 가 있는 것**이 이긴다. 둘 다 있으면 나중 것 — 재정규화가 새로
 * 세운 레코드가 배열 뒤에 온다. 짝이 없는 옛 레코드는 그대로 둔다. 버릴 이유가 없다.
 */
export function dedupePosts(posts: PostRecord[]): PostRecord[] {
  const at = new Map<string, number>();
  const out: PostRecord[] = [];
  for (const p of posts) {
    const i = at.get(p.id);
    if (i === undefined) {
      at.set(p.id, out.length);
      out.push(p);
    } else if (p.discoveryId || !out[i].discoveryId) {
      out[i] = p;
    }
  }
  return out;
}

async function write(db: Db): Promise<void> {
  db.posts = dedupePosts(db.posts);
  cache = null;
  await fs.mkdir(DIR, { recursive: true });
  const tmp = path.join(DIR, `db.json.${process.pid}.tmp`);
  await fs.writeFile(tmp, JSON.stringify(db, null, 2), 'utf8');
  await fs.rename(tmp, path.join(DIR, 'db.json'));
}

/** 쓰기 직렬화. 여러 요청이 동시에 저장해도 마지막 것만 남지 않게. */
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => undefined);
  return next;
}

export async function listCandidates(options?: { lifecycle?: CandidateLifecycle }): Promise<Candidate[]> {
  const db = await read();
  return [...db.candidates]
    .filter((candidate) => !options?.lifecycle || candidate.lifecycle === options.lifecycle)
    .sort((a, b) => b.origin.runAt.localeCompare(a.origin.runAt));
}

export async function getCandidate(id: string): Promise<Candidate | undefined> {
  return (await read()).candidates.find((c) => c.id === id);
}

/**
 * 같은 대상이 회차마다 다시 나오면 새 행으로 쌓지 않고 갱신한다.
 * 대신 추이를 쓸 수 있게 회차 기록은 runs 에 남는다.
 */
export async function upsertCandidates(
  cands: Candidate[],
  run: { id: string; discoveryId: string; at: string; input: Record<string, string>; trigger?: 'manual' | 'automatic' },
  raw?: unknown,
  records?: PostRecord[],
): Promise<{ added: number; updated: number }> {
  return serial(async () => {
    const db = await read();
    let added = 0;
    let updated = 0;
    for (const c of cands) {
      const i = db.candidates.findIndex(
        (x) => x.origin.discoveryId === c.origin.discoveryId && key(x.subject) === key(c.subject),
      );
      if (i >= 0) {
        // 사람이 내린 판단은 새 회차가 덮어쓰지 않는다.
        // 추적 설정도 사람이 건 것이다 — 고쳐 둔 query 와 마지막 확인 시각이 여기서 날아가면
        // 다음 추적 회차가 후보 제목으로 되돌아가 조용히 다른 것을 쫓는다.
        const prev = db.candidates[i];
        /*
         * 내려갔던 것이 다시 잡혔다. 되살린다 — 관측 이력은 스냅샷에 있으므로 점까지
         * 그대로 이어진다(`allTrends`). 한 번 식었다가 다시 오르는 것은 드물어서 새로 뜬
         * 것보다 신호가 세다. 그래서 날짜를 적어 화면에 표시한다.
         */
        const revived = prev.lifecycle === 'retired';
        db.candidates[i] = {
          ...c,
          id: prev.id,
          review: prev.review,
          reviewNote: prev.reviewNote,
          lifecycle: revived ? 'active' : prev.lifecycle ?? 'active',
          tracking: prev.tracking ?? c.tracking,
          misses: 0,
          ...(revived ? { revivedAt: run.at } : prev.revivedAt ? { revivedAt: prev.revivedAt } : {}),
        };
        updated += 1;
      } else {
        db.candidates.push(c);
        added += 1;
      }
    }
    db.runs.push({ ...run, count: cands.length });

    /*
     * 회차가 끝났으니 이 판정기의 후보를 훑어 안 뜨는 것을 내린다 (`lib/core/retire.ts`).
     * 여기서 하는 이유는 **무엇이 잡혔는지 아는 유일한 자리**여서다. 밖에서 나중에 돌리면
     * '이번에 안 잡혔다'를 다시 알아내야 한다.
     */
    const swept = sweep(db.candidates, {
      discoveryId: run.discoveryId,
      seen: new Set(cands.map((c) => c.id)),
      at: run.at,
      rule: db.schedule?.retire,
    });
    if (swept.changed.length) {
      const at = new Map(db.candidates.map((c, idx) => [c.id, idx]));
      for (const c of swept.changed) {
        const idx = at.get(c.id);
        if (idx !== undefined) db.candidates[idx] = c;
      }
    }
    if (records?.length) {
      // 같은 게시물이 회차를 넘어 다시 잡히면 최신 것으로 갈아 끼운다.
      // 회차마다 쌓으면 같은 영상이 시간축에서 여러 점으로 찍힌다.
      const at = new Map(db.posts.map((p, i) => [p.id, i]));
      for (const r of records) {
        const i = at.get(r.id);
        if (i === undefined) {
          at.set(r.id, db.posts.length);
          db.posts.push(r);
        } else {
          db.posts[i] = r;
        }
      }
    }
    if (raw !== undefined) {
      db.snapshots.push({ runId: run.id, discoveryId: run.discoveryId, at: run.at, raw });
    }
    await write(db);
    return { added, updated };
  });
}

/**
 * 저장된 원본에 지금 규칙을 다시 돌린다. API 는 한 번도 부르지 않는다.
 *
 * 이게 스냅샷을 남겨 둔 이유다 — 판정 규칙을 고쳤을 때 수집도 LLM 도 다시 부르지 않고
 * 표만 갱신할 수 있어야 한다. 지금까지는 CLI 스크립트로만 됐다.
 *
 * 회차 하나만 다시 돌리면 안 된다. 그러면 옛 규칙으로 들어온 다른 회차의 후보가 남는다.
 * 그래서 그 판정기의 원본을 오래된 것부터 전부 다시 돌려 표를 새로 세운다.
 * 사람이 내린 판단(채택·기각·메모)은 이름으로 물려받는다.
 */
export async function renormalize(
  discoveryId: string,
  normalize: (raw: unknown, ctx: { runId: string; runAt: string; mock: boolean }) => Candidate[],
  /**
   * 게시물 레코드도 같이 다시 세운다 (지시서 P2). 선택이다 — 안 주면 posts 는 그대로 둔다.
   * 이게 있어서 **이미 쌓인 회차에 소급 적재**가 된다. 수집을 다시 하지 않는다.
   */
  records?: (
    raw: unknown,
    ctx: { runId: string; runAt: string; mock: boolean },
    candidates: Candidate[],
  ) => PostRecord[],
  /** 같은 회차를 여러 번 읽은 스냅샷을 가려낸다. 같은 값이면 마지막 것만 쓴다. */
  snapshotKey?: (raw: unknown) => string | null,
): Promise<{ before: number; after: number; orphanedProducts: number; posts: number }> {
  return serial(async () => {
    const db = await read();
    let snaps = db.snapshots
      .filter((s) => s.discoveryId === discoveryId)
      .sort((a, b) => a.at.localeCompare(b.at));

    if (snapshotKey) {
      // 같은 회차를 여러 번 읽었으면 마지막 것만 쓴다. 앞의 것은 판정 중이던 중간 상태다.
      // 열쇠를 못 내는 스냅샷(null)은 각자 별개로 둔다 — 뭉뚱그려 하나로 치면 안 된다.
      const last = new Map<string, (typeof snaps)[number]>();
      const keyless: typeof snaps = [];
      for (const s of snaps) {
        const k = snapshotKey(s.raw);
        if (k) last.set(k, s);
        else keyless.push(s);
      }
      snaps = [...keyless, ...last.values()].sort((a, b) => a.at.localeCompare(b.at));
    }

    const mine = db.candidates.filter((c) => c.origin.discoveryId === discoveryId);
    const judged = new Map(mine.map((c) => [key(c.subject), c]));

    // 회차 순서대로 덮어써서 원래 upsert 와 같은 결과가 나오게 한다.
    const rebuilt = new Map<string, Candidate>();
    const rebuiltPosts = new Map<string, PostRecord>();
    for (const s of snaps) {
      let fresh: Candidate[];
      const ctx = { runId: s.runId, runAt: s.at, mock: false };
      try {
        fresh = normalize(s.raw, ctx);
      } catch {
        continue; // 못 읽는 옛 원본이 있으면 그 회차만 건너뛴다
      }
      if (records) {
        // 후보가 실패해도 레코드까지 같이 죽이지 않는다. 시간축은 남는 게 낫다.
        try {
          for (const r of records(s.raw, ctx, fresh)) rebuiltPosts.set(r.id, r);
        } catch {
          /* 이 회차의 레코드만 건너뛴다 */
        }
      }
      for (const c of fresh) {
        const prev = judged.get(key(c.subject));
        rebuilt.set(key(c.subject), prev
          ? {
              ...c,
              id: prev.id,
              review: prev.review,
              reviewNote: prev.reviewNote,
              lifecycle: prev.lifecycle ?? 'active',
              tracking: prev.tracking ?? c.tracking,
              // 수집 근거는 새로 세운 것을 쓰고, 추적이 모아 온 것만 되붙인다.
              evidence: keepTracked(c.evidence, prev.evidence),
            }
          : c);
      }
    }

    const kept = [...rebuilt.values()];
    const keptIds = new Set(kept.map((c) => c.id));
    // 사라진 후보에 붙어 있던 제작물은 갈 곳이 없어진다. 지우지는 않고 몇 개인지 알린다.
    const orphanedProducts = db.products.filter(
      (p) => mine.some((c) => c.id === p.candidateId) && !keptIds.has(p.candidateId),
    ).length;

    db.candidates = [...db.candidates.filter((c) => c.origin.discoveryId !== discoveryId), ...kept];

    let posts = 0;
    if (records) {
      /*
       * **이 판정기가 적은 레코드만** 갈아 끼운다. 후보 단위로 갈아엎으면 안 된다 —
       * 한 후보에 여러 경로가 레코드를 붙이기 때문이다(캐릭터 발굴 TikHub + 본보기 찾기
       * YouTube). 실제로 그렇게 했다가 attach 로 들어온 YouTube 40건을 날렸다.
       *
       * 후보가 사라진 레코드는 갈 곳이 없으므로 함께 내린다. 남의 판정기 것이어도 그렇다.
       */
      const alive = new Set(db.candidates.map((c) => c.id));
      const fresh = [...rebuiltPosts.values()];
      const others = db.posts.filter((p) => p.discoveryId !== discoveryId && alive.has(p.candidateId));
      db.posts = [...others, ...fresh.filter((p) => alive.has(p.candidateId))];
      posts = db.posts.length - others.length;
    }

    await write(db);
    return { before: mine.length, after: kept.length, orphanedProducts, posts };
  });
}

export async function setReview(id: string, review: ReviewState, note?: string): Promise<void> {
  await serial(async () => {
    const db = await read();
    const c = db.candidates.find((x) => x.id === id);
    if (!c) return;
    c.review = review;
    if (note !== undefined) c.reviewNote = note;
    await write(db);
  });
}

/** 검토 결과는 유지한 채 현재 후보 목록에서 보관하거나 다시 활성화한다. */
export async function setCandidateLifecycle(id: string, lifecycle: CandidateLifecycle): Promise<void> {
  await serial(async () => {
    const db = await read();
    const candidate = db.candidates.find((x) => x.id === id);
    if (!candidate) return;
    candidate.lifecycle = lifecycle;
    if (lifecycle === 'archived') {
      candidate.tracking = {
        ...candidate.tracking,
        enabled: true,
        queries: candidate.tracking?.queries?.length ? candidate.tracking.queries : [candidate.subject],
      };
    } else if (candidate.tracking) {
      /*
       * 되돌리면 화면은 '추적 중지'라고 말한다. 저장값도 그렇게 적는다 —
       * 지금은 추적 회차가 archived 만 보므로 enabled 를 켠 채 둬도 결과는 같지만,
       * 말과 값이 어긋난 채로 두면 다음에 이 둘을 갈라놓을 때 거짓말이 남는다.
       * query 는 지운다고 좋을 게 없으니 그대로 둔다. 다시 켜면 쓰던 것을 쓴다.
       */
      candidate.tracking = { ...candidate.tracking, enabled: false };
    }
    await write(db);
  });
}

export async function archiveCandidate(id: string): Promise<void> {
  return setCandidateLifecycle(id, 'archived');
}

export async function restoreCandidate(id: string): Promise<void> {
  return setCandidateLifecycle(id, 'active');
}

export async function collectionSchedule(): Promise<CollectionSchedule> {
  const schedule = (await read()).schedule;
  return {
    ...DEFAULT_COLLECTION_SCHEDULE,
    ...schedule,
    newsDays: schedule?.newsDays ?? DEFAULT_COLLECTION_SCHEDULE.newsDays,
    socialDays: schedule?.socialDays ?? DEFAULT_COLLECTION_SCHEDULE.socialDays,
    characterDays: schedule?.characterDays ?? schedule?.socialDays ?? DEFAULT_COLLECTION_SCHEDULE.characterDays,
    characterTime: schedule?.characterTime ?? schedule?.socialTime ?? DEFAULT_COLLECTION_SCHEDULE.characterTime,
    memeDays: schedule?.memeDays ?? schedule?.socialDays ?? DEFAULT_COLLECTION_SCHEDULE.memeDays,
    memeTime: schedule?.memeTime ?? schedule?.socialTime ?? DEFAULT_COLLECTION_SCHEDULE.memeTime,
  };
}

export async function setCollectionSchedule(schedule: CollectionSchedule): Promise<void> {
  await serial(async () => {
    const db = await read();
    db.schedule = schedule;
    await write(db);
  });
}

export async function setCandidateTracking(id: string, tracking: CandidateTracking): Promise<void> {
  await serial(async () => {
    const db = await read();
    const candidate = db.candidates.find((x) => x.id === id);
    if (!candidate) return;
    candidate.tracking = tracking;
    await write(db);
  });
}

export async function patchCandidate(id: string, patch: Partial<Candidate>): Promise<void> {
  await serial(async () => {
    const db = await read();
    const i = db.candidates.findIndex((x) => x.id === id);
    if (i < 0) return;
    db.candidates[i] = { ...db.candidates[i], ...patch, id };
    await write(db);
  });
}

export async function addProduct(p: Product): Promise<void> {
  await serial(async () => {
    const db = await read();
    db.products.push(p);
    await write(db);
  });
}

export async function productsFor(candidateId: string): Promise<Product[]> {
  return (await read()).products.filter((p) => p.candidateId === candidateId);
}

/** 후보별 제작물 수. 목록 화면에서 '채택했는데 아직 안 만든 것'을 가려내는 데 쓴다. */
export async function productCounts(): Promise<Map<string, number>> {
  const m = new Map<string, number>();
  for (const p of (await read()).products) {
    m.set(p.candidateId, (m.get(p.candidateId) ?? 0) + 1);
  }
  return m;
}

export async function listRuns() {
  return [...(await read()).runs].sort((a, b) => b.at.localeCompare(a.at));
}

/** 오래된 것부터. 추이를 만들 때 시간 순서가 필요하다. */
export async function listSnapshots() {
  return [...(await read()).snapshots].sort((a, b) => a.at.localeCompare(b.at));
}

/**
 * 저장된 스냅샷의 원본에 칸을 덧댄다. **덮어쓰지 않고 합친다.**
 *
 * 수집을 다시 하지 않고 나중에 생긴 경로(본문 요약 등)를 옛 회차에 소급해 넣는 자리다.
 * 이게 있어서 `PostRecord` 에 본문 칸을 새로 만들지 않아도 된다 — 본문은 이미
 * `raw.posts[].text` 에 있고, 여기에 요약만 얹으면 `renormalize` 가 알아서 읽는다.
 *
 * 원본을 통째로 갈지 않는 이유는 하나다. 스냅샷은 그 회차에 실제로 받은 것이고,
 * 그걸 잃으면 규칙을 고쳐 다시 세우는 길이 함께 사라진다.
 */
export async function patchSnapshotRaw(
  runId: string,
  patch: Record<string, unknown>,
): Promise<boolean> {
  return serial(async () => {
    const db = await read();
    const i = db.snapshots.findIndex((s) => s.runId === runId);
    if (i < 0) return false;
    const raw = db.snapshots[i].raw;
    if (!raw || typeof raw !== 'object') return false;
    db.snapshots[i] = { ...db.snapshots[i], raw: { ...(raw as object), ...patch } };
    await write(db);
    return true;
  });
}

/** 이름 대조 키. verify.py 의 compact() 와 같은 생각 — 표기 흔들림을 지운다. */
export function key(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

/* ── 게시물 레코드 (지시서 P2) ────────────────────────────────────── */

/**
 * 레코드만 적재한다. 후보를 낳지 않는 부착기(벤치마크·YouTube)가 쓰는 입구다.
 * upsertCandidates 와 같은 규칙으로 갈아 끼운다 — 같은 게시물을 회차마다 쌓지 않는다.
 */
export async function upsertPosts(records: PostRecord[]): Promise<number> {
  if (!records.length) return 0;
  return serial(async () => {
    const db = await read();
    const at = new Map(db.posts.map((p, i) => [p.id, i]));
    for (const r of records) {
      const i = at.get(r.id);
      if (i === undefined) {
        at.set(r.id, db.posts.length);
        db.posts.push(r);
      } else {
        db.posts[i] = r;
      }
    }
    await write(db);
    return records.length;
  });
}

export async function listPosts(): Promise<PostRecord[]> {
  return (await read()).posts;
}

/** 한 후보의 근거가 된 게시물들. 최신 게시물부터. 날짜를 모르는 건 뒤로 민다. */
export async function postsFor(candidateId: string): Promise<PostRecord[]> {
  const all = await listPosts();
  return all
    .filter((p) => p.candidateId === candidateId)
    .sort((a, b) => (b.postedAt ?? '').localeCompare(a.postedAt ?? ''));
}
