import Link from 'next/link';
import { listCandidates } from '@/lib/core/store';
import { axisOf } from '@/lib/core/axis';
import { TrackingPicker, type TrackRow } from '@/components/tracking-picker';

export const dynamic = 'force-dynamic';

/**
 * 추적 — 운영자 자리. `/settings` 아래에 둔다.
 *
 * **상단바에 두지 않는다.** 배포본을 여는 사람은 만들 방식을 찾으러 오고, 수집 대상을
 * 등록하러 오지 않는다. 별표가 소재 카드에 있던 동안 사람이 누른 것은 "나중에 볼 것"인데
 * 실제로는 서버에 수집 대상을 등록하는 것이었다 — 그 둘을 한 버튼에 얹은 것이 문제였다.
 *
 * 기능·API·데이터를 그대로 남겼다. `/api/archive` 도 `lifecycle: 'archived'` 도 살아
 * 있다. 담기는 브라우저로 갔고(`/library`), 이 화면은 서버가 무엇을 계속 볼지 정한다.
 */
export default async function TrackingPage() {
  /* 내려간 소재(retired)는 빼고 낸다. 회차가 안 물어오는 것에 추적을 거는 건 헛일이다. */
  const cands = (await listCandidates()).filter((c) => c.lifecycle !== 'retired');

  const rows: TrackRow[] = cands.map((c) => ({
    id: c.id,
    subject: c.subject,
    axis: AXIS[axisOf(c)] ?? '뉴스·사건',
    archived: c.lifecycle === 'archived',
    enabled: c.tracking?.enabled ?? true,
    queries: c.tracking?.queries ?? [c.subject],
    ...(c.tracking?.lastCheckedAt ? { lastCheckedAt: c.tracking.lastCheckedAt } : {}),
  }));

  return (
    <div className="space-y-5">
      <div>
        <Link href="/settings" className="inline-block text-[12px] hover:underline" style={{ color: 'var(--ink-muted)' }}>
          ← 설정
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">추적</h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
          수집이 매일 새 기사를 붙일 대상입니다. 서버에 저장되므로 이 앱을 여는 모든 사람에게
          같은 목록이 보입니다. 사용자가 개인적으로 담아 두는 것은{' '}
          <Link href="/library" className="underline">담은 것</Link> 이고 그쪽은 브라우저에만 남습니다.
        </p>
      </div>
      <TrackingPicker rows={rows} />
    </div>
  );
}

const AXIS: Record<string, string> = {
  issue: '뉴스·사건',
  character: '캐릭터·굿즈',
  meme: '유행 포맷',
};
