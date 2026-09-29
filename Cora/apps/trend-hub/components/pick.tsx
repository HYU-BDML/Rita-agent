'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/**
 * 담기 — 사람이 고른 것을 모아 두는 바구니.
 *
 * **`review: 'adopted'` 를 쓰지 않는다.** 그 칸은 "만들기로 정했다"는 판단이고
 * 기각·보류와 한 벌이다. 담기는 그보다 가벼운 행동이다 — 여러 개를 골라 카드뉴스
 * 쪽에 한 번에 넘기려는 작업 바구니다. 둘을 한 칸에 넣으면 담았다가 뺀 것이
 * '기각'과 구분이 안 된다.
 *
 * **브라우저에 둔다.** 서버(db.json)에 두지 않는 이유가 둘이다 —
 *   1. Render 디스크는 재배포 때 비워진다. 보관함이 말없이 사라지는 것이 제일 나쁘다
 *   2. 담기는 그 사람의 작업 상태지 팀이 함께 보는 판단이 아니다.
 *      채택·기각은 db.json 에 남고 다음 회차까지 이어진다 — 그건 그대로 둔다
 *
 * 값은 **id 만** 담는다. 이름·썸네일까지 넣어 두면 회차가 돌아 내용이 바뀌었을 때
 * 보관함만 옛 값을 보여 준다. 화면에 뿌릴 것은 그때 서버가 준 것으로 맞춘다.
 */

const KEY = 'trendhub.pick.v1';

interface PickCtx {
  ids: string[];
  has: (id: string) => boolean;
  toggle: (id: string) => void;
  remove: (id: string) => void;
  clear: () => void;
  /**
   * localStorage 를 읽었나.
   *
   * 서버는 이 값을 모르므로 첫 그림은 반드시 '안 담김'으로 그려야 한다. 담긴 채로
   * 그리면 서버 HTML 과 어긋나 hydration 이 깨진다. 읽고 나서 다시 그린다.
   */
  ready: boolean;
}

const Ctx = createContext<PickCtx | null>(null);

export function PickProvider({ children }: { children: React.ReactNode }) {
  const [ids, setIds] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) setIds(parsed.filter((x): x is string => typeof x === 'string'));
    } catch {
      // 사생활 보호 창이나 저장 공간이 막힌 경우. 담기는 그 세션 안에서만 돌면 된다.
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(ids));
    } catch {
      /* 위와 같다 */
    }
  }, [ids, ready]);

  /*
   * 다른 탭에서 담은 것도 따라온다. 목록을 한 탭, 보관함을 다른 탭에 띄워 두는 것이
   * 자연스러운 쓰임인데, 그때 두 탭의 수가 어긋나면 어느 쪽이 맞는지 알 수 없다.
   */
  useEffect(() => {
    const on = (e: StorageEvent) => {
      if (e.key !== KEY) return;
      try {
        const parsed: unknown = e.newValue ? JSON.parse(e.newValue) : [];
        if (Array.isArray(parsed)) setIds(parsed.filter((x): x is string => typeof x === 'string'));
      } catch {
        /* 무시 */
      }
    };
    window.addEventListener('storage', on);
    return () => window.removeEventListener('storage', on);
  }, []);

  const toggle = useCallback((id: string) => {
    setIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);
  const remove = useCallback((id: string) => setIds((prev) => prev.filter((x) => x !== id)), []);
  const clear = useCallback(() => setIds([]), []);

  const value = useMemo<PickCtx>(
    () => ({ ids, has: (id) => ids.includes(id), toggle, remove, clear, ready }),
    [ids, toggle, remove, clear, ready],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePick(): PickCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('PickProvider 안에서만 쓸 수 있습니다.');
  return v;
}
