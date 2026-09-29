import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { LegacyShell } from '@/components/cora/legacy-shell';
import { Nav } from '@/components/nav';
import { PickProvider } from '@/components/pick';
import { PickBar } from '@/components/pick-bar';

export const metadata: Metadata = {
  title: 'Cora · 콘텐츠 제작실',
  description: '지금 작동하는 콘텐츠 방식을 근거와 함께 보여드립니다',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    /*
     * suppressHydrationWarning 은 <html>·<body> 두 태그에만 건다.
     *
     * Grammarly·QuillBot 같은 확장이 React 가 붙기 전에 이 두 태그에 속성을 끼워 넣는다
     * (data-gr-ext-installed, data-qb-installed …). 서버가 보낸 HTML 에는 없는 것이라
     * 개발 모드에서 hydration 경고가 뜬다. 앱 코드와 무관한데 매번 빨간 오버레이가 뜬다.
     *
     * 이 옵션은 걸어 둔 태그 '한 겹'의 속성·텍스트 차이만 덮는다. 자식 트리의 진짜
     * 불일치는 그대로 올라온다 — 그래서 여기 두 곳에만 걸고 아래로는 내리지 않는다.
     */
    <html lang="ko" suppressHydrationWarning>
      <body suppressHydrationWarning>
        {/*
          담기 바구니는 앱 전체가 함께 본다 — 방식 카드에서 담고 「담은 것」에서 꺼내며,
          하단 띠의 건수도 같은 값을 읽는다. 그래서 provider 가 여기 있다.

          **브라우저에 둔다.** 서버(db.json)에 두면 배포본에서 A 가 담은 것이 B 화면에도
          뜨고, Render 무료 플랜은 디스크를 못 붙여 재배포하면 말없이 비워진다.
          `lifecycle: 'archived'` 는 없애지 않는다 — 그건 수집이 매일 새 기사를 붙일
          대상을 서버가 아는 자리라서 운영자 쪽으로 남는다. 두 축이 따로 산다.
        */}
        <PickProvider>
        <LegacyShell legacy={<>
        {/* 상단 바는 RITA 잉크. 아래 2px 그라데이션 선이 그라데이션을 쓰는 네 자리 중 하나다. */}
        <header className="sticky top-0 z-10" style={{ background: 'var(--rita-ink)' }}>
          <div className="mx-auto flex min-w-0 items-center gap-1 px-4 py-3 sm:px-8" style={{ maxWidth: 1140 }}>
            {/* 브랜드 마크가 그라데이션을 쓰는 네 자리 중 셋째다. */}
            <Link href="/" className="mr-4 flex items-center gap-2">
              <span
                className="inline-block h-[18px] w-[18px] rounded-[5px]"
                style={{ background: 'var(--grad)' }}
                aria-hidden
              />
              <span className="text-[15px] font-semibold tracking-tight" style={{ color: '#fff' }}>
                트렌드 허브
              </span>
            </Link>
            {/*
              메뉴는 **사람이 하려는 일**로 나눈다 — 탐색 / 추적 중 / 지난 기록 / 설정.
              세 축(이슈·캐릭터·밈)은 탐색과 각 상세 목록에서 이어진다. 자세한 까닭은
              components/nav.tsx 에 적었다.
            */}
            <Nav />
          </div>
          <div style={{ height: 2, background: 'var(--grad)' }} />
        </header>
        <main className="mx-auto px-4 py-5 sm:px-8 sm:py-7" style={{ maxWidth: 1140 }}>{children}</main>
        {/* 담은 것이 어디로 갔는지 말해 주는 줄. 0 건이면 통째로 숨는다. */}
        <PickBar />
        </>}>{children}</LegacyShell>
        </PickProvider>
      </body>
    </html>
  );
}
