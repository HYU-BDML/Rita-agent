# -*- coding: utf-8 -*-
"""인스타 게시물 **하나**를 담는다 — 라벨할 수 있는 상태까지.

웹 화면에서 사람이 하던 일을 서버가 대신 한다. 하는 일은 셋이다.

1. Apify 로 그 게시물의 낱장 주소와 딸린 값을 받아 온다
2. 게시판(`POST /api/picks`)에 줄을 하나 만든다
3. 낱장을 하나씩 R2 로 끌어온다(`PUT /api/slide/<코드>/<번호>`)

셋이 다 되면 라벨 화면 주소가 나온다. **거기까지가 「담기」다** — 그 앞에서
멈추면 사람은 클릭할 것이 없다.

**열쇠가 없으면 조용히 못 한다고 답한다.** 웹 쪽 열쇠는 브라우저에 있어서
서버는 못 본다(`web/lib/keys.js`). 서버가 쓰려면 `APIFY_TOKEN` 을 따로 넣어야
한다. 없을 때 터지지 않고 「웹에서 담아 주세요」로 물러서는 것이 이 함수의
계약이다.
"""
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

from 주소 import 다듬기 as 주소다듬기

# 게시물 **주소 하나**로 낱장을 캐는 액터.
#
# **웹의 `account` 액터(`apify~instagram-post-scraper`)로는 안 된다** — 그쪽은
# 계정 이름만 받는다. 주소를 주면 «Field input.username is required» 로 400 이
# 난다(실측 2026-08-28). 주소를 받는 것은 이 범용 액터다.
액터 = "apify~instagram-scraper"
액터돈 = 0.0023   # 결과 1건당

# 액터가 끝나기를 기다리는 한도. 한 건이라 보통 30~60초에 끝난다.
기다림상한 = 240
한숨 = 5

낱장상한 = 30      # 게시판이 받는 한도(`server/picks.js` 의 MAX_SLIDES)


class 담기탈(Exception):
    """사람에게 보여 줄 말과 함께 실패한다."""

    def __init__(self, 말: str, 열쇠없음: bool = False):
        super().__init__(말)
        self.말 = 말
        self.열쇠없음 = 열쇠없음


def 열쇠있나() -> bool:
    return bool((os.environ.get("APIFY_TOKEN") or "").strip())


def _부르기(주소: str, 몸=None, 방식: str = "GET", 열쇠: str = "", 초: int = 60):
    """**열쇠는 머릿말로만 보낸다.** 주소에 끼우면 실패할 때 그대로 로그에 찍힌다."""
    머리 = {"User-Agent": "Mozilla/5.0"}
    if 열쇠:
        머리["Authorization"] = f"Bearer {열쇠}"
    if 몸 is not None:
        머리["Content-Type"] = "application/json; charset=utf-8"
        몸 = json.dumps(몸, ensure_ascii=False).encode("utf-8")
    요 = urllib.request.Request(주소다듬기(주소), data=몸, method=방식, headers=머리)
    try:
        with urllib.request.urlopen(요, timeout=초) as r:
            글 = r.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        # **까닭을 읽는다.** 게시판도 Apify 도 왜 막았는지 본문에 적어 보낸다.
        # 안 읽으면 로그에 「400 Bad Request」만 남아서 무엇이 틀렸는지 모른다.
        속 = e.read().decode("utf-8", "replace")[:300]
        raise 담기탈(f"{e.code}: {속}") from e
    return json.loads(글) if 글.strip() else {}


def 낱장캐기(코드: str) -> dict:
    """Apify 를 돌려 그 게시물의 낱장 주소를 받아 온다."""
    열쇠 = (os.environ.get("APIFY_TOKEN") or "").strip()
    if not 열쇠:
        raise 담기탈("서버에 담기 열쇠가 없습니다", 열쇠없음=True)

    밑 = f"https://api.apify.com/v2/acts/{액터}"
    시킴 = {"directUrls": [f"https://www.instagram.com/p/{코드}/"],
           "resultsType": "details", "resultsLimit": 1, "addParentData": False}
    돈것 = _부르기(f"{밑}/runs", 시킴, "POST", 열쇠)["data"]
    번호, 창고 = 돈것["id"], 돈것["defaultDatasetId"]
    print(f"++ Apify 돌린다: {번호}")

    끝난때 = time.time() + 기다림상한
    상태 = "RUNNING"
    while time.time() < 끝난때:
        time.sleep(한숨)
        상태 = _부르기(f"https://api.apify.com/v2/actor-runs/{번호}",
                    열쇠=열쇠)["data"]["status"]
        if 상태 not in ("READY", "RUNNING"):
            break
    if 상태 != "SUCCEEDED":
        raise 담기탈(f"인스타에서 게시물을 못 가져왔습니다({상태})")

    줄들 = _부르기(f"https://api.apify.com/v2/datasets/{창고}/items", 열쇠=열쇠)
    if not 줄들:
        raise 담기탈("그 주소에서 게시물을 못 찾았습니다")
    return 줄들[0]


def 줄만들기(코드: str, 캔것: dict) -> dict:
    """게시판이 받는 모양으로 바꾼다. `web/lib/sources.js` 의 `account` 와 같다."""
    낱장들 = 캔것.get("childPosts") or 캔것.get("images") or []
    if not 낱장들 and 캔것.get("displayUrl"):
        낱장들 = [캔것]
    if not 낱장들:
        raise 담기탈("그 게시물에는 담을 사진이 없습니다")
    낱장들 = 낱장들[:낱장상한]

    주소들, 표시 = [], []
    for 낱 in 낱장들:
        영상 = bool(낱.get("videoUrl"))
        주소들.append(낱.get("videoUrl") or 낱.get("displayUrl") or "")
        표시.append("1" if 영상 else "0")
    if not any(주소들):
        raise 담기탈("그 게시물에는 담을 사진이 없습니다")

    본문 = 캔것.get("caption") or ""
    # **이름표는 게시판이 정한다**(`web/server/picks.js` 의 `toRow`). 밑줄 이름을
    # 보냈더니 400 이 났다(실측 2026-08-28) — 그쪽은 낙타 이름만 읽는다.
    return {
        "id": 코드,
        "contentType": "cardnews",
        "url": 캔것.get("url") or f"https://www.instagram.com/p/{코드}/",
        "slideCount": len(낱장들),
        "slideTotal": len(낱장들),
        "slideKinds": "".join(표시),
        "caption": 본문[:2200],
        "author": (캔것.get("ownerUsername") or "")[:60],
        "likes": max(int(캔것.get("likesCount") or 0), 0),
        "comments": max(int(캔것.get("commentsCount") or 0), 0),
        "postedAt": 캔것.get("timestamp") or "",
    }, 주소들


def 게시판에얹기(줄: dict, 주소들: list, 게시판: str, 출입증: str) -> int:
    """줄을 만들고 낱장을 하나씩 끌어온다. 끌어온 장 수를 돌려준다.

    **줄을 먼저 만든다.** 낱장은 그 줄에 딸려 사는 것이라, 순서가 뒤집히면
    사진만 창고에 뜨고 목록에서는 안 보인다.
    """
    난것 = _부르기(f"{게시판}/api/picks", 줄, "POST", 출입증)
    if not 난것.get("ok"):
        raise 담기탈(난것.get("why") or "게시판에 담지 못했습니다")

    담긴것 = 0
    for i, 주소 in enumerate(주소들, start=1):
        if not 주소:
            continue
        캔것 = urllib.parse.urlencode({"u": 주소})
        영상 = "&v=1" if 줄["slideKinds"][i - 1] == "1" else ""
        try:
            답 = _부르기(f"{게시판}/api/slide/{줄['id']}/{i}?{캔것}{영상}",
                      방식="PUT", 열쇠=출입증, 초=90)
            담긴것 += 1 if 답.get("ok") else 0
        except urllib.error.HTTPError as e:
            # **한 장이 안 와도 나머지는 담는다.** 열 장 중 아홉이면 라벨은 된다.
            print(f"!! {i}번 낱장 실패: {e.code}")
    if not 담긴것:
        raise 담기탈("사진을 한 장도 가져오지 못했습니다")
    return 담긴것


def 라벨주소(게시판: str, 코드: str, 장수: int) -> str:
    return f"{게시판}/label.html?id={코드}&n={장수}"
