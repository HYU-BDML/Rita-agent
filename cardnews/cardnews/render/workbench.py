# -*- coding: utf-8 -*-
"""작업대 한 쪽을 만든다. 자족적인 HTML 하나 — 바깥 스크립트를 안 부른다.

**층으로 나눠 얹는다.** 배경은 CSS, 사진은 원본 주소, 글자는 진짜 글자다.
그래서 서버가 미리 구워 둘 것이 하나도 없다. 진짜 카드는 저장할 때 한 번
`cardnews_compose` 가 만든다.

**`viewer.py` 를 대신하지 않는다.** 저것은 보기 전용으로 그대로 남는다.
"""
import json
import re

import edit_store
import 주소
import 작업대말
from pathlib import Path

HERE = Path(__file__).resolve().parent
CANVAS = (1080, 1350)
줄간격 = 1.32
세로보정 = 0.0558
"""CSS 줄상자와 PIL 어센더 기준의 차이(글자 크기 대비 비율). **실측값이다** —
`Pretendard-Medium` 을 pt 37·41·45·106 에서 재서(`f.getmetrics()` 의 어센더·
디센더) 얻은 네 값 0.0519·0.0502·0.06·0.0609 의 평균이다. pt 마다 최대·최소가
19% 가량 흔들렸다(정수로 반올림되는 PIL 어센더·디센더 탓) — 짐작이 아니라 그
흔들림까지 실측해서 평균으로 접은 값이다. 자세한 숫자는 task-6-report.md 참고.
바꿔야 하면 겹쳐 보기 시험(Task 6 Step 7)을 다시 돌려라."""

_띠꼴 = re.compile(r"\s*(#[0-9A-Fa-f]{6})@([\d.]+)%\s*")
_글꼴칸 = {"Bold": "Pretendard-Bold", "Regular": "Pretendard-Medium"}

# 라벨이 고를 수 있는 여덟 종 → (CSS 글꼴 이름, Bold 파일, Regular 파일).
#
# **여태 작업대는 프리텐다드만 그렸다**(사람 지적 2026-08-29). 굽는 쪽은 고쳐
# 놓고 여기는 안 고쳤으니, 틀에 「검은고딕」이라 적혀 있어도 화면과 구운 그림이
# 달랐다. 굽는 쪽(`cardnews_compose.한글글꼴`)과 **같은 여덟이어야 한다.**
#
# 굵기가 한 벌뿐인 글꼴(잘난체·검은고딕·도현)은 두 자리에 같은 파일을 쓴다.
_글꼴들 = {
    "프리텐다드": ("Pretendard", "Pretendard-Bold.otf", "Pretendard-Medium.otf"),
    "원티드산스": ("WantedSans", "WantedSans-Bold.otf", "WantedSans-Medium.otf"),
    "지마켓산스": ("GmarketSans", "GmarketSansTTFBold.ttf", "GmarketSansTTFMedium.ttf"),
    "에스코어드림": ("SCDream", "SCDream7.otf", "SCDream4.otf"),
    "여기어때잘난체": ("Jalnan", "JalnanGothicTTF.ttf", "JalnanGothicTTF.ttf"),
    "검은고딕": ("BlackHanSans", "BlackHanSans-Regular.ttf", "BlackHanSans-Regular.ttf"),
    "배민도현": ("DoHyeon", "DoHyeon-Regular.ttf", "DoHyeon-Regular.ttf"),
    "나눔스퀘어라운드": ("NanumSquareRound", "NanumSquareRoundB.ttf", "NanumSquareRoundR.ttf"),
    "나눔명조": ("NanumMyeongjo", "NanumMyeongjo-Bold.ttf", "NanumMyeongjo-Regular.ttf"),
}


def _글꼴규칙() -> str:
    """여덟 종의 `@font-face`. 파일은 창고의 `fonts/` 에 있다."""
    줄 = []
    for _, (이름, 굵은것, 가는것) in _글꼴들.items():
        줄.append(f'  @font-face {{ font-family: {이름}; font-weight: 700;'
                  f' src: url("./../fonts/{굵은것}"); }}')
        줄.append(f'  @font-face {{ font-family: {이름}; font-weight: 500;'
                  f' src: url("./../fonts/{가는것}"); }}')
    return "\n".join(줄)
"""«Regular» 은 Medium 으로 그린다 — 레포에 Pretendard Regular 파일이 없어서
`cardnews_compose.WEIGHT_TO_FONT` 가 이미 그렇게 대신 쓴다. 같은 대응을 써야
화면과 결과가 안 어긋난다."""


def _음영기본값() -> str:
    """전체 사진 음영의 기본값을 **굽는 쪽에서 읽어** 화면에 넣는다.

    두 곳에 숫자를 따로 적으면 언젠가 갈라진다 — 실제로 40 에서 45 로 바꿀 때
    굽는 쪽만 바뀌고 화면은 40 인 채였다(2026-09-18, 시험이 잡았다).
    원본은 `cardnews_compose` 한 곳뿐이다.
    """
    import cardnews_compose as cc      # noqa: PLC0415 — 쪽을 만들 때만 필요하다
    return json.dumps([cc.음영기본색, cc.음영기본진하기, cc.음영시작])


def _그림자기본값() -> str:
    """사진 바깥 그림자의 기본값·거리·흐림을 굽는 쪽에서 읽어 넣는다.

    까닭은 `_음영기본값` 과 같다 — 원본은 `cardnews_compose` 한 곳뿐이다.
    """
    import cardnews_compose as cc      # noqa: PLC0415
    return json.dumps([cc.그림자기본색, cc.그림자기본진하기, cc.그림자아래, cc.그림자흐림])


def _선굵기상한() -> str:
    """테두리 굵기 상한을 **설계도 검사에서 읽어** 화면에 넣는다.

    까닭은 `_음영기본값` 과 같다 — 화면 막대가 검사보다 큰 값을 내면 사람이
    끌어 놓고 저장할 때서야 「선굵기는 0~60 이다」를 본다.
    """
    import edit_store                  # noqa: PLC0415
    return json.dumps(edit_store.선굵기상한)


def 배경CSS(배경: dict) -> str:
    """설계도의 배경을 CSS 값 하나로. 모르는 것은 흰색 — 쪽이 죽지 않는다.

    **배경판을 그 위에 얹는다.** 굽는 쪽(`cardnews_compose._draw_background`)이
    색·그라데이션을 칠하고 판을 덮는 것과 같은 차례다. 여태 여기서는 판을 아예
    안 봤다 — 구운 그림에는 종이 질감·찢어진 가장자리가 있는데 **고치는 화면에는
    없었다**(사람 지적 2026-08-29: 「아직도 배경을 반영 안 했는데…?」).

    CSS 는 앞 겹이 위다. 그래서 판을 먼저 적고 색·그라데이션을 뒤에 적는다.
    """
    바닥 = _배경바닥(배경)
    판 = 주소.다듬기((배경 or {}).get("판") or "")
    if not 판:
        return 바닥
    # 따옴표와 괄호가 든 주소는 CSS 를 깨뜨린다 — 창고 주소엔 없지만 막아 둔다.
    if any(c in 판 for c in "\"'()\ "):
        return 바닥
    return f'url("{판}") center / 100% 100% no-repeat, {바닥}'


def _배경바닥(배경: dict) -> str:
    """판 밑에 깔릴 색. 판에서 뚫린 자리로 이것이 비친다."""
    종류 = (배경 or {}).get("종류")
    if 종류 == "단색":
        return 배경.get("hex") or "#FFFFFF"
    if 종류 == "그라데이션":
        멈춤 = _띠꼴.findall(배경.get("띠") or "")
        if not 멈춤:
            return "#FFFFFF"
        속 = ", ".join(f"{색} {몫}%" for 색, 몫 in 멈춤)
        return f"linear-gradient(180deg, {속})"
    # 사진·미측정은 그림이 그 위를 덮는다. 밑에 깔린 바닥색까지 흰색으로 지우면
    # 사진이 장 전체를 안 덮을 때 화면과 구운 결과가 어긋난다.
    return 배경.get("hex") or "#FFFFFF"


def _박을_스크립트() -> str:
    """`web/lib/workbench.js` 와 `boxedit.js` 를 읽어 `export`/`import` 를 벗긴다.

    **두 벌로 만들지 않는다.** 시험이 도는 것은 `web/` 쪽 파일이고, 쪽에는 그
    파일의 «내용»이 들어간다. 여기서 베껴 쓰면 언젠가 갈라진다.
    """
    조각 = []
    # **zip 이 받기보다 먼저다** — 받기가 `makeZip` 을 쓴다.
    for 이름 in ("boxedit.js", "workbench.js", "zip.js", "받기.js"):
        글 = (HERE / "weblib" / 이름).read_text(encoding="utf-8")
        글 = re.sub(r"^import .*$", "", 글, flags=re.M)
        글 = re.sub(r"^export ", "", 글, flags=re.M)
        조각.append(글)
    return "\n".join(조각)


def _강조색유추(cards: list) -> str:
    """새로 찍을 형광펜의 기본색. **설계도에서 유추한다.**

    카드뉴스 전체 강조색을 따로 들고 다니지 않는다 — 형광펜이 제 색을 갖게 된
    뒤로 `cards_json` 이 자족적이라, 덩어리의 형광펜 색에서 그 틀의 색을 알 수 있다.
    하나도 없으면 실측 게시물 값으로 둔다.
    """
    for c in cards or []:
        for r in c.get("글자영역") or []:
            for 줄 in r.get("글줄") or []:
                for d in 줄.get("덩어리") or []:
                    h = d.get("형광펜")
                    if isinstance(h, str) and h:
                        return h
    return "#C9FC95"


def 쪽만들기(edit_id: str, cards: list, png주소들: list, 언어: str = "",
         결과주소: str = "") -> str:
    """`언어` 를 안 주면 한국어다 — 옛 부르는 쪽이 그대로 돈다.

    **이 쪽은 브라우저 저장소를 못 읽는다.** 라벨판은 채팅과 같은 출처의
    iframe 이라 거기서 고른 언어를 그대로 읽었지만, 작업대는 창고(S3)에 구워
    올리는 쪽이라 출처가 다르다. 그래서 **구울 때 박는다.**
    """
    # 박기 전에 글줄로 — 작업대 화면은 새 모양만 안다(2026-09-28).
    cards = edit_store.카드들글줄로(cards)
    쓸말 = 작업대말.쓸말(언어)
    강조색 = _강조색유추(cards)
    cards = [{**c, "배경CSS": 배경CSS(c.get("배경"))} for c in cards]
    상태 = {"id": edit_id, "cards": cards, "png": png주소들,
           "canvas": list(CANVAS), "줄간격": 줄간격, "세로보정": 세로보정,
           "글꼴칸": _글꼴칸, "강조색": 강조색,
           # 슬롯의 `font` 를 CSS 글꼴 이름으로 옮기는 표.
           "글꼴이름": {k: v[0] for k, v in _글꼴들.items()},
           # **쪽이 제 언어를 안다.** 저장할 때 돌려보내야 다시 구워도 유지된다 —
           # 이 쪽은 창고에 구워 올라가는 것이라 브라우저 저장소를 못 읽는다.
           "언어": 쓸말,
           # **결과 쪽 주소를 처음부터 들고 있는다**(사람 지시 2026-09-21).
           # 여태는 저장이 돌려주는 값으로만 채워서, 만들자마자 연 사람은
           # 「결과물 보기」가 회색으로 죽어 있었다 — 저장을 누르기 전에는
           # 결과 쪽이 아예 안 구워졌기 때문이다. 이제 같이 구워진다.
           "결과": 결과주소,
           "ep": "https://l26m3zzcjd.execute-api.ap-northeast-2.amazonaws.com"}
    # **고른 언어로 이미 푼 표를 넣는다.** JS 가 언어를 다시 고를 일이 없다 —
    # 고르는 규칙이 두 벌이 되면 한쪽만 고치게 된다.
    말표 = {k: 작업대말.말(k, 쓸말) for k in 작업대말._말}
    말표["낱말"] = {k: 작업대말.낱말(k, 쓸말) for k in 작업대말._낱말}
    return _쪽.replace("/*말*/", json.dumps(말표, ensure_ascii=False)) \
              .replace("/*쪽제목*/", 작업대말.말("쪽제목", 쓸말)) \
              .replace("/*상태*/", json.dumps(상태, ensure_ascii=False)) \
              .replace("/*기하*/", _박을_스크립트()) \
              .replace("/*음영기본값*/", _음영기본값()) \
              .replace("/*그림자기본값*/", _그림자기본값()) \
              .replace("/*선굵기상한*/", _선굵기상한()) \
              .replace("/*글꼴*/", _글꼴규칙())


_쪽 = """<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>/*쪽제목*/</title>
<style>
/*글꼴*/
  * { box-sizing: border-box; }
  body { margin:0; background:#111317; color:#e8eaed; display:flex;
         flex-direction:column; align-items:center; gap:12px; padding:14px;
         font-family:Pretendard,-apple-system,"Segoe UI",system-ui,sans-serif; }
  /* **무대와 패널을 가로로 나란히 세운다**(사람 결정 2026-09-18, 미리캔버스
     구조). 여태 단추 15개가 한 줄에 몰려 있어서 슬라이더를 넣을 자리가 없었고,
     그래서 글자 크기·정렬·글씨체를 못 달았다. */
  .일터 { display:flex; gap:14px; align-items:flex-start; }
  .왼쪽 { display:flex; flex-direction:column; align-items:center; gap:10px; }
  #패널 { width:286px; flex:0 0 286px; background:#191c21; border-radius:12px;
         padding:12px 14px; max-height:80vh; overflow-y:auto;
         font-size:13px; color:#c8ccd2; }
  #패널 .패널제목 { font-size:15px; font-weight:700; color:#e8eaed;
                  padding-bottom:8px; border-bottom:1px solid #2a2f36; margin-bottom:10px; }
  #패널 .줄칸 { display:flex; align-items:center; gap:8px; margin:8px 0; }
  /* **`hidden` 이 `display:flex` 를 못 이긴다.** 위 규칙은 아이디(`#패널`)를
     끼고 있어 브라우저가 기본으로 주는 `[hidden] { display:none }` 보다 세다 —
     접어 둔 줄이 그대로 보였다(사람 지적 2026-09-19: 「여전히 보임」). */
  #패널 .줄칸[hidden] { display:none; }
  #패널 .줄칸 > span:first-child { min-width:52px; color:#9aa0a6; }
  #패널 button { background:#22262d; color:#c8ccd2; border:1px solid #2f343c;
                border-radius:6px; padding:3px 9px; cursor:pointer; font-size:13px; }
  #패널 button:hover { background:#2a2f36; }
  #패널 button.눌림 { background:#4c8dff; color:#fff; border-color:#4c8dff; }
  /* 모양 단추 — 이름 대신 «그 모양» 을 보여 준다(사람 지시 2026-09-19:
     「이름말고 … 모양을 보여주는거임」). 이름은 마우스를 올리면 뜬다. */
  #패널 button.모양단추 { padding:3px; line-height:0; }
  #패널 button.모양단추 svg { display:block; fill:currentColor; }
  /* **여섯이 한 줄에 들어가야 한다.** 286px 패널에 34px 단추 여섯이면 넘쳐서
     가로 밀대가 생기고 육각형이 잘렸다(사람 지적 2026-09-19). 단추를 28px 로
     줄이고, 빈 이름칸은 아예 없앤다. 그래도 넘치면 밀지 말고 접는다. */
  #패널 .줄칸.모양줄 { gap:5px; flex-wrap:wrap; }
  #패널 .줄칸.모양줄 > span:first-child:empty { display:none; }
  #패널 input[type=number] { width:56px; background:#22262d; color:#e8eaed;
                            border:1px solid #2f343c; border-radius:6px; padding:3px 6px; }
  /* 색칩 — 누르면 우리 팔레트가 뜬다(브라우저 기본 색칸이 아니다). */
  #패널 details { border-top:1px solid #2a2f36; padding:8px 0 4px; margin-top:6px; }
  #패널 summary { cursor:pointer; color:#9aa0a6; font-weight:600; list-style:none; }
  #패널 summary::-webkit-details-marker { display:none; }
  #패널 summary::before { content:'▶ '; font-size:10px; }
  #패널 details[open] summary::before { content:'▼ '; }
  #패널 input[type=range] { flex:1; height:18px; cursor:pointer; }
  #패널 .색칩 { width:34px; height:24px; padding:0; border-radius:6px; cursor:pointer;
               border:1px solid #4a505a; }
  #패널 .색칩:hover { outline:2px solid #4c8dff; }
  /* 글자색 칩 옆 색 이름(#RRGGBB) — 누른 글자의 색(사람 요청 2026-09-29). */
  #패널 .색이름 { font-size:11px; color:#9aa0a6; font-family:Consolas, monospace; }
  #패널 select { flex:1; background:#22262d; color:#e8eaed; border:1px solid #2f343c;
                border-radius:6px; padding:3px 6px; }
  /* **색 고르개는 우리가 그린다**(사람 결정 2026-09-19). 윈도우 색 고르개 창이
     뜨면 그 사이 브라우저가 포커스를 잃어 긁어놓은 선택이 풀린다. */
  #색고르개 { position:fixed; z-index:50; width:266px; background:#1f2329;
             border:1px solid #363c45; border-radius:10px; padding:12px;
             box-shadow:0 12px 32px rgba(0,0,0,.5); }
  #색고르개 .갈래이름 { font-size:12px; color:#9aa0a6; margin:0 0 7px; }
  #색고르개 .격자 { display:grid; grid-template-columns:repeat(7, 1fr); gap:5px; }
  #색고르개 .칩 { width:100%; aspect-ratio:1; border-radius:5px; cursor:pointer;
                border:1px solid rgba(255,255,255,.14); }
  #색고르개 .칩:hover { outline:2px solid #4c8dff; }
  #색고르개 .칩.고름 { outline:2px solid #4c8dff; }
  /* 「없음」은 대각선 하나로 보인다 — 흰색과 헷갈리면 안 된다. */
  #색고르개 .칩.없음 { background:
      linear-gradient(135deg, transparent 46%, #ff5555 46%, #ff5555 54%, transparent 54%), #2a2f36; }
  #색고르개 .가름선 { height:1px; background:#2f343c; margin:11px 0; }
  #색고르개 .직접 { display:flex; align-items:center; gap:7px; }
  #색고르개 .직접 input[type=text] { flex:1; background:#22262d; color:#e8eaed;
      border:1px solid #2f343c; border-radius:6px; padding:4px 7px; font-size:13px; }
  /* 미리보기는 «누르는 것» 이다 — 누르면 아래 무지개 판이 펴진다. */
  #색고르개 .직접 .미리보기 { width:30px; height:26px; flex:0 0 30px;
      border:1px solid #4a505a; border-radius:6px; cursor:pointer; padding:0; }
  #색고르개 .직접 .미리보기:hover { border-color:#4c8dff; }
  /* 무지개 판 — 네모에서 «짙기·밝기», 띠에서 «색». 브라우저 것을 안 쓰는
     까닭은 `색고르개열기` 머리말 참고. */
  #색고르개 .무지개 { margin-top:11px; }
  #색고르개 .판 { position:relative; height:112px; border-radius:7px;
      cursor:crosshair; touch-action:none;
      border:1px solid rgba(255,255,255,.14); overflow:hidden; }
  #색고르개 .판 .하양 { position:absolute; inset:0;
      background:linear-gradient(to right, #fff, rgba(255,255,255,0)); }
  #색고르개 .판 .검정 { position:absolute; inset:0;
      background:linear-gradient(to top, #000, rgba(0,0,0,0)); }
  #색고르개 .판 .집게 { position:absolute; width:13px; height:13px;
      margin:-7px 0 0 -7px; border-radius:50%; pointer-events:none;
      border:2px solid #fff; box-shadow:0 0 0 1px rgba(0,0,0,.6); }
  #색고르개 .색띠 { position:relative; height:14px; margin-top:9px;
      border-radius:7px; cursor:pointer; touch-action:none;
      border:1px solid rgba(255,255,255,.14);
      background:linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00); }
  #색고르개 .색띠 .집게 { position:absolute; top:-3px; width:12px; height:18px;
      margin-left:-6px; border-radius:4px; pointer-events:none;
      border:2px solid #fff; box-shadow:0 0 0 1px rgba(0,0,0,.6); }
  .무대 { position:relative; width:min(58vw, 64vh); aspect-ratio:1080/1350;
         overflow:hidden; border-radius:14px; }
  .칸 { position:absolute; }
  .칸.사진 img, .칸.인물 img { width:100%; height:100%; object-fit:cover; display:block; }
  .칸.로고 img { width:100%; height:100%; object-fit:contain; display:block; }
  .칸.사진 video, .칸.인물 video { width:100%; height:100%; object-fit:cover; display:block; }
  /* 자리표시 — **굽는 쪽과 같은 회색이다.** 예전엔 테두리만 그려서, 구운
     그림에는 회색 덩이가 나오는데 화면은 «비어» 보였다(사람이 2026-08-27
     알려 줬다). 점선은 남긴다 — 여기는 고치는 자리라 «누를 수 있는 칸» 이라는
     표시가 필요하다. */
  /* **배경 사진 자리는 투명하다**(사람 결정 2026-09-01). 겉에 점선, 가운데
     물음표뿐이다. 칠하지 않는 까닭은 **밑에 이미 배경색이 깔려 있어서** 다 —
     원본 사진의 평균색을 배경으로 올렸다(`make_dsl_cardnews`). 여기서 또
     칠하면 자리표시가 배경 노릇을 하게 되어, 자리를 옮기거나 지우면 배경이
     같이 사라진다. */
  .칸.배경빈 { background:transparent; border:2px dashed rgba(0,0,0,.28);
               color:rgba(0,0,0,.30); font-weight:700; display:grid;
               place-items:center; font-size:56px; }
  .칸.배경빈::after { content:'?'; }
  /* **속을 안 칠한다**(사람 결정 2026-09-18: 「그냥 투명하게 그리고 겉에만
     점선, 중앙에 ?」). 회색으로 꽉 채우면 사진 넣기 전 카드가 회색 덩어리로
     보인다. 굽는 쪽(`cardnews_compose._decoration_속`)과 같은 규칙이라야
     화면과 구운 그림이 안 갈린다. */
  /* **빈 자리 점선은 «자리를 안 차지하게» 그린다.** 예전엔 `border:3px dashed`
     였는데, 그러면 테두리(`선색`·`선굵기`)를 그리는 안쪽 그림자가 그 3px 만큼
     밀려 들어가 「선이 칸 맨 바깥이 아니라 안에 있다」가 됐다(사람 지적
     2026-09-19). 네 변에 점선 무늬를 깔면 자리를 안 먹고, 테두리가 그 위를
     덮으므로 선이 칸의 맨 바깥에 놓인다. */
  /* 모양을 오린 빈 자리는 네 변 점선을 끈다 — `빈점선그리기` 가 모양을 따라 긋는다. */
  .칸.빈.모양빈 { background:none; }
  .칸.빈 { color:#B4B4B4; font-weight:700;
           background:
             repeating-linear-gradient(90deg,#B4B4B4 0 9px,transparent 9px 17px) top/100% 3px no-repeat,
             repeating-linear-gradient(90deg,#B4B4B4 0 9px,transparent 9px 17px) bottom/100% 3px no-repeat,
             repeating-linear-gradient(0deg,#B4B4B4 0 9px,transparent 9px 17px) left/3px 100% no-repeat,
             repeating-linear-gradient(0deg,#B4B4B4 0 9px,transparent 9px 17px) right/3px 100% no-repeat;
           display:flex; align-items:center; justify-content:center; }
  .칸.글자 { white-space:pre; }
  /* 글머리기호 — 굽는 쪽(`cardnews_compose._글머리찍기`)과 같은 자리·크기다.
     `em` 으로 적어서 글자 크기가 바뀌어도 같은 비율로 따라간다. */
  .줄[data-글머리] { position:relative; }
  .줄[data-글머리]::before { position:absolute; left:0.28em; top:0.52em;
      transform:translateY(-50%); color:currentColor; }
  .줄[data-글머리="원"]::before { content:''; width:0.32em; height:0.32em;
      background:currentColor; border-radius:50%; }
  .줄[data-글머리="네모"]::before { content:''; width:0.30em; height:0.30em;
      background:currentColor; }
  .줄[data-글머리="줄표"]::before { content:''; width:0.48em; height:0.09em;
      background:currentColor; }
  .줄[data-글머리="번호"]::before { content:attr(data-몇째) '.'; top:0;
      transform:none; font-size:1em; }
  /* **브라우저 기본 포커스 링을 끈다**(사람 지적 2026-09-18: 「난 그냥 줄
     일자였으면 좋겠는데」). 글자칸은 `contentEditable` 이라 누르면 크롬이 제
     링을 그리는데, 그 링은 네모가 아니라 «줄마다의 글자 폭» 을 따라가서 줄
     길이가 다르면 계단이 진다. 고른 표시는 우리가 그리는 파란 네모(`.선택겹`)가
     이미 하므로 잃는 것이 없다. 안쪽 `span`(형광펜·굵은 토막)도 같이 끈다. */
  .칸.글자:focus, .칸.글자 *:focus { outline:none; }
  /* **색 고르개가 열린 동안 칠할 글자를 보인다**(손잡이엔 상태 표시까지, 2026-09-29).
     표(`_고름`)는 저장 전에 떼므로 이 점선은 화면에만 있다 — 구운 그림엔 안 나온다. */
  .칸.글자 span.덩[data-고름] { outline:2px dashed #4c8dff; outline-offset:1px; }
  .칸.골랐음 { outline:2px solid #4c8dff; }
  /* **가로로 넘친 줄을 빨갛게 안 칠한다**(사람 지적 2026-09-18: 「줄 넘어가면
     빨간색으로 보이잖아 그거 없애자, 색깔 이 부분만」). 셈과 `.넘침` 표는
     그대로 둔다 — 굽는 쪽·대본 검증이 같은 셈을 쓴다. 칠만 안 한다.
     다른 빨간 표시(카드 밖으로·세로 넘침·올리기 실패)는 뜻이 달라 남긴다. */
  .줄 { line-height:1; }
  /* 모양을 딴 도형에 선을 긋는 겹. 오려낸(clip-path) 칸 «안» 에 들어가므로
     선의 바깥 절반이 잘린다 — 그래서 굵기를 두 배로 주고 안쪽 절반만 남긴다.
     굽는 쪽(`cardnews_compose._선그리기`)도 같은 셈이다. */
  .테두리겹 { position:absolute; inset:0; width:100%; height:100%;
              pointer-events:none; overflow:visible; box-sizing:border-box;
              z-index:3; }
  .굵기칸 { width:52px; background:#22262d; color:#e8eaed; border:1px solid #2f343c;
            border-radius:6px; padding:3px 6px; font-size:13px; text-align:right; }
  .손잡이 { position:absolute; width:12px; height:12px; margin:-6px 0 0 -6px;
           background:#4c8dff; border:2px solid #fff; border-radius:3px; }
  .옮기기손잡이 { position:absolute; left:-9px; top:-22px; width:16px; height:14px;
                background:#4c8dff; border:2px solid #fff; border-radius:3px;
                cursor:move; }
  .회전손잡이 { position:absolute; left:50%; top:-26px; width:12px; height:12px;
              margin-left:-6px; background:#4c8dff; border:2px solid #fff;
              border-radius:50%; cursor:grab; }
  .칸.밖으로 { outline:2px solid #ff5555; }
  /* **세로로 넘쳐도 안 두른다**(사람 지적 2026-09-20: 「글자 아웃되어도
     빨간색 안뜨게 하고싶어 보기 흉흉해」). 2026-09-18 에 «가로» 넘침만
     칠을 뺐는데, 사람이 보기엔 둘 다 「글자가 넘쳤다」 하나다.
     셈과 `.세로넘침` 표는 그대로 둔다 — 굽는 쪽이 같은 셈을 쓴다.
     위의 `.밖으로`·`.올리기실패` 는 뜻이 달라 남긴다(사람이 고쳐야 하는 일). */
  .칸.올리기실패 { outline:2px solid #ff5555; }
  .넘김줄 { display:flex; align-items:center; gap:14px; }
  .셈 { font-variant-numeric:tabular-nums; font-size:14px; color:#9aa0a6;
       min-width:64px; text-align:center; }
  .색칸 { display:inline-flex; align-items:center; gap:5px; font-size:13px; color:#9aa0a6; }
  .색칸 input { width:28px; height:24px; padding:0; border:none; background:none; cursor:pointer; }
  .색칸 input[type=range] { width:76px; height:18px; cursor:pointer; }
  .음영값 { min-width:30px; font-variant-numeric:tabular-nums; }
  .머리줄 { display:flex; align-items:center; gap:14px;
           width:min(96vw, calc(64vh + 300px)); }
  .제목 { font-weight:700; font-size:15px; color:#9aa0a6; margin-right:auto; }
  .귀띔 { font-size:12px; color:#6b7075; }
  .귀띔 b { color:#9aa0a6; font-weight:600; }
  .층표 { font-size:13px; color:#9aa0a6; font-variant-numeric:tabular-nums;
         min-width:56px; display:inline-block; }
  /* 고른 표시는 «그림» 이 아니라 «연장» 이다 — 뒤로 보낸 사진이 덮여도 보여야
     한다. 그래서 칸 안이 아니라 무대 맨 위 겹에 따로 그린다. */
  .선택겹 { position:absolute; outline:2px solid #4c8dff; pointer-events:none; }
  .선택겹.밖으로 { outline-color:#ff5555; }
  .선택겹 .옮기기손잡이, .선택겹 .회전손잡이 { pointer-events:auto; }
</style>
<div class="머리줄">
  <!-- **글자는 `말` 이 채운다**(쪽 맨 아래). 여기 박아 두면 영어로 열어도
       한국어로 남는다 — 라벨판에서 쪽 제목이 그랬다(2026-09-19). -->
  <span class="제목" data-말="쪽제목"></span>
  <button id="ㅁ되돌" data-말title="되돌리기">↶</button>
  <button id="ㅂ다시" data-말title="다시">↷</button>
  <span id="셈"></span>
  <button id="ㅅ저장" data-말="저장"></button>
  <button id="ㅈ받기" data-말="전부받기" data-말title="전부받기설명"></button>
  <button id="ㅇ결과" data-말="결과물보기" data-말title="결과물설명"></button>
</div>
<div class="일터">
  <div class="왼쪽">
    <div class="넘김줄">
      <button id="ㄱ이전" data-말="이전"></button>
      <span class="셈" id="장셈"></span>
      <button id="ㄴ다음" data-말="다음"></button>
    </div>
    <div class="무대" id="무대"></div>
  </div>
  <aside id="패널"></aside>
</div>
<!-- **처리 코드가 이 단추들의 id 를 잡고 있다.** 없애면 그 자리에서 죽으므로
     숨긴 채로 둔다 — 패널 단추가 이것들을 대신 누른다(사람 결정 2026-09-19:
     아래 가로 막대를 없애고 오른쪽 패널로 모은다). -->
<div hidden>
  <button id="ㄱ사진"></button>
  <button id="ㄴ글자추가"></button>
  <button id="ㄷ사진추가"></button>
  <button id="ㅁ도형추가"></button>
  <button id="ㅌ뒤로"></button>
  <button id="ㅍ앞으로"></button>
  <span id="층표"></span>
</div>
<div class="귀띔" id="귀띔"></div>
<input type="file" id="파일고르기" accept="image/*,video/mp4" hidden>
<script>
const 상태 = /*상태*/;
// **화면 글자는 여기 한 벌뿐이다**(`render/작업대말.py` 가 고른 언어로 이미
// 풀어 넣는다). 이 쪽은 창고에 구워 올라가는 것이라 브라우저 저장소를 못
// 읽는다 — 언어는 구울 때 박힌다.
const 말표 = /*말*/;
const 말 = (열쇠) => (말표[열쇠] !== undefined ? 말표[열쇠] : 열쇠)
// 설계도에 저장되는 값(정렬·종류)을 **보여 줄 때만** 갈아 끼운다.
// **값은 한국어 그대로다** — 영어로 바꾸면 굽는 쪽이 못 찾는다.
const 낱말 = (값) => (말표.낱말 && 말표.낱말[값]) || 값

// 마크업에 박아 둔 자리를 채운다. 글자를 HTML 에 두면 영어로 열어도 한국어로 남는다.
for (const el of document.querySelectorAll('[data-말]')) el.textContent = 말(el.dataset.말)
for (const el of document.querySelectorAll('[data-말title]')) el.title = 말(el.dataset.말title)

// 귀띔 한 줄. **조각으로 잇는다** — 굵은 글씨 자리가 두 언어에서 다르다.
;(() => {
  const 굵 = (s) => `<b>${s}</b>`
  const 귀 = document.getElementById('귀띔')
  if (!귀) return
  귀.innerHTML = [
    `${말('귀띔_순서')} ${굵('Shift')}+${굵('-')} ${말('귀띔_뒤로')} · `
      + `${굵('Shift')}+${굵('+')} ${말('귀띔_앞으로')}`,
    `${말('귀띔_겹친데')} ${굵(말('귀띔_또누르면'))} ${말('귀띔_밑엣것')}`,
    `${굵('Del')} ${말('귀띔_사진빼기')}`,
    `${말('귀띔_구멍')} ${굵(말('귀띔_구멍말'))}${말('귀띔_구멍설명')}`,
  ].join(' · ')
})()
// 영상은 주소 끝이 .mp4 인 것으로 안다 — 설계도에 새 칸이 없다(굽는 쪽과 같은 규칙).
const 영상인가 = (r) => /\\.mp4$/i.test(r.media_url || '')
// **전체 사진 아래 음영.** 굽는 쪽(`cardnews_compose._음영얹기`)과 같은 겹이다 —
// 한쪽만 그리면 미리보기와 구운 그림이 갈린다. 기본값은 파이썬에서 박아 넣는다
// (두 곳에 따로 적으면 언젠가 갈라진다 — 시험이 같은 값인지 본다).
const [그림자기본색, 그림자기본진하기, 그림자아래, 그림자흐림] = /*그림자기본값*/
const [음영기본색, 음영기본진하기, 음영시작] = /*음영기본값*/
const 선굵기상한 = /*선굵기상한*/
// **사진 바깥 그림자.** 굽는 쪽(`cardnews_compose._그림자깔기`)과 같은 값이다.
// `box-shadow` 가 아니라 `drop-shadow` 를 쓴다 — 모양 있는 사진은 `clip-path` 로
// 오리는데, 오린 요소의 `box-shadow` 는 그림자까지 잘려서 안 보인다.
// 흐림 값은 CSS 가 «표준편차» 로 받아 Pillow 와 같은 뜻이다(굽는 쪽은
// `GaussianBlur(흐림)`). 거리·흐림은 카드 좌표라 화면 배율 `s` 를 곱한다.
function 그림자CSS(r, s) {
  let 진 = r.그림자진하기
  if (진 === undefined || 진 === null) 진 = 그림자기본진하기
  진 = Math.max(0, Math.min(100, Number(진) || 0))
  if (!진) return ''                       // 0 = 끄기
  const h = (r.그림자색 || 그림자기본색).replace('#', '')
  const [R, G, B] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  return `drop-shadow(0 ${그림자아래 * s}px ${그림자흐림 * s}px rgba(${R},${G},${B},${진 / 100}))`
}
function 음영CSS(r) {
  let 진 = r.음영진하기
  if (진 === undefined || 진 === null) 진 = 음영기본진하기
  진 = Math.max(0, Math.min(100, Number(진) || 0))
  if (!진) return ''                       // 0 = 끄기
  const h = (r.음영색 || 음영기본색).replace('#', '')
  const [R, G, B] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  const 시작 = Math.round(음영시작 * 100)
  return `linear-gradient(180deg, transparent ${시작}%, rgba(${R},${G},${B},${진 / 100}) 100%)`
}
/*기하*/
// 그리기 — 층을 그대로 얹는다. 배경 CSS · 사진 원본 · 진짜 글자.
const 무대 = document.getElementById('무대')
let 지금장 = 0

function 배율() { return 무대.clientWidth / 상태.canvas[0] }

// 글꼴로 실제 폭을 재는 자. 카드 좌표계로 돌려준다(화면 배율을 나눈다).
// **글꼴이 다 내려온 뒤에 써야 한다** — 아니면 대체 글꼴로 잰 엉뚱한 값이 나온다.
const _자캔버스 = document.createElement('canvas').getContext('2d')
function 자만들기(r) {
  _자캔버스.font = `${r.weight === 'Bold' ? 700 : 500} ${r.pt}px Pretendard`
  _자캔버스.letterSpacing = '0px'
  return (글) => _자캔버스.measureText(글).width
}

// **덩어리 폭을 잰다** — 굵은 덩어리는 굵은 글꼴로(굽는 쪽이 그렇게 그린다).
// 부를 때마다 글꼴을 다시 건다 — 캔버스 하나를 같이 쓰므로.
function 덩어리자만들기(r) {
  return (덩어리들) => (덩어리들 || []).reduce((합, d) => {
    _자캔버스.font = `${(d.굵게 || r.weight === 'Bold') ? 700 : 500} ${r.pt}px Pretendard`
    _자캔버스.letterSpacing = '0px'
    return 합 + _자캔버스.measureText(d.글).width
  }, 0)
}

// **덩어리 하나를 화면에.** 효과 없는 덩어리는 맨 글(텍스트 노드) — 치는 글이 거기 들어가기 좋다.
// 효과 덩어리는 `span.덩` 이고 효과를 data- 로 적는다(`화면글줄` 이 그걸 읽어 온다).
function 덩어리칸(d) {
  if (!d.색 && !d.형광펜 && !d.굵게 && !d.밑줄 && !d._고름) return document.createTextNode(d.글)
  const 조각 = document.createElement('span')
  조각.className = '덩'
  조각.textContent = d.글
  if (d.형광펜) {
    조각.dataset.형광펜 = d.형광펜 === true ? '1' : d.형광펜
    조각.style.background = d.형광펜 === true ? (상태.강조색 || '#C9FC95') : d.형광펜
  }
  if (d.굵게) { 조각.dataset.굵게 = '1'; 조각.style.fontWeight = 700 }
  if (d.색) { 조각.dataset.색 = d.색; 조각.style.color = d.색 }
  if (d.밑줄) { 조각.dataset.밑줄 = '1'; 조각.style.textDecoration = 'underline' }
  if (d._고름) 조각.dataset.고름 = '1'
  return 조각
}

// **화면에서 글줄을 읽어 온다**(2026-09-28). 친 글·지운 글·합친 줄이 다 여기서 모델로
// 들어간다. 우리 표(`span.덩` 의 data-)가 붙은 글만 효과가 있다 — 브라우저가 끼운
// 태그나 바깥 붙여넣기는 효과 없는 글이다. 경계 칸(`\\u200B`)은 지운다.
function 화면글줄(el) {
  const 글줄 = []
  for (const 줄el of el.querySelectorAll(':scope > .줄')) {
    const 줄 = { 새문장: 줄el.dataset.새문장 !== '0', 덩어리: [] }
    if (줄.새문장 && 줄el.dataset.글머리) 줄.글머리 = 줄el.dataset.글머리
    if (줄.새문장 && 줄el.dataset.정렬) 줄.정렬 = 줄el.dataset.정렬
    const 걷기 = document.createTreeWalker(줄el, NodeFilter.SHOW_TEXT)
    for (let n = 걷기.nextNode(); n; n = 걷기.nextNode()) {
      const 글 = n.textContent.replace(/\\u200B/g, '')
      if (!글) continue
      const 덩el = n.parentElement && n.parentElement.closest('span.덩')
      const 효과 = {}
      if (덩el && 줄el.contains(덩el)) {
        if (덩el.dataset.색) 효과.색 = 덩el.dataset.색
        if (덩el.dataset.형광펜) 효과.형광펜 = 덩el.dataset.형광펜 === '1' ? true : 덩el.dataset.형광펜
        if (덩el.dataset.굵게) 효과.굵게 = true
        if (덩el.dataset.밑줄) 효과.밑줄 = true
        if (덩el.dataset.고름) 효과._고름 = true
      }
      줄.덩어리.push({ 글, ...효과 })
    }
    줄.덩어리 = 덩어리정리(줄.덩어리)
    글줄.push(줄)
  }
  if (!글줄.length) 글줄.push({ 새문장: true, 덩어리: [] })
  글줄[0].새문장 = true
  return 글줄
}

// **두 글줄이 같은가.** 칸의 차례는 안 본다 — 서버(`글줄로`)·`다시끊기`·`화면글줄` 이
// 칸을 서로 다른 차례로 만든다. `JSON.stringify` 로 곧장 견주면 글머리 칸을 눌렀다 떼기만
// 해도 「고쳤다」가 되어 되돌리기 한 칸·「저장 •」이 생겼다(2026-09-29 실측).
function 글줄같나(a, b) {
  const 펴기 = (글줄) => JSON.stringify((글줄 || []).map((줄) => [!!줄.새문장, 줄.글머리 || null,
    줄.정렬 || null, (줄.덩어리 || []).map((d) => [d.글, d.색 || null, d.형광펜 || null,
      !!d.굵게, !!d.밑줄, !!d._고름])]))
  return 펴기(a) === 펴기(b)
}

// 모델에 글줄을 둔다 — `lines` 사본과 높이를 같이 맞춘다. **이 셋은 늘 같이 바뀐다.**
function 글줄두기(r, 글줄) {
  r.글줄 = 글줄
  r.lines = 글줄글들(글줄)
  r.box = 높이맞추기(r.box, 글줄.length, r.pt, r.줄간격)
}

// **화면을 이미 읽어 모델에 넣은 칸.** 다시 그리면 크로미움이 지워지는 칸에 `blur` 를
// 부른다 — 지우는 그 순간, 칸이 아직 붙어 있는 채로(2026-09-29 실측, 크로미움 149).
// 효과·엔터·색 고르개는 화면을 먼저 읽고 고치므로, 그때 `blur` 가 옛 화면을 또 넣으면
// 방금 건 효과를 덮는다. 그 칸의 `blur` 는 건너뛴다.
let 읽은칸 = null

function 글자칸el() {
  return 고른것 && 고른것.갈래 === '글자'
    ? 무대.querySelector(`.칸.글자[data-번호="${고른것.번호}"]`) : null
}

function 그리기() {
  const c = 상태.cards[지금장]
  const s = 배율()
  무대.innerHTML = ''
  // 지우는 «동안» 에 온 `blur` 까지 건너뛰었다 — 이제 푼다. 남겨 두면 다음에 그 칸의 진짜
  // `blur` 를 삼킨다(맨 위에서 풀면 지우는 동안의 `blur` 를 못 건너뛴다).
  읽은칸 = null
  무대.style.background = c.배경CSS || '#FFFFFF'
  // **사진은 층 순서, 글자는 언제나 그 앞.** 서버가 굽는 순서
  // (`cardnews_compose._장식순서`)와 같은 규칙이라야 화면과 구운 그림이 안 갈린다.
  for (const i of 장식순서(c)) 무대.appendChild(장식칸(c.장식영역[i], s, i))
  ;(c.글자영역 || []).forEach((r, i) => 무대.appendChild(글자칸(r, s, i)))
  선택겹만들기()
  셈그리기()
  색칸그리기()
  층표그리기()
}

// 고른 사진이 겹친 것 중 몇 번째인지. **이게 없으면 앞뒤가 눈에 안 보인다.**
function 층표그리기() {
  const c = 상태.cards[지금장]
  const 장식인가 = 고른것 && 고른것.장 === 지금장 && 고른것.갈래 === '장식'
  const 줄 = 장식인가 ? 장식순서(c) : []
  const i = 장식인가 ? 줄.indexOf(고른것.번호) : -1
  document.getElementById('ㅌ뒤로').disabled = i <= 0
  document.getElementById('ㅍ앞으로').disabled = i < 0 || i === 줄.length - 1
  document.getElementById('층표').textContent = i < 0 ? ''
    : `${i + 1}/${줄.length}` + (줄.length < 2 ? ''
        : i === 줄.length - 1 ? ' 맨 앞' : i === 0 ? ' 맨 뒤' : '')
}

// 장을 넘긴다. **고른 것은 놓는다** — 장이 바뀌면 그 칸은 화면에 없다.
// 여기서는 «다시 그리기» 가 맞다(선택만 바뀌는 게 아니라 내용이 통째로 바뀐다).
function 장으로(n) {
  const 새장 = Math.max(0, Math.min(상태.cards.length - 1, n))
  if (새장 === 지금장) return
  지금장 = 새장
  고른것 = null
  그리기()
}

function 셈그리기() {
  document.getElementById('장셈').textContent = `${지금장 + 1} / ${상태.cards.length}`
  document.getElementById('ㄱ이전').disabled = 지금장 === 0
  document.getElementById('ㄴ다음').disabled = 지금장 === 상태.cards.length - 1
}

document.getElementById('ㄱ이전').onclick = () => 장으로(지금장 - 1)
document.getElementById('ㄴ다음').onclick = () => 장으로(지금장 + 1)

// 화살표로도 넘긴다 — 보기 전용 뷰어(`viewer.py`)가 그렇게 하고 있어 결을 맞춘다.
// **글을 고치는 중에는 안 넘긴다** — 커서를 왼쪽으로 옮기려던 것이지 장을 넘기려던
// 것이 아니다.
//
// **글을 고치는 중에는 키를 하나도 안 받는다.** Del 은 글자를 지우려던 것이고
// 화살표는 커서를 옮기려던 것이다. 이 한 줄이 여기 있는 모든 키를 지켜 준다.
window.addEventListener('keydown', (ev) => {
  // **굵게는 글을 고치는 중에도 먹는다.** 아래 «고치는 중엔 키를 안 받는다」
  // 규칙의 유일한 예외다 — 굵게 할 줄은 지금 커서가 있는 줄이라서다.
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'b') {
    ev.preventDefault()
    return 굵게걸기(지금칸())
  }
  if (ev.target.isContentEditable) return
  if (ev.key === 'ArrowLeft') return 장으로(지금장 - 1)
  if (ev.key === 'ArrowRight') return 장으로(지금장 + 1)
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') {
    ev.preventDefault()
    return ev.shiftKey ? 다시() : 되돌리기()
  }
  // Shift 를 눌러야 나오는 글쇠라 `ev.key` 는 «+» 와 «_» 로 온다. 자판에 따라
  // «=» · «-» 로 오는 경우도 있어 넷 다 받는다.
  if (['+', '=', '-', '_'].includes(ev.key)) {
    ev.preventDefault()
    return 층으로밀기(ev.key === '+' || ev.key === '=' ? +1 : -1)
  }
  if (ev.key === 'Delete' || ev.key === 'Backspace') {
    ev.preventDefault()
    return 지우기()
  }
})

// 고른 사진을 겹친 것 중 한 칸 민다. 새 층 번호를 **모든 장식에** 도로 박는다 —
// 반쯤 매겨진 설계도는 `장식순서` 가 통째로 무시하기 때문이다.
//
// **글자에는 안 먹는다.** 글자는 언제나 사진 앞이다.
function 층으로밀기(방향) {
  if (!고른것 || 고른것.갈래 !== '장식' || 고른것.장 !== 지금장) return
  const c = 상태.cards[지금장]
  const 새줄 = 층밀기(장식순서(c), 고른것.번호, 방향)
  if (!새줄) return
  설계도고치기(() => {
    for (const x of 새줄) c.장식영역[x.번호].층 = x.층
  })
}

// Del — **내용이 있으면 내용만 뺀다. 한 번 더 누르면 칸까지 없앤다.**
//
// 두 단계로 나눈 것은 「내용을 바꾸려던 것」과 「칸을 없애려던 것」이 다르기
// 때문이다. 사진이든 글자든 같은 결이다.
//
// **글자칸에도 먹는다**(사람 지적 2026-08-29: 「del 버튼 눌러도 뭐 없더라」).
// 예전엔 장식(사진)에만 먹어서, 글자칸을 고르고 누르면 아무 일도 안 났다.
// 글을 «고치는 중» 에는 여기까지 안 온다 — 위 `isContentEditable` 이 막는다.
// 거기서 Del 은 글자를 지우는 키다.
function 지우기() {
  const r = 지금칸()
  if (!r) return
  const c = 상태.cards[고른것.장]
  const 번호 = 고른것.번호

  if (고른것.갈래 === '글자') {
    const 남은글 = 글줄글들(r.글줄 || []).some((x) => (x || '').trim())
    // 글을 비우면 효과도 같이 없어진다 — 효과는 글자에 붙어 있으니까(2026-09-28).
    if (남은글) return 설계도고치기(() => 글줄두기(r, [{ 새문장: true, 덩어리: [] }]))
    return 설계도고치기(() => {
      c.글자영역.splice(번호, 1)
      고른것 = null
    })
  }

  if (고른것.갈래 !== '장식') return
  if (r.media_url) return 설계도고치기(() => { delete r.media_url })
  설계도고치기(() => {
    c.장식영역.splice(번호, 1)
    // 뒤엣것들의 번호가 한 칸씩 당겨졌다 — 층은 번호가 아니라 값이라 그대로 둔다.
    고른것 = null
  })
}

// **테두리는 언제나 «안쪽» 으로 긋는다.** 네모는 안쪽 그림자로, 모양을 딴
// 도형은 SVG 로 그 모양을 따라 긋는다 — 오려낸 칸에는 CSS 선이 안 붙는다.
// 굽는 쪽(`cardnews_compose._선그리기`)과 같은 관례다.
// **모양을 오린 빈 자리는 점선도 모양을 따라간다.** 네 변에 깐 네모 점선은
// 오려낸(`clip-path`) 칸에서는 모양 밖이 잘려 나가, 원이면 네 꼭지 언저리만
// 토막토막 남는다(사람 지적 2026-09-19). 모양이 있으면 그 모양을 따라 점선을
// 긋고, 네모 점선은 끈다.
// **도형 모양 — 여섯 가지**(사람 요청 2026-09-19: 「도형도 다양하게 있잖아 왜
// 1개밖에 없는 것인가」). `테두리`(점 목록)를 그 자리에서 만들어 넣는다. 네모는
// 점 목록을 아예 지운다 — 없으면 칸 그대로가 네모다.
//
// **굽는 쪽은 안 고쳐도 된다.** 이미 `테두리` 를 받아 그 모양대로 오린다
// (`cardnews_compose._테두리알파`). 화면도 같은 점으로 `clip-path` 를 건다.
const 도형모양들 = ['네모', '둥근네모', '원', '마름모', '삼각형', '육각형']

function 모양점들(갈래, box) {
  const [x0, y0, x1, y1] = box
  const w = x1 - x0, h = y1 - y0
  const cx = x0 + w / 2, cy = y0 + h / 2
  const 돌기 = (n, 시작) => {
    const 점 = []
    for (let i = 0; i < n; i++) {
      const t = 시작 + 2 * Math.PI * i / n
      점.push([cx + (w / 2) * Math.cos(t), cy + (h / 2) * Math.sin(t)])
    }
    return 점
  }
  if (갈래 === '원') return 돌기(48, 0)
  if (갈래 === '마름모') return [[cx, y0], [x1, cy], [cx, y1], [x0, cy]]
  if (갈래 === '삼각형') return [[cx, y0], [x1, y1], [x0, y1]]
  if (갈래 === '육각형') return 돌기(6, -Math.PI / 2)
  if (갈래 === '둥근네모') {
    // 네 귀퉁이만 둥글린다. 반지름은 짧은 변의 18% — 알약처럼 보이지 않게.
    const rr = Math.min(w, h) * 0.18
    const 점 = []
    const 귀 = [[x1 - rr, y0 + rr, -Math.PI / 2], [x1 - rr, y1 - rr, 0],
               [x0 + rr, y1 - rr, Math.PI / 2], [x0 + rr, y0 + rr, Math.PI]]
    for (const [gx, gy, 시작] of 귀) {
      for (let i = 0; i <= 6; i++) {
        const t = 시작 + (Math.PI / 2) * i / 6
        점.push([gx + rr * Math.cos(t), gy + rr * Math.sin(t)])
      }
    }
    return 점
  }
  return null                                  // 네모 — 점 목록을 안 쓴다
}

function 빈점선그리기(el, r) {
  if (!el.classList.contains('빈')) return
  if (!(r.테두리 && r.테두리.length >= 3)) return
  el.classList.add('모양빈')                 // 네 변 점선 무늬를 끈다
  const [bx0, by0, bx1, by1] = r.box
  const 폭 = Math.max(1, bx1 - bx0), 높 = Math.max(1, by1 - by0)
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('class', '테두리겹')
  svg.setAttribute('viewBox', `0 0 ${폭} ${높}`)
  svg.setAttribute('preserveAspectRatio', 'none')
  const 꼴 = document.createElementNS(ns, 'polygon')
  꼴.setAttribute('points', r.테두리.map(([px, py]) => `${px - bx0},${py - by0}`).join(' '))
  꼴.setAttribute('fill', 'none')
  꼴.setAttribute('stroke', '#B4B4B4')   // `.칸.빈` 의 점선 색과 같다
  // **바깥 절반이 잘린다** — 테두리와 같은 셈이라 두 배로 긋는다.
  꼴.setAttribute('stroke-width', 6)
  꼴.setAttribute('stroke-dasharray', '18 16')
  svg.appendChild(꼴)
  el.appendChild(svg)
}

function 선그리기(el, r, s) {
  const 굵기 = Number(r.선굵기) || 0
  if (!r.선색 || 굵기 <= 0) return
  if (r.테두리 && r.테두리.length >= 3) {
    const [bx0, by0, bx1, by1] = r.box
    const 폭 = Math.max(1, bx1 - bx0), 높 = Math.max(1, by1 - by0)
    const ns = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(ns, 'svg')
    svg.setAttribute('class', '테두리겹')
    svg.setAttribute('viewBox', `0 0 ${폭} ${높}`)
    svg.setAttribute('preserveAspectRatio', 'none')
    const 꼴 = document.createElementNS(ns, 'polygon')
    꼴.setAttribute('points', r.테두리.map(([px, py]) => `${px - bx0},${py - by0}`).join(' '))
    꼴.setAttribute('fill', 'none')
    꼴.setAttribute('stroke', r.선색)
    꼴.setAttribute('stroke-width', 굵기 * 2)
    svg.appendChild(꼴)
    el.appendChild(svg)
    return
  }
  // **안쪽 그림자로는 안 된다.** 그것은 «내용 밑» 에 깔려서, 사진을 넣는 순간
  // `<img>` 가 통째로 덮어 선이 사라졌다(사람 지적 2026-09-19). 겹을 하나 얹어
  // 그림 위에 긋는다 — 칸에 테두리가 없으므로 `inset:0` 이 곧 맨 바깥이다.
  const 겹 = document.createElement('div')
  겹.className = '테두리겹'
  겹.style.border = `${Math.max(1, 굵기 * s)}px solid ${r.선색}`
  el.appendChild(겹)
}

function 자리(el, box, s, r) {
  el.style.left = box[0] * s + 'px'
  el.style.top = box[1] * s + 'px'
  el.style.width = (box[2] - box[0]) * s + 'px'
  el.style.height = (box[3] - box[1]) * s + 'px'
  // CSS 기본 축이 가운데라 서버(`_돌려담기`)와 같은 축이다. 부호도 같다.
  el.style.transform = r && r.각도 ? `rotate(${r.각도}deg)` : ''
}

function 장식칸(r, s, 번호) {
  const el = document.createElement('div')
  el.className = '칸 ' + (r.종류 || '장식')
  el.dataset.갈래 = '장식'
  el.dataset.번호 = 번호
  자리(el, r.box, s, r)
  if (r.media_url) {
    // **사람이 손으로 올린 것이 자동 누끼(`그림`)보다 앞선다**(2026-09-17
    // 최종 검토 지적 ① — 굽는 쪽 `cardnews_compose._decoration_속`과 같은
    // 순서라야 화면이 안 갈린다). 영상은 소리 없이 돈다 — 미리보기다.
    const el2 = document.createElement(영상인가(r) ? 'video' : 'img')
    el2.src = r.media_url
    if (영상인가(r)) { el2.muted = true; el2.loop = true; el2.autoplay = true; el2.playsInline = true }
    el.appendChild(el2)
    // 사진 «뒤» 의 그림자. 굽는 쪽은 사진을 붙이기 «전» 에 깐다 — CSS 는 요소
    // 자체에 거는 것이라 순서가 저절로 맞는다.
    const 그늘밖 = 그림자CSS(r, s)
    if (그늘밖) el.style.filter = 그늘밖
    // 사진 «위» 에 음영을 한 겹 덮는다. 굽는 쪽도 사진을 붙인 직후에 얹는다.
    const 겹 = r.배경자리 ? 음영CSS(r) : ''
    if (겹) {
      const 그늘 = document.createElement('div')
      그늘.style.cssText = 'position:absolute;inset:0;pointer-events:none;background:' + 겹
      el.appendChild(그늘)
    }
  } else if (r.그림) {
    // 장식은 원본 그대로 보인다 — 굽는 쪽과 같은 규칙이라야 화면이 안 갈린다.
    const 그 = document.createElement('img')
    그.src = r.그림
    el.appendChild(그)
    return el
  } else if (r.배경자리) {
    // **배경 사진 자리는 투명하다** — 밑에 배경색이 깔려 있다(`배경CSS`).
    // 굽는 쪽(`cardnews_compose._decoration_속`)도 여기서 아무것도 안 그린다.
    // 다만 작업대에는 «여기가 사진 자리» 라는 표시가 있어야 해서 점선과
    // 물음표를 둔다 — 구운 그림에는 안 찍는다(결과물이라서).
    el.classList.add('배경빈')
  } else if (r.종류 !== '장식' && r.종류 !== '도형') {
    // 도형·장식은 자리만 비워 둔다 — 굽는 쪽(`cardnews_compose._decoration_속`)이
    // 물음표까지 찍으면 소음이라며 둘 다 일찍 돌아간다. 여기가 도형만 물음표를
    // 찍으면 화면과 구운 그림이 갈린다(2026-08-26 판정 리뷰).
    el.classList.add('빈')
    el.textContent = '?'
    // **물음표를 칸에 맞춰 키운다.** 굽는 쪽은 `max(24, min(w,h)//3)` 을 쓴다
    // — 같은 셈을 여기서도 해야 큰 사진 자리가 «비어 보이지» 않는다.
    const [bx0, by0, bx1, by1] = r.box
    el.style.fontSize = Math.max(24, Math.min(bx1 - bx0, by1 - by0) / 3) * s + 'px'
  }
  // **테두리가 있으면 그 모양으로 오린다.** 굽는 쪽
  // (`cardnews_compose._decoration_속`)과 같은 모양이라야 고칠 때 본 그림과
  // 구운 그림이 안 갈린다. 좌표는 카드 좌표계라 칸 안쪽 비율(%)로 바꾼다.
  // 굽는 쪽은 자리표시·도형에 «끝점 포함»(w+1, h+1) 을 쓰지만 CSS % 는
  // 요소 크기(폭 = bx1-bx0) 기준이라 그 1px 차는 화면에서 안 보인다 — 그대로 둔다.
  //
  // **구멍은 CSS 로 못 판다.** 도넛처럼 속이 뚫린 도형은 화면에선 메워져 보이고
  // 구운 그림에서만 뚫린다 — 귀띔에 그렇게 적어 뒀다.
  //
  // (R23) 이 if 는 `장식칸` 안에 늘 있다 — 카드 데이터로 서버에서 끼워 넣고
  // 빼고 하지 않는다. 지킴이(`r.테두리 && …`) 가 이미 «테두리 없으면 안
  // 들어간다」를 보장하므로, 테두리 없는 쪽과 있는 쪽의 스크립트를 다르게
  // 만들 이유가 없다 — 길이 둘로 갈리면 언젠가 어긋난다.
  if (r.테두리 && r.테두리.length >= 3) {
    const [bx0, by0, bx1, by1] = r.box
    const 폭 = Math.max(1, bx1 - bx0), 높 = Math.max(1, by1 - by0)
    const 점들 = r.테두리
      .map(([px, py]) => `${((px - bx0) / 폭 * 100).toFixed(2)}% ${((py - by0) / 높 * 100).toFixed(2)}%`)
      .join(', ')
    el.style.setProperty('clip-path', `polygon(${점들})`)
  }
  // 도형은 잰 색으로 칠한다 — 검은 알약이 검은 알약으로 보인다.
  // (`빈` 처리 뒤에 두어야 위 else-if 가 붙인 `빈`·`?` 를 실제로 벗겨낸다.)
  if (r.종류 === '도형' && r.채움색) {
    el.style.background = r.채움색
    el.classList.remove('빈')
    el.textContent = ''
  }
  // 올리기 실패 표시는 설계도가 아니라 화면 상태(실패한칸)로만 들고 있는다 —
  // 저장될 값이 아니다. 다시 올려 성공하면 실패한칸이 비므로 자동으로 없어진다.
  if (실패한칸 && 실패한칸.장 === 지금장 && 실패한칸.갈래 === '장식' && 실패한칸.번호 === 번호) {
    el.classList.add('올리기실패')
  }
  빈점선그리기(el, r)
  선그리기(el, r, s)
  꾸미기(el, '장식', 번호, r.box, s)
  return el
}

// 슬롯의 «font» 를 CSS 글꼴 이름으로. 모르는 것은 프리텐다드로 물러선다 —
// 굽는 쪽(`cardnews_compose.글꼴이름`)과 같은 잣대다.
function 글꼴패밀리(이름) {
  const 표 = 상태.글꼴이름 || {}
  return (표[(이름 || '').trim()] || 'Pretendard') +
         ',-apple-system,"Segoe UI",system-ui,sans-serif'
}

function 글자칸(r, s, 번호) {
  const el = document.createElement('div')
  el.className = '칸 글자'
  el.dataset.갈래 = '글자'
  el.dataset.번호 = 번호
  자리(el, r.box, s, r)
  el.style.color = r.글자색
  el.style.fontWeight = r.weight === 'Bold' ? 700 : 500
  // **슬롯에 적힌 글씨체를 쓴다.** 여태 프리텐다드만 그려서, 틀에 「검은고딕」
  // 이라 적혀 있어도 화면과 구운 그림이 달랐다(사람 지적 2026-08-29).
  el.style.fontFamily = 글꼴패밀리(r.font)
  el.style.fontSize = r.pt * s + 'px'
  el.style.letterSpacing = '0'
  // 앵커() 가 이미 이 판단을 한다 — 여기서 다시 베껴 쓰지 않는다.
  el.style.textAlign = 앵커(r.align)
  el.style.paddingTop = (상태.세로보정 * r.pt * s) + 'px'
  // **도형에서 온 글자칸은 세로 가운데다.** 굽는 쪽(`cardnews_compose`)이 이미
  // 그렇게 그리는데 여기만 몰라서, **구운 그림은 가운데인데 화면은 위에 붙었다**
  // (사람이 2026-08-27 「도형 안 글자가 너무 위로 가 있다」고 알려 줬다).
  // 본 것과 나올 것이 다르면 사람이 고칠 자리를 잘못 짚는다.
  if (r.세로가운데) {
    el.style.display = 'flex'
    el.style.flexDirection = 'column'
    el.style.justifyContent = 'center'
  }
  // **글머리기호는 도형으로 그린다** — 글자로 찍으면 글꼴에 따라 빈 네모가
  // 나온다(검은고딕에는 ● ○ ■ 가 하나도 없다, 2026-09-19 실측). 화면은 CSS
  // 로 흉내내고 굽는 쪽은 Pillow 로 그린다 — 둘이 같은 자리·같은 크기다.
  // **글줄로 그린다**(2026-09-28). 줄 하나 = `.줄`, 효과 덩어리 = `span.덩`.
  // 문장 첫 줄이면 data-새문장=1 과 문장 효과(글머리·정렬)를 단다 — 읽어 올 때 쓴다.
  // 두 줄을 합치면(문장 맨 앞 백스페이스 — 아래 손잡이가 합친다) 앞 줄 div 가 남아 앞 문장 것만 남는다.
  const 글머리자리 = 1.1
  let 문장정렬 = null
  let 번호셈 = 0          // 「번호」 글머리가 몇째인가 (`번호` 는 이 칸의 번호다)
  for (const 줄 of (r.글줄 || [])) {
    const d = document.createElement('div')
    d.className = '줄'
    d.style.height = (줄높이(r.pt, r.줄간격) * s) + 'px'
    d.dataset.새문장 = 줄.새문장 ? '1' : '0'
    if (줄.새문장) 문장정렬 = 줄.정렬 || null
    if (줄.새문장 && 줄.정렬) d.dataset.정렬 = 줄.정렬
    if (문장정렬) d.style.textAlign = 앵커(문장정렬)
    if (줄.새문장 && ['원', '네모', '줄표', '번호'].includes(줄.글머리)) {
      d.style.paddingLeft = (r.pt * s * 글머리자리) + 'px'
      d.dataset.글머리 = 줄.글머리
      if (줄.글머리 === '번호') 번호셈 += 1
      d.dataset.몇째 = 줄.글머리 === '번호' ? 번호셈 : 1
    }
    for (const 덩 of 줄.덩어리 || []) d.appendChild(덩어리칸(덩))
    el.appendChild(d)
  }
  // **상자는 칸에 하나뿐이다.** 줄마다 걸면 브라우저가 서로 남남인 입력칸으로
  // 봐서 커서가 줄을 못 넘고 드래그 선택도 한 줄에 갇힌다(사람 지적 2026-09-18).
  // 줄 div 는 그대로 둔다 — 줄마다 새 문장·글머리 표를 단다(`화면글줄` 이 읽는다).
  el.contentEditable = 'true'
  el.spellcheck = false
  el.addEventListener('input', () => {
    // **먼저 우리 표를 되붙인다.** 붙여넣기·백스페이스가 만든 조각이 섞인 채로
    // 줄을 세면 넘침이 엉뚱한 줄에 붙는다.
    줄표다시붙이기(el, r, s)
    // 치는 동안엔 설계도를 안 건드린다 — 되돌리기 기록이 글자마다 쌓인다.
    // 넘침도 줄을 다시 끊는 셈(`다시끊기`)과 **같은 캔버스 자**로 잰다 — `.줄` 은
    // 블록 요소라 `scrollWidth` 가 제 폭보다 작아지지 않아(부모 폭을 다 채운다) 글
    // 길이와 무관하게 넘침이 떴었다. 자가 갈리면 `다시끊기` 가 맞춰 놓은 줄을
    // 넘침이 「넘쳤다」고 하는 모순도 생긴다.
    const 잰다 = 자만들기(r)
    const 줄들 = [...el.querySelectorAll(':scope > .줄')]
    const 폭들 = 줄들.map((x) => 잰다(x.textContent))
    const n = 넘침(폭들, 줄들.length, r.box, r.pt, r.줄간격)
    줄들.forEach((x, k) => x.classList.toggle('넘침', n.가로.includes(k)))
  })
  // **고친 뒤에만 다시 끊는다.** 누르기만 한 것으로 디자인이 달라지면 안 된다(사람
  // 지적 2026-08-27) — 화면에서 읽은 글줄이 모델과 같으면 손대지 않는다.
  // 효과는 글자에 붙어 있으니 끊는 자리가 바뀌어도 따라간다(2026-09-28).
  el.addEventListener('blur', () => {
    if (el === 읽은칸) return
    const 지금 = 화면글줄(el)
    if (글줄같나(지금, r.글줄)) return
    const 새글줄 = 다시끊기(지금, r.box[2] - r.box[0], 덩어리자만들기(r))
    설계도고치기(() => 글줄두기(r, 새글줄))
  })
  el.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter') return
    ev.preventDefault()
    // **커서가 든 줄에서 나눈다.** 못 찾으면 아무것도 안 한다 — 글을 잃느니 낫다.
    const 곳 = 커서줄(el)
    if (!곳) return
    const 지금 = 화면글줄(el)                       // 친 글을 먼저 모델로
    const 몇째문장 = 지금.slice(0, 곳.k + 1).filter((줄) => 줄.새문장).length
    const 나눈 = 문장나누기(지금, 곳.k, 곳.자리)
    const 새글줄 = 다시끊기(나눈, r.box[2] - r.box[0], 덩어리자만들기(r))
    읽은칸 = el                                     // 다시 그리기 바로 앞에서만 — 셈이 터지면 안 남는다
    설계도고치기(() => 글줄두기(r, 새글줄))
    // **커서를 새 문장 맨 앞에 돌려놓는다.**
    let 센것 = 0
    let 갈줄 = -1
    새글줄.forEach((줄, i) => { if (줄.새문장 && ++센것 === 몇째문장 + 1 && 갈줄 < 0) 갈줄 = i })
    requestAnimationFrame(() => {
      const 다시 = document.querySelectorAll('.칸.글자.골랐음 > .줄')
      const 갈곳 = 다시[갈줄]
      if (!갈곳) return
      // 다시 그리면서 칸이 새로 생겨 입력을 잃었다 — 새 칸에 다시 준다.
      const 상자 = 갈곳.closest('.칸.글자')
      if (상자) 상자.focus({ preventScroll: true })
      const 범위 = document.createRange()
      범위.setStart(갈곳.firstChild || 갈곳, 0)
      범위.collapse(true)
      const 다시뽑기 = window.getSelection()
      다시뽑기.removeAllRanges()
      다시뽑기.addRange(범위)
    })
  })
  // **효과 덩어리 앞·끝에서 치면 효과 없는 글이 된다**(사람 결정 2026-09-28).
  // 브라우저는 커서가 span 끝에 있으면 그 span 안에 넣는다 — 치기 직전에 커서를
  // span «밖» 의 경계 칸(`\\u200B`) 뒤로 옮긴다. 한글 입력기는 첫 키가 229 로 온다 —
  // 그때(조합 «전») 옮겨야 조합이 안 깨진다.
  el.addEventListener('keydown', (ev) => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.isComposing) return
    if (ev.key.length === 1 || ev.keyCode === 229) 경계밖으로(el)
  })
  // **줄 맨 앞 백스페이스·줄 끝 Delete 는 우리가 두 줄을 합친다.** 브라우저가 합치면
  // `span.덩` 을 글꼴 모양만 흉내 낸 span 으로 바꿔 효과 표(data-)가 없어진다(2026-09-29
  // 실측, 크로미움 149). 뒤 줄의 노드를 앞 줄 끝으로 그대로 옮긴다 — 앞 줄 div 가 남아
  // 앞 문장 것(글머리·정렬)만 남는다. 긁어 놓고 누르면 긁은 것도 우리가 지운다(`긁은것지우기`).
  // 기본 동작을 막았으니 `input` 이 안 온다 — 넘침 표는 그 손잡이를 불러 다시 붙인다.
  // Shift+Delete 는 잘라내기다(윈도) — 브라우저가 `cut` 을 부르게 둔다(그 손잡이도 `긁은것지우기`).
  // Ctrl·Alt·Cmd 를 같이 눌러도 긁은 것이 있으면 긁은 것을 지우는 것이라 우리가 한다. 안 긁었으면
  // 낱말 지우기 — 브라우저에 맡긴다.
  el.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Backspace' && ev.key !== 'Delete') return
    if (ev.isComposing || (ev.key === 'Delete' && ev.shiftKey)) return
    const sel = window.getSelection()
    if (!sel || !sel.rangeCount) return
    let 자리 = null
    if (!sel.isCollapsed) {
      const 범위 = sel.getRangeAt(0)
      if (!el.contains(범위.commonAncestorContainer)) return
      ev.preventDefault()
      자리 = 긁은것지우기(el, 범위)
    } else {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return
      const 곳 = 커서줄(el)
      if (!곳) return
      const 줄들 = [...el.querySelectorAll(':scope > .줄')]
      const 글수 = 곳.줄el.textContent.replace(/\\u200B/g, '').length
      let 앞 = null
      let 뒤 = null
      if (ev.key === 'Backspace' && 곳.자리 === 0 && 곳.k > 0) { 앞 = 줄들[곳.k - 1]; 뒤 = 곳.줄el }
      if (ev.key === 'Delete' && 곳.자리 === 글수 && 곳.k < 줄들.length - 1) { 앞 = 곳.줄el; 뒤 = 줄들[곳.k + 1] }
      if (!앞) return
      ev.preventDefault()
      자리 = 줄잇기(앞, 뒤)
    }
    if (자리) { sel.removeAllRanges(); sel.addRange(자리) }
    el.dispatchEvent(new Event('input'))
  })
  el.addEventListener('paste', (ev) => 붙여넣기(ev, el))
  el.addEventListener('copy', (ev) => 덩어리복사(ev, el, false))
  el.addEventListener('cut', (ev) => 덩어리복사(ev, el, true))
  el.addEventListener('dragstart', (ev) => 덩어리복사(ev, el, false, true))
  el.addEventListener('drop', (ev) => 끌어놓기(ev, el))
  // 넘침은 «진짜 폭»으로 잰다 — 글자 수로 어림하지 않는다. 글꼴이 다 내려온
  // 뒤에 재야 하므로 `document.fonts.ready` 뒤에서 그린다.
  requestAnimationFrame(() => {
    // 고른 칸이면 꾸미기() 가 손잡이 div 를 형제로 얹는다 — 그것까지 줄로
    // 세면 넘침 판정이 늘 «넘침»으로 나온다. `.줄` 만 골라 걸러낸다.
    // 넘침도 `다시끊기` 와 **같은 캔버스 자**로 잰다(카드 좌표계라 `/ s` 로 다시
    // 나누면 안 된다) — `.줄` 은 블록 요소라 `scrollWidth` 가 제 폭보다
    // 작아지지 않아 글 길이와 무관하게 넘침이 떴었고, 자가 갈리면 `다시끊기` 가
    // 맞춰 놓은 줄을 넘침이 「넘쳤다」고 하는 모순도 구조적으로 생겼다.
    const 잰다 = 자만들기(r)
    const 줄들 = [...el.querySelectorAll(':scope > .줄')]
    const 폭들 = 줄들.map((d) => 잰다(d.textContent))
    const n = 넘침(폭들, 줄들.length, r.box, r.pt, r.줄간격)
    줄들.forEach((d, i) => d.classList.toggle('넘침', n.가로.includes(i)))
    // 회전(Task 11)도 이 셈을 안 흔든다 — 자만들기() 는 캔버스 폰트로 글자
    // 자체의 폭을 재는 것이라 CSS `transform: rotate(...)` 와 무관하다.
    // 돌린다고 글이 길어지지 않으니 «회전 전 기준으로 잰다» 가 맞는 동작이고,
    // 돌려서 카드 밖으로 나간 것은 이 넘침이 아니라 「밖으로」 표시가 맡는다.
    // «세로 넘침» 은 «카드 밖으로» 와 다른 뜻이다 — 이름을 나눈다. 같은
    // 이름을 toggle(force) 로 같이 쓰면 나중에 도는 이 rAF 가 꾸미기() 가
    // 동기로 붙여 둔 밖으로 표시를 지워 버린다(세로 안 넘치는 칸을 카드
    // 밖으로 끌면 다음 프레임에 빨간 테두리가 없어지는 버그였다).
    el.classList.toggle('세로넘침', n.세로)
  })
  선그리기(el, r, s)
  꾸미기(el, '글자', 번호, r.box, s)
  return el
}

for (const c of 상태.cards) c.배경CSS = c.배경CSS || ''

let 고른것 = null
let 실패한칸 = null       // 올리기 실패 표시 — 화면 상태일 뿐, 설계도엔 안 넣는다
const 기록 = []          // 되돌리기용 설계도 사본들
let 기록칸 = -1

function 깊은사본(x) { return JSON.parse(JSON.stringify(x)) }

function 설계도고치기(바꿈) {
  기록.length = Math.min(기록.length, 기록칸 + 1)
  기록.push(깊은사본(상태.cards))
  기록칸 = 기록.length - 1
  바꿈()
  안저장표시()
  그리기()
}

// 되돌리기 칸에는 고르개가 열린 동안의 설계도(표 `_고름` 단 것)가 들어 있을 수 있다 —
// 고르개가 닫혀 있으면 표를 떼고 그린다. 안 떼면 창이 없는데 점선이 남는다(2026-09-29 검토).
function 되돌리기() {
  if (기록칸 < 0) return
  const 지금 = 깊은사본(상태.cards)
  상태.cards = 기록[기록칸]
  기록[기록칸] = 지금
  기록칸 -= 1
  if (!고르개열림) 고름표다떼기()
  그리기()
}

function 다시() {
  if (기록칸 + 1 >= 기록.length) return
  기록칸 += 1
  const 지금 = 깊은사본(상태.cards)
  상태.cards = 기록[기록칸]
  기록[기록칸] = 지금
  if (!고르개열림) 고름표다떼기()
  그리기()
}

function 지금칸() {
  if (!고른것) return null
  const c = 상태.cards[고른것.장]
  return (고른것.갈래 === '글자' ? c.글자영역 : c.장식영역)[고른것.번호]
}



// **형광펜 색은 패널에서 그때그때 읽는다.** 패널은 고를 때마다 다시 그려져
// 요소가 새로 생긴다 — 변수에 담아 두면 낡은 요소를 읽는다. 패널이 안 떠
// 있으면(고른 것이 글자가 아니면) 강조색으로 물러선다.
function 지금형광색() {
  const 칸 = document.getElementById('ㅊ형광색')
  return (칸 && 칸.value) || 상태.강조색 || '#C9FC95'
}

// **패널은 고른 것에 따라 내용이 바뀐다.** 글자를 골랐는데 사진 손잡이가
// 보이면 안 된다 — 여태 도구막대가 그랬다(단추 15개가 늘 다 보였다).
//
// 판단은 코드 표(`배경자리`)로 하고, 사람에게 보이는 이름만 「배경 사진」이다
// (사람 결정 2026-09-18). 굽는 쪽·틀이 쓰는 이름은 안 바꾼다.
function 패널갈래() {
  if (!고른것) return '없음'
  if (고른것.갈래 === '글자') return '글자'
  const r = 지금칸()
  // **도형은 사진과 다른 갈래다**(사람 결정 2026-09-19). 여태는 글자가 아닌
  // 것을 전부 사진으로 떨어뜨려서, 도형을 골라도 사진 패널이 떴다 — 옮기고
  // 키우는 것은 되는데 **색을 바꾸는 손잡이가 없었다.**
  if (r && r.종류 === '도형') return '도형'
  if (r && r.배경자리) return '배경사진'
  return '사진'
}

const 패널이름 = { 글자: '글자', 사진: '사진/영상', 배경사진: '배경 사진',
                도형: '도형', 없음: '이 장' }

// **같은 것을 고른 채면 다시 안 만든다.** 색칸을 누르면 글자칸에서 초점이
// 빠지고(`blur`), 그것이 `그리기()` → `색칸그리기()` → 여기로 온다. 예전엔
// 여기서 `innerHTML = ''` 로 안을 지워서 **누르고 있던 색칸이 그 자리에서
// 없어졌다** — 클릭이 씹혔다(사람 지적 2026-09-18: 「지금은 클릭도 안 되는데」).
//
// 열쇠는 「장·갈래·번호」다. 그것이 같으면 고른 것이 그대로라는 뜻이고, 안에
// 든 값(색·크기·정렬)은 손잡이 자신이 이미 바꿔 놓았으므로 다시 만들 까닭이
// 없다. 다른 것을 고르거나 아무것도 안 고르면 열쇠가 달라져 새로 만든다.
function 패널그리기() {
  const 패널 = document.getElementById('패널')
  if (!패널) return
  const 갈래 = 패널갈래()
  const 열쇠 = 고른것
    ? `${고른것.장}/${고른것.갈래}/${고른것.번호}/${갈래}`
    : '없음'
  if (패널.dataset.무엇 === 열쇠) return
  패널.dataset.무엇 = 열쇠
  패널.innerHTML = ''
  const 제목 = document.createElement('div')
  제목.className = '패널제목'
  제목.textContent = 패널이름[갈래]
  패널.appendChild(제목)
  for (const 묶음 of 패널묶음들(갈래)) 패널.appendChild(묶음)
}

// 기본 팔레트 — 무채색 한 줄과 색상 다섯 줄. 미리캔버스가 쓰는 짜임을 따랐다
// (사람이 화면을 보여 줌 2026-09-19): 왼쪽이 어둡고 오른쪽이 밝다.
const 기본팔레트 = [
  '#000000', '#434343', '#666666', '#999999', '#B7B7B7', '#EFEFEF', '#FFFFFF',
  '#F4CCCC', '#FCE5CD', '#FFF2CC', '#D9EAD3', '#D0E0E3', '#CFE2F3', '#D9D2E9',
  '#EA9999', '#F9CB9C', '#FFE599', '#B6D7A8', '#A2C4C9', '#9FC5E8', '#B4A7D6',
  '#E06666', '#F6B26B', '#FFD966', '#93C47D', '#76A5AF', '#6FA8DC', '#8E7CC3',
  '#CC0000', '#E69138', '#F1C232', '#6AA84F', '#45818E', '#3D85C6', '#674EA7',
  '#990000', '#B45F06', '#BF9000', '#38761D', '#134F5C', '#0B5394', '#351C75',
]

// **색 고르개를 우리가 그린다.** 윈도우 색 고르개 창이 뜨면 그 사이 브라우저가
// 포커스를 잃어 긁어놓은 선택이 풀린다 — 그걸 막으려고 자리를 미리 적어 두는
// 꼼수를 썼는데, 창을 안 띄우면 그 꼼수가 아예 필요 없다.
//
// `고른뒤(색)` 는 색을 누르는 «순간» 불린다 — 확인 단추를 또 누르게 하지 않는다.
// 「없음」은 `null` 을 넘긴다(형광펜은 지우고, 글자색은 칸 색으로 되돌린다).
// **고른 색은 색칩에 곧바로 비춘다.** 설계도는 바로 바뀌는데 색칩은 그대로라
// 사람이 「바뀐 건가?」 하고 못 믿었다 — 딴 것을 골랐다 돌아와야 색이 바뀌었다
// (사람 지적 2026-09-19). 패널은 고른 것이 그대로면 다시 안 그리므로(`패널그리기`
// 의 열쇠) 여기서 칩을 직접 칠해 준다. 색고르개를 쓰는 다섯 자리가 다 같이 낫는다.
// ── 색 셈 ─────────────────────────────────────────────────────────
//
// 무지개 판은 «색(hue)·짙기(s)·밝기(v)» 로 다루고, 설계도에는 `#RRGGBB` 로 담는다.
// 둘을 오가는 셈이다. 바깥 것을 안 받아 오므로 여기 적어 둔다.
function hsv에서hex(h, sv, vv) {
  const f = (n) => {
    const k = (n + h / 60) % 6
    const x = vv * (1 - sv * Math.max(0, Math.min(k, 4 - k, 1)))
    return Math.round(x * 255).toString(16).padStart(2, '0')
  }
  return '#' + f(5) + f(3) + f(1)
}

function hex에서hsv(색) {
  const m = /^#([0-9a-f]{6})$/i.exec(String(색 || '').trim())
  if (!m) return { h: 0, s: 0, v: 0 }
  const n = parseInt(m[1], 16)
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255
  const 큰 = Math.max(r, g, b), 작 = Math.min(r, g, b), 차 = 큰 - 작
  let h = 0
  if (차) {
    if (큰 === r) h = 60 * (((g - b) / 차) % 6)
    else if (큰 === g) h = 60 * ((b - r) / 차 + 2)
    else h = 60 * ((r - g) / 차 + 4)
  }
  return { h: (h + 360) % 360, s: 큰 ? 차 / 큰 : 0, v: 큰 }
}

// **끌기 한 벌.** 판과 띠가 같은 규칙을 쓴다 — 누른 자리에서 바로 잡히고,
// 손을 떼기 전까지 칸 밖으로 나가도 따라온다.
//
// **잡아 가두기(`setPointerCapture`)를 안 쓴다.** 그것은 「내가 지금 잡고 있나」를
// 브라우저에 물어보는 방식인데, 그 답이 손 떼는 순간 이미 «아니오» 로 바뀌어
// 있어서 **뗐다는 것을 못 받았다** — 끄는 동안 색은 바뀌는데 손을 떼도 설계도에
// 안 담겼다. 창(`window`)에 잠깐 귀를 달았다 떼는 쪽이 확실하다.
function 끌어고르기(칸, 짚기) {
  const 재기 = (ev, 뗐나) => {
    const 네모 = 칸.getBoundingClientRect()
    짚기(Math.max(0, Math.min(1, (ev.clientX - 네모.left) / 네모.width)),
        Math.max(0, Math.min(1, (ev.clientY - 네모.top) / 네모.height)), 뗐나)
  }
  let 끄는중 = false
  const 움직임 = (ev) => { if (끄는중) 재기(ev, false) }
  const 뗌 = (ev) => {
    if (!끄는중) return
    끄는중 = false
    window.removeEventListener('pointermove', 움직임)
    window.removeEventListener('pointerup', 뗌)
    window.removeEventListener('pointercancel', 뗌)
    재기(ev, true)
  }
  칸.onpointerdown = (ev) => {
    // **기본 동작을 막는다** — 긁어놓은 글자 선택이 풀리면 형광펜·글자색이
    // 「안 긁었다」가 된다(사람 지적 2026-09-19).
    ev.preventDefault()
    끄는중 = true
    window.addEventListener('pointermove', 움직임)
    window.addEventListener('pointerup', 뗌)
    window.addEventListener('pointercancel', 뗌)
    재기(ev, false)
  }
}

// **색 고르개를 여는 동안 긁어 둔 글자를 기억한다.**
//
// 이것이 없으면 이렇게 깨진다(2026-09-19 브라우저에서 확인) — 낱말을 긁고 글자색
// 고르개를 열어 무지개 판에서 색을 한 번 고르면, 그 색을 거느라 화면을 다시
// 그리면서 **긁어 둔 자리가 날아간다.** 창은 그대로 열려 있으므로 사람은 이어서
// 색을 더 고르는데, 두 번째부터는 「안 긁었다」가 되어 **칸 전체 색이 바뀐다.**
// 팔레트 칩은 한 번 누르면 창이 닫혀서 이 탈이 안 드러났다.
let 고르개열림 = false

function 색고르개열기(붙일곳, 지금색, 고른뒤, 없음말) {
  // **여는 순간 긁은 글자에 잠깐 표(`_고름`)를 단다**(2026-09-28). 여태는 줄·글자 번호를
  // 적어 뒀다 — 이제 그 글자에 표를 단다. 다시 그려도 표가 따라가 두 번째 색도 같은 글자에.
  // **긁은 곳을 닫기보다 먼저 읽는다** — 닫기가 다시 그리면 긁은 것이 풀린다.
  const 글자r = 고른것 && 고른것.갈래 === '글자' ? 지금칸() : null
  const 곳들0 = 글자r ? 긁은자리들(글자r, null) : []
  const el0 = 곳들0.length ? 글자칸el() : null
  const 화면0 = el0 ? 화면글줄(el0) : null
  let 단것 = null
  let 친글 = false
  if (글자r && 곳들0.length) {
    const 기준 = 고름표떼기(화면0 || 글자r.글줄)
    단것 = 고름표달기(기준, 곳들0)
    친글 = !글줄같나(기준, 고름표떼기(글자r.글줄))
    if (친글) 단것 = 다시끊기(단것, 글자r.box[2] - 글자r.box[0], 덩어리자만들기(글자r))
  }
  if (el0) 읽은칸 = el0            // 다시 그리기(닫기·아래) 바로 앞에서만
  색고르개닫기()
  if (단것) {
    // **친 글은 설계도다** — 되돌리기 한 칸과 「저장 •」(2026-09-29 검토: 안 고르고 닫으면
    // 친 글이 표시 없이 모델에만 들어가 있었다). 표는 떼고 적는다 — 기록에 안 넣는다.
    if (친글) 설계도고치기(() => 글줄두기(글자r, 고름표떼기(단것)))
    글줄두기(글자r, 단것)          // 되돌리기 기록 없이 — 표는 설계도가 아니다
    고르개열림 = true
    그리기()
  }
  const 칩칠하기 = (색) => {
    if (!붙일곳 || !붙일곳.classList.contains('색칩')) return
    붙일곳.style.background = 색 ||
      'linear-gradient(135deg, transparent 46%, #ff5555 46%, #ff5555 54%, transparent 54%), #2a2f36'
  }
  const 창 = document.createElement('div')
  창.id = '색고르개'
  const 네모 = 붙일곳.getBoundingClientRect()
  창.style.left = Math.min(네모.left, window.innerWidth - 290) + 'px'
  창.style.top = Math.min(네모.bottom + 6, window.innerHeight - 330) + 'px'

  const 이름 = document.createElement('p')
  이름.className = '갈래이름'
  이름.textContent = 말('기본팔레트')
  창.appendChild(이름)

  const 격자 = document.createElement('div')
  격자.className = '격자'
  if (없음말) {
    const 없음 = document.createElement('div')
    없음.className = '칩 없음'
    없음.title = 없음말
    없음.onmousedown = 선택안뺏기
    없음.onclick = () => { 칩칠하기(null); 고른뒤(null); 색고르개닫기() }
    격자.appendChild(없음)
  }
  for (const 색 of 기본팔레트) {
    const 칩 = document.createElement('div')
    칩.className = '칩' + (색.toLowerCase() === (지금색 || '').toLowerCase() ? ' 고름' : '')
    칩.style.background = 색
    칩.title = 색
    칩.onmousedown = 선택안뺏기
    칩.onclick = () => { 칩칠하기(색); 고른뒤(색); 색고르개닫기() }
    격자.appendChild(칩)
  }
  창.appendChild(격자)

  const 선 = document.createElement('div')
  선.className = '가름선'
  창.appendChild(선)

  // 격자에 없는 색 — `#RRGGBB` 로 직접 친다.
  //
  // **브라우저 기본 색 고르개(`input type=color`)는 안 쓴다**(사람 지적
  // 2026-09-19, 화면으로 보여 줌). 그것을 누르면 큰 창이 떠서 «우리 팔레트를
  // 덮어 버리고», 그 사이 포커스가 옮겨가 긁어놓은 선택도 풀린다. 42색 격자와
  // 직접 치기로 충분하다.
  const 직접 = document.createElement('div')
  직접.className = '직접'
  // **미리보기는 누르는 것이다**(사람 요청 2026-09-19: 「그 색깔 누르면 …
  // 모든 색깔 막 고르는거 … 모든 색깔에 다 적용해야함」). 누르면 아래에 무지개
  // 판이 펴진다. 색 고르는 자리 다섯(글자색·형광펜·채움색·테두리색·음영)이
  // 이 함수 하나를 같이 쓰므로 여기만 고치면 전부에 붙는다.
  const 미리보기 = document.createElement('button')
  미리보기.className = '미리보기'
  미리보기.style.background = 지금색 || '#000000'
  미리보기.title = 말('아무색이나')
  미리보기.onmousedown = 선택안뺏기
  const 글칸 = document.createElement('input')
  글칸.type = 'text'
  글칸.placeholder = '#000000'
  글칸.value = 지금색 || ''
  글칸.title = 말('직접친다')
  글칸.onchange = () => {
    const v = 글칸.value.trim()
    // 색을 먼저 걸고 닫는다 — 닫기가 `_고름` 표를 떼면 긁은 글자를 잊어 칸 전체가 바뀐다.
    if (/^#[0-9A-Fa-f]{6}$/.test(v)) { 칩칠하기(v); 고른뒤(v); 색고르개닫기() }
  }
  글칸.oninput = () => {
    const v = 글칸.value.trim()
    if (/^#[0-9A-Fa-f]{6}$/.test(v)) { 미리보기.style.background = v; 무지개맞추기(v) }
  }
  직접.appendChild(미리보기)
  직접.appendChild(글칸)
  창.appendChild(직접)

  // ── 무지개 판 (접힌 채로 시작) ──────────────────────────────────
  //
  // **끄는 내내 설계도를 안 고친다.** `설계도고치기` 는 되돌리기 기록을 한 칸
  // 쌓으므로, 끌 때마다 고치면 되돌리기가 수백 칸이 된다. 손을 뗄 때 한 번만
  // 고친다. 그 전까지는 미리보기·글칸·칩만 따라 움직인다.
  const 무지개 = document.createElement('div')
  무지개.className = '무지개'
  무지개.hidden = true
  const 판 = document.createElement('div')
  판.className = '판'
  const 하양 = document.createElement('div'); 하양.className = '하양'
  const 검정 = document.createElement('div'); 검정.className = '검정'
  const 판집게 = document.createElement('div'); 판집게.className = '집게'
  판.append(하양, 검정, 판집게)
  const 색띠 = document.createElement('div')
  색띠.className = '색띠'
  const 띠집게 = document.createElement('div'); 띠집게.className = '집게'
  색띠.appendChild(띠집게)
  무지개.append(판, 색띠)
  창.appendChild(무지개)

  let 지금 = hex에서hsv(지금색 || '#000000')

  function 무지개그리기() {
    판.style.background = 'hsl(' + 지금.h + ', 100%, 50%)'
    판집게.style.left = (지금.s * 100) + '%'
    판집게.style.top = ((1 - 지금.v) * 100) + '%'
    판집게.style.background = hsv에서hex(지금.h, 지금.s, 지금.v)
    띠집게.style.left = (지금.h / 360 * 100) + '%'
    띠집게.style.background = 'hsl(' + 지금.h + ', 100%, 50%)'
  }

  // 글칸에 직접 친 색도 판이 따라간다 — 두 곳이 다른 색을 가리키면 안 된다.
  function 무지개맞추기(색) { 지금 = hex에서hsv(색); 무지개그리기() }

  function 색바뀜(뗐나) {
    const 색 = hsv에서hex(지금.h, 지금.s, 지금.v)
    무지개그리기()
    미리보기.style.background = 색
    글칸.value = 색
    칩칠하기(색)
    if (뗐나) 고른뒤(색)          // 손을 뗄 때만 설계도를 고친다
  }

  끌어고르기(판, (x, y, 뗐나) => { 지금.s = x; 지금.v = 1 - y; 색바뀜(뗐나) })
  끌어고르기(색띠, (x, _y, 뗐나) => { 지금.h = x * 360; 색바뀜(뗐나) })

  미리보기.onclick = () => {
    무지개.hidden = !무지개.hidden
    if (!무지개.hidden) {
      무지개맞추기(글칸.value.trim() || 지금색 || '#000000')
      // 펴면 창이 길어진다 — 화면 밑으로 넘치면 위로 올린다.
      const 네모2 = 창.getBoundingClientRect()
      if (네모2.bottom > window.innerHeight - 8) {
        창.style.top = Math.max(8, window.innerHeight - 8 - 네모2.height) + 'px'
      }
    }
  }

  document.body.appendChild(창)
  // 밖을 누르면 닫는다. 지금 누름이 그대로 닫아 버리지 않게 다음 차례로 미룬다.
  setTimeout(() => document.addEventListener('pointerdown', 밖을누르면닫기), 0)
}

// 모든 글자 칸에서 표(`_고름`)를 뗀다. 표는 고르개가 열린 동안에만 있어야 한다.
function 고름표다떼기() {
  for (const c of 상태.cards) for (const r of c.글자영역 || []) {
    if ((r.글줄 || []).some((줄) => (줄.덩어리 || []).some((d) => d._고름))) 글줄두기(r, 고름표떼기(r.글줄))
  }
}

function 색고르개닫기() {
  if (고르개열림) {
    고름표다떼기()
    고르개열림 = false
    그리기()
  }
  const 옛 = document.getElementById('색고르개')
  if (옛) 옛.remove()
  document.removeEventListener('pointerdown', 밖을누르면닫기)
}

function 밖을누르면닫기(ev) {
  const 창 = document.getElementById('색고르개')
  if (창 && !창.contains(ev.target)) 색고르개닫기()
}


// 접었다 펴는 묶음. 평소 안 만지는 것(음영·그림자)은 접어 둔다 — 미리캔버스가
// 「외곽선 ▶」·「그림자 ▼」로 하는 것과 같다.
function 접는묶음(이름, 펼침, ...것들) {
  const d = document.createElement('details')
  if (펼침) d.open = true
  const s = document.createElement('summary')
  s.textContent = 이름
  d.appendChild(s)
  for (const 것 of 것들) d.appendChild(것)
  return d
}

// 색 + 0~100 막대 한 쌍. 음영·그림자가 같은 모양이라 한 자리에서 만든다.
// **막대는 `change` 로 받는다** — `input` 이면 끄는 내내 되돌리기 기록이 쌓인다.
function 색과막대(r, 색키, 진키, 기본색, 기본진) {
  const 색칩 = document.createElement('button')
  색칩.className = '색칩'
  색칩.style.background = r[색키] || 기본색
  색칩.title = 말('색')
  색칩.onmousedown = 선택안뺏기
  색칩.onclick = () => 색고르개열기(색칩, r[색키] || 기본색,
    (색) => 설계도고치기(() => { r[색키] = 색 || 기본색 }), null)
  const 막대 = document.createElement('input')
  막대.type = 'range'
  막대.min = 0
  막대.max = 100
  const 지금 = (r[진키] === undefined || r[진키] === null) ? 기본진 : r[진키]
  막대.value = 지금
  const 값표 = document.createElement('span')
  값표.className = '음영값'
  값표.textContent = 지금 + '%'
  막대.oninput = () => { 값표.textContent = 막대.value + '%' }
  막대.onchange = () => 설계도고치기(() => { r[진키] = Number(막대.value) })
  return [줄칸('색', 색칩), 줄칸('진하기', 막대, 값표)]
}


// 테두리 손잡이. **색과 굵기다** — 진하기(%)가 아니라 굵기(px)라 `색과막대` 를
// 못 쓴다. 굵기 0 이 「테두리 없음」이고, 그것이 기본이다 — 여태 만든 카드에
// 선을 덧붙이면 안 된다.
function 색과굵기(r) {
  const 기본색 = '#000000'
  const 색칩 = document.createElement('button')
  색칩.className = '색칩'
  색칩.style.background = r.선색 || 기본색
  색칩.title = 말('테두리색')
  색칩.onmousedown = 선택안뺏기
  색칩.onclick = () => 색고르개열기(색칩, r.선색 || 기본색,
    (색) => 설계도고치기(() => { r.선색 = 색 || 기본색 }), null)
  const 막대 = document.createElement('input')
  막대.type = 'range'
  막대.min = 0
  막대.max = 선굵기상한
  const 지금 = Number(r.선굵기) || 0
  막대.value = 지금
  // **끌기만 되면 정확한 값을 못 준다**(사람 요청 2026-09-19). 숫자를 직접 치는
  // 칸을 나란히 둔다 — 둘은 같은 값을 보고 서로를 따라간다.
  const 숫자 = document.createElement('input')
  숫자.type = 'number'
  숫자.className = '굵기칸'
  숫자.min = 0
  숫자.max = 선굵기상한
  숫자.value = 지금
  숫자.title = 말('테두리굵기')
  const 넣기 = (값) => 설계도고치기(() => {
    r.선굵기 = 값
    // 굵기를 올렸는데 색이 없으면 아무것도 안 보인다 — 기본색을 같이 넣는다.
    if (r.선굵기 > 0 && !r.선색) r.선색 = 기본색
  })
  const 다듬기 = (v) => Math.max(0, Math.min(선굵기상한, Math.round(Number(v) || 0)))
  막대.oninput = () => { 숫자.value = 막대.value }
  막대.onchange = () => 넣기(다듬기(막대.value))
  숫자.onchange = () => {
    const 값 = 다듬기(숫자.value)
    숫자.value = 값
    막대.value = 값
    넣기(값)
  }
  // 엔터로도 먹게 — 치고 나서 딴 데를 안 눌러도 된다.
  숫자.onkeydown = (ev) => { if (ev.key === 'Enter') 숫자.onchange() }
  // **누르면 있던 값을 통째로 고른다.** 안 그러면 「0」 앞에 커서가 놓여
  // 1 을 치면 「10」 이 된다(사람 지적 2026-09-19).
  숫자.onfocus = () => 숫자.select()
  숫자.onmouseup = (ev) => ev.preventDefault()   // 클릭이 그 선택을 풀지 않게
  return [줄칸('색', 색칩), 줄칸('굵기', 막대, 숫자)]
}


// 패널 한 줄: 왼쪽에 이름, 오른쪽에 손잡이들.
function 줄칸(이름, ...것들) {
  const d = document.createElement('div')
  d.className = '줄칸'
  const s = document.createElement('span')
  s.textContent = 이름
  d.appendChild(s)
  for (const 것 of 것들) d.appendChild(것)
  return d
}

// **아이콘만 있으면 무슨 단추인지 모른다**(사람 지적 2026-09-18). `B`·`▤▥▦`
// 는 글자만 봐서는 뜻이 안 드러난다 — 마우스를 올리면 뜨는 설명을 반드시 단다.
// **버튼을 누르면 포커스가 옮겨가며 긁어놓은 선택이 풀린다.** 그래서 긁고 색을
// 골라도 「안 긁었다」가 됐다(사람 지적 2026-09-19: 「형광펜은 아직도 안 된다」).
// `mousedown` 의 기본 동작을 막으면 포커스가 안 옮겨가고 선택이 살아 있다.
const 선택안뺏기 = (ev) => ev.preventDefault()

// **모양 단추는 이름을 안 쓴다**(사람 지시 2026-09-19: 「이름말고 … 모양을
// 보여주는거임」). 좁은 패널에서 「둥근네모」 는 넉 줄로 접혀 읽을 수도 없었다.
// 이름은 마우스를 올리면 뜬다. 그림은 실제 도형과 **같은 함수**(`모양점들`)로
// 그린다 — 두 벌로 적으면 한쪽만 바뀌어도 아무도 모른다.
function 모양그림(갈래, 크기) {
  const 여백 = 1, 변 = 크기 - 여백 * 2
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('viewBox', '0 0 ' + 크기 + ' ' + 크기)
  svg.setAttribute('width', 크기)
  svg.setAttribute('height', 크기)
  const 점 = 모양점들(갈래, [여백, 여백, 여백 + 변, 여백 + 변])
  let 꼴
  if (점) {
    꼴 = document.createElementNS(ns, 'polygon')
    꼴.setAttribute('points', 점.map((p) => p[0] + ',' + p[1]).join(' '))
  } else {
    꼴 = document.createElementNS(ns, 'rect')
    꼴.setAttribute('x', 여백)
    꼴.setAttribute('y', 여백)
    꼴.setAttribute('width', 변)
    꼴.setAttribute('height', 변)
  }
  svg.appendChild(꼴)
  return svg
}

// 「원 로」 가 아니라 「원으로」. 받침이 있으면 «으로», 없거나 ㄹ 이면 «로».
function 으로(말) {
  const 끝 = (말 || '').charCodeAt((말 || '').length - 1) - 0xac00
  const 받침 = 끝 >= 0 && 끝 <= 11171 ? 끝 % 28 : 0
  return 말 + (받침 === 0 || 받침 === 8 ? '로' : '으로')
}

function 모양단추(갈래, 눌림, 눌렀을때, 설명) {
  const b = 단추('', 눌림, 눌렀을때, 설명)
  b.classList.add('모양단추')
  b.appendChild(모양그림(갈래, 20))
  return b
}

function 단추(글, 눌림, 눌렀을때, 설명) {
  const b = document.createElement('button')
  b.onmousedown = 선택안뺏기      // 긁어놓은 선택을 안 뺏는다
  b.textContent = 글
  if (눌림) b.classList.add('눌림')
  if (설명) b.title = 설명
  b.onclick = 눌렀을때
  return b
}

// **글자 크기를 바꾸면 네모 높이도 따라간다.** 글자가 커지면 줄이 높아지는데
// 네모가 그대로면 글이 밖으로 넘친다 — `높이맞추기` 가 이미 그 셈을 한다.
// 8~300 으로 막는다: 0 이나 음수는 글자가 사라지고, 너무 크면 장을 덮는다.
function 글자크기바꾸기(r, 새pt) {
  const pt = Math.max(8, Math.min(300, Math.round(새pt)))
  if (!pt || pt === r.pt) return
  // **줄 수를 먼저 담는다.** 인자 안에 괄호를 넣으면(`(r.lines || []).length`)
  // 「네 인자를 다 넘기나」를 훑는 시험이 정규식으로 인자를 세다가 안쪽 괄호에서
  // 잘린다. 그 시험은 브라우저에서만 도는 코드를 글자로 훑는 그물이라 괄호를
  // 못 센다 — 부르는 쪽이 평평하게 쓴다.
  const 줄수 = (r.lines || []).length
  설계도고치기(() => {
    r.box = 높이맞추기(r.box, 줄수, pt, r.줄간격)
    r.pt = pt
  })
}

// **줄 간격도 네모 높이를 흔든다.** 간격이 넓어지면 글 덩어리가 높아지는데
// 네모가 그대로면 아래로 넘친다 — 크기를 바꿀 때와 같은 셈이다.
//
// 값이 없으면 붙박이(`상태.줄간격`, 1.32)를 쓴다. 0.8~3.0 으로 막는다: 0.8 보다
// 좁으면 글자가 서로 겹치고(`layout_labeled.최소줄간격` 과 같은 뜻), 3.0 을
// 넘으면 한 줄만 들어가 네모가 장을 덮는다.
function 줄간격바꾸기(r, 새간격) {
  const 간격 = Math.max(0.8, Math.min(3.0, Math.round(새간격 * 100) / 100))
  const 지금 = r.줄간격 || 상태.줄간격
  if (!간격 || 간격 === 지금) return
  const 줄수 = (r.lines || []).length
  설계도고치기(() => {
    r.box = 높이맞추기(r.box, 줄수, r.pt, 간격)
    r.줄간격 = 간격
  })
}


// **글자 효과를 거는 한 길**(2026-09-28). 화면의 글을 먼저 읽어 오고(친 글이 모델에
// 들어가야 긁은 자리와 맞는다), 긁은 곳에 효과를 건 뒤, 글이 바뀌었으면 다시 끊는다.
// 안 긁었으면 `칸바꿈`(칸 전체 효과)을 한다.
function 효과로고치기(r, 바꿈, 칸바꿈) {
  const el = 글자칸el()
  const 화면 = el ? 화면글줄(el) : (r.글줄 || [])
  const 글바뀜 = !글줄같나(화면, r.글줄)
  const 곳들 = 긁은자리들(r, null)
  let 새 = 곳들.length ? 바꿈(화면, 곳들) : 화면
  if (글바뀜) 새 = 다시끊기(새, r.box[2] - r.box[0], 덩어리자만들기(r))
  if (el) 읽은칸 = el                               // 다시 그리기 바로 앞에서만 — 셈이 터지면 안 남는다
  설계도고치기(() => {
    글줄두기(r, 새)
    if (!곳들.length && 칸바꿈) 칸바꿈()
  })
}

// **긁었으면 긁은 데만, 안 긁었으면 칸 전체.** 칸 색과 같은 색을 고르면 그 부분을 뺀다.
function 글자색걸기(r, 새색) {
  효과로고치기(r, (글줄, 곳들) => 색걸기(글줄, 곳들, 새색, r.글자색), () => { r.글자색 = 새색 })
}

// **긁은 데가 그 효과로 다 덮였나** — 단추를 파랗게(손잡이엔 상태 표시까지).
function 긁은데걸렸나(r, 이름) {
  const el = 글자칸el()
  const 곳들 = 긁은자리들(r, null)
  if (!곳들.length || !el) return false
  return 덮였나(화면글줄(el), 곳들, 이름)
}

// **패널을 통째로 다시 그리지 않고 단추 표시만 갈아 끼운다.** 다시 그리면
// 누르고 있던 것이 사라지고(2026-09-18 에 겪었다), 긁은 자리도 흔들린다.
function 표시갱신() {
  const 패널 = document.getElementById('패널')
  if (!패널 || !고른것 || 고른것.갈래 !== '글자') return
  const r = 지금칸()
  if (!r) return
  const 굵은가 = 긁은데걸렸나(r, '굵게') || (!긁은자리들(r, null).length && r.weight === 'Bold')
  const 밑줄인가 = 긁은데걸렸나(r, '밑줄')
    || (!긁은자리들(r, null).length && (r.효과 || []).includes('밑줄'))
  for (const b of 패널.querySelectorAll('button')) {
    if (b.textContent === 'B') b.classList.toggle('눌림', 굵은가)
    if (b.textContent === 'U') b.classList.toggle('눌림', 밑줄인가)
  }
  글자색칩칠하기(r)
}

// **누른 글자의 색**(`#RRGGBB` 대문자). 커서만 있으면 커서가 든 효과 덩어리, 긁었으면 긁은 «첫 글자»
// (경계 칸 `\\u200B` 는 글자가 아니다). 색 고르개가 열린 채 긁은 것이 풀렸으면(고르면 다시 그려진다)
// 표(`_고름`) 단 첫 글자 — `긁은자리들` 과 같은 차례다. 제 색이 없거나 골라진 칸 밖이면 칸 색.
function 누른글자색(r) {
  const el = 글자칸el()
  const sel = window.getSelection()
  const 범위 = sel && sel.rangeCount ? sel.getRangeAt(0) : null
  const 안 = !!(el && 범위 && el.contains(범위.startContainer))
  let 글 = null
  if (el && 고르개열림 && !(안 && !범위.collapsed)) 글 = el.querySelector('span.덩[data-고름]')
  else if (안 && 범위.collapsed) 글 = 범위.startContainer
  else if (안) {
    const 걷기 = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    for (let n = 걷기.nextNode(); n; n = 걷기.nextNode()) {
      const 앞 = n === 범위.startContainer ? 범위.startOffset : 0
      const 뒤 = n === 범위.endContainer ? 범위.endOffset : n.length
      if (범위.intersectsNode(n) && n.textContent.slice(앞, 뒤).replace(/\\u200B/g, '')) { 글 = n; break }
    }
  }
  const 바탕 = 글 && (글.nodeType === 3 ? 글.parentElement : 글)
  const 덩el = 바탕 && 바탕.closest('span.덩')
  return ((덩el && 덩el.dataset.색) || r.글자색 || '#000000').toUpperCase()
}

// **글자색 칩과 그 옆 색 이름을 누른 글자의 색으로 칠한다**(사람 요청 2026-09-29: 「클릭해도 정확한
// 이름 즉 #052511 뭐 이런게 안떠」). 긁은 자리가 바뀔 때(`표시갱신`)와 다시 그릴 때(`색칸그리기`) 부른다.
function 글자색칩칠하기(r) {
  const 이름 = document.querySelector('#패널 .색이름')
  if (!이름) return
  const 색 = 누른글자색(r)
  if (이름.textContent !== 색) 이름.textContent = 색
  이름.previousElementSibling.style.background = 색
}

// 긁은 자리가 바뀔 때마다 표시를 따라가게 한다.
document.addEventListener('selectionchange', 표시갱신)


// 갈래마다 보일 묶음.
function 패널묶음들(갈래) {
  const r = 지금칸()
  const 것들 = []
  // **숨긴 단추를 대신 누른다.** 처리 코드가 그 id 를 잡고 있어서, 옮기는 대신
  // 이렇게 하면 처리 코드를 손댈 자리가 없다.
  const 대신누르기 = (id) => () => document.getElementById(id).click()
  if (갈래 === '없음') {
    // **＋도형은 모양부터 고르게 한다**(사람 지시 2026-09-19: 「＋도형을 누르고
    // 모양을 골라야 생긴다고」). 여태는 누르면 바로 네모가 생겼고, 그 밑에 모양
    // 단추가 늘 펼쳐져 있어 안 쓸 때도 자리를 차지했다 — 「밑에 있는 5개 버튼
    // 없애도 된다」.
    //
    // **이름표를 안 단다**(「＋도형모양 빼고」). 빈 이름칸을 그대로 두어 위
    // 「넣기」 줄과 단추 시작 자리가 맞는다.
    //
    // 고르면 그 도형이 «골라진 채» 로 생겨서 패널이 도형 패널로 갈린다 —
    // 이 줄은 그때 통째로 사라지므로 따로 접을 일이 없다.
    const 모양줄 = 줄칸('', ...도형모양들.map((갈래) =>
      모양단추(갈래, false, () => 도형넣기(갈래),
        '이 장에 ' + 갈래 + ' 도형을 하나 더')))
    모양줄.classList.add('모양줄')
    모양줄.hidden = true
    // 펴 놓은 동안 ＋도형이 파랗게 눌려 있다 — 누른 것이 눈에 보여야 한다.
    const 도형단추 = 단추('＋도형', false, () => {
      모양줄.hidden = !모양줄.hidden
      도형단추.classList.toggle('눌림', !모양줄.hidden)
    }, '눌러서 모양을 고르면 이 장에 도형이 생긴다')
    것들.push(줄칸('넣기',
      단추('＋글자', false, 대신누르기('ㄴ글자추가'), '이 장에 글자칸을 하나 더'),
      단추('＋사진', false, 대신누르기('ㄷ사진추가'),
        '이 장에 사진·영상 자리를 하나 더'),
      도형단추))
    것들.push(모양줄)
  }
  if (갈래 === '글자' && r) {
    // 글씨체 — 화면이 아는 8종(`상태.글꼴이름`). 굽는 쪽도 같은 표를 쓴다.
    const 글꼴칸 = document.createElement('select')
    for (const 이름 of Object.keys(상태.글꼴이름 || { 프리텐다드: 1 })) {
      const o = document.createElement('option')
      o.value = o.textContent = 이름
      if (이름 === r.font) o.selected = true
      글꼴칸.appendChild(o)
    }
    글꼴칸.onchange = () => 설계도고치기(() => { r.font = 글꼴칸.value })
    것들.push(줄칸('글꼴', 글꼴칸))

    // 크기 − 숫자 +
    const 크기칸 = document.createElement('input')
    크기칸.type = 'number'
    크기칸.min = 8
    크기칸.max = 300
    크기칸.value = r.pt
    크기칸.onchange = () => 글자크기바꾸기(r, Number(크기칸.value))
    크기칸.title = 말('글자크기')
    것들.push(줄칸('크기',
      단추('−', false, () => 글자크기바꾸기(r, (r.pt || 40) - 1), '1 줄이기'),
      크기칸,
      단추('+', false, () => 글자크기바꾸기(r, (r.pt || 40) + 1), '1 키우기')))

    // 줄 간격 − 숫자 +
    const 간격칸 = document.createElement('input')
    간격칸.type = 'number'
    간격칸.min = 0.8
    간격칸.max = 3
    간격칸.step = 0.05
    간격칸.value = r.줄간격 || 상태.줄간격
    간격칸.onchange = () => 줄간격바꾸기(r, Number(간격칸.value))
    간격칸.title = 말('줄간격')
    것들.push(줄칸('줄 간격',
      단추('−', false, () => 줄간격바꾸기(r, (r.줄간격 || 상태.줄간격) - 0.05), '0.05 좁히기'),
      간격칸,
      단추('+', false, () => 줄간격바꾸기(r, (r.줄간격 || 상태.줄간격) + 0.05), '0.05 넓히기')))

    // **B 는 칸 전체 굵기(`weight`)다.** 긁은 낱말만 굵게 하는 「굵게」 단추와
    // 다른 일이다(`굵기` 구간) — 둘 다 남긴다.
    것들.push(줄칸('굵기·정렬',
      단추('B', 긁은데걸렸나(r, '굵게') || r.weight === 'Bold', () => { 굵게걸기(r); 표시갱신() },
        '굵기'),
      단추('U', 긁은데걸렸나(r, '밑줄') || (r.효과 || []).includes('밑줄'),
        () => { 밑줄걸기(r); 표시갱신() }, '밑줄'),
      ...['왼쪽', '가운데', '오른쪽'].map((a) =>
        단추({ 왼쪽: '▤', 가운데: '▥', 오른쪽: '▦' }[a], r.align === a,
          () => 설계도고치기(() => { r.align = a }), a + ' 정렬'))))

    // **색 고르개를 우리가 그린다**(사람 결정 2026-09-19). 윈도우 창이 안 뜨니
    // 누르는 동안 긁어놓은 선택이 그대로 살아 있다 — 자리를 미리 적어 두던
    // 꼼수가 필요 없어졌다.
    const 글자색칩 = document.createElement('button')
    글자색칩.className = '색칩'
    글자색칩.style.background = r.글자색 || '#000000'
    글자색칩.title = 말('글자색')
    글자색칩.onmousedown = 선택안뺏기
    글자색칩.onclick = () => 색고르개열기(글자색칩, 누른글자색(r),
      (색) => 글자색걸기(r, 색 || (r.글자색 || '#000000')),
      '칠한 색을 지운다 (칸 색으로 되돌린다)')
    // 칩 바로 옆에 그 색 이름 — 칠하는 것은 `글자색칩칠하기`.
    const 색이름 = document.createElement('span')
    색이름.className = '색이름'
    색이름.onmousedown = 선택안뺏기
    것들.push(줄칸('글자색', 글자색칩, 색이름))

    // **형광펜 색칩 하나가 두 일을 한다**(사람 결정 2026-09-18): 긁은 데가
    // 있으면 «그 색으로 칠하고», 안 긁었으면 이미 칠한 것들의 색만 바꾼다.
    // 「없음」은 긁은 데의 형광펜을 뺀다.
    const 지금형광 = ((r.글줄 || []).flatMap((줄) => 줄.덩어리 || [])
      .find((d) => typeof d.형광펜 === 'string') || {}).형광펜 || 상태.강조색 || '#C9FC95'
    const 형광칩 = document.createElement('button')
    형광칩.className = '색칩'
    형광칩.style.background = 지금형광
    형광칩.title = 말('형광펜')
    형광칩.onmousedown = 선택안뺏기
    형광칩.onclick = () => 색고르개열기(형광칩, 지금형광,
      (색) => 형광펜걸기(r, 색, null),
      '긁은 데의 형광펜을 뺀다')
    것들.push(줄칸('형광펜', 형광칩))

    // **글머리기호 넷**(사람이 고름 2026-09-19): 원·네모·줄표·번호.
    // 도형으로 그린다 — 글자로 찍으면 글꼴에 따라 빈 네모가 나온다.
    것들.push(줄칸('글머리',
      ...[['원', '●'], ['네모', '■'], ['줄표', '—'], ['번호', '1.']].map(([갈래, 보임]) =>
        단추(보임, (r.글줄 || []).some((줄) => 줄.새문장 && 줄.글머리 === 갈래),
          () => { 글머리걸기(r, 갈래); 표시갱신() }, 갈래))))
  }

  // 테두리는 글자칸에도 사진·도형에도 똑같이 붙는다 — 같은 값(`선색`·
  // `선굵기`)이고 굽는 쪽도 한 함수(`_선그리기`)로 그린다.
  if (r && (갈래 === '글자' || 갈래 === '사진' || 갈래 === '배경사진'
            || 갈래 === '도형')) {
    것들.push(접는묶음('테두리 (둘레 선)', false, ...색과굵기(r)))
  }

  // **도형 — 채움색**(사람 결정 2026-09-19).
  //
  // 여태 도형을 고르면 사진 패널이 떠서 색을 못 바꿨다. 글자색 칩과 같은
  // 손잡이를 쓴다 — 색고르개 하나로 길을 맞춘다.
  if (갈래 === '도형' && r) {
    const 채움칩 = document.createElement('button')
    채움칩.className = '색칩'
    채움칩.style.background = r.채움색 || '#111111'
    채움칩.title = 말('도형색')
    채움칩.onmousedown = 선택안뺏기
    채움칩.onclick = () => 색고르개열기(채움칩, r.채움색 || '#111111',
      (색) => 설계도고치기(() => { r.채움색 = 색 || r.채움색 || '#111111' }))
    것들.push(줄칸('채움색', 채움칩))
    // **모양 고르기.** 지금 걸린 모양에 파란 표시가 뜬다(`ui-state-must-show`).
    //
    // **바꾼 뒤에 표시를 «직접» 다시 칠한다**(사람 지적 2026-09-19: 「사각형에서
    // 원으로 바꾸면 그 부분이 파란색으로 되어야하잖아」). 패널은 «고른 칸이
    // 그대로면» 다시 안 그린다(`패널그리기` 의 열쇠에 모양이 없다). 그래서 도형은
    // 원이 됐는데 단추는 네모가 파란 채로 남았다. 열쇠에 모양을 넣어 패널을
    // 통째로 다시 그리는 길도 있지만, 그러면 색고르개·긁어놓은 선택까지 날아간다.
    const 지금모양 = () => (r.테두리 && r.테두리.length >= 3)
      ? (도형모양들.find((갈래) => 갈래 !== '네모'
          && JSON.stringify(모양점들(갈래, r.box).map((p) => p.map(Math.round)))
             === JSON.stringify(r.테두리.map((p) => p.map(Math.round)))) || '모름')
      : '네모'
    const 모양단추들 = 도형모양들.map((갈래) =>
      모양단추(갈래, 갈래 === 지금모양(), () => {
        설계도고치기(() => {
          const 점 = 모양점들(갈래, r.box)
          if (점) r.테두리 = 점
          else delete r.테두리
          delete r.구멍          // 옛 모양의 구멍은 새 모양에 안 맞는다
        })
        모양표시하기()
      }, '이 도형을 ' + 으로(갈래)))
    function 모양표시하기() {
      const 걸린것 = 지금모양()
      모양단추들.forEach((b, i) => b.classList.toggle('눌림', 도형모양들[i] === 걸린것))
    }
    const 바꾸는줄 = 줄칸('모양', ...모양단추들)
    바꾸는줄.classList.add('모양줄')
    것들.push(바꾸는줄)
    것들.push(줄칸('층',
      단추('⬓ 뒤로', false, () => 층으로밀기(-1), '겹친 것 중 한 칸 뒤로 (Shift+-)'),
      단추('⬒ 앞으로', false, () => 층으로밀기(+1), '겹친 것 중 한 칸 앞으로 (Shift++)')))
  }
  if ((갈래 === '사진' || 갈래 === '배경사진') && r) {
    것들.push(줄칸('사진/영상',
      단추('넣기', false, 대신누르기('ㄱ사진'),
        '이 자리에 넣을 사진이나 영상을 고른다 — 영상은 mp4 · 30초 · 200MB 까지')))

    // **음영은 배경 사진에만.** 보통 사진 칸에 뜨면 눌러도 아무 일이 안 일어나
    // 사람이 헷갈린다 — 굽는 쪽이 `배경자리` 표를 보고 거른다.
    if (갈래 === '배경사진') {
      것들.push(접는묶음('음영 (사진 안쪽 아래)', false,
        ...색과막대(r, '음영색', '음영진하기', 음영기본색, 음영기본진하기)))
    }
    것들.push(접는묶음('그림자 (사진 바깥)', false,
      ...색과막대(r, '그림자색', '그림자진하기', 그림자기본색, 그림자기본진하기)))

    if (갈래 === '사진') {
      것들.push(줄칸('층',
        단추('⬓ 뒤로', false, () => 층으로밀기(-1), '겹친 사진 중 한 칸 뒤로 (Shift+-)'),
        단추('⬒ 앞으로', false, () => 층으로밀기(+1), '겹친 사진 중 한 칸 앞으로 (Shift++)')))
    }
  }
  return 것들
}


// 고른 칸의 지금 색을 고르개에 비춘다.
function 색칸그리기() {
  패널그리기()
  const r = 고른것 && 고른것.갈래 === '글자' ? 지금칸() : null
  if (r) 글자색칩칠하기(r)
}

// **`change` 를 쓴다.** `input` 이면 색을 끄는 내내 되돌리기 기록이 쌓인다.
// 형광펜 색은 **고른 칸의 형광펜 전부**에 건다. 하나씩 다르게 하고 싶으면
// 색을 먼저 고르고 칠하면 된다(넣을 때 그 색이 실린다).
// ── 칸 더 만들기 ────────────────────────────────────────────────
//
// 여태 작업대는 **있는 것을 고치기만** 했다. 라벨에 없던 글자나 사진은 넣을
// 길이 아예 없어서, 한 줄을 더 쓰고 싶으면 라벨부터 다시 해야 했다.
//
// 새 칸은 **장 한가운데**에 놓는다. 그리고 만들 때마다 조금씩 어긋나게 둔다 —
// 둘을 잇달아 만들면 똑같은 자리에 겹쳐서 하나만 있는 줄 안다.

let 더만든수 = 0

function 새네모(폭, 높이) {
  const [W, H] = 상태.canvas
  const 밀기 = (더만든수++ % 5) * 24
  const x = Math.round((W - 폭) / 2) + 밀기
  const y = Math.round((H - 높이) / 2) + 밀기
  return [x, y, x + 폭, y + 높이]
}

document.getElementById('ㄴ글자추가').onclick = () => {
  const c = 상태.cards[지금장]
  // 이 장에 이미 있는 글자칸의 생김새를 물려받는다 — 글꼴·크기·색을 새로
  // 고르게 하면 그 장만 겉도는 글자가 생긴다.
  const 본 = (c.글자영역 || [])[0] || {}
  설계도고치기(() => {
    c.글자영역 = c.글자영역 || []
    c.글자영역.push({
      종류: '글자', box: 새네모(600, 120),
      pt: 본.pt || 44, weight: 본.weight || 'Bold',
      align: 본.align || '가운데', font: 본.font || '프리텐다드',
      글자색: 본.글자색 || '#111111',
      줄간격: 본.줄간격 || 0, lines: ['새 글자'], 글줄: [{ 새문장: true, 덩어리: [{ 글: '새 글자' }] }],
    })
    고른것 = { 장: 지금장, 갈래: '글자', 번호: c.글자영역.length - 1 }
  })
}

document.getElementById('ㄷ사진추가').onclick = () => {
  const c = 상태.cards[지금장]
  설계도고치기(() => {
    c.장식영역 = c.장식영역 || []
    // 사진 주소는 안 넣는다 — 회색 자리표시로 나오고, 그 자리를 고른 뒤
    // 「사진 넣기」를 누르면 채워진다. 넣는 길은 하나로 둔다.
    c.장식영역.push({ 종류: '사진', box: 새네모(520, 390) })
    고른것 = { 장: 지금장, 갈래: '장식', 번호: c.장식영역.length - 1 }
  })
}

// **넣는 길은 하나다.** 단추가 여섯이어도 만드는 자리는 여기 하나여야
// 한쪽만 고치는 일이 안 생긴다. `갈래` 를 안 주면 네모다.
function 도형넣기(갈래) {
  const c = 상태.cards[지금장]
  // **이 장에 있는 도형의 색을 물려받는다** — 글자칸을 더할 때와 같은 결이다.
  // 없으면 강조색을 쓴다. 아무 색이나 두면 그 장만 겉도는 도형이 생긴다.
  const 본 = (c.장식영역 || []).find((d) => d.종류 === '도형' && d.채움색)
  설계도고치기(() => {
    c.장식영역 = c.장식영역 || []
    // **채움색은 반드시 넣는다.** 없으면 화면에 아무것도 안 보인다 —
    // 그리는 쪽이 `r.종류 === '도형' && r.채움색` 일 때만 바탕을 칠한다.
    // 「모양」(테두리 점 목록)은 안 넣는다. 네모 도형으로 나고, 모양을 딴
    // 도형은 분석이 원본에서 떠 온 것만 있다.
    // 모양 있는 것은 정사각에 가깝게 — 가로로 긴 네모에 원을 넣으면 찌그러진
    // 타원이 되어 사람이 「원이 아닌데」 한다.
    const box = 갈래 && 갈래 !== '네모' ? 새네모(320, 320) : 새네모(480, 200)
    const 새것 = {
      종류: '도형', box,
      채움색: (본 && 본.채움색) || 상태.강조색 || '#111111',
    }
    const 점 = 갈래 ? 모양점들(갈래, box) : null
    if (점) 새것.테두리 = 점
    c.장식영역.push(새것)
    고른것 = { 장: 지금장, 갈래: '장식', 번호: c.장식영역.length - 1 }
  })
}

document.getElementById('ㅁ도형추가').onclick = () => 도형넣기('네모')

const 파일칸 = document.getElementById('파일고르기')

// 브라우저가 영상을 읽어 길이(초)를 잰다. 못 읽으면 거절.
function 영상길이(f) {
  return new Promise((되, 안) => {
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.onloadedmetadata = () => { URL.revokeObjectURL(v.src); 되(v.duration) }
    v.onerror = () => { URL.revokeObjectURL(v.src); 안(new Error('읽을 수 없다')) }
    v.src = URL.createObjectURL(f)
  })
}

document.getElementById('ㄱ사진').onclick = () => {
  const r = 지금칸()
  if (!r || 고른것.갈래 !== '장식') return alert('사진 자리를 먼저 고르세요')
  파일칸.click()
}

파일칸.onchange = async () => {
  const f = 파일칸.files[0]
  파일칸.value = ''
  if (!f) return
  const r = 지금칸()
  const 대상 = { ...고른것 }
  실패한칸 = null   // 다시 시도하는 순간 옛 빨간 표시부터 지운다
  const el = 무대.querySelector('.칸.골랐음')
  if (f.type.startsWith('video/')) {
    // 사람 결정 2026-09-16: 30초·200MB·한 장에 하나. 브라우저가 먼저 재고 서버가 한 번 더 잰다.
    if (f.size > 200 * 1024 * 1024) return alert('영상이 너무 큽니다 (200MB 까지)')
    const c = 상태.cards[지금장]
    if ((c.장식영역 || []).some((x, i) => 영상인가(x) && i !== 고른것.번호)) return alert('한 장에 영상은 하나입니다')
    let 초
    try { 초 = await 영상길이(f) } catch { return alert('이 영상은 읽을 수 없습니다') }
    if (초 > 30) return alert('영상이 30초를 넘습니다 (' + Math.round(초) + '초)')
    if (el) el.textContent = 말('올리는중')
    try {
      const s = await fetch(상태.ep + '/upload/sign', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ext: 'mp4', size: f.size }) }).then((x) => x.json())
      if (!s.ok) throw new Error(s.why || '서명 주소를 못 받았다')
      const put = await fetch(s.put_url, { method: 'PUT', body: f, headers: { 'Content-Type': 'video/mp4' } })
      if (!put.ok) throw new Error('창고가 거절했다 — ' + put.status)
      설계도고치기(() => { r.media_url = s.url })
    } catch (e) {
      alert('영상을 못 올렸습니다 — ' + e.message)
      실패한칸 = 대상
      그리기()
    }
    return
  }
  if (f.size > 10 * 1024 * 1024) return alert('사진이 너무 큽니다 (10MB 까지)')
  if (el) el.textContent = 말('올리는중')
  const fd = new FormData()
  fd.append(r.종류 === '로고' ? 'logo' : 'photos', f, f.name)
  try {
    const res = await fetch(상태.ep + '/upload', { method: 'POST', body: fd })
    const j = await res.json()
    if (!res.ok) throw new Error(j.error || '올리기 실패')
    const 주소 = (r.종류 === '로고' ? j.logo_url : (j.photo_urls || '').split('\\n')[0])
    if (!주소) throw new Error('주소가 안 왔다')
    설계도고치기(() => { r.media_url = 주소 })
  } catch (e) {
    alert('사진을 못 올렸습니다 — ' + e.message)
    // 그 네모만 빨갛게, 나머지 조작은 계속된다.
    실패한칸 = 대상
    그리기()
  }
}

// 사진 빼기·자리 없애기는 단추가 아니라 Del 키다(맨 아래 「키」 참고).

// 긁힌 지점(node, offset) 을 줄 div 처음부터 잰 글자 자리로 바꾼다.
// **왜 sel.anchorOffset 을 그냥 못 쓰나** — 이미 칠해진 줄은 안에 <span> 이
// 들어 있어서 anchorOffset 이 그 span(또는 그 앞뒤 글자 노드) 안에서의 자리가
// 된다. 그러면 두 번째로 긁을 때 자리가 어긋난다(2026-08-25, 사람이 실제로
// 두 번 연속 칠해 보고 확인). Range 를 줄 div 의 0번째 지점부터 그 지점까지
// 잡아 `toString().length` 를 세면, 중간에 span 이 몇 개 끼어 있어도 줄
// 전체 기준의 글자 자리가 정확히 나온다 — span 이 텍스트 노드를 쪼개도
// Range.toString() 은 지나간 문서 순서의 글자를 그대로 이어 붙이기 때문이다.
function 줄자리(줄el, node, offset) {
  const range = document.createRange()
  range.setStart(줄el, 0)
  range.setEnd(node, offset)
  return range.toString().replace(/\\u200B/g, '').length
}

// **긁은 자리를 읽는 한 곳.** 형광펜과 굵게가 같이 쓴다 — 둘이 갈리면
// 「형광펜은 긁은 만큼인데 굵게는 줄 통째로」 같은 어긋남이 난다.
// 못 읽으면 `null` 을 내고 까닭을 알린다.
// **브라우저가 만든 조각에 우리 표를 붙인다.** 엔터는 위에서 가로채지만
// 붙여넣기·백스페이스는 못 막는다 — 그때 `.줄` 없는 div 나 맨 텍스트가 생긴다.
// 그대로 두면 줄 세기(`:scope > .줄`)가 어긋나 형광펜·굵게가 엉뚱한 줄에 붙고
// 넘침도 잘못 잡힌다. 손잡이 div(고른 칸에 얹히는 것)는 건너뛴다 — 줄이 아니다.
function 줄표다시붙이기(el, r, s) {
  for (const 애 of [...el.childNodes]) {
    if (애.nodeType === 1) {
      const c = 애.classList
      if (c.contains('줄') || c.contains('손잡이') || c.contains('테두리겹')
          || c.contains('옮기기손잡이') || c.contains('회전손잡이')) continue
      if (애.tagName === 'BR') { 애.remove(); continue }
    }
    if (애.nodeType === 3 && !애.textContent) { 애.remove(); continue }
    const 새줄 = document.createElement('div')
    새줄.className = '줄'
    새줄.style.height = (줄높이(r.pt, r.줄간격) * s) + 'px'
    el.insertBefore(새줄, 애)
    새줄.appendChild(애)
  }
}


// 뒤 줄을 앞 줄 끝에 잇는다 — 노드를 그대로 옮겨 `span.덩` 의 효과 표가 산다. 브라우저가 빈 줄에
// 끼워 둔 `<br>` 자리표는 뺀다(남으면 이은 줄 안에서 줄이 바뀐다, 2026-09-29). 이은 자리를 돌려준다.
function 줄잇기(앞, 뒤) {
  for (const b of [...앞.querySelectorAll('br'), ...뒤.querySelectorAll('br')]) b.remove()
  const 이음 = document.createRange()
  이음.selectNodeContents(앞)
  이음.collapse(false)
  while (뒤.firstChild) 앞.appendChild(뒤.firstChild)
  뒤.remove()
  return 이음
}

// **긁은 것을 우리가 지운다 — 줄을 넘는 긁기도**(2026-09-29). 브라우저·`deleteContents` 에 맡기면
// 커서가 두 줄 div «사이» 에 남아 그 뒤에 넣은 글을 `화면글줄` 이 못 읽고, 브라우저가 줄을 합치면
// `span.덩` 의 효과 표를 버린다. 줄마다 제 몫만 지우고 첫 줄과 끝 줄을 `줄잇기` 로 잇는다
// (앞 줄 문장의 글머리·정렬이 남는다). 긁은 밖의 글자는 효과를 그대로 갖는다.
// 커서 자리(접힌 범위 — 첫 줄 안, 이은 자리)를 돌려준다. 줄에 걸친 것이 없으면 null.
function 긁은것지우기(el, 범위) {
  const 줄들 = [...el.querySelectorAll(':scope > .줄')].filter((줄) => 범위.intersectsNode(줄))
  if (!줄들.length) return null
  const 첫 = 줄들[0]
  const 끝 = 줄들[줄들.length - 1]
  const 앞몫 = document.createRange()
  if (첫.contains(범위.startContainer)) 앞몫.setStart(범위.startContainer, 범위.startOffset)
  else 앞몫.setStart(첫, 0)
  if (첫 === 끝 && 끝.contains(범위.endContainer)) 앞몫.setEnd(범위.endContainer, 범위.endOffset)
  else 앞몫.setEnd(첫, 첫.childNodes.length)
  앞몫.deleteContents()
  if (첫 !== 끝) {
    const 뒤몫 = document.createRange()
    뒤몫.setStart(끝, 0)
    if (끝.contains(범위.endContainer)) 뒤몫.setEnd(범위.endContainer, 범위.endOffset)
    else 뒤몫.setEnd(끝, 끝.childNodes.length)
    뒤몫.deleteContents()
    for (const 줄 of 줄들.slice(1, -1)) 줄.remove()
    줄잇기(첫, 끝)
  }
  // 글이 다 지워진 효과 덩어리는 뺀다 — 커서가 빈 span 에 들면 새 글자가 그 효과를 받는다.
  for (const s of 첫.querySelectorAll('span.덩')) if (!s.textContent) s.remove()
  return 앞몫
}

function 경계밖으로(el) {
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount) return
  // **긁어 놓고 치면 긁은 글자를 먼저 지운다** — 지운 글자의 효과는 끝났다(시나리오 10).
  // 커서가 효과 덩어리 한가운데에 남으면 덩어리를 둘로 갈라, 새 글자가 그 사이 «밖» 에 들게 한다.
  if (!sel.isCollapsed) {
    const 범위 = sel.getRangeAt(0)
    if (!el.contains(범위.commonAncestorContainer)) return
    const 자리 = 긁은것지우기(el, 범위)
    if (!자리) return
    const t = 자리.startContainer
    const 덩el = t.nodeType === 3 && t.parentElement && t.parentElement.closest('span.덩')
    const 새자리 = document.createRange()
    if (덩el && 자리.startOffset > 0 && 자리.startOffset < t.textContent.length) {
      const 뒤글 = t.splitText(자리.startOffset)
      const 뒤덩 = 덩el.cloneNode(false)
      for (let x = 뒤글; x;) { const 다음 = x.nextSibling; 뒤덩.appendChild(x); x = 다음 }
      덩el.after(뒤덩)
      새자리.setStart(t, t.textContent.length)      // 앞 덩어리 «끝» — 아래가 밖으로 옮긴다
    } else {
      새자리.setStart(자리.startContainer, 자리.startOffset)
    }
    새자리.collapse(true)
    sel.removeAllRanges()
    sel.addRange(새자리)
  }
  const n = sel.anchorNode
  const off = sel.anchorOffset
  const 바탕 = n && (n.nodeType === 3 ? n.parentElement : n)
  const 덩el = 바탕 && 바탕.closest && 바탕.closest('span.덩')
  // **커서가 효과 덩어리 «밖» 인데 이웃이 효과 덩어리여도** 브라우저는 그 span 안에 넣는다 —
  // 커서가 줄의 «몇째 자식» 자리일 때(합친 뒤·붙인 뒤), 지우고 남은 빈 글자 노드 안일 때, 맨 글 맨 앞일
  // 때가 그렇다(2026-09-29). 빈 글자 노드·경계 칸만 든 노드는 건너뛰고 이웃을 본다. 그 사이에 경계
  // 칸을 끼우고 커서를 그 위에.
  if (!덩el && 바탕 && el.contains(바탕) && 바탕.closest('.줄')) {
    const 덩인가 = (x) => !!x && x.nodeType === 1 && x.matches('span.덩')
    const 빈것 = (x) => !!x && x.nodeType === 3 && !x.textContent.replace(/\\u200B/g, '')
    let 부모 = n
    let 넣을앞 = null
    let 앞것 = null
    let 뒤것 = null
    if (n.nodeType === 1) { 넣을앞 = n.childNodes[off] || null; 앞것 = n.childNodes[off - 1]; 뒤것 = 넣을앞 }
    else if (빈것(n) || off === 0) {
      부모 = n.parentNode
      넣을앞 = n
      앞것 = n.previousSibling
      뒤것 = 빈것(n) ? n.nextSibling : n
    } else return                          // 맨 글 가운데·끝 — 브라우저가 그 글에 넣는다
    while (빈것(앞것)) 앞것 = 앞것.previousSibling
    while (빈것(뒤것)) 뒤것 = 뒤것.nextSibling
    if (!덩인가(앞것) && !덩인가(뒤것)) return
    // 커서가 이미 경계 칸 안이면 그 칸을 다시 쓴다 — 새로 끼우면 치고 지울 때마다 쌓여, 「다」 앞
    // 백스페이스가 보이지 않는 칸을 지우고 오른쪽 화살표가 멈췄다(2026-09-29). 그냥 돌아가면 안 된다 —
    // (경계 칸, 0) 에서 치면 앞 덩어리로 들어간다. 커서를 칸의 알맞은 끝에 다시 놓는다.
    const 칸 = (n.nodeType === 3 && n.textContent && 빈것(n)) ? n : document.createTextNode('\\u200B')
    if (칸 !== n) 부모.insertBefore(칸, 넣을앞)
    const 범위 = document.createRange()
    범위.setStart(칸, 덩인가(앞것) ? 칸.length : 0)
    범위.collapse(true)
    sel.removeAllRanges()
    sel.addRange(범위)
    return
  }
  if (!덩el || !el.contains(덩el)) return
  const 끝인가 = n.nodeType === 3 ? (off === n.textContent.length && 덩el.lastChild === n) : off >= 덩el.childNodes.length
  const 앞인가 = n.nodeType === 3 ? (off === 0 && 덩el.firstChild === n) : off === 0
  if (!끝인가 && !앞인가) return
  const 칸 = document.createTextNode('\\u200B')
  if (끝인가) 덩el.after(칸)
  else 덩el.before(칸)
  const 범위 = document.createRange()
  범위.setStart(칸, 끝인가 ? 1 : 0)
  범위.collapse(true)
  sel.removeAllRanges()
  sel.addRange(범위)
}

// 셀렉션 안의 글을 덩어리로 — 줄이 바뀌는 자리에는 띄어쓰기 하나를 넣는다.
function 셀렉션덩어리(범위) {
  const 틀 = document.createElement('div')
  틀.appendChild(범위.cloneContents())
  // 한 덩어리 «안» 만 긁었으면 복사본에 그 span 이 안 따라온다 — 바깥 덩어리를 따로 본다.
  const 바탕 = 범위.commonAncestorContainer
  const 바깥덩 = (바탕.nodeType === 3 ? 바탕.parentElement : 바탕).closest('span.덩')
  const 난것 = []
  let 앞줄 = null
  const 걷기 = document.createTreeWalker(틀, NodeFilter.SHOW_TEXT)
  for (let n = 걷기.nextNode(); n; n = 걷기.nextNode()) {
    const 글 = n.textContent.replace(/\\u200B/g, '')
    if (!글) continue
    const 줄 = n.parentElement && n.parentElement.closest('.줄')
    if (앞줄 && 줄 && 줄 !== 앞줄) 난것.push({ 글: ' ' })
    앞줄 = 줄 || 앞줄
    const 덩el = (n.parentElement && n.parentElement.closest('span.덩')) || 바깥덩
    const 효과 = {}
    if (덩el) {
      if (덩el.dataset.색) 효과.색 = 덩el.dataset.색
      if (덩el.dataset.형광펜) 효과.형광펜 = 덩el.dataset.형광펜 === '1' ? true : 덩el.dataset.형광펜
      if (덩el.dataset.굵게) 효과.굵게 = true
      if (덩el.dataset.밑줄) 효과.밑줄 = true
    }
    난것.push({ 글, ...효과 })
  }
  return 덩어리정리(난것)
}

const 덩어리표 = 'application/x-cardnews-덩어리'

// **작업대 안에서 옮기면 효과도 같이 간다**(2026-09-28, 시나리오 12). 복사할 때 우리 덩어리를
// 같이 싣는다 — 붙일 때 그것이 있으면 효과째, 없으면(바깥 글) 글만 넣는다.
function 덩어리복사(ev, el, 자르기, 끌기 = false) {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || !sel.rangeCount) return
  const 범위 = sel.getRangeAt(0)
  const 덩어리들 = 셀렉션덩어리(범위)
  const 표 = 끌기 ? ev.dataTransfer : ev.clipboardData
  if (!표) return
  if (!끌기) ev.preventDefault()
  표.setData('text/plain', 덩어리들.map((d) => d.글).join(''))
  표.setData(덩어리표, JSON.stringify(덩어리들))
  if (끌기) { 표.effectAllowed = 'move'; el._끌던범위 = 범위.cloneRange() }
  if (자르기) {
    const 자리 = 긁은것지우기(el, 범위)            // 줄을 넘게 잘라도 두 줄을 잇는다
    if (자리) { sel.removeAllRanges(); sel.addRange(자리) }
    el.dispatchEvent(new Event('input'))
  }
}

// 커서 자리에 덩어리를 넣는다. 효과 덩어리 «안» 에 넣은 맨 글은 그 효과를 따른다(읽어 올 때 그렇게 읽힌다).
function 덩어리넣기(범위, 덩어리들) {
  범위.deleteContents()
  let 끝노드 = null
  for (const d of [...덩어리들].reverse()) {
    const 노드 = 덩어리칸(d)
    범위.insertNode(노드)
    if (!끝노드) 끝노드 = 노드
  }
  if (끝노드) {
    const sel = window.getSelection()
    const 뒤 = document.createRange()
    뒤.setStartAfter(끝노드)
    뒤.collapse(true)
    sel.removeAllRanges()
    sel.addRange(뒤)
  }
}

function 표에서덩어리(표) {
  try {
    const 우리것 = 표.getData(덩어리표)
    if (우리것) return 덩어리정리(JSON.parse(우리것))
  } catch { /* 망가진 표는 글로 받는다 */ }
  const 글 = (표.getData('text/plain') || '').replace(/\\s*\\n\\s*/g, ' ')
  return 글 ? [{ 글 }] : []
}

function 붙여넣기(ev, el) {
  ev.preventDefault()
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount || !ev.clipboardData) return
  경계밖으로(el)
  덩어리넣기(sel.getRangeAt(0), 표에서덩어리(ev.clipboardData))
  el.dispatchEvent(new Event('input'))            // 기본 동작을 막았다 — 넘침 표를 다시 붙인다
}

// 끌어 놓기 — 놓을 곳에 먼저 표를 박고, 끌던 곳을 지운 뒤, 표 자리에 넣는다
// (먼저 지우면 놓을 자리가 밀린다).
function 끌어놓기(ev, el) {
  ev.preventDefault()
  const 놓을곳 = document.caretRangeFromPoint ? document.caretRangeFromPoint(ev.clientX, ev.clientY) : null
  if (!놓을곳 || !el.contains(놓을곳.startContainer)) return
  // 효과 덩어리 앞·끝에 놓으면 그 덩어리 «밖» 에 놓는다 — 붙이기와 같은 규칙(`경계밖으로`).
  const sel = window.getSelection()
  sel.removeAllRanges()
  sel.addRange(놓을곳)
  경계밖으로(el)
  const 표 = document.createElement('span')
  sel.getRangeAt(0).insertNode(표)
  const 끌던 = el._끌던범위
  el._끌던범위 = null
  // 끌던 글 «안» 에 놓았으면 옮길 것이 없다 — 지우면 놓을 자리도 같이 사라져 글을 잃는다.
  if (끌던 && 끌던.intersectsNode(표)) { 표.remove(); return }
  // 줄을 넘게 끌었어도 두 줄을 잇는다(2026-09-29). 표는 끌던 곳 밖이라 지워지지 않고 따라간다.
  if (끌던) 긁은것지우기(el, 끌던)
  const 넣을곳 = document.createRange()
  넣을곳.setStartBefore(표)
  넣을곳.collapse(true)
  표.remove()
  덩어리넣기(넣을곳, 표에서덩어리(ev.dataTransfer))
  el.dispatchEvent(new Event('input'))            // 기본 동작을 막았다 — 넘침 표를 다시 붙인다
}

// **커서가 든 줄과 그 안의 글자 자리.** 상자가 칸 하나가 되면서 「지금 어느
// 줄인가」를 셀렉션으로 찾아야 한다(전에는 줄마다 상자라 그 상자가 곧 줄이었다).
// 못 찾으면 null — 부르는 쪽이 아무것도 안 하게 해서 글을 잃지 않는다.
function 커서줄(el) {
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount || !sel.anchorNode) return null
  const 바탕 = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement
  const 줄el = 바탕 && 바탕.closest('.줄')
  if (!줄el || !el.contains(줄el)) return null
  const 줄들 = [...el.querySelectorAll(':scope > .줄')]
  return { 줄el, k: 줄들.indexOf(줄el), 자리: 줄자리(줄el, sel.anchorNode, sel.anchorOffset) }
}


// **긁은 자리를 줄마다 하나씩 낸다** — `{줄(0부터), 시작, 끝}`. **이 순간 한 번 쓰는 자리다**
// (덩어리를 자르는 데 쓰고 버린다 — 저장하지 않는다, 2026-09-28).
// 색 고르개가 열려 있고 긁은 것이 풀렸으면 표(`_고름`) 단 글자들의 자리를 낸다.
function 긁은자리들(r, 할말) {
  if (!r || !고른것 || 고른것.갈래 !== '글자') { if (할말) alert('글자 자리를 먼저 고르세요'); return [] }
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || !sel.rangeCount) {
    if (고르개열림) return 고름곳들(r.글줄 || [])
    if (할말) alert(할말)
    return []
  }
  const 바탕 = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement
  const el = 바탕 && 바탕.closest('.칸.글자')
  if (!el) return []
  const 범위 = sel.getRangeAt(0)
  const 난것 = []
  const 줄들 = [...el.querySelectorAll(':scope > .줄')]
  줄들.forEach((줄el, i) => {
    if (!범위.intersectsNode(줄el)) return
    const 글수 = 줄el.textContent.replace(/\\u200B/g, '').length
    const 안에서시작 = 줄el.contains(범위.startContainer)
    const 안에서끝 = 줄el.contains(범위.endContainer)
    const 앞 = 안에서시작 ? 줄자리(줄el, 범위.startContainer, 범위.startOffset) : 0
    const 뒤 = 안에서끝 ? 줄자리(줄el, 범위.endContainer, 범위.endOffset) : 글수
    const a = Math.max(0, Math.min(글수, Math.min(앞, 뒤)))
    const b = Math.max(0, Math.min(글수, Math.max(앞, 뒤)))
    if (b > a) 난것.push({ 줄: i, 시작: a, 끝: b })
  })
  return 난것
}

// 형광펜 — 토글. 안 긁었으면 이미 칠한 형광펜의 색만 바꾼다.
function 형광펜걸기(r, 새색, 할말) {
  if (!r) return
  const 긁었나 = 긁은자리들(r, null).length > 0
  if (할말 && !새색 && !긁었나) { alert(할말); return }
  // 안 긁었는데 바꿀 것이 없으면(칠한 형광펜이 없거나, 「없음」이거나, 같은 색) 아무것도 안 한다 —
  // 되돌리기 칸·「저장 •」이 헛되이 생기면 안 된다(옛 코드도 여기서 돌아갔다).
  if (!긁었나 && (!새색 || 글줄같나(형광색바꾸기(r.글줄 || [], 새색), r.글줄))) return
  const 색 = 새색 || 지금형광색()
  효과로고치기(r, (글줄, 곳들) => 효과바꾸기(글줄, 곳들, '형광펜', 색),
    () => { if (새색) 글줄두기(r, 형광색바꾸기(r.글줄, 새색)) })
}

document.getElementById('ㅌ뒤로').onclick = () => 층으로밀기(-1)
document.getElementById('ㅍ앞으로').onclick = () => 층으로밀기(+1)
document.getElementById('ㅁ되돌').onclick = 되돌리기
document.getElementById('ㅂ다시').onclick = 다시

// 화면 좌표 → 카드 좌표
function 카드좌표(ev) {
  const b = 무대.getBoundingClientRect()
  const s = 배율()
  return [(ev.clientX - b.left) / s, (ev.clientY - b.top) / s]
}

function 꾸미기(el, 갈래, 번호) {
  if (!고른것 || 고른것.장 !== 지금장 || 고른것.갈래 !== 갈래 || 고른것.번호 !== 번호) return
  el.classList.add('골랐음')
}

// 고른 칸의 테두리와 손잡이. **무대 맨 위에 따로 얹는다** — 칸 안에 넣으면
// 뒤로 보낸 사진이 덮이는 순간 테두리도 손잡이도 같이 가려져서, 무엇을 골랐는지
// 안 보이고 끌 수도 없다.
//
// 손잡이는 화면에서 자리를 읽지 않는다(`고를것` 이 계산으로 잡는다) — 그래서
// 옮겨도 끌기가 안 깨진다. 옮기기·회전 손잡이만 제 pointerdown 을 갖는다.
function 선택겹만들기() {
  무대.querySelectorAll('.선택겹').forEach((x) => x.remove())
  if (!고른것 || 고른것.장 !== 지금장) return
  const r = 지금칸()
  if (!r) return
  const s = 배율()
  const box = r.box
  const el = document.createElement('div')
  el.className = '선택겹'
  자리(el, box, s, r)
  // **배경 사진 자리는 손잡이를 안 단다**(사람 지적 2026-08-31). 이 자리는 장
  // 전체라 «위치» 도 «크기» 도 없다 — 옮기고 늘릴 수 있게 두면 빈 곳을 누를
  // 때마다 카드 한 장이 통째로 잡혀 끌려 나온다. 고를 수는 있어야 한다
  // (「사진 넣기」로 채우는 자리다). 그래서 테두리만 두고 여기서 돌아간다.
  if (r.배경자리) { 무대.appendChild(el); return }
  const AT = { nw:[0,0], n:[.5,0], ne:[1,0], e:[1,.5], se:[1,1], s:[.5,1], sw:[0,1], w:[0,.5] }
  for (const h of Object.keys(AT)) {
    const d = document.createElement('div')
    d.className = '손잡이'
    d.style.left = (AT[h][0] * 100) + '%'
    d.style.top = (AT[h][1] * 100) + '%'
    el.appendChild(d)
  }
  // 옮기기 손잡이 — 글자 칸은 몸통이 contentEditable 이라 몸통을 끌면 커서·
  // 형광펜 긁기와 부딪힌다(그래서 무대의 pointerdown 가드가 그 몸통 끌기를
  // 막아 둔다). 대신 칸 밖 왼쪽 위에 옮기기 전용 손잡이를 둔다. 장식 칸은
  // 충돌이 없지만 결을 맞추려 똑같이 붙인다.
  const m = document.createElement('div')
  m.className = '옮기기손잡이'
  m.addEventListener('pointerdown', (ev) => {
    ev.stopPropagation()
    끌기시작(ev, 지금칸(), null, 카드좌표(ev))
  })
  el.appendChild(m)
  // 회전 손잡이 — 위 가운데 바깥이다. 옮기기 손잡이(왼쪽 위)와 자리가
  // 안 겹치게 CSS 로 떨어뜨려 둔다(위 `.회전손잡이`).
  const 회전 = document.createElement('div')
  회전.className = '회전손잡이'
  회전.addEventListener('pointerdown', (ev) => {
    ev.stopPropagation()
    const r = 지금칸()
    const 처음각 = r.각도 || 0
    무대.setPointerCapture(ev.pointerId)
    const 움직임 = (e2) => {
      r.각도 = Math.round(각도구하기(r.box, 카드좌표(e2), e2.shiftKey) * 10) / 10
      그리기()
    }
    const 끝 = () => {
      무대.removeEventListener('pointermove', 움직임)
      무대.removeEventListener('pointerup', 끝)
      const 끝난각 = r.각도
      r.각도 = 처음각
      설계도고치기(() => { r.각도 = 끝난각 })
    }
    무대.addEventListener('pointermove', 움직임)
    무대.addEventListener('pointerup', 끝)
  })
  el.appendChild(회전)
  // 카드 밖으로 나갔으면 빨갛게 — 막지는 않는다.
  if (box[0] < 0 || box[1] < 0 || box[2] > 상태.canvas[0] || box[3] > 상태.canvas[1]) {
    el.classList.add('밖으로')
  }
  무대.appendChild(el)
}

// 고르기만 바뀌었을 때는 다시 그리지 않는다 — 그리기() 로 무대.innerHTML 을
// 통째로 새로 만들면, 막 클릭한 글자 줄 요소가 그 자리에서 사라져 커서가
// 놓일 자리가 없어진다(2026-08-25, 사람이 실제로 만져 보고 지적: 글자를
// 한 번 눌러서는 편집이 안 됐다). 고를 때 바뀌는 것은 테두리·손잡이뿐이므로
// 그것만 갈아 끼운다 — 판단·장식은 전부 꾸미기() 하나에 맡긴다(두 벌 안
// 만든다).
function 선택그리기() {
  무대.querySelectorAll('.칸.골랐음').forEach((el) => el.classList.remove('골랐음'))
  선택겹만들기()
  색칸그리기()
  층표그리기()
  if (!고른것 || 고른것.장 !== 지금장) return
  const el = 무대.querySelector(`[data-갈래="${고른것.갈래}"][data-번호="${고른것.번호}"]`)
  if (el) 꾸미기(el, 고른것.갈래, 고른것.번호)
}

무대.addEventListener('pointerdown', (ev) => {
  // 이미 고른 글자 칸의 줄(.줄) 위를 다시 눌렀으면 텍스트 편집·형광펜 긁기다.
  // 여기서 그리기() 로 DOM 을 통째로 새로 만들면 브라우저가 막 잡으려던
  // 커서·드래그 선택이 통째로 끊긴다(실측: pointerdown 뒤 같은 .줄 이 더
  // 이상 문서에 없다) — 요약본에 없던 상호작용이라 여기서 손을 뗀다.
  if (ev.target.closest('.칸.글자.골랐음 .줄')) return
  const p = 카드좌표(ev)
  const c = 상태.cards[지금장]
  // 어느 칸을 잡았는지는 고를것() 이 판단한다 — 두 벌로 만들지 않는다.
  // **아까 고른 것을 또 누르면 그 밑엣것으로 내려간다.** 덮인 사진을 집어내는
  // 유일한 길이다 — 뒤로 보낸 순간 손이 안 닿으면 그건 지우기와 같다.
  // 방금 «움직인» 끌기였으면 안 내려간다 — 옮기려던 것이지 바꾸려던 게 아니다.
  const 고른 = 고른것 && 고른것.장 === 지금장 ? 고른것 : null
  const 잡음 = 고를것((c.장식영역 || []).map((r) => r.box),
                    (c.글자영역 || []).map((r) => r.box), p, 14,
                    장식순서(c), 고른, !끌었나)
  if (!잡음) { 고른것 = null; 선택그리기(); return }
  const r = (잡음.갈래 === '글자' ? c.글자영역 : c.장식영역)[잡음.번호]
  // **이미 고른 글자칸 «안» 을 다시 누르면 끌기를 안 건다**(사람 지적
  // 2026-09-18: 「형광펜 안 되는데?」). 글자를 긁으려는데 칸이 움직였다 —
  // 브라우저에서 재현했다: 긁힌 글이 빈 채로 칸 네모만 [70,140,…] →
  // [306.9,140,…] 으로 옮겨졌다. 긁히지 않으니 형광펜도 색도 안 걸렸다.
  //
  // 옮기는 길은 따로 있다 — 칸 왼쪽 위 「옮기기 손잡이」(`.옮기기손잡이`).
  // 처음 누를 때는 그대로 끌린다: 고르자마자 옮기는 손이 익어 있다.
  const 글자를긁는중 = 잡음.갈래 === '글자' && !잡음.손잡이
    && 고른 && 고른.갈래 === '글자' && 고른.번호 === 잡음.번호
  고른것 = { 장: 지금장, 갈래: 잡음.갈래, 번호: 잡음.번호 }
  // 배경 사진 자리는 고르기만 된다 — 위 `선택겹만들기` 와 같은 까닭이다.
  if (!r.배경자리 && !글자를긁는중) 끌기시작(ev, r, 잡음.손잡이, p)
  선택그리기()
})

// 방금 끝난 끌기가 «움직인» 끌기였나. 안 움직였으면 다음 누름을 «또 누른 것»
// 으로 쳐서 겹친 것의 밑으로 내려간다.
let 끌었나 = false

// 끈 뒤의 네모에 맞춰 `테두리`·`구멍` 을 다시 찍는다. 늘 **처음 점** 에서 셈해야
// 끄는 동안 배수가 겹겹이 쌓이지 않는다.
function 모양따라가기(r, 처음, 새box) {
  if (처음.테두리) r.테두리 = 모양늘리기(처음.테두리, 처음.box, 새box)
  if (처음.구멍) r.구멍 = 처음.구멍.map((g) => 모양늘리기(g, 처음.box, 새box))
}

function 끌기시작(ev0, r, 손잡이, 시작점) {
  const 처음 = {
    box: r.box.slice(), pt: r.pt,
    테두리: r.테두리 && r.테두리.map((p) => p.slice()),
    구멍: r.구멍 && r.구멍.map((g) => g.map((p) => p.slice())),
  }
  let 바뀜 = false
  무대.setPointerCapture(ev0.pointerId)

  const 움직임 = (ev) => {
    const p = 카드좌표(ev)
    const 모서리 = 손잡이 && 손잡이.length === 2
    if (모서리 && r.pt) {
      const 난것 = 비율조절(처음.box, 손잡이, p, 처음.pt, r.align)
      r.box = 난것.box
      r.pt = 난것.pt
    } else if (손잡이) {
      r.box = 옆면조절(처음.box, 손잡이, p, r.align)
    } else {
      r.box = 옮기기(처음.box, p[0] - 시작점[0], p[1] - 시작점[1])
    }
    if (손잡이) 모양따라가기(r, 처음, r.box)
    바뀜 = true
    그리기()
  }
  const 끝 = () => {
    무대.removeEventListener('pointermove', 움직임)
    무대.removeEventListener('pointerup', 끝)
    끌었나 = 바뀜
    if (!바뀜) return
    const 끝난것 = { box: r.box.slice(), pt: r.pt }
    r.box = 처음.box; r.pt = 처음.pt
    모양따라가기(r, 처음, 처음.box)
    // 가로가 바뀌었으면 줄을 다시 감는다 — 좁히면 다음 줄로 넘어가고 넓히면 줄어든다.
    // 굽는 쪽은 `lines` 를 받은 그대로 그리므로, 여기서 나눈 것이 곧 정답이 된다.
    // **모서리(비율 조절)에서는 다시 감지 않는다** — 네모와 글자 크기가 같은
    // 배수로 커지므로 한 줄에 들어가는 글자 수가 그대로다.
    const 배수바뀜 = 끝난것.pt !== 처음.pt
    if (r.글줄 && !배수바뀜 && (끝난것.box[2] - 끝난것.box[0]) !== (처음.box[2] - 처음.box[0])) {
      const 폭 = 끝난것.box[2] - 끝난것.box[0]
      // **효과는 글자에 붙어 있어 같이 간다**(2026-09-28 — 동료 저장 오류가 여기서 났다).
      끝난것.글줄 = 다시끊기(r.글줄, 폭, 덩어리자만들기({ ...r, pt: 끝난것.pt }))
      // 줄이 늘었는데 아래가 모자라면 네모를 늘린다 — 안 그러면 잘려서 다시 감은
      // 뜻이 없어진다. 위 변은 그대로 두고 아래만 내린다.
      끝난것.box = 높이맞추기(끝난것.box, 끝난것.글줄.length, 끝난것.pt, r.줄간격)
    }
    설계도고치기(() => {
      r.box = 끝난것.box
      r.pt = 끝난것.pt
      if (끝난것.글줄) { r.글줄 = 끝난것.글줄; r.lines = 글줄글들(끝난것.글줄) }
      모양따라가기(r, 처음, 끝난것.box)
    })
  }
  무대.addEventListener('pointermove', 움직임)
  무대.addEventListener('pointerup', 끝)
}

// 첫 그리기에서 무대.clientWidth 가 0 으로 읽힐 때가 있다(레이아웃이 아직
// 한 번도 안 돈 시점) — 레이아웃이 한 번 돈 뒤로 미뤄서 잰다.
document.fonts.ready.then(() => requestAnimationFrame(그리기))
window.addEventListener('resize', 그리기)

// ── 저장과 판 되돌리기 ──────────────────────────────────────────
// 지금까지는 만지는 것만 됐다 — 새로고침하면 다 날아갔다. 여기서 링크에 남긴다.

const 저장단추 = document.getElementById('ㅅ저장')
let 안저장 = false

// 틀 뽑기 단추(`ㅇ틀`)는 뺐다(사람 지시 2026-09-22). 서버 길
// (`POST /template/{id}`)은 그대로 둔다 — 이미 구워 둔 옛 작업대 쪽에는
// 단추가 남아 있어서, 길을 막으면 그것들이 그 자리에서 죽는다.
function 저장상태(안저장인가) {
  안저장 = 안저장인가
  저장단추.textContent = 안저장 ? '저장 •' : '저장'
  // **결과 쪽은 저장할 때 같이 구워진다.** 주소는 저장이 돌려준다 —
  // 굽기 전에는 열 것이 없다. 내려받기도 저쪽에 있다(2026-09-19).
  const 결과 = document.getElementById('ㅇ결과')
  결과.disabled = 안저장 || !상태.결과
  결과.title = (안저장 || !상태.결과)
    ? '먼저 저장하세요 — 결과물은 저장할 때 만들어집니다'
    : '구운 카드뉴스를 열어 본다 — 영상도 보고 내려받는 것도 여기서 한다'
  // **받기도 같은 잣대다.** 화면에 보이는 것과 다른 그림을 받아 가면 사람은
  // 그걸 모른다 — 저장 안 한 것이 있으면 안 눌린다.
  const 받기단추 = document.getElementById('ㅈ받기')
  받기단추.disabled = 안저장 || !(상태.png || []).length
  받기단추.title = 안저장 ? 말('먼저저장')
                        : 말('전부받기설명')
}
function 안저장표시() { 저장상태(true) }
저장상태(false)

저장단추.onclick = async () => {
  저장단추.disabled = true
  저장단추.textContent = 말('굽는중')
  try {
    // 굽는 15분 동안 사람이 고칠 수 있다 — 구운 것과 화면이 같을 때만 «저장됨» 으로 친다.
    const 굽던설계도 = JSON.stringify(상태.cards)
    const res = await fetch(상태.ep + '/edit/' + 상태.id, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // 잠깐 쓰는 표(`_고름`)는 설계도가 아니다 — 떼고 보낸다.
      body: JSON.stringify({ cards: 상태.cards.map((c) => ({ ...c,
        글자영역: (c.글자영역 || []).map((r) => (r.글줄 ? { ...r, 글줄: 고름표떼기(r.글줄) } : r)) })),
      언어: 상태.언어 || '' }),
    })
    const j = await res.json()
    if (!j.ok) throw new Error((j.탈 || ['모르는 탈']).join(' · '))
    if (res.status === 202 && j.job_id) {
      // 영상이 든 판은 뒤에서 굽는다(사람 결정 2026-09-16). 5초마다 물어본다, 15분까지.
      const 시작 = Date.now()
      let 끝 = null
      while (Date.now() - 시작 < 15 * 60 * 1000) {
        await new Promise((r) => setTimeout(r, 5000))
        const 봉투 = await fetch(상태.ep + '/make/' + j.job_id).then((x) => x.json()).catch(() => null)
        if (!봉투) continue
        if (봉투.status === 'succeeded') { 끝 = 봉투.result; break }
        if (봉투.status === 'failed') throw new Error((봉투.error && 봉투.error.message) || '굽지 못했습니다')
        저장단추.textContent = 말('굽는중') + ' ' + (Number.isFinite(Number(봉투.progress)) ? 봉투.progress + '%' : '')
      }
      if (!끝) throw new Error('너무 오래 걸립니다 — 잠시 뒤 판 목록에서 확인하세요')
      상태.png = 끝.slides
      저장상태(JSON.stringify(상태.cards) !== 굽던설계도)
      판칸그리기(끝.판목록, 끝.판)
      return
    }
    상태.png = j.slides
    상태.결과 = j.결과 || ''
    저장상태(false)
    판칸그리기(j.판목록, j.판)
  } catch (e) {
    // 판을 안 쌓았으므로 고친 것은 화면에 그대로 남는다. 다시 누르면 된다.
    alert('저장을 못 했습니다 — ' + e.message)
    저장상태(true)
  } finally {
    저장단추.disabled = false
  }
}

// ── 결과물 보기 ────────────────────────────────────────────────────
//
// **내려받기는 결과 쪽에 있다(사람 결정 2026-09-19).** 여기 있던 단추는 뺐다 —
// 저장하면 결과 쪽이 같이 구워지고, 전부·낱장 내려받기가 거기 있다.
//
// **저장 안 한 것이 있으면 안 눌린다.** 화면에 보이는 것과 다른 그림을 받아 가면
// 사람은 그걸 모른다 — 틀 뽑기와 같은 잣대다.
document.getElementById('ㅇ결과').onclick = () => {
  if (상태.결과) window.open(상태.결과, '_blank', 'noopener')
}

// ── 전부 다운로드 ──────────────────────────────────────────────────
//
// **압축 파일 하나로 준다**(사람 지시 2026-09-21: 「폴더 안에 다 넣어서」).
// 브라우저는 폴더를 못 준다 — 압축 파일이 그것과 가장 가까운 것이고, 풀면
// 폴더가 된다.
//
// 2026-09-19 에 여기 있던 단추를 빼고 결과 쪽으로 옮겼는데, 결과 쪽으로 가는
// 길이 저장 뒤에만 열려서 **어디서도 못 받는 상태**가 됐다. 그래서 되돌린다.
document.getElementById('ㅈ받기').onclick = async () => {
  const 단추 = document.getElementById('ㅈ받기')
  const 본글 = 단추.textContent
  단추.disabled = true
  try {
    await 모아받기(상태.png || [], 말('쪽제목'),
                (i, 모두) => { 단추.textContent = 말('받는중') + ' ' + i + '/' + 모두 })
  } catch (e) {
    alert(말('못받음') + e.message)
  }
  단추.textContent = 본글
  단추.disabled = false
}

// ── 굵게·밑줄·글머리 ──────────────────────────────────────────────
//
// **긁었으면 긁은 데만, 안 긁었으면 칸 전체.** 글자색·형광펜과 같은 규칙이다
// (사람 결정 2026-09-18·09-19). 단추 하나가 둘을 다 한다 — 사람이 「긁었나
// 안 긁었나」만 기억하면 된다. 효과는 긁은 그 글자에 붙는다(2026-09-28).

// 글머리 — 문장에 붙는다. 긁은 글자가 든 문장들에(한 글자만 긁어도 그 문장). 안 긁으면 모든 문장.
function 글머리걸기(r, 갈래) {
  if (!r) return
  효과로고치기(r, (글줄, 곳들) => 글머리바꾸기(글줄, [...new Set(곳들.map((곳) => 곳.줄))], 갈래),
    () => 글줄두기(r, 글머리바꾸기(r.글줄, [], 갈래)))
}

// 밑줄 — 토글. 안 긁었으면 칸 전체(옛 `효과: ["밑줄"]` 그대로).
function 밑줄걸기(r) {
  if (!r) return
  효과로고치기(r, (글줄, 곳들) => 효과바꾸기(글줄, 곳들, '밑줄'), () => {
    const 효과 = [...(r.효과 || [])]
    r.효과 = 효과.includes('밑줄') ? 효과.filter((e) => e !== '밑줄') : [...효과, '밑줄']
  })
}

// 굵게 — 토글. 안 긁었으면 칸 전체 굵기(`weight`).
function 굵게걸기(r) {
  if (!r) return
  효과로고치기(r, (글줄, 곳들) => 효과바꾸기(글줄, 곳들, '굵게'),
    () => { r.weight = r.weight === 'Bold' ? 'Regular' : 'Bold' })
}



function 판칸그리기(목록, 지금판) {
  const 셈 = document.getElementById('셈')
  셈.innerHTML = ''
  const sel = document.createElement('select')
  for (const x of 목록) {
    const o = document.createElement('option')
    o.value = x.판
    o.textContent = (x.판 === 0 ? '처음' : x.판 + '판') + ' · ' + (x.때 || '')
    if (x.판 === 지금판) o.selected = true
    sel.appendChild(o)
  }
  sel.onchange = async () => {
    if (안저장 && !confirm('저장 안 한 것이 있습니다. 그래도 옮길까요?')) return
    const res = await fetch(상태.ep + '/edit/' + 상태.id + '?v=' + sel.value)
    const j = await res.json()
    상태.cards = j.cards.map((c) => ({ ...c, 배경CSS: c.배경CSS || '' }))
    상태.강조색 = j.강조색 || 상태.강조색
    기록.length = 0; 기록칸 = -1
    저장상태(false)
    그리기()
  }
  셈.appendChild(sel)
}

window.addEventListener('beforeunload', (e) => {
  if (안저장) { e.preventDefault(); e.returnValue = '' }
})

fetch(상태.ep + '/edit/' + 상태.id)
  .then((r) => r.json())
  .then((j) => 판칸그리기(j.판목록 || [], j.판))
  .catch(() => {})
</script>
"""
