import Link from 'next/link';

/**
 * '오늘의 소재' 안의 세 갈래.
 *
 * 메뉴에서 내려온 이슈·캐릭터·밈이다. 화면을 합치지 않은 이유는 **재는 잣대가
 * 다르기 때문**이다 — 뉴스는 검색이 늘었나, 캐릭터는 만들어도 되는 권리인가,
 * 포맷은 몇 계정이 따라 하나를 본다. 한 목록에 섞으면 검색을 잰 적도 없는 캐릭터가
 * '검색은 평소' 칸에 들어앉는다. 고르는 사람에게만 한 곳으로 보이면 된다.
 *
 * **이름도 바꿨다.** 낱말만으로 무엇인지 읽혀야 한다.
 *   이슈 → 뉴스·사건 · 캐릭터 → 캐릭터·굿즈 · 밈 → 유행 포맷
 */
export type AxisTab = 'issue' | 'character' | 'meme';

const TABS: { key: AxisTab; href: string; label: string }[] = [
  { key: 'issue', href: '/issues', label: '뉴스·사건' },
  { key: 'character', href: '/characters', label: '캐릭터·굿즈' },
  { key: 'meme', href: '/memes', label: '유행 포맷' },
];

export function AxisTabs({ current }: { current: AxisTab }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="tablist">
      {TABS.map((t) => {
        const on = t.key === current;
        return (
          <Link
            key={t.key}
            href={t.href}
            role="tab"
            aria-selected={on}
            className="rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors"
            style={
              on
                ? { background: 'var(--rita-ink)', color: '#fff' }
                : { background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink-2)' }
            }
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
