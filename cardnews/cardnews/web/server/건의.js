// 쓰다가 남긴 건의를 표(D1)에 넣고 꺼낸다.
//
// **적는 것은 아무나, 보는 것은 출입증이 있어야 한다**(사람 결정 2026-09-21).
// 적는 쪽에 암호를 걸면 아무도 안 쓴다 — 건의는 쓰는 사람이 귀찮으면 그냥
// 안 하고 마는 일이다. 모인 것은 우리만 본다.
//
// **이름을 안 받는다.** 익명이다. 대신 «어디서 눌렀는지» 를 화면이 자동으로
// 붙인다 — 글만 쌓이면 무엇이 불편했는지 영영 모른다.
//
// 판단하는 부분(형식 검사)은 순수 함수로 빼서 D1 없이 시험한다 — `measures.js`
// 와 같은 결이다.

// 한 건은 길어야 이 정도다. 넘으면 잘라서 받는다 — 길게 썼는데 통째로 버리면
// 쓴 사람은 그 글을 다시 못 살린다.
export const 글최대 = 2000
// 화면 이름과 주소는 우리가 붙이는 값이라 짧다. 그래도 한도를 둔다 — 화면 쪽을
// 고쳐서 아무거나 보낼 수 있다.
const 화면최대 = 100
const 주소최대 = 500

/** 올라온 건의가 쓸 만한지 본다. 이상하면 `why` 만 돌려준다. */
export function 건의검사(몸) {
  const 글 = String(몸?.글 ?? '').trim().slice(0, 글최대)
  if (!글) return { why: '내용을 적어 주세요' }
  return {
    줄: {
      글,
      화면: String(몸?.화면 ?? '').trim().slice(0, 화면최대),
      카드뉴스: String(몸?.카드뉴스 ?? '').trim().slice(0, 주소최대),
    },
  }
}

export async function 건의넣기(db, 줄, 번호, 때) {
  await db
    .prepare('INSERT INTO suggestions (id, body, screen, made, at) VALUES (?, ?, ?, ?, ?)')
    .bind(번호, 줄.글, 줄.화면, 줄.카드뉴스, 때)
    .run()
}

// 최신 것이 위로. 500 건이 넘어가면 그때 쪽 나누기를 붙인다 — 지금 붙이면
// 아무도 안 쓰는 코드를 먼저 만드는 꼴이다.
export async function 건의목록(db) {
  const r = await db
    .prepare('SELECT id, body, screen, made, at FROM suggestions ORDER BY at DESC LIMIT 500')
    .all()
  return (r?.results ?? []).map((x) => ({
    번호: x.id, 글: x.body, 화면: x.screen, 카드뉴스: x.made, 때: x.at,
  }))
}
