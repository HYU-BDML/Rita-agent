# -*- coding: utf-8 -*-
"""구운 카드뉴스를 **보는 쪽**. 주소 하나로 넘겨주면 열어서 바로 본다.

**왜 따로 만드나.** 여태는 다 굽고 나서 «내려받기» 밖에 없었다. 그림은 받아서
열면 되지만 **영상은 받아 봐야 알고**, 남에게 보여 주려면 파일을 통째로 보내야
했다. Dify 도 사람에게 줄 것이 없었다 — 작업대 주소는 «고치는 곳» 이지
«결과» 가 아니다.

**한 장씩 크게 보고 넘긴다(2026-09-19).** 처음에는 작은 그림을 격자에 늘어놨는데
카드가 한 장도 제대로 안 보였다. 주차소식이 쓰는 저쪽 뷰어
(`/viewer`)를 열어 보고 그 방식으로 맞췄다 — 무대 하나, 이전/다음, 옆으로 밀기,
화살표 키, 점 눌러 이동, 「3 / 7」 셈, 영상은 그 장에 오면 저절로 재생.
**다른 점 하나** — 저쪽은 `cover` 라 4:5 가 아닌 판의 가장자리가 잘린다. 여기는
`contain` 이라 안 잘린다.

**내려받기는 여기에 있다.** 작업대에서 뺐다 — 저장하면 여기로 와서 받는다.

**`/viewer` 는 저쪽 것이다.** 주차소식·경제뉴스가 같이 쓰는 함수라 안 건드린다
(`cardnews/render/app.py` 머리말 참고). 그래서 우리 것을 따로 둔다.

**바깥을 안 부른다.** 글꼴도 스크립트도 안 받아 온다 — 열쇠도 없고, 창고가
막혀도 쪽 자체는 뜬다.
"""
from __future__ import annotations

import html
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent


def _박을_받기코드() -> str:
    """`web/lib/zip.js` · `받기.js` 를 읽어 `import`/`export` 를 벗긴다.

    **작업대와 같은 파일을 쓴다**(`workbench._박을_스크립트` 와 쌍둥이다).
    베껴 쓰면 언젠가 갈라진다 — 한쪽만 고치고 다른 쪽은 그대로 남는다.
    zip 이 먼저다: 받기가 `makeZip` 을 쓴다.
    """
    조각 = []
    for 이름 in ("zip.js", "받기.js"):
        글 = (HERE / "weblib" / 이름).read_text(encoding="utf-8")
        글 = re.sub(r"^import .*$", "", 글, flags=re.M)
        글 = re.sub(r"^export ", "", 글, flags=re.M)
        조각.append(글)
    return "\n".join(조각)

# 영상인지 그림인지는 **주소 끝으로 안다.** 설계도에 새 칸을 안 만든다 —
# 굽는 쪽(`cardnews_compose.영상인가`)·작업대와 같은 규칙이다.
영상꼴 = (".mp4",)


def 영상인가(주소: str) -> bool:
    return str(주소 or "").lower().endswith(영상꼴)


def 쪽만들기(edit_id: str, 주소들: list, 작업대주소: str = "") -> str:
    """구운 주소 목록으로 보는 쪽 하나를 만든다.

    `주소들` 은 `_굽고_쌓기` 가 내는 그대로다 — 장 차례대로이고, 영상이 든
    장은 `.mp4` 주소가 온다.
    """
    쓸것 = [str(u) for u in (주소들 or []) if u]
    고치기 = (f'<a class="단추" href="{html.escape(작업대주소)}">작업대에서 고치기</a>'
            if 작업대주소 else "")
    return _쪽.replace("/*주소들*/", json.dumps(쓸것))               .replace("/*받기코드*/", _박을_받기코드())               .replace("<!--고치기-->", 고치기)


_쪽 = """<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>카드뉴스</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; background:#15171d; color:#e8e8ee; display:flex;
         flex-direction:column; align-items:center; justify-content:center;
         min-height:100dvh; gap:13px; padding:14px;
         font:15px/1.5 system-ui, -apple-system, "Malgun Gothic", sans-serif; }
  header { display:flex; gap:9px; align-items:center; flex-wrap:wrap;
           justify-content:center; }
  h1 { font-size:15px; font-weight:600; margin:0 6px 0 0; color:#99a; }
  .단추 { background:#22262c; color:#e8e8ee; border:1px solid #333a44;
          border-radius:9px; padding:8px 15px; font-size:14px; cursor:pointer;
          text-decoration:none; user-select:none; font-family:inherit; }
  .단추:hover { background:#2c3138; border-color:#4c8dff; }
  .단추:disabled { opacity:.35; cursor:default; background:#22262c;
                   border-color:#333a44; }
  .무대 { position:relative; width:min(92vw, 46vh); aspect-ratio:1080/1350;
          border-radius:14px; overflow:hidden; background:#000;
          box-shadow:0 12px 40px rgba(0,0,0,.55); }
  .장 { position:absolute; inset:0; opacity:0; transition:opacity .18s;
        pointer-events:none; }
  .장.보임 { opacity:1; pointer-events:auto; }
  .장 img, .장 video { width:100%; height:100%; object-fit:contain; display:block; }
  .줄 { display:flex; align-items:center; gap:16px; }
  .셈 { font-variant-numeric:tabular-nums; font-size:14px; color:#99a;
        min-width:64px; text-align:center; }
  .점들 { display:flex; gap:5px; flex-wrap:wrap; justify-content:center;
          max-width:min(92vw,46vh); }
  .점 { width:7px; height:7px; border-radius:50%; background:#3a3f46; cursor:pointer; }
  .점.켬 { background:#e8e8ee; }
  .메모 { font-size:12px; color:#6b7280; }
  .빈 { color:#99a; }
</style>
<header>
  <h1>카드뉴스</h1>
  <button class="단추" id="전부">전부 내려받기</button>
  <button class="단추" id="한장">이 장 내려받기</button>
  <!--고치기-->
</header>
<div class="무대" id="무대"></div>
<div class="줄">
  <button class="단추" id="앞">‹ 이전</button>
  <div class="셈" id="셈"></div>
  <button class="단추" id="뒤">다음 ›</button>
</div>
<div class="점들" id="점들"></div>
<div class="메모">좌우 화살표 키 · 옆으로 밀기 · 점을 눌러 이동</div>
<script>/*받기코드*/</script>
<script>
const 주소들 = /*주소들*/
const 무대 = document.getElementById('무대')
const 점들 = document.getElementById('점들')
let 지금 = 0

const 영상인가 = (u) => /\.mp4(\?|$)/i.test(u)
// 파일 이름·내려받기는 `받기.js` 것을 쓴다 — 작업대와 한 벌이다.
const 폴더이름 = '카드뉴스'

if (!주소들.length) {
  무대.innerHTML = '<p class="빈" style="padding:20px">아직 구운 것이 없습니다 —' +
                   ' 작업대에서 저장하면 여기에 나옵니다.</p>'
}

// **그림을 미뤄 받지 않는다(`loading="lazy"` 안 씀).** 장이 다 겹쳐 있어서
// 안 보이는 장은 «화면 밖» 으로 치고 안 받아 온다 — 넘기는 순간 빈칸이 뜬다.
주소들.forEach((u, i) => {
  const d = document.createElement('div')
  d.className = '장'
  d.innerHTML = 영상인가(u)
    ? `<video src="${u}" playsinline muted loop controls></video>`
    : `<img src="${u}" alt="${i + 1}번째 장">`
  무대.appendChild(d)
  const p = document.createElement('div')
  p.className = '점'
  p.onclick = () => 가자(i)
  점들.appendChild(p)
})

// **보이는 장의 영상만 돈다.** 안 보이는 것까지 같이 돌면 소리도 겹치고
// 느려진다 — 벗어나면 멈추고 처음으로 되감는다.
// **한 장이 잘못돼도 넘기기는 살린다**(사용자 지적 2026-09-24: 「채팅 화면 안의
// 작업대에서 「다음」이 안 넘어감 — 2/6에서 멈춤. 새 탭으로 열면 넘어감」).
//
// 넘기는 셈 자체는 멀쩡했다. 그런데 **한 장을 손보다 터지면 그 뒤가 통째로 안
// 돌아** 단추가 죽는다 — 셈을 다시 적는 줄도, 단추를 되살리는 줄도 못 지나간다.
// 그러면 사람은 「눌러도 안 넘어간다」만 본다.
//
// 그래서 **장마다 따로 감싼다.** 터진 장은 건너뛰고 나머지는 그대로 간다.
// **그리고 자국을 남긴다** — 조용히 멈추면 다시 나도 알 길이 없다.
function 가자(i) {
  지금 = Math.max(0, Math.min(주소들.length - 1, i))
  ;[...무대.children].forEach((el, k) => {
    try {
      el.classList.toggle('보임', k === 지금)
      const v = el.querySelector('video')
      if (v) { if (k === 지금) v.play().catch(() => {}); else { v.pause(); v.currentTime = 0 } }
    } catch (e) {
      console.error(`[결과쪽] ${k + 1}번째 장을 손보다 터졌다 — 건너뛴다`, e)
    }
  })
  try {
    ;[...점들.children].forEach((el, k) => el.classList.toggle('켬', k === 지금))
  } catch (e) {
    console.error('[결과쪽] 점을 켜다 터졌다', e)
  }
  // **여기부터는 «반드시» 지나가야 한다** — 셈과 단추다. 위에서 터져도 안 막힌다.
  const 셈 = document.getElementById('셈')
  if (셈) 셈.textContent = `${지금 + 1} / ${주소들.length}`
  const 앞단추 = document.getElementById('앞')
  const 뒤단추 = document.getElementById('뒤')
  if (앞단추) 앞단추.disabled = 지금 === 0
  if (뒤단추) 뒤단추.disabled = 지금 >= 주소들.length - 1
}
document.getElementById('앞').onclick = () => 가자(지금 - 1)
document.getElementById('뒤').onclick = () => 가자(지금 + 1)
addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') 가자(지금 - 1)
  if (e.key === 'ArrowRight') 가자(지금 + 1)
})
let x0 = null
무대.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX }, {passive:true})
무대.addEventListener('touchend', (e) => {
  if (x0 === null) return
  const 차 = e.changedTouches[0].clientX - x0
  if (Math.abs(차) > 40) 가자(지금 + (차 < 0 ? 1 : -1))
  x0 = null
}, {passive:true})

// **한 장은 그대로 낱장이다.** 한 장 받자고 압축을 푸는 것은 번거롭기만 하다.
document.getElementById('한장').onclick = async () => {
  const 단추 = document.getElementById('한장')
  단추.disabled = true
  try { await 한장받기(주소들[지금], 지금, 폴더이름) }
  catch (e) { alert('못 받았습니다 — ' + e.message) }
  단추.disabled = false
}

// **전부는 압축 파일 하나로 준다**(사람 지시 2026-09-21: 「폴더 안에 다 넣어서」).
//
// 여태는 한 장씩 따로 떨어뜨렸다. 일곱 장이면 다운로드 폴더에 일곱 개가 다른
// 파일들 사이로 흩어졌고, 남에게 보내려면 그걸 다시 골라내야 했다. 브라우저는
// 폴더를 못 주므로 압축 파일이 그것에 가장 가깝다 — 풀면 폴더가 된다.
document.getElementById('전부').onclick = async () => {
  const 단추 = document.getElementById('전부')
  단추.disabled = true
  try {
    await 모아받기(주소들, 폴더이름,
                (i, 모두) => { 단추.textContent = `받는 중… ${i}/${모두}` })
  } catch (e) { alert('못 받았습니다 — ' + e.message) }
  단추.textContent = '전부 내려받기'
  단추.disabled = false
}

가자(0)
if (!주소들.length) {
  document.getElementById('전부').disabled = true
  document.getElementById('한장').disabled = true
  document.getElementById('셈').textContent = '0 / 0'
}
</script>
"""
