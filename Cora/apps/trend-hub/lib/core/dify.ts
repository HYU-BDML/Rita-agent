/**
 * Dify 워크플로우 클라이언트.
 *
 * 잘 도는 Dify 워크플로우(카드뉴스 통합 v2 는 67노드다)를 지금 재구현할 이유가 없다.
 * 깨진 것만 옮기고, 없는 것(연결)을 만들고, 잘 도는 건 그대로 부른다.
 */

export interface DifyRunResult {
  outputs: Record<string, unknown>;
  status: string;
  elapsed?: number;
  raw: unknown;
}

export class DifyError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: string,
  ) {
    super(message);
    this.name = 'DifyError';
  }
}

const BASE = () => process.env.DIFY_BASE_URL?.replace(/\/+$/, '') || 'https://api.dify.ai/v1';

/** 앱별 API 키. Dify 는 앱마다 키를 따로 발급한다. */
export function apiKeyFor(env?: string): string | undefined {
  if (!env) return undefined;
  const v = process.env[env];
  return v && v.trim() ? v.trim() : undefined;
}

export async function runWorkflow(
  keyEnv: string,
  inputs: Record<string, unknown>,
  opts: { user?: string; timeoutMs?: number } = {},
): Promise<DifyRunResult> {
  const key = apiKeyFor(keyEnv);
  if (!key) throw new DifyError(`API 키가 없습니다 (${keyEnv}). .env.local 에 넣거나 목 모드로 도세요.`);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 300_000);
  try {
    const res = await fetch(`${BASE()}/workflows/run`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs,
        response_mode: 'blocking',
        user: opts.user ?? 'trend-hub',
      }),
      signal: ctrl.signal,
    });

    const text = await res.text();
    if (!res.ok) {
      throw new DifyError(`Dify 응답 ${res.status}`, res.status, text.slice(0, 500));
    }
    const json = JSON.parse(text) as {
      data?: { outputs?: Record<string, unknown>; status?: string; elapsed_time?: number };
    };
    const data = json.data ?? {};
    if (data.status && data.status !== 'succeeded') {
      throw new DifyError(`워크플로우 실패: ${data.status}`, res.status, text.slice(0, 500));
    }
    return {
      outputs: data.outputs ?? {},
      status: data.status ?? 'unknown',
      elapsed: data.elapsed_time,
      raw: json,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Dify 출력은 대부분 문자열에 담긴 JSON 이다 (변수 타입 제약 때문).
 * 코드펜스가 섞여 오는 경우도 있어 같이 벗긴다.
 */
export function parseJsonField<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === 'object') return value as T;
  if (typeof value !== 'string') return fallback;
  let s = value.trim();
  if (!s) return fallback;
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) s = fenced[1].trim();
  const start = s.search(/[[{]/);
  if (start > 0) s = s.slice(start);
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

/** Dify 는 숫자도 문자열로 준다. "12" 와 "" 와 undefined 를 구분해서 받는다. */
export function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function str(value: unknown): string {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value : String(value);
}
