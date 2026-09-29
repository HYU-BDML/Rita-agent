'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * 상단 메뉴 — **우리가 데이터를 나눈 방식이 아니라 사람이 하려는 일로 나눈다.**
 *
 * 전에는 `이슈 / 캐릭터 / 밈 / 회차 / 설정` 이었다. 그건 판정기를 나눈 축이지
 * 사람이 하려는 일이 아니다. "그냥 '캐릭터' 라고 하면 무슨 말인지 아무도 모른다."
 *
 * 세 축은 메뉴에서 내려와 '오늘의 소재' 안의 **탭**이 된다(components/axis-tabs.tsx).
 * 재는 잣대가 달라 화면은 그대로 셋이지만, 고르는 사람에게는 한 곳이다.
 *
 * **주소는 그대로 둔다** (`/issues` · `/characters` · `/memes`).
 * 이미 나간 배포 링크와 북마크, `render.yaml` 의 헬스체크 경로, `/api/brief?scope=`
 * 의 어휘가 모두 이 낱말을 쓴다. 사람이 읽는 것은 메뉴 글씨지 주소가 아니다.
 */
const TABS: { href: string; label: string; match: string[] }[] = [
  { href: '/', label: '브리프', match: ['/'] },
  // 축별 화면은 탐색 아래다. 주소는 그대로 살아 있다 — 나간 링크와 북마크가 그 낱말을 쓴다.
  { href: '/explore', label: '탐색', match: ['/explore', '/issues', '/characters', '/memes', '/candidates'] },
  { href: '/grammars', label: '방식', match: ['/grammars'] },
  { href: '/library', label: '담은 것', match: ['/library'] },
  { href: '/runs', label: '지난 기록', match: ['/runs'] },
  // 설정을 상단바에서 지우지 않는다. 지웠더니 운영자가 수집 일정·상한·키를 바꿀 자리가
  // 없어졌다. 첫 화면에 안 보이는 것과 없애는 것은 다르다 (docs/PROMPT.md §2).
  { href: '/settings', label: '설정', match: ['/settings'] },
];

export function Nav() {
  const path = usePathname() ?? '';

  return (
    <nav className="min-w-0 flex-1 overflow-x-auto" aria-label="주요 메뉴">
      <div className="flex w-max items-center gap-0.5">
      {TABS.map((t) => {
        const on = t.match.some((m) => path === m || path.startsWith(`${m}/`));
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={on ? 'page' : undefined}
            className="rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-white/10"
            style={{
              color: on ? '#fff' : 'rgba(255,255,255,0.78)',
              fontWeight: on ? 600 : 400,
              background: on ? 'rgba(255,255,255,0.12)' : undefined,
            }}
          >
            {t.label}
          </Link>
        );
      })}
      </div>
    </nav>
  );
}
