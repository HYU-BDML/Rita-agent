'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CollectionSchedule } from '@/lib/core/store';

/*
 * 기본값은 **서버가 내려 준다.** 여기서 lib/core/run-limit 을 직접 부르면 그것이
 * lib/core/store → node:fs 를 끌고 들어와 클라이언트 번들이 깨진다. 실제로 깨졌다.
 */

const DAYS = [['월', 1], ['화', 2], ['수', 3], ['목', 4], ['금', 5], ['토', 6], ['일', 0]] as const;

function DayPicker({ selected, onToggle }: { selected: number[]; onToggle: (day: number) => void }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {DAYS.map(([label, day]) => (
        <button key={day} type="button" onClick={() => onToggle(day)} className="rounded-full px-3 py-1.5 text-[12px]" style={selected.includes(day) ? { background: 'var(--rita-ink)', color: '#fff' } : { background: 'var(--plane)', border: '1px solid var(--line)', color: 'var(--ink-2)' }}>{label}</button>
      ))}
    </div>
  );
}

/** 숫자 칸 하나. 비우면 '안 정함'이고, 0 은 '잠근다'다 — 둘을 같은 것으로 다루지 않는다. */
function LimitInput({
  label,
  hint,
  value,
  fallback,
  unit = '회',
  onChange,
}: {
  label: string;
  hint?: string;
  value: number | undefined;
  fallback: number;
  /** 뒤에 붙는 말. 상한은 '회', 기한은 '일'. */
  unit?: string;
  onChange: (next: number | undefined) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg px-3 py-2" style={{ background: 'var(--plane)' }}>
      <span className="min-w-0">
        <span className="block text-[12.5px] font-medium">{label}</span>
        {hint && <span className="block text-[11px]" style={{ color: 'var(--ink-muted)' }}>{hint}</span>}
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        <input
          type="number"
          min={0}
          max={50}
          value={value ?? ''}
          placeholder={String(fallback)}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
          className="w-16 rounded-md px-2 py-1.5 text-right text-sm num"
          style={{ background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink)' }}
        />
        <span className="text-[12px]" style={{ color: 'var(--ink-muted)' }}>{unit}</span>
      </span>
    </label>
  );
}

export function ScheduleControls({
  initial,
  discoveries,
  defaults,
}: {
  initial: CollectionSchedule;
  /** 상한을 정할 판정기. 화면에 뜨는 것만 준다 — 못 돌리는 것에 숫자를 물어봐야 소용없다. */
  discoveries: { id: string; name: string }[];
  /** 비워 뒀을 때 실제로 걸리는 값. 회색 숫자로 보여 준다. */
  defaults: { perDiscovery: number; total: number; maxAgeDays: Record<string, number>; maxMissDays: number };
}) {
  const [schedule, setSchedule] = useState(initial);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  function toggle(field: 'newsDays' | 'characterDays' | 'memeDays', day: number) {
    setSchedule((current) => ({
      ...current,
      [field]: current[field].includes(day) ? current[field].filter((value) => value !== day) : [...current[field], day].sort(),
    }));
  }

  async function save() {
    setBusy(true);
    try {
      // 비운 칸은 null 로 보낸다. undefined 는 JSON 에서 사라져 '안 보냈다'가 되고, 서버가 옛 값을 지킨다.
      const payload = { ...schedule, totalLimit: schedule.totalLimit ?? null, limits: schedule.limits ?? {}, retire: schedule.retire ?? {} };
      await fetch('/api/schedule', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight">자동 수집 일정</h2>
          <p className="mt-1 text-[12px] leading-relaxed" style={{ color: 'var(--ink-muted)' }}>한국시간 기준입니다. 각 수집원의 요일과 시각을 따로 정합니다.</p>
        </div>
        <label className="flex items-center gap-2 text-[12px]"><input type="checkbox" checked={schedule.enabled} onChange={(event) => setSchedule({ ...schedule, enabled: event.target.checked })} /> 자동 수집 켜기</label>
      </div>
      <details>
        <summary className="cursor-pointer list-none rounded-lg px-3 py-2.5 text-[13px] font-semibold" style={{ background: 'var(--plane)' }}>뉴스 일정 <span className="ml-2 text-[11px] font-normal" style={{ color: 'var(--ink-muted)' }}>요일과 시각 선택</span></summary>
        <div className="space-y-3 px-3 pb-2 pt-3">
          <label className="block text-[12px] font-medium">수집 시각<input type="time" step={1800} value={schedule.newsTime} onChange={(event) => setSchedule({ ...schedule, newsTime: event.target.value })} className="mt-1 block rounded-md px-2 py-1.5 text-sm" style={{ background: 'var(--plane)', border: '1px solid var(--line)' }} /></label>
          <div><p className="text-[12px] font-medium">수집 요일</p><DayPicker selected={schedule.newsDays} onToggle={(day) => toggle('newsDays', day)} /></div>
        </div>
      </details>
      <details>
        <summary className="cursor-pointer list-none rounded-lg px-3 py-2.5 text-[13px] font-semibold" style={{ background: 'var(--plane)' }}>캐릭터 일정 <span className="ml-2 text-[11px] font-normal" style={{ color: 'var(--ink-muted)' }}>요일과 시각 선택</span></summary>
        <div className="space-y-3 px-3 pb-2 pt-3">
          <label className="block text-[12px] font-medium">수집 시각<input type="time" step={1800} value={schedule.characterTime} onChange={(event) => setSchedule({ ...schedule, characterTime: event.target.value })} className="mt-1 block rounded-md px-2 py-1.5 text-sm" style={{ background: 'var(--plane)', border: '1px solid var(--line)' }} /></label>
          <div><p className="text-[12px] font-medium">수집 요일</p><DayPicker selected={schedule.characterDays} onToggle={(day) => toggle('characterDays', day)} /></div>
        </div>
      </details>

      <details>
        <summary className="cursor-pointer list-none rounded-lg px-3 py-2.5 text-[13px] font-semibold" style={{ background: 'var(--plane)' }}>유행 포맷 일정 <span className="ml-2 text-[11px] font-normal" style={{ color: 'var(--ink-muted)' }}>요일과 시각 선택</span></summary>
        <div className="space-y-3 px-3 pb-2 pt-3">
          <label className="block text-[12px] font-medium">수집 시각<input type="time" step={1800} value={schedule.memeTime} onChange={(event) => setSchedule({ ...schedule, memeTime: event.target.value })} className="mt-1 block rounded-md px-2 py-1.5 text-sm" style={{ background: 'var(--plane)', border: '1px solid var(--line)' }} /></label>
          <div><p className="text-[12px] font-medium">수집 요일</p><DayPicker selected={schedule.memeDays} onToggle={(day) => toggle('memeDays', day)} /></div>
        </div>
      </details>
      <details>
        <summary className="cursor-pointer list-none rounded-lg px-3 py-2.5 text-[13px] font-semibold" style={{ background: 'var(--plane)' }}>
          수집 상한 <span className="ml-2 text-[11px] font-normal" style={{ color: 'var(--ink-muted)' }}>분야별 하루 횟수</span>
        </summary>
        <div className="space-y-2 px-3 pb-2 pt-3">
          <p className="text-[12px] leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
            한 번 돌 때마다 유료 API 를 부릅니다. 이 숫자가 하루치 비용의 천장입니다.
            한국시간 자정에 다시 열리고, 수동·자동을 합쳐 셉니다.
            <strong className="block">비워 두면 기본값(회색 숫자)을 쓰고, 0 을 넣으면 그 분야는 잠깁니다.</strong>
          </p>
          {discoveries.map((d) => (
            <LimitInput
              key={d.id}
              label={d.name}
              value={schedule.limits?.[d.id]}
              fallback={defaults.perDiscovery}
              onChange={(next) =>
                setSchedule((c) => {
                  const limits = { ...(c.limits ?? {}) };
                  if (next === undefined) delete limits[d.id];
                  else limits[d.id] = next;
                  return { ...c, limits };
                })
              }
            />
          ))}
          <LimitInput
            label="전체 천장"
            hint="분야별 상한을 다 더한 것보다 낮게 두면 여기서 먼저 막힙니다."
            value={schedule.totalLimit}
            fallback={defaults.total}
            onChange={(next) => setSchedule((c) => ({ ...c, totalLimit: next }))}
          />
        </div>
      </details>

      <details>
        <summary className="cursor-pointer list-none rounded-lg px-3 py-2.5 text-[13px] font-semibold" style={{ background: 'var(--plane)' }}>
          소재 기한 <span className="ml-2 text-[11px] font-normal" style={{ color: 'var(--ink-muted)' }}>안 뜨면 언제 내릴까</span>
        </summary>
        <div className="space-y-2 px-3 pb-2 pt-3">
          <p className="text-[12px] leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
            회차가 더 이상 안 물어오는 소재를 목록에서 내립니다. 지우는 게 아니라 내리는 것이라,
            나중에 같은 이름이 다시 잡히면 관측 기록까지 그대로 되살아납니다.
            <strong className="block">보관해 둔 소재는 기한과 상관없이 그대로 둡니다.</strong>
            비우면 기본값(회색 숫자), 0 을 넣으면 그 분야는 기한을 안 봅니다.
          </p>
          {discoveries.map((d) => (
            <LimitInput
              key={d.id}
              label={d.name}
              unit="일"
              value={schedule.retire?.maxAgeDays?.[d.id]}
              fallback={defaults.maxAgeDays[d.id] ?? 30}
              onChange={(next) =>
                setSchedule((c) => {
                  const days = { ...(c.retire?.maxAgeDays ?? {}) };
                  if (next === undefined) delete days[d.id];
                  else days[d.id] = next;
                  return { ...c, retire: { ...c.retire, maxAgeDays: days } };
                })
              }
            />
          ))}
          <LimitInput
            label="연속 미포착"
            unit="일"
            hint="회차는 돌았는데 못 물어온 날이 이만큼 이어지면 내립니다."
            value={schedule.retire?.maxMissDays}
            fallback={defaults.maxMissDays}
            onChange={(next) => setSchedule((c) => ({ ...c, retire: { ...c.retire, maxMissDays: next } }))}
          />
        </div>
      </details>

      <div className="flex justify-end"><button type="button" disabled={busy} onClick={() => void save()} className="rounded-lg px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-60" style={{ background: 'var(--rita-blue)' }}>{busy ? '저장 중…' : '일정 저장'}</button></div>
    </section>
  );
}
