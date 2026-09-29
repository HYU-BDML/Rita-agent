'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { InputField } from '@/lib/core/adapters';

interface Spec {
  id: string;
  name: string;
  inputs: InputField[];
}

/**
 * 주 동작. 화면에서 제일 큰 버튼이고, 이것 하나로 회차가 돈다.
 *
 * 누른 뒤 아무 일도 없는 것처럼 보이면 안 된다. 단계를 지어내지 않고 실제로 아는 것만
 * 보여준다 — 지난 시간과 **실측한** 소요 시간.
 *
 * **"보통 40초"는 거짓이 됐다** (2026-09-19). 회차가 무거워졌다 — 사운드 매핑·썸네일
 * 자막·이름 재검색이 붙었다. 서버 로그 실측이 202·333·343·436초다. 40초라고 적어 두면
 * 3분째에 "멈췄다"고 읽힌다. 실제로 그렇게 읽혔다. 판정기마다 다른 값을 보여 준다.
 */

/**
 * 판정기별 실측 소요 시간(초). 2026-09-19 서버 로그에서 잰 값이다.
 * 코드가 무거워지면 여기도 같이 고친다 — 안 고치면 화면이 거짓말을 한다.
 */
const TYPICAL: Record<string, { sec: number; steps: string }> = {
  news: { sec: 40, steps: '뉴스 9곳 수집 → 주제 묶기 → 검색추이 확인' },
  radar: { sec: 20, steps: '레이더가 남긴 회차 파일 읽기' },
  'character-native': {
    // 2026-09-22 대표 사진 고르기(charShot)가 붙었다. 썸네일 8장씩 몇 콜이 더 든다.
    sec: 370,
    steps: '인스타·X·틱톡 15콜 → 이름 추출 → 권리 판정 → 본문 요약 → 대표 사진 고르기',
  },
  'meme-native': {
    sec: 440,
    steps: '씨앗 수집 15콜 → 썸네일 자막 읽기 → 포맷 이름 추출 → 이름마다 재검색 → 요약·안전 판정',
  },
};

/**
 * 받침을 보고 은/는 을 고른다. 판정기 이름을 화면 문장에 넣으면서 생겼다 —
 * '뉴스 소재는' 옆에 **'밈 발굴는'** 이 나갔다. 한글이 아니면 '는' 으로 둔다.
 */
function topicParticle(word: string): '은' | '는' {
  const last = word.trim().slice(-1);
  const code = last.charCodeAt(0);
  if (Number.isNaN(code) || code < 0xac00 || code > 0xd7a3) return '는';
  return (code - 0xac00) % 28 === 0 ? '는' : '은';
}

/** 초를 사람이 읽는 말로. 3분을 180초로 적으면 길이가 안 잡힌다. */
function human(sec: number): string {
  if (sec < 90) return `${sec}초`;
  const m = Math.round(sec / 60);
  return `${m}분`;
}

/**
 * 오늘 남은 실행 횟수. 서버가 세어 내려 준다 (lib/core/run-limit.ts).
 * 안 주면 횟수 줄을 그리지 않는다 — 로컬에서는 굳이 셈을 보일 이유가 없다.
 *
 * **이 판정기의 몫과 오늘 전체를 함께 받는다.** 둘은 사람이 할 일이 다르다 —
 * 이 축을 다 썼으면 다른 축을 돌리면 되고, 전체를 다 썼으면 오늘은 못 한다.
 */
interface Quota {
  left: number;
  max: number;
  totalLeft: number;
  totalMax: number;
}

/**
 * **판정기 하나에 버튼 하나.**
 *
 * 전에는 목록을 받아 `specs[0]` 만 그렸다. 그래서 '오늘의 소재' 화면에 뉴스와 레이더가
 * 함께 있었는데도 뉴스만 버튼이 났고, **레이더는 화면에서 돌릴 길이 없었다.**
 * 상한도 판정기별로 나뉘었으므로(lib/core/run-limit.ts) 남은 횟수도 버튼마다 다르다.
 * 하나로 묶으면 그 숫자를 어느 판정기 것이라고 말할 수 없다.
 */
export function FindButton({
  spec,
  big = false,
  quota,
}: {
  spec: Spec;
  big?: boolean;
  quota?: Quota;
}) {
  // 서버가 준 값에서 출발해 회차가 돌 때마다 갱신한다. 새로고침해야 줄어들면 거짓말이 된다.
  const [left, setLeft] = useState(quota?.left ?? null);
  const [totalLeft, setTotalLeft] = useState(quota?.totalLeft ?? null);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<Record<string, string>>({});
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const router = useRouter();

  const typical = TYPICAL[spec.id] ?? { sec: 60, steps: '수집 → 판정 → 정리' };

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  async function run() {
    setBusy(true);
    setError(null);
    setElapsed(0);
    const started = Date.now();
    timer.current = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);

    const inputs: Record<string, string> = {};
    for (const f of spec.inputs) inputs[f.name] = opts[f.name] ?? f.default ?? '';

    try {
      const res = await fetch('/api/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discoveryId: spec.id, inputs }),
      });
      const json = await res.json();
      if (typeof json?.quota?.left === 'number') setLeft(json.quota.left);
      if (typeof json?.quota?.totalLeft === 'number') setTotalLeft(json.quota.totalLeft);
      if (!res.ok) setError(json.error ?? '알 수 없는 오류');
      else router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (timer.current) clearInterval(timer.current);
      setBusy(false);
      setOpen(false);
    }
  }

  const size = big ? 'px-6 py-3 text-[15px]' : 'px-4 py-2 text-sm';
  // 한도를 다 쓰면 눌러도 429 만 돌아온다. 누르게 두고 실패를 보여 주는 것보다 잠그는 쪽이 정직하다.
  const mineSpent = left !== null && left <= 0;
  const allSpent = totalLeft !== null && totalLeft <= 0;
  const spent = mineSpent || allSpent;

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <button
          onClick={run}
          disabled={busy || spent}
          className={`rounded-lg font-medium text-white transition-opacity disabled:opacity-60 ${size}`}
          // 그라데이션을 쓰는 네 자리 중 넷째. 도는 동안에는 단색으로 내려 눌린 것이 보이게 한다.
          style={{ background: busy ? 'var(--ink-2)' : 'var(--grad)' }}
        >
          {busy ? (
            <span className="inline-flex items-center gap-2">
              <Spinner />
              찾는 중… <span className="num">{human(elapsed)}</span>
            </span>
          ) : (
            // 축이 셋이 되면서 어느 화면에서든 같은 말이면 무엇이 도는지 알 수 없다.
            `${spec.name} 돌리기`
          )}
        </button>

        {!busy && (
          <button
            onClick={() => setOpen(!open)}
            className="rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
            style={{ color: 'var(--ink-2)' }}
            aria-expanded={open}
          >
            옵션
          </button>
        )}
      </div>

      {!busy && left !== null && quota && (
        <p className="mt-1.5 text-[12px]" style={{ color: spent ? 'var(--down)' : 'var(--ink-muted)' }}>
          {allSpent ? (
            <>오늘 전체 한도 <span className="num">{quota.totalMax}</span>회를 다 썼습니다 — 한국시간 자정에 다시 열립니다.</>
          ) : mineSpent ? (
            /* 이 축만 막힌 것이다. 다른 축은 열려 있다는 말을 빼면 '오늘은 끝'으로 읽힌다. */
            <>{spec.name}{topicParticle(spec.name)} 오늘 <span className="num">{quota.max}</span>회를 다 썼습니다 — 다른 축은 아직 <span className="num">{totalLeft}</span>회 돌릴 수 있습니다.</>
          ) : (
            <>{spec.name} 오늘 <span className="num">{left}</span>회 남았습니다 (판정기당 <span className="num">{quota.max}</span>회 · 오늘 전체 <span className="num">{totalLeft}</span>회).</>
          )}
        </p>
      )}

      {busy && (
        <div className="mt-2">
          {/* 예상 대비로 채운다. 무한히 흐르는 막대는 '돌고 있다'만 말하고 '얼마나 남았나'를
              못 말한다 — 7분짜리 회차에서는 그 차이가 크다. 예상을 넘으면 더 안 채우고 멈춘다. */}
          <div className="h-1 w-full overflow-hidden rounded-full" style={{ background: 'var(--track)' }}>
            <div
              className="h-full rounded-full transition-[width] duration-1000"
              style={{
                // 그라데이션은 네 자리뿐이고 여기는 아니다(지시서 1장). 단색으로 둔다.
                background: 'var(--rita-blue)',
                width: `${Math.min(97, Math.round((elapsed / typical.sec) * 100))}%`,
              }}
            />
          </div>
          <p className="mt-1.5 text-[12px]" style={{ color: 'var(--ink-muted)' }}>
            {typical.steps}. 보통 <span className="num">{human(typical.sec)}</span>쯤 걸립니다
            {elapsed > typical.sec * 1.5 && ' — 예상보다 깁니다. 창을 닫지 마세요, 돌고 있습니다'}.
          </p>
        </div>
      )}

      {open && !busy && (
        <div
          className="absolute right-0 top-full z-20 mt-2 w-64 rounded-xl p-3 shadow-lg"
          style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
        >
          {spec.inputs.map((f) => (
            <label key={f.name} className="mb-3 block last:mb-0">
              <span className="text-[12px] font-medium">{f.label}</span>
              <select
                className="mt-1 w-full rounded-md px-2 py-1.5 text-sm"
                style={{ background: 'var(--plane)', border: '1px solid var(--hairline)', color: 'var(--ink)' }}
                value={opts[f.name] ?? f.default ?? ''}
                onChange={(e) => setOpts({ ...opts, [f.name]: e.target.value })}
              >
                {(f.options ?? []).map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
              {f.help && (
                <span className="mt-1 block text-[11px]" style={{ color: 'var(--ink-muted)' }}>{f.help}</span>
              )}
            </label>
          ))}
        </div>
      )}

      {error && (
        <p className="mt-2 text-[12px]" style={{ color: 'var(--down)' }}>
          {error}
        </p>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2.5" />
      <path d="M14.5 8A6.5 6.5 0 0 0 8 1.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
