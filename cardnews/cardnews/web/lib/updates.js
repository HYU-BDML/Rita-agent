// 바뀐 것을 알리는 자리.
//
// 기능이 늘면 맨 위에 항목 하나를 더한다. 그것만 하면 안 본 사람에게 점이
// 저절로 붙는다 — 같은 날 두 번째로 올려도 붙는다(아래 markerOf 참고).
// 오래된 것은 지워도 된다 — 읽고 나면 쓸모가 없다.
//
// 최신이 맨 위다. 화면에 그리는 순서가 곧 이 순서다.
//
// **한 항목에 두 언어를 나란히 둔다.** 영어가 없으면 그 항목만 한국어로
// 뜬다 — 소식 창을 열었을 때 반은 영어 반은 한국어가 되는 것보다, 한 벌씩
// 다 갖춰 두고 `소식글` 로 골라 쓰는 쪽이 낫다.
export const UPDATES = [
  {
    date: '2026-08-17',
    title: '공동 목록에서 중요한 것을 맨 앞에 고정할 수 있습니다',
    제목영어: 'You can pin important posts to the front of the shared list',
    scope: 'common',
    body:
      '카드에 📌 를 누르면 목록 맨 앞으로 옵니다. 담긴 게 늘어나도 먼저 볼 것이 뒤로 밀리지 않습니다. ' +
      '고정은 승민님 화면에서도 똑같이 보입니다 — 공동 목록은 같이 보는 자리라 고정도 같이 봅니다. ' +
      '같은 게시물을 다시 담아도 고정은 풀리지 않습니다.',
    본문영어:
      'Press 📌 on a card and it moves to the front. As the list grows, the ones you want first stay first. ' +
      'Pins show the same way on your teammate\'s screen — the shared list is shared, and so are the pins. ' +
      'Saving the same post again does not unpin it.',
  },
  {
    date: '2026-08-17',
    title: '@계정 검색도 얼마나 걸릴지 알려줍니다',
    제목영어: '@account searches now tell you how long they will take',
    scope: 'common',
    body:
      '전에는 검색어로 찾을 때만 예상 시간이 나오고 @계정 은 안 나왔습니다. 이제 둘 다 나옵니다. ' +
      '계정은 건수를 늘려도 시간이 크게 안 늘어납니다 — 50건이든 150건이든 1분 안팎입니다. ' +
      '다만 아직 몇 번 안 재봐서 추정입니다. 그래서 끝나고 실제로 몇 초 걸렸는지도 같이 보여줍니다.',
    본문영어:
      'Before, only keyword searches showed an estimate; @account searches did not. Now both do. ' +
      'For an account, asking for more posts barely costs more time — 50 or 150, it is about a minute. ' +
      'It is still only an estimate from a few measured runs, so we also show how many seconds it actually took.',
  },
  {
    date: '2026-08-17',
    title: '키마다 크레딧이 얼마나 남았는지 보입니다',
    제목영어: 'You can see how much credit each key has left',
    scope: 'common',
    body:
      '키 설정을 열면 키마다 남은 금액이 나옵니다. 곧 소진될 키는 그렇다고 알려줍니다. ' +
      '검색하다 갑자기 막히기 전에 미리 다른 키를 넣을 수 있습니다.',
    본문영어:
      'Open API Keys and each key shows what is left. Keys about to run out say so. ' +
      'You can add another key before a search stops on you mid-way.',
  },
  {
    date: '2026-08-17',
    title: '검색 결과를 즐겨찾기에 담아두면 다시 검색하지 않아도 됩니다',
    제목영어: 'Save a search and you never have to pay for it twice',
    scope: 'common',
    body:
      '마음에 드는 계정이나 검색어를 찾았는데 다른 걸 검색하다 보면 그 결과가 사라졌습니다. ' +
      '다시 보려면 또 검색해야 했고 그때마다 크레딧이 나갔습니다. ' +
      '이제 결과 위 "★ 즐겨찾기 추가"를 누르면 검색창 아래에 칩으로 남고, ' +
      '눌러서 다시 열 때는 돈이 나가지 않습니다. 슬라이드까지 그대로 넘겨볼 수 있습니다. ' +
      '최대 5개까지 담깁니다. ' +
      '다만 인스타 그림 주소는 나흘쯤 뒤 죽어서 그때부터는 회색 칸이 됩니다 — ' +
      '칩에 담은 시각이 같이 보이고, 지난 것은 "그림 만료"라고 알려줍니다. ' +
      '오래 두고 볼 것은 공동 목록에 담아주세요. 그쪽은 그림을 서버에 복사해서 안 죽습니다.',
    본문영어:
      'You would find a good account or keyword, search for something else, and the results were gone. ' +
      'Getting them back meant searching again, and paying credits again. ' +
      'Now press "★ Save search" above the results and it stays as a chip under the search box. ' +
      'Reopening it costs nothing. The slides are all still there to page through. ' +
      'You can keep up to five. ' +
      'Instagram image links do die after about four days, and from then the tiles go grey — ' +
      'each chip shows when you saved it, and old ones say "images expired". ' +
      'For anything you want to keep, use the shared list: it copies the images to our server, so they do not die.',
  },
  {
    date: '2026-08-16',
    title: '"카드뉴스"를 붙이면 더 잘 나온다는 안내를 지웠습니다',
    제목영어: 'We dropped the advice about adding "cardnews" to your keyword',
    scope: 'cardnews',
    body:
      '검색어가 적으면 뒤에 "카드뉴스"를 붙여보라고 권했는데, 붙여봐도 딱히 ' +
      '더 나오지 않는 경우가 많았습니다. 붙이고 싶으면 붙여도 되고, 아니면 그냥 검색어만 써도 됩니다.',
    본문영어:
      'When a search came back thin we suggested adding "cardnews" to the end, but it often ' +
      'made no difference. Add it if you like, or just search the plain keyword.',
  },
  {
    date: '2026-08-16',
    title: '@계정 으로도 긁습니다',
    제목영어: 'You can fetch by @account too',
    scope: 'common',
    body:
      '검색창에 @cardnews 처럼 치면 그 계정의 게시물을 가져옵니다. ' +
      '검색은 릴스가 섞여 카드뉴스가 얼마 안 남지만, 카드뉴스 계정에서 직접 긁으면 훨씬 많이 남습니다. ' +
      '건당 값도 절반 이하라 계정 100건이 검색 50건보다 쌉니다.',
    본문영어:
      'Type something like @cardnews in the search box and you get that account\'s posts. ' +
      'Keyword searches come back mixed with Reels, so few card-news posts survive; pulling straight from ' +
      'a card-news account leaves far more. It also costs less than half per post — 100 from an account ' +
      'is cheaper than 50 from a search.',
  },
  {
    date: '2026-08-16',
    title: '캐러셀에 섞인 영상도 봅니다',
    제목영어: 'Videos mixed into a carousel now play',
    scope: 'cardnews',
    body:
      '전에는 영상 슬라이드가 빈칸으로 보이고 담기도 안 됐습니다. ' +
      '이제 재생되고, 내려받으면 mp4 로 저장되고, 공동 목록에도 들어갑니다.',
    본문영어:
      'Video slides used to show as blank tiles and could not be saved. ' +
      'Now they play, download as mp4, and go into the shared list.',
  },
]

/**
 * 소식 한 줄을 고른 언어로. **영어가 없으면 한국어를 그대로 준다** — 빈 칸이
 * 되면 그 소식이 있었다는 것조차 못 본다.
 */
export function 소식글(소식, 언어) {
  const 영어냐 = String(언어) === '영어'
  return {
    title: (영어냐 && 소식.제목영어) || 소식.title,
    body: (영어냐 && 소식.본문영어) || 소식.body,
    date: 소식.date,
  }
}

// 콘텐츠 종류별로 볼 소식만 남긴다 — common 은 항상, 나머지는 그 종류만.
export function updatesFor(contentType) {
  return UPDATES.filter((u) => u.scope === 'common' || u.scope === contentType)
}

// 목록이 지금 어떤 상태인지 나타내는 짧은 표식.
//
// 예전에는 날짜만 봤는데, 그러면 같은 날 소식을 하나 더 올렸을 때 그날 이미
// 열어본 사람에게 점이 안 붙었다. 올린 사람은 붙는 줄 알고 있으니 조용히 놓친다.
// 개수를 함께 넣어, 뭐가 하나라도 늘면 표식이 달라지게 한다.
//
// 오래된 소식을 지우면 개수가 줄어 표식이 또 바뀐다. 그때 점이 한 번 뜨는데,
// 잃는 것이 없으므로 그대로 둔다.
export function markerOf(list) {
  const first = Array.isArray(list) && list.length ? list[0] : null
  return first ? `${first.date}·${list.length}` : ''
}

export const LATEST = markerOf(UPDATES)

// seen 은 마지막으로 열어봤을 때의 표식이다. latest 를 안 주면 전체 목록 기준(LATEST)이다 —
// app.js 는 콘텐츠 종류별로 필터링한 목록의 마커를 넘긴다.
export function hasUnseen(seen, latest = LATEST) {
  if (!latest) return false
  return String(seen ?? '') !== latest
}
