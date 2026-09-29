/**
 * 카드뉴스 렌더 서버.
 *
 * 우리가 원고를 쓰고, 서버가 굽는다. 나누는 이유가 양쪽에 다 있다.
 *   우리만 하는 것 — 근거 수집·출처 대조·권리 게이트. 서버는 이걸 안 한다.
 *   서버만 하는 것 — 틀 8종 × 브랜드 스타일 37벌, 그리고 서버사이드 렌더.
 *
 * 서버사이드 렌더가 중요한 이유는 자동화다. 브라우저 CSS 시안은 사람이 탭을
 * 열어야 그려진다. 회차를 스케줄로 돌리려면 사람 없이 구워지는 곳이 필요하다.
 *
 * 서버가 자거나(무료 티어는 첫 요청에 20초쯤 걸린다) 죽어도 앱은 멈추지 않는다.
 * 브라우저 시안이 그대로 남아 있고, 굽기는 나중에 다시 눌러도 된다.
 */

export interface RenderHealth {
  ok: boolean;
  service: string;
  build: string;
  /** 배치 형식. explain_box · photo_copy … */
  templates: string[];
  /** 브랜드 겉모습. careet · gogumafarm · univ20 … */
  styles: string[];
}

export class RenderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'RenderError';
  }
}

export function renderBase(): string | undefined {
  const v = process.env.RENDER_BASE?.trim().replace(/\/+$/, '');
  return v || undefined;
}

export function hasRender(): boolean {
  return Boolean(renderBase());
}

/**
 * 서버가 무엇을 아는지 물어본다.
 *
 * 틀과 스타일 목록을 코드에 박아 두지 않는다. 서버가 늘리면 화면이 바로 따라가야 하고,
 * 박아 두면 서버에 없는 것을 고를 수 있게 되어 굽는 순간 실패한다.
 * 무료 티어는 자고 있다 깨느라 첫 요청이 오래 걸린다 — 그래서 넉넉히 기다린다.
 */
export async function health(timeoutMs = 60_000): Promise<RenderHealth> {
  const base = renderBase();
  if (!base) throw new RenderError('RENDER_BASE 가 없습니다. .env.local 에 넣으세요.');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/health`, { signal: ctrl.signal });
    const text = await res.text();
    if (!res.ok) throw new RenderError(`렌더 서버 응답 ${res.status}`, res.status);
    const j = JSON.parse(text) as {
      ok?: boolean;
      service?: string;
      빌드?: string;
      templates?: string[];
      styles?: string[];
    };
    return {
      ok: Boolean(j.ok),
      service: String(j.service ?? ''),
      build: String(j.빌드 ?? ''),
      templates: j.templates ?? [],
      styles: j.styles ?? [],
    };
  } catch (e) {
    if (e instanceof RenderError) throw e;
    if (e instanceof Error && e.name === 'AbortError') {
      throw new RenderError('렌더 서버가 시간 안에 답하지 않았습니다. 자고 있을 수 있습니다.');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/* ─────────────────────────── 이미지 만들기 ─────────────────────────── */

/**
 * 서버에 그림 조각을 올린다.
 *
 * 굽기 엔드포인트는 조각 번호를 못 알아듣는다. 올린 뒤 돌려주는 **절대 경로**만 먹는다
 * (`/data/out/_uploads/<번호>.jpg`). 번호·상대경로·file:// 는 전부 "사진이 없습니다"가 온다.
 * 실제로 넷을 다 넣어 보고 확인했다.
 */
export interface Piece {
  번호: string;
  /** 굽기에 넣어야 하는 값. 이것 말고는 안 받는다. */
  경로: string;
}

export async function uploadPiece(
  bytes: Uint8Array,
  name: string,
  type = 'image/jpeg',
  timeoutMs = 180_000,
): Promise<Piece> {
  const base = renderBase();
  if (!base) throw new RenderError('RENDER_BASE 가 없습니다.');

  const data = `data:${type};base64,${Buffer.from(bytes).toString('base64')}`;
  const j = await post<{ 조각번호?: string; 파일경로?: string }>(
    `${base}/실험/유경/조각/올리기`,
    { 올릴파일: { name, type, data } },
    timeoutMs,
  );
  if (!j.조각번호 || !j.파일경로) throw new RenderError('조각을 올렸는데 번호나 경로를 받지 못했습니다.');
  return { 번호: j.조각번호, 경로: j.파일경로 };
}

/** `GET /image/타이틀` 이 알려 주는 선택지. 코드에 박지 않고 서버에서 받는다. */
export interface TitleOptions {
  자리?: '아래' | '가운데' | '위';
  정렬?: '왼쪽' | '가운데';
  글자크기?: '작게' | '보통' | '크게' | '아주 크게';
  /** 우리가 손으로 짜던 scrim 이 서버에는 이 이름으로 있다. */
  사진어둡게?: '없음' | '조금' | '많이' | '아래쪽만';
  강조색?: string;
}

/**
 * 사진 위에 제목을 얹어 표지를 만든다 — 우리 포스터가 정확히 이것이다.
 * 제목을 별표로 감싼 곳이 강조색으로 나온다.
 */
export async function renderTitle(
  input: { 사진경로: string; 제목: string; 부제?: string } & TitleOptions,
  timeoutMs = 180_000,
): Promise<{ 번호: string; 쓴것: Record<string, unknown> }> {
  const base = renderBase();
  if (!base) throw new RenderError('RENDER_BASE 가 없습니다.');
  const { 사진경로, ...rest } = input;
  const j = await post<{ 조각번호?: string; 쓴것?: Record<string, unknown> }>(
    `${base}/image/타이틀`,
    { 사진: 사진경로, ...rest },
    timeoutMs,
  );
  if (!j.조각번호) throw new RenderError('구웠는데 조각 번호를 받지 못했습니다.');
  return { 번호: j.조각번호, 쓴것: j.쓴것 ?? {} };
}

/**
 * 구운 조각을 사람이 볼 수 있는 곳.
 *
 * 그림 자체를 주는 `/piece/<번호>` 는 지금 404 다 — 옛 조각도 마찬가지라 서버 쪽 문제다.
 * 그래서 그림 주소가 아니라 손질 화면 주소를 돌려준다. `/piece/` 가 고쳐지면
 * 그 화면의 그림이 저절로 뜬다. 우리 쪽은 고칠 것이 없다.
 */
export function pieceUrl(번호: string): string | undefined {
  const base = renderBase();
  return base ? `${base}/손질판/조각/${번호}` : undefined;
}

async function post<T>(url: string, body: unknown, timeoutMs: number): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new RenderError(`렌더 서버 응답 ${res.status}`, res.status);
    const j = JSON.parse(text) as { ok?: boolean; error?: string } & T;
    // 이 서버는 실패도 200 으로 준다. ok 를 봐야 한다.
    if (j.ok === false) throw new RenderError(j.error || '렌더 서버가 거절했습니다.');
    return j;
  } catch (e) {
    if (e instanceof RenderError) throw e;
    if (e instanceof Error && e.name === 'AbortError') {
      throw new RenderError('렌더 서버가 시간 안에 답하지 않았습니다.');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/* ─────────────────────────── 카드뉴스 굽기 ─────────────────────────── */

/**
 * 덱을 통째로 보내 카드 한 벌을 굽는다.
 *
 * 경로와 본문 모양은 Dify 「카드뉴스 만들기 (등록 디자인 연동)」 워크플로우의
 * weave 노드에서 그대로 읽었다 — `return {"path": "/render", "body": json.dumps(payload)}`.
 * 빈 본문으로 찔러 확인도 했다: `{"ok": false, "error": "deck.slides 가 비어 있습니다."}`
 */
export async function renderDeck(
  payload: unknown,
  timeoutMs = 300_000,
): Promise<Record<string, unknown>> {
  const base = renderBase();
  if (!base) throw new RenderError('RENDER_BASE 가 없습니다.');
  return post<Record<string, unknown>>(`${base}/render`, payload, timeoutMs);
}

/** 등록된 겉모습 한 벌을 읽는다. 워크플로우의 '등록된 디자인 읽기' 노드와 같다. */
export async function readDesign(sid: string, timeoutMs = 90_000): Promise<Record<string, unknown>> {
  const base = renderBase();
  if (!base) throw new RenderError('RENDER_BASE 가 없습니다.');
  return post<Record<string, unknown>>(
    `${base}/실험/유경/디자인/읽기`,
    { 동작: '디자인읽기', sid },
    timeoutMs,
  );
}

/**
 * /health 를 캐시해 둔다.
 *
 * 후보 화면을 열 때마다 물으면 서버가 자고 있을 때 20초씩 붙잡힌다.
 * 틀·겉모습 목록은 자주 바뀌지 않으니 10분이면 충분하다.
 * 못 받으면 undefined 를 돌려준다 — 화면이 죽지 않고 목록만 비게 두려고.
 */
let 캐시: { at: number; value: RenderHealth } | undefined;

export async function cachedHealth(maxAgeMs = 600_000): Promise<RenderHealth | undefined> {
  if (!hasRender()) return undefined;
  if (캐시 && Date.now() - 캐시.at < maxAgeMs) return 캐시.value;
  try {
    const v = await health(20_000);
    캐시 = { at: Date.now(), value: v };
    return v;
  } catch {
    // 자고 있거나 죽었다. 이전에 받아 둔 것이 있으면 그거라도 쓴다.
    return 캐시?.value;
  }
}
