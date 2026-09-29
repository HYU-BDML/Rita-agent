# -*- coding: utf-8 -*-
"""카드뉴스 작업대 Lambda — 라벨링 사슬 «우리 것» 만.

**저쪽(주차소식·채용공고·경제뉴스)과 갈라 나온 함수다.** 예전에는
`render-server/app.py` 하나가 양쪽 길을 다 갖고 Lambda 함수 하나로 배포됐다.
그래서 한쪽이 배포하면 다른 쪽 코드가 사라졌고(2026-08-25, `/render/cardnews`
404), 한쪽이 모듈을 빠뜨리면 양쪽 길이 다 500 이 됐다.

    POST /render/cardnews    cards_json  → 장마다 구운 PNG 주소 목록
    POST /workbench          구운 장 + 설계도 → «작업대» 쪽 주소 (0판으로 쌓는다)
    GET  /edit/{id}          그 판의 설계도 (`?v=` 로 옛 판)
    POST /edit/{id}          고친 설계도를 굽고 새 판으로 쌓는다
    GET  /template/{id}      틀 하나
    POST /template/{id}      저장된 판에서 틀을 뽑는다
    POST /template/resolve   주소·별명(또는 빈 값) → 틀 내용
    POST /upload             사진·로고 → 공개 주소
    POST /analyze/{코드}      그 게시물을 «분석» Lambda 로 넘긴다 (비동기)

**`/viewer` 는 저쪽에 남겼다.** 보기 전용 뷰어는 주차소식·경제뉴스도 쓴다.
설계도를 같이 보내 작업대를 받는 길은 여기 `/workbench` 다.

**API 주소는 그대로다.** 같은 API Gateway 에 우리 길만 명시적으로 걸어서 이
함수로 보낸다 — 이미 만들어 둔 작업대 링크와 틀 주소가 전부 그대로 산다.
"""
import base64
import json
import os
import re
import shutil
import time
import urllib.request
import uuid
from email.parser import BytesParser
from email.policy import default as _EMAIL
from pathlib import Path
from urllib.parse import urlparse

import boto3
from botocore.config import Config
from PIL import Image

import cardnews_compose
import rita
import 영상굽기
import edit_store
import template_out
import template_render as tr
import workbench

HERE = Path(__file__).resolve().parent
TMP = Path("/tmp")
BUCKET = os.environ["BUCKET"]
REGION = os.environ.get("AWS_REGION", "ap-northeast-2")
# 영상은 **이 주소로 시작하는 것만** 받는다. 검사하는 쪽(`edit_store`)과 굽는
# 쪽(`영상굽기`)은 우리 통 이름을 모른다 — 여기서 받아 넘긴다.
영상접두 = f"https://{BUCKET}.s3.{REGION}.amazonaws.com/photos/"

_s3 = boto3.client("s3")
_서명용 = None


def _서명창고():
    """서명 주소 전용 클라이언트 — **작업대와 같은 집** 주소로 서명한다.

    기본 클라이언트는 `<통>.s3.amazonaws.com`(지역 없는 주소)으로 서명해서, 작업대
    (`<통>.s3.ap-northeast-2.amazonaws.com`)와 집이 달라 브라우저가 PUT 을 막았다
    (실물 2026-09-16, 첫 배포 뒤 확인). 지역 주소 + s3v4 + 가상 호스트 방식이면 같은 집.
    """
    global _서명용
    if _서명용 is None:
        _서명용 = boto3.client(
            "s3", region_name=REGION, endpoint_url=f"https://s3.{REGION}.amazonaws.com",
            config=Config(signature_version="s3v4", s3={"addressing_style": "virtual"}))
    return _서명용
TPL = json.loads((HERE / "template.json").read_text(encoding="utf-8"))
FONTS = tr.FontBook(TPL["fonts"], HERE)   # 글꼴은 한 번만 읽는다


MIME = {".png": "image/png", ".jpg": "image/jpeg", ".mp4": "video/mp4"}

def _fetch(url: str) -> Path:
    """미디어를 /tmp 로 내린다.

    User-Agent 를 반드시 넣는다. 파이썬 기본값(Python-urllib/3.x)은 Cloudflare
    가 봇으로 보고 막는다 — 우리 게시판에서 이미 겪은 일이다(analyze/fetch_board.py).
    """
    req = urllib.request.Request(url, headers={"User-Agent": "cardnews-render/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        suffix = Path(urlparse(url).path).suffix.lower()
        if suffix not in MIME:
            ctype = (r.headers.get("Content-Type") or "").split(";")[0].strip()
            suffix = {v: k for k, v in MIME.items()}.get(ctype, ".bin")
        p = TMP / f"media-{uuid.uuid4().hex}{suffix}"
        with open(p, "wb") as f:
            shutil.copyfileobj(r, f)
    return p


def _put(path: Path, key: str) -> str:
    ctype = MIME.get(path.suffix.lower(), "application/octet-stream")
    _s3.upload_file(str(path), BUCKET, key, ExtraArgs={"ContentType": ctype})
    return f"https://{BUCKET}.s3.{REGION}.amazonaws.com/{key}"

class _S3창고:
    """`edit_store` 가 받는 오리 타입의 S3 판. 읽기·쓰기 둘뿐이다."""

    def 읽기(self, key: str):
        try:
            return _s3.get_object(Bucket=BUCKET, Key=key)["Body"].read()
        except Exception as e:
            # **`NoSuchKey` 만 잡으면 안 된다** — 이 역할에는 `s3:ListBucket` 이
            # 없어서 없는 열쇠에 `AccessDenied` 가 온다(`_wait_job` 과 같은 사정).
            코드 = getattr(e, "response", {}).get("Error", {}).get("Code", "")
            if 코드 in ("NoSuchKey", "AccessDenied", "404") or type(e).__name__ == "NoSuchKey":
                return None
            raise

    def 쓰기(self, key: str, data: bytes, ctype: str) -> None:
        _s3.put_object(Bucket=BUCKET, Key=key, Body=data, ContentType=ctype)

def _창고():
    return _S3창고()

def edit_id_of(path: str):
    """`/edit/{id}` 에서 id 를 뽑는다. 없으면 None.

    API Gateway 단계 이름이 앞에 붙어 올 수 있어(`/prod/edit/…`) 끝에서 센다.
    """
    조각 = [x for x in (path or "").split("/") if x]
    if len(조각) < 2 or 조각[-2] != "edit":
        return None
    return 조각[-1] or None

def edit_load(edit_id: str, 판=None) -> dict:
    """판 하나를 읽어 쪽이 바로 쓸 수 있게 배경 CSS · 강조색을 얹어 준다.

    **판을 갈아 끼울 때도 필요하다** — 새로 받는 `cards` 에는 배경CSS 가 없고
    (그건 `쪽만들기` 가 처음 낼 때만 계산해 얹는 값이다), 강조색도 그 판의
    형광펜에서 다시 유추해야 다른 틀로 건너가도 기본색이 그 틀을 따라간다.
    """
    import workbench
    난것 = edit_store.판읽기(_창고(), edit_id, 판)
    # **여는 문에서 글줄로 바꾼다**(2026-09-28) — 작업대는 새 모양만 안다.
    난것["cards"] = edit_store.카드들글줄로(난것["cards"])
    난것["cards"] = [{**c, "배경CSS": workbench.배경CSS(c.get("배경"))}
                    for c in 난것["cards"]]
    난것["강조색"] = workbench._강조색유추(난것["cards"])
    return 난것

def _두쪽굽기(창고, edit_id: str, cards: list, 주소들: list, 언어: str = "") -> tuple:
    """작업대 쪽과 결과 쪽을 **같이** 올린다. 돌려주는 것은 그 둘의 주소.

    **만들 때도 결과 쪽이 있어야 한다**(사람 지시 2026-09-21). 여태는 저장할 때만
    구웠다. 그래서 처음 만든 사람은 결과 쪽이 아예 없었고 — 작업대의 「결과물
    보기」가 회색으로 죽어 있어 **내려받을 길이 어디에도 없었다.**

    서로의 주소를 미리 아는 까닭은 둘 다 `edit_id` 하나로 정해지기 때문이다.
    그래서 굽기 전에 주소부터 잡고 서로에게 넣어 준다. 열쇠는 아스키로 둔다 —
    한글 열쇠에서 나온 주소는 요청조차 안 된 적이 있다(`_한판올리기` 의 그 탈).
    """
    import workbench
    import 결과쪽
    작업대주소 = f"https://{BUCKET}.s3.{REGION}.amazonaws.com/viewer/{edit_id}.html"
    결과주소 = f"https://{BUCKET}.s3.{REGION}.amazonaws.com/results/{edit_id}.html"
    창고.쓰기(f"viewer/{edit_id}.html",
            workbench.쪽만들기(edit_id, cards, 주소들, 언어, 결과주소).encode("utf-8"),
            "text/html; charset=utf-8")
    창고.쓰기(f"results/{edit_id}.html",
            결과쪽.쪽만들기(edit_id, 주소들, 작업대주소).encode("utf-8"),
            "text/html; charset=utf-8")
    return 작업대주소, 결과주소


def _굽고_쌓기(edit_id: str, cards: list, 굽기, 때: str, 언어: str = "") -> dict:
    """굽고 → 판 쌓고 → 뷰어 다시 쓰기. 즉시 저장과 번호표 굽기가 같이 쓴다.

    `언어` 는 **작업대 쪽이 돌려준 것**이다(`상태.언어`). 안 오면 한국어 —
    옛 쪽에서 저장해도 그대로 돈다.
    """
    주소들 = 굽기(cards)
    창고 = _창고()
    판 = edit_store.다음판(창고, edit_id)
    난것 = edit_store.판저장(창고, edit_id, 판, cards, 주소들, 때)
    작업대주소, 결과주소 = _두쪽굽기(창고, edit_id, cards, 주소들, 언어)
    return {"ok": True, "판": 난것["판"], "판목록": 난것["판목록"], "slides": 주소들,
            "url": 작업대주소, "결과": 결과주소}


# **장이 이만큼보다 많으면 저장도 번호표로 굽는다.** 게이트웨이가 30초에서 끊는데
# 저장은 «모든 장을 다시 굽는» 일이다.
#
# 실물 2026-09-21: 사진이 든 7장을 저장하자 31.2초·30.3초가 걸렸다. 서버는 끝까지
# 굽고 판 1·2 를 쌓았는데, 게이트웨이는 30초에 503 을 돌려줘서 화면은 「저장을 못
# 했습니다」를 띄웠다 — **저장은 됐는데 실패로 보였다.**
#
# 사진 든 첫 3장이 19초 걸린 기록이 있어(9/21 18:08) 4장부터는 넘어갈 수 있다.
#
# **처음 굽는 쪽(`카드뉴스만들기`)은 이제 안 나눈다**(2026-09-24). 그쪽은 분석 람다가
# 이 람다를 «직접» 불러서 게이트웨이를 안 거친다. 이 저장 길은 브라우저가 바깥 문으로
# 들어오는 것이라 30초 벽이 그대로라, 둘의 숫자를 맞출 까닭이 없어졌다.
번호표로굽는장수 = 3


def _영상있나(cards: list) -> bool:
    return any(cardnews_compose.영상자리(c) for c in cards or [] if isinstance(c, dict))


def _자기걸기(몸: dict) -> None:
    """작업대 Lambda 가 **자기 자신**을 비동기로 부른다. 게이트웨이(30초)를 안 탄다."""
    boto3.client("lambda").invoke(
        FunctionName=os.environ.get("AWS_LAMBDA_FUNCTION_NAME", "cardnews-workbench"),
        InvocationType="Event",
        Payload=json.dumps(몸, ensure_ascii=False).encode("utf-8"))


def edit_save(edit_id: str, body: dict, 굽기=None, 때=None, 걸기=None) -> dict:
    """고친 설계도를 굽고 새 판으로 쌓는다.

    **탈이 있으면 아무것도 안 굽고 판도 안 쌓는다** — 반쯤 저장된 판이
    남는 것이 제일 나쁘다. 화면 쪽은 고친 상태를 그대로 들고 있다가 다시
    저장하면 된다.

    **영상이 든 판은 번호표다**(사람 결정 2026-09-16). 영상 한 장 인코딩이
    10~30초라 게이트웨이의 30초 안에 못 끝난다. 번호표를 주고 자기 자신을 뒤에서
    불러 굽는다(`굽기한판`). **장이 많은 판도 같다**(`번호표로굽는장수`, 2026-09-21).
    영상도 없고 장도 적으면 예전 그대로 즉시 답한다 — 한 바이트도 안 바뀐다.
    """
    # **들어오는 문에서 글줄로 바꾼다**(2026-09-28). 배포 전에 열어 둔 옛 작업대가
    # 옛 모양으로 보내도 받는다 — 없는 줄을 가리키던 효과는 그것만 버리고 자국에 남긴다.
    버린것 = []
    cards = edit_store.카드들글줄로(body.get("cards"), 버린것)
    for 말 in 버린것:
        print(f"!! 바꾸며 버린 효과 — {말}")
    탈 = edit_store.설계도_탈(cards, 영상접두=영상접두)
    if 탈:
        return {"ok": False, "탈": 탈}
    # **작업대 쪽이 제 언어를 돌려준다**(`상태.언어`). 그래야 다시 구워도
    # 영어인 채로 남는다 — 이 쪽은 창고에 구워 올라가는 것이라 브라우저
    # 저장소를 못 읽는다.
    언어 = (body.get("언어") or "").strip()
    굽기 = 굽기 or (lambda c: build_cardnews({"slides": c})["slides"])
    때 = 때 or time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    if _영상있나(cards) or len(cards) > 번호표로굽는장수:
        번호 = rita.번호만들기()
        일저장(번호, {"status": "queued", "progress": 0})
        (걸기 or _자기걸기)({"굽기일": {"번호": 번호, "edit_id": edit_id,
                                    "cards": cards, "언어": 언어}})
        print(f"++ 영상 굽기를 걸었다: {번호}")
        return {"ok": True, "job_id": 번호, "status": "queued"}
    return _굽고_쌓기(edit_id, cards, 굽기, 때, 언어)


def 굽기한판(시킴: dict) -> dict:
    """번호표로 굽는다. **답을 아무도 안 받는다** — 비동기로 불렸으니 탈이 나도
    반드시 번호표에 적는다. 안 적으면 작업대가 「굽는 중」을 영영 본다."""
    번호 = (시킴 or {}).get("번호") or ""
    edit_id = (시킴 or {}).get("edit_id") or ""
    cards = (시킴 or {}).get("cards") or []
    # **작업대 쪽이 돌려준 언어.** 안 오면 한국어 — 옛 번호표가 그대로 돈다.
    언어 = (시킴 or {}).get("언어") or ""
    if not 번호 or not edit_id:
        return {"ok": False, "why": "번호표나 edit_id 가 없다"}
    # Lambda 가 Event 호출을 두 번까지 다시 부르므로, 이미 끝난 일을 또 구워
    # 판을 겹쌓지 않는다.
    이전 = 일읽기(번호)
    if (이전 or {}).get("status") == "succeeded":
        print(f"++ 이미 구운 번호표다: {번호}")
        return {"ok": True, "번호": 번호, "이미": True}
    일저장(번호, {"status": "running", "progress": 10})
    try:
        때 = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        난것 = _굽고_쌓기(edit_id, cards,
                       lambda c: build_cardnews({"slides": c})["slides"], 때, 언어)
        일저장(번호, {"status": "succeeded", "progress": 100, "result": 난것})
        print(f"++ 영상 굽기 끝: {번호} · {len(난것['slides'])}장")
        return {"ok": True, "번호": 번호}
    except Exception as e:  # noqa: BLE001 — 반드시 번호표에 적고 끝낸다
        import traceback
        traceback.print_exc()
        일저장(번호, {"status": "failed", "progress": 100,
                    "error": {"code": "bake_failed", "message": str(e) or type(e).__name__}})
        return {"ok": False, "번호": 번호, "why": str(e)}

def template_id_of(path: str):
    """`/template/{id}` 에서 id 를 뽑는다. 없으면 None.

    `edit_id_of` 와 같은 결 — 끝에서 둘째 조각이 `template` 일 때만 잡는다.
    """
    조각 = [x for x in (path or "").split("/") if x]
    if len(조각) < 2 or 조각[-2] != "template":
        return None
    return 조각[-1] or None

def template_save(edit_id: str, body: dict) -> dict:
    """그 판을 «틀» 로 뽑아 창고에 둔다.

    **Dify 가 이 틀을 골라 쓰게 하는 것은 아직 안 한다** — 지금 틀은
    `make_dsl_cardnews.py` 가 yml 안에 박아 넣는다(「레시피 꺼내기」 노드).
    바깥 틀을 읽으려면 그래프를 바꿔야 하고, 그건 별개의 일이다.
    """
    try:
        난것 = edit_store.판읽기(_창고(), edit_id, body.get("판"))
    except KeyError as e:
        return {"ok": False, "탈": [str(e)]}
    틀 = template_out.틀뽑기(edit_store.카드들글줄로(난것["cards"]), FONTS, body.get("강조색") or "#C9FC95")
    틀["이름"] = (body.get("이름") or "").strip() or edit_id
    틀["나온곳"] = {"edit_id": edit_id, "판": 난것["판"]}
    키 = f"templates/{edit_id}-{난것['판']}.json"
    _창고().쓰기(키, json.dumps(틀, ensure_ascii=False).encode("utf-8"),
                "application/json; charset=utf-8")
    return {"ok": True, "url": f"https://{BUCKET}.s3.{REGION}.amazonaws.com/{키}",
            "틀": 틀}

def template_load(이름: str) -> dict:
    """틀 하나를 그대로 준다. **이름이 비면 기본 틀이다.**

    이렇게 해 두면 Dify 쪽에 갈래가 없다 — 사람이 틀 주소를 안 줘도 「틀 받기」
    노드가 늘 같은 자리를 부르고, 없으면 서버가 기본을 준다.
    """
    키 = f"templates/{(이름 or '기본').strip() or '기본'}.json"
    raw = _창고().읽기(키)
    if not raw:
        raise KeyError(f"그런 템플릿이 없다 — {키}")
    return json.loads(raw.decode("utf-8"))

# 「아무거나 어울리는 것」을 뜻하는 이름. Dify 고르는 칸의 첫 줄이고, 창고의
# `기본.json`(여러 게시물을 합친 옷장)으로 간다.
기본이름 = "기본"


def _목록():
    """창고의 틀 목록. 없으면 빈 목록."""
    raw = _창고().읽기("templates/목록.json")
    return json.loads(raw.decode("utf-8")) if raw else []


def _이름으로찾기(이름: str) -> dict:
    """별명(또는 게시물 코드)으로 틀 하나.

    **목록을 거쳐 코드를 얻고, 창고 열쇠로 읽는다.** 목록에 적힌 `주소` 를 그대로
    부르지 않는 까닭은 그게 «바깥 주소» 라서다 — 목록이 어쩌다 남의 주소를 담게
    되면 서버가 그걸 대신 불러 준다. 열쇠로 읽으면 우리 창고 밖으로 못 나간다.
    """
    목록 = _목록()
    for 줄 in 목록:
        if (줄.get("이름") or "").strip() == 이름 or (줄.get("코드") or "") == 이름:
            코드 = 줄.get("코드") or ""
            raw = _창고().읽기(f"templates/{코드}.json")
            if not raw:
                raise KeyError(f"목록에는 있는데 템플릿 파일이 없다 — {이름}")
            return json.loads(raw.decode("utf-8"))
    있는것 = ", ".join((줄.get("이름") or "?") for 줄 in 목록) or "없음"
    raise KeyError(f"그런 템플릿이 없습니다 — «{이름}». 있는 것: {있는것}")


# ---------------------------------------------------------------- 말투
#
# **디자인과 따로 쌓는다.** 사람이 고르는 축이 둘이기 때문이다 — 디자인 하나,
# 말투 하나(사람 결정 2026-08-27). 틀 쪽과 모양을 똑같이 맞춰 둔다: 목록 파일
# 하나와 이름으로 찾기.

# **아스키로만 짓는다** — `analyze/lambda_분석.py` 의 `말투칸` 과 같은 값이어야 한다.
# 두 벌인 까닭은 배포 단위가 달라서다. 갈리면 말투를 못 찾는다.
말투칸 = "tones"


def 말투목록() -> list:
    raw = _창고().읽기(f"{말투칸}/목록.json")
    return json.loads(raw.decode("utf-8")) if raw else []


def 말투찾기(body: dict) -> dict:
    """별명(또는 게시물 코드)으로 말투 하나. `_이름으로찾기` 와 같은 규칙이다."""
    이름 = (body.get("이름") or "").strip()
    목록 = 말투목록()
    if not 이름:
        raise KeyError("어떤 말투인지 알려 주세요 — " + (_있는말투(목록) or "저장된 말투가 없습니다"))
    for 줄 in 목록:
        if (줄.get("이름") or "").strip() == 이름 or (줄.get("코드") or "") == 이름:
            raw = _창고().읽기(f"{말투칸}/{줄.get('코드') or ''}.json")
            if not raw:
                raise KeyError(f"목록에는 있는데 말투 파일이 없다 — {이름}")
            return json.loads(raw.decode("utf-8"))
    raise KeyError(f"그런 말투가 없다 — «{이름}». " + (_있는말투(목록) or "저장된 말투가 없습니다"))


def _있는말투(목록: list) -> str:
    이름들 = ", ".join((줄.get("이름") or "?") for 줄 in 목록)
    return f"있는 것: {이름들}" if 이름들 else ""


def template_rename(body: dict) -> dict:
    """틀 이름만 고친다. **다시 재지 않는다.**

    이름 짓기는 「분석하기」를 누를 때 물어본다. 그런데 그 기능이 생기기 전에
    만든 틀은 이름이 게시물 코드(`DHqCBQnRAjW`)라 고를 때 뭐가 뭔지 모른다.
    이름을 고치자고 게시물을 다시 재는 것은 값(구글 비전)도 시간도 아깝다.

    **틀 파일이 이름의 주인이다.** 목록은 틀에서 뽑아 만들어지므로 거기만
    고치면 다음 목록 갱신 때 저절로 따라온다. 다만 지금 화면이 바로 보게
    목록도 같이 손본다.
    """
    코드 = (body.get("코드") or "").strip()
    이름 = (body.get("이름") or "").strip()
    if not 코드 or not 이름:
        return {"ok": False, "why": "코드와 이름이 다 있어야 한다"}
    if len(이름) > 60:
        return {"ok": False, "why": "이름이 너무 길다 (60자까지)"}
    raw = _창고().읽기(f"templates/{코드}.json")
    if not raw:
        return {"ok": False, "why": f"그런 템플릿이 없다 — {코드}"}
    틀 = json.loads(raw.decode("utf-8"))
    틀["이름"] = 이름
    _창고().쓰기(f"templates/{코드}.json",
               json.dumps(틀, ensure_ascii=False, indent=1).encode("utf-8"),
               "application/json; charset=utf-8")
    목록 = _목록()
    for 줄 in 목록:
        if 줄.get("코드") == 코드:
            줄["이름"] = 이름
    _창고().쓰기("templates/목록.json",
               json.dumps(목록, ensure_ascii=False, indent=1).encode("utf-8"),
               "application/json; charset=utf-8")
    return {"ok": True, "코드": 코드, "이름": 이름, "말투이름": _말투이름고치기(코드, 이름)}


# 말투 이름은 틀 이름에 이것을 붙인 것이다(`analyze/말투틀.뽑기` 가 그렇게 짓는다).
# **두 벌인 까닭은 배포 단위가 달라서다** — 작업대 Lambda 는 `analyze/` 를 안 싣는다.
# 갈리면 이름을 고쳐도 말투가 옛 이름으로 남는다(`test_말투이름.py` 가 잡는다).
말투꼬리 = " 말투"


def _말투이름고치기(코드: str, 이름: str) -> str:
    """틀 이름을 고치면 **말투 이름도 같이 고친다.**

    말투 이름은 틀 이름에서 나온다(「파란 타임라인」 → 「파란 타임라인 말투」).
    틀만 고치면 말투는 옛 이름으로 남아, 사람이 방금 붙인 이름으로 말투를
    고르면 «그런 말투가 없다» 가 나온다(실물 2026-08-31: 틀은 「파란 타임라인」
    인데 말투는 「DSW-6lrk5rs」였다).

    말투가 아직 없으면(분석 전) 아무 일도 안 한다. 여기서 죽으면 이름 고치기
    자체가 실패하는데, 그건 말투 하나보다 나쁘다.
    """
    새이름 = 이름 + 말투꼬리
    try:
        raw = _창고().읽기(f"{말투칸}/{코드}.json")
        if not raw:
            return ""
        말투 = json.loads(raw.decode("utf-8"))
        말투["이름"] = 새이름
        _창고().쓰기(f"{말투칸}/{코드}.json",
                   json.dumps(말투, ensure_ascii=False, indent=1).encode("utf-8"),
                   "application/json; charset=utf-8")
        목록 = 말투목록()
        for 줄 in 목록:
            if 줄.get("코드") == 코드:
                줄["이름"] = 새이름
        _창고().쓰기(f"{말투칸}/목록.json",
                   json.dumps(목록, ensure_ascii=False, indent=1).encode("utf-8"),
                   "application/json; charset=utf-8")
        return 새이름
    except Exception as e:  # noqa: BLE001 — 이름 고치기 자체는 살려 둔다
        print(f"!! 말투 이름은 못 고쳤다: {type(e).__name__}: {e}")
        return ""


def template_resolve(body: dict) -> dict:
    """틀 하나를 준다. 받는 것은 셋 중 하나다.

        {"url": "https://…"}   그 주소의 틀 — 예전부터 쓰던 길
        {"이름": "키키 밈체"}    저장소에서 별명으로 찾는다 — Dify 고르는 칸
        {}  또는 {"이름": "기본"}  여러 게시물을 합친 기본 옷장

    **주소를 먼저 본다.** 둘 다 왔으면 주소가 이긴다 — 더 또렷한 지정이다.


    Dify 쪽에 갈래를 두지 않으려고 서버가 이 판단을 한다 — 「틀 받기」 노드는 늘
    같은 자리를 부르고, 빈 주소면 기본이 온다. 시작 칸 `template_url` 값(사용자가
    넣는 S3 주소)은 슬래시 같은 문자를 담을 수 있어 URL 경로 조각으로 못 끼우므로,
    「틀 받기」 HTTP 노드가 **몸통에** 담아 POST 로 보낸다.
    """
    주소 = (body.get("url") or "").strip()
    if 주소:
        return json.loads(_fetch(주소).read_bytes().decode("utf-8"))
    이름 = (body.get("이름") or "").strip()
    if 이름 and 이름 != 기본이름:
        return _이름으로찾기(이름)
    raw = _창고().읽기("templates/기본.json")
    if not raw:
        raise ValueError("기본 틀이 창고에 없다 — deploy.sh 가 올리는 자리다")
    return json.loads(raw.decode("utf-8"))

_UPLOAD_MIME = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
                ".gif": "image/gif", ".webp": "image/webp"}

_CRLF = bytes([13, 10])

def _multipart(event: dict) -> dict:
    """multipart/form-data 를 «칸 이름 → [(파일이름, 바이트)]» 로 푼다.

    Dify HTTP 노드는 **파일 목록 변수 하나를 같은 칸 이름의 여러 조각으로 펼쳐서**
    보낸다(graphon `_resolve_form_files` 가 `ArrayFileSegment` 를 그렇게 다룬다).
    그래서 칸마다 목록으로 받는다 — 사진 여러 장이 한 번에 온다. Dify 쪽에 반복
    노드가 필요 없는 이유다.

    API Gateway 는 몸통이 글자가 아니면 base64 로 싸서 준다(`isBase64Encoded`).
    """
    헤더 = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
    ctype = 헤더.get("content-type") or ""
    if "multipart/" not in ctype:
        raise ValueError(f"multipart/form-data 로 보내야 한다 — 받은 것: {ctype!r}")
    몸통 = event.get("body") or ""
    바이트 = base64.b64decode(몸통) if event.get("isBase64Encoded") else 몸통.encode()
    머리 = b"Content-Type: " + ctype.encode() + _CRLF + b"MIME-Version: 1.0" + _CRLF + _CRLF
    쪽지 = BytesParser(policy=_EMAIL).parsebytes(머리 + 바이트)
    칸 = {}
    for 조각 in 쪽지.iter_parts():
        이름 = 조각.get_param("name", header="content-disposition")
        파일이름 = 조각.get_filename()
        속 = 조각.get_payload(decode=True)
        if not 이름 or not 파일이름 or not 속:
            continue      # 파일 아닌 칸과 Dify 의 빈 자리표시(`__multipart_placeholder__`)
        칸.setdefault(이름, []).append((파일이름, 속))
    return 칸

def upload_sign(body: dict) -> dict:
    """`POST /upload/sign` — 영상을 **창고에 직접** 올릴 서명 주소를 준다.

    사진은 `/upload` 로 Lambda 를 거치는데 그 문은 API Gateway 가 10MB 에서
    끊는다. 30초 영상은 수십 MB 라 못 지나간다(사람 결정 2026-09-16). 작업대
    쪽은 창고와 같은 집(같은 S3 주소)에서 나오므로 CORS 없이 PUT 이 된다.
    """
    ext = str((body or {}).get("ext") or "").lower().lstrip(".")
    if ext != "mp4":
        return {"ok": False, "why": "mp4 만 올릴 수 있습니다"}
    # **크기를 서명에 박는다.** 안 박으면 이 문은 «아무 크기나 우리 창고에 쓸 수
    # 있는 주소» 가 된다 — 창고가 ContentLength 를 같이 검사하게 만든다.
    크기 = (body or {}).get("size")
    if not isinstance(크기, int) or isinstance(크기, bool) or 크기 <= 0 or 크기 > 영상굽기.최대바이트:
        return {"ok": False, "why": "영상이 너무 큽니다 (200MB 까지)"}
    키 = f"photos/{uuid.uuid4().hex}.mp4"
    put_url = _서명창고().generate_presigned_url(
        "put_object", Params={"Bucket": BUCKET, "Key": 키, "ContentType": "video/mp4",
                              "ContentLength": 크기},
        ExpiresIn=900)
    return {"ok": True, "put_url": put_url,
            "url": f"https://{BUCKET}.s3.{REGION}.amazonaws.com/{키}"}


# 지울 수 있는 열쇠 꼴. **우리가 지은 이름만 지운다** — `photos/<32자리>.<확장자>`
# 다(`upload_media` 와 `upload_sign` 이 그렇게 짓는다). 받은 주소를 그대로 믿고
# 지우면 이 문이 «창고 아무거나 지우는 문» 이 된다.
_지울꼴 = re.compile(r"^[0-9a-f]{32}\.(?:png|jpg|jpeg|gif|webp|mp4)$")

# 한 번에 지울 수 있는 수. 한 대화가 들 수 있는 것은 사진 30장(`_사진최대`)과
# 로고 하나뿐이라 넉넉하다.
_지울최대 = 40


def upload_delete(body: dict) -> dict:
    """`POST /upload/delete` — 올린 사진·로고를 창고에서 지운다.

    **「새 대화」가 부른다**(사람 지시 2026-09-22: 「새 대화라는 게 리셋임 모든게
    리셋(로고까지)」). 여태는 한 번 올라간 그림을 지우는 길이 **아예 없었다** —
    사람이 AWS 화면에 들어가 손으로 지우는 수밖에 없었다.

    **우리가 지은 이름만 지운다.** 받은 주소가 우리 창고의 `photos/<32자리>.<확장자>`
    꼴이 아니면 세지도 않고 건너뛴다.

    **없는 것을 지워도 탈이 아니다.** S3 는 없는 열쇠에도 성공을 준다 — 두 번
    눌러도 결과가 같고, 이미 지운 뒤에 또 불려도 죽지 않는다.
    """
    주소들 = body.get("주소들")
    if not isinstance(주소들, list):
        return {"ok": False, "why": "주소들이 목록이 아닙니다"}
    앞 = f"https://{BUCKET}.s3.{REGION}.amazonaws.com/photos/"
    지운것, 건너뛴것 = 0, 0
    for u in 주소들[:_지울최대]:
        글자 = u.strip() if isinstance(u, str) else ""
        뒤 = 글자[len(앞):] if 글자.startswith(앞) else ""
        if not _지울꼴.match(뒤):
            건너뛴것 += 1
            continue
        _s3.delete_object(Bucket=BUCKET, Key=f"photos/{뒤}")
        지운것 += 1
    # **주소는 안 찍는다** — 자국에 남길 까닭이 없다. 개수만 남긴다.
    print(f"++ 올린 것 지움 — {지운것}개 (건너뜀 {건너뛴것}개)")
    return {"ok": True, "지운수": 지운것, "건너뛴수": 건너뛴것}


def upload_media(event: dict) -> dict:
    """올린 사진·로고를 창고에 넣고 **공개 주소**를 돌려준다.

    **왜 이 문이 필요한가.** Dify 가 워크플로에 주는 것은 사진이 아니라 «내 서랍
    몇 번» 이라는 쪽지다 — 지금 설정으론 호스트도 안 붙고(`FILES_URL` 공란) 5분에
    만료된다(`FILES_ACCESS_TIMEOUT`). 굽는 쪽은 AWS 라 사용자 컴퓨터의 서랍을 못
    연다. 그래서 쪽지 대신 **사진 자체를 여기로 부치고**, 여기서 공개 주소로 바꿔
    돌려준다.

    받는 것: multipart/form-data — `photos` 칸에 사진 여러 장, `logo` 칸에 로고 한 장.
    주는 것: `photo_urls`(줄마다 하나) 와 `logo_url`. 시작 화면의 같은 이름 칸과
             **모양이 같아서** 배치 노드가 손댈 것 없이 그대로 받는다.

    한 번에 보낼 수 있는 크기는 **API Gateway 가 10MB 에서 끊는다.** 사진 열몇
    장이면 보통 몇 MB 라 닿지 않지만, 원본 사진을 그대로 올리면 넘길 수 있다.
    """
    칸 = _multipart(event)

    def 올려(파일들: list) -> list:
        주소들 = []
        for 파일이름, 속 in 파일들:
            ext = Path(파일이름).suffix.lower()
            if ext not in _UPLOAD_MIME:
                raise ValueError(f"그림이 아니다 — «{파일이름}» (되는 것: "
                                 f"{', '.join(sorted(_UPLOAD_MIME))})")
            키 = f"photos/{uuid.uuid4().hex}{ext}"
            p = TMP / Path(키).name
            p.write_bytes(속)
            _s3.upload_file(str(p), BUCKET, 키, ExtraArgs={"ContentType": _UPLOAD_MIME[ext]})
            p.unlink(missing_ok=True)
            주소들.append(f"https://{BUCKET}.s3.{REGION}.amazonaws.com/{키}")
        return 주소들

    사진 = 올려(칸.get("photos") or [])
    로고 = 올려(칸.get("logo") or [])
    print(f"++ 올림 — 사진 {len(사진)}장 · 로고 {len(로고)}장")
    return {"photo_urls": chr(10).join(사진), "logo_url": 로고[0] if 로고 else ""}

def build_cardnews(body: dict) -> dict:
    """라벨링 기반 카드뉴스(Task 10) 전용 — `cardnews_compose.py` 참고.

    `slide_types` 레지스트리를 안 쓴다. `cards_json` 이 이미 장마다 box·색·
    글꼴을 다 담고 있어서 타입을 찾을 필요가 없다.

    사진 장은 png, **영상 장은 mp4** 다(사람 결정 2026-09-16). 영상 장은 굽는 쪽이
    «뚫린 그림 + 영상 주소 + 자리» 로 주고, 여기서 `영상굽기` 가 mp4 를 만든다.
    실패하면 장 번호를 붙여 던진다 — 어느 장이 왜 안 됐는지 사람이 봐야 한다."""
    장들 = cardnews_compose.build(body, FONTS)
    urls = []
    for n, 장 in enumerate(장들, start=1):
        if isinstance(장, dict):
            뚫린 = TMP / f"cardnews-{uuid.uuid4().hex}.png"
            결과 = TMP / f"cardnews-{uuid.uuid4().hex}.mp4"
            # **탈이 나도 둘 다 지운다.** ffmpeg 이 굽다 죽으면 반쯤 만든 mp4 가
            # 남는데, Lambda 의 `/tmp` 는 따뜻한 호출 사이에 살아 있어서 몇 번만
            # 실패해도 디스크(512MB)가 찬다.
            try:
                장["그림"].save(뚫린)
                영상굽기.굽기(장["영상"], 뚫린, 장["box"], 결과, 허용접두=영상접두)
                urls.append(_put(결과, f"cardnews/{uuid.uuid4().hex}.mp4"))
            except 영상굽기.영상탈 as e:
                raise ValueError(f"{n}번 장 영상을 못 구웠습니다 — {e}") from e
            finally:
                뚫린.unlink(missing_ok=True)
                결과.unlink(missing_ok=True)
            continue
        p = TMP / f"cardnews-{uuid.uuid4().hex}.png"
        장.save(p)
        urls.append(_put(p, f"cardnews/{uuid.uuid4().hex}.png"))
        p.unlink(missing_ok=True)
    return {"slides": urls}

# ---------------------------------------------------------------- 작업대 내주기

def _구운주소들(장들) -> list:
    """구운 장 목록을 «주소 글 목록» 으로 편다.

    **덩이째 온 것도 푼다.** Dify 「뷰어」 노드는 굽기의 답 본문을 «글 그대로»
    끼워 넣는다 — `{"slides": {{#굽기.body#}}}` 가 되면서 답 전체가 한 겹 더
    감싸인다. 그러면 `{"slides": {"slides": [...]}}` 가 오고, 사전을 돌면 열쇠
    이름(`"slides"`)이 주소로 잡혀 «구운 그림이 하나도 없는» 0판이 쌓인다
    (2026-08-27 실제로 그랬다).

    노드를 하나 더 세워 풀지 않고 여기서 푸는 까닭은, 이미 Dify 에 올라가 있는
    판까지 같이 고쳐지기 때문이다.
    """
    if isinstance(장들, dict):
        장들 = 장들.get("slides") or []
    if not isinstance(장들, list):
        return []
    주소들 = [x if isinstance(x, str) else (x.get("url") or "")
            for x in 장들 if isinstance(x, (str, dict))]
    return [u for u in 주소들 if u.startswith("http")]


def make_workbench(body: dict) -> dict:
    """구운 장 목록 + 설계도 → 작업대 쪽 하나. 0판으로 쌓는다.

    **설계도(`cards`)가 없으면 거절한다.** 보기 전용 뷰어는 저쪽 `/viewer` 다 —
    여기서 그 길까지 흉내 내면 두 벌이 생긴다.
    """
    주소들 = _구운주소들(body.get("slides"))
    cards = body.get("cards")
    if isinstance(cards, str):
        cards = json.loads(cards)
    if not cards:
        raise ValueError("cards 가 없다 — 보기 전용 뷰어는 /viewer 를 써라")
    버린것 = []
    cards = edit_store.카드들글줄로(cards, 버린것)
    for 말 in 버린것:
        print(f"!! 바꾸며 버린 효과 — {말}")
    탈 = edit_store.설계도_탈(cards)
    if 탈:
        raise ValueError("설계도에 탈이 있다 — " + " · ".join(탈[:3]))
    창고 = _창고()
    edit_id = uuid.uuid4().hex
    edit_store.판저장(창고, edit_id, 0, cards, 주소들,
                    time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
    # **언어를 흘려보낸다.** 안 보내면 작업대만 한국어로 구워진다.
    주소, 결과주소 = _두쪽굽기(창고, edit_id, cards, 주소들,
                          (body.get("언어") or "").strip())
    만든것얹기(edit_id, 주소, 주소들, cards)
    return {"url": 주소, "edit_id": edit_id, "결과": 결과주소}


# ---------------------------------------------------------------- 만든 것 목록
#
# **만든 카드뉴스를 다시 찾을 길이 없었다.** 만들 때마다 작업대 주소가 나오는데
# 그 창을 닫으면 끝이었다 — 틀은 목록이 있는데 결과물은 없었다(사람이 2026-08-27
# 「지금까지 저장된 거 보는 건 웹에 없는데 이게 정상인가?」라고 물었다. 정상이
# 아니라 빠진 것이었다).
#
# 틀 목록(`templates/목록.json`)과 **같은 결로** 둔다 — 창고에 글 파일 하나,
# 웹이 그대로 읽는다. 새 문을 안 만들어도 화면을 붙일 수 있다.

만든것칸 = "만든것"
만든것최대 = 200
"""목록에 남길 개수. 넘으면 오래된 것부터 잘라 낸다.

지운다는 뜻이 아니다 — 작업대 쪽도 설계도도 창고에 그대로 있고 주소를 알면
열린다. **목록이 끝없이 길어지는 것만** 막는다."""


def _첫줄(cards: list) -> str:
    """첫 장의 첫 글줄. 목록에서 「무엇을 만든 것인지」 알아보게 하는 값이다."""
    for c in cards or []:
        for r in c.get("글자영역") or []:
            for 줄 in r.get("lines") or []:
                if str(줄).strip():
                    return str(줄).strip()[:60]
    return ""


def 만든것얹기(edit_id: str, 주소: str, 구운것: list, cards: list) -> None:
    """목록 맨 앞에 한 줄. **터져도 만든 것을 잃지 않는다.**

    카드뉴스는 이미 창고에 있고 주소도 돌려줬다. 목록에 못 적었다고 그걸
    실패로 만들 이유가 없다 — 다음에 만들 때 다시 적힌다.
    """
    try:
        raw = _창고().읽기(f"{만든것칸}/목록.json")
        목록 = json.loads(raw.decode("utf-8")) if raw else []
        if not isinstance(목록, list):
            목록 = []
    except Exception:  # noqa: BLE001 — 목록이 깨졌으면 이번 것부터 새로 시작한다
        목록 = []
    한줄 = {"edit_id": edit_id, "주소": 주소,
          "표지": (구운것 or [""])[0], "장수": len(cards or []),
          "제목": _첫줄(cards),
          "만든날": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    목록 = [한줄] + [x for x in 목록 if x.get("edit_id") != edit_id]
    try:
        _창고().쓰기(f"{만든것칸}/목록.json",
                   json.dumps(목록[:만든것최대], ensure_ascii=False, indent=1).encode("utf-8"),
                   "application/json; charset=utf-8")
    except Exception:  # noqa: BLE001
        print("!! 만든 것 목록을 못 적었다 — 카드뉴스는 그대로 있다")


# ---------------------------------------------------------------- 길 나누기

분석함수 = os.environ.get("ANALYZE_FN", "cardnews-analyze")


def analyze_id_of(path: str) -> str:
    """`/analyze/<코드>` 에서 코드. 아니면 빈 글자."""
    조각 = [c for c in (path or "").split("/") if c]
    return 조각[1] if len(조각) >= 2 and 조각[0] == "analyze" else ""


def 분석시키기(pid: str, 이름: str = "", 개인: bool = True) -> dict:
    """분석 Lambda 를 **비동기로** 부르고 곧바로 돌아온다.

    **여기서 기다리면 안 된다.** 계량은 일곱 장에 1~2분인데 API Gateway 는 30초
    에서 끊는다. 기다리는 판을 만들면 사람은 «실패» 를 보는데 뒤에서는 계속 도는,
    제일 헷갈리는 모양이 된다.

    끝났는지는 게시판 상태로 안다 — 분석 함수가 「분석중」→「분석 끝」·「분석
    실패」로 바꾼다. 이미 있던 상태 기계라 새로 만들 것이 없다.
    """
    if not pid or not pid.replace("_", "").replace("-", "").isalnum():
        return {"ok": False, "why": f"게시물 코드가 이상하다: {pid!r}"}
    boto3.client("lambda").invoke(
        FunctionName=분석함수, InvocationType="Event",
        Payload=json.dumps({"분석": pid, "이름": 이름, "개인": bool(개인)},
                           ensure_ascii=False).encode("utf-8"))
    return {"ok": True, "코드": pid,
            "말": "분석을 걸었다 — 목록의 상태가 「분석 끝」이 되면 템플릿이 창고에 있다"}


# ---------------------------------------------------------------- RITA 채팅
#
# **여기 두 길은 아무 일도 안 한다.** 번호표만 주고받는다 — RITA 등록 화면의
# 연결 시험이 15초에서 끊기 때문이다. 진짜 일은 분석 Lambda 가 맡는다
# (`분석시키기` 와 같은 결의 번호표 방식이다).

일칸 = "rita-jobs"


def make_id_of(path: str) -> str:
    """`/make/<번호>` 에서 번호. `POST /make`(번호 없음)는 안 잡힌다."""
    조각 = [c for c in (path or "").split("/") if c]
    return 조각[1] if len(조각) >= 2 and 조각[0] == "make" else ""


def 그만둘번호(path: str) -> str:
    """`/make/<번호>/stop` 에서 번호. 아니면 빈 글자.

    **`make_id_of` 도 이 길에서 번호를 낸다** — 셋째 조각을 안 보기 때문이다.
    그래서 문을 가를 때 이것을 «먼저» 봐야 한다. 안 그러면 「그만두기」가
    「다 됐나 물어보기」로 잡힌다.
    """
    조각 = [c for c in (path or "").split("/") if c]
    if len(조각) == 3 and 조각[0] == "make" and 조각[2] == "stop":
        return 조각[1]
    return ""


def jobs_id_of(path: str) -> str:
    """`/jobs/<번호>` 에서 번호. 아니면 빈 글자."""
    조각 = [c for c in (path or "").split("/") if c]
    return 조각[1] if len(조각) >= 2 and 조각[0] == "jobs" else ""


def _밑주소(event) -> str:
    """이 요청이 들어온 집 주소.

    **박아 두지 않고 요청에서 읽는다.** 규격 §7.1 이 물어보러 갈 주소를 등록
    주소와 같은 집(scheme·host·port)으로 요구하는데, 여기서 읽으면 어느 집으로
    등록하든 저절로 맞는다.
    """
    도메인 = (event.get("requestContext") or {}).get("domainName") or ""
    return f"https://{도메인}" if 도메인 else ""


def 일저장(번호: str, 일: dict) -> None:
    _창고().쓰기(f"{일칸}/{번호}.json",
               json.dumps(일, ensure_ascii=False).encode("utf-8"),
               "application/json; charset=utf-8")


def 일읽기(번호: str):
    raw = _창고().읽기(f"{일칸}/{번호}.json")
    return json.loads(raw.decode("utf-8")) if raw else None


# 무슨 말인지 모를 때 보여 줄 안내. **할 수 있는 것을 나열한다** — 「모르겠다」
# 만 말하면 사람은 무엇을 물어야 할지 모른다.
_도움말 = "\n".join([
    "카드뉴스를 만들어 드립니다. 이렇게 말해 보세요.",
    "",
    "- 「템플릿 목록 보여줘」 · 「말투 목록 보여줘」",
    "- 「키키 템플릿에 아기 말투로 강남 카페 트렌드 만들어줘」",
    "- 인스타 주소를 붙이면 그 게시물을 담습니다",
    "- 라벨을 마친 뒤 「분석해줘」 하면 템플릿과 말투로 저장합니다",
])


def _일걸기(event, 시킴: dict, 무엇: str) -> dict:
    """번호표를 찍고 분석 Lambda 로 넘긴다. **1초 안에 끝난다.**"""
    번호 = rita.번호만들기()
    일저장(번호, {"status": "queued", "progress": 0})
    boto3.client("lambda").invoke(
        FunctionName=분석함수, InvocationType="Event",
        Payload=json.dumps({무엇: {"번호": 번호, **시킴}},
                           ensure_ascii=False).encode("utf-8"))
    print(f"++ {무엇} 를 걸었다: {번호}")
    return _reply(202, rita.접수봉투(번호, _밑주소(event)))


def 만들기걸기(event, body: dict) -> dict:
    """`POST /make` — **웹 화면이 부르는 문.**

    채팅(`/chat`)과 하는 일은 같다. 다른 것은 «어떻게 받느냐» 뿐이다 — 채팅은
    말 한 덩이를 받아 뜻을 읽어야 하고, 여기는 화면이 이미 칸으로 나눠 준다.
    그래서 되묻기도 뜻읽기도 필요 없다.

    **일 거는 자리는 하나다**(`_일걸기`). 물어보는 자리도 하나다(`/jobs/{번호}`).
    두 입구가 같은 사슬을 쓰므로 채팅과 웹이 갈라질 수 없다.
    """
    칸 = _대본칸(body)
    막힘 = _대본칸막힘(칸)
    if 막힘:
        return 막힘
    # **여기가 봉투를 새로 짓는 자리다.** 받은 것을 그대로 안 넘기고 칸을 골라
    # 담는다. 그래서 화면이 새 칸을 보내기 시작해도 여기 안 더하면 조용히
    # 버려진다 — 오류도 로그도 없이 그 칸이 없던 것처럼 일이 돈다.
    # 실제로 그랬다(2026-09-18): 「언어」가 화면·워커까지 잘 왔는데 여기서
    # 버려져 영어 카드가 한 장도 안 나왔다. `test_만들기걸기` 가 칸 목록을
    # 통째로 못 박아 다음번엔 빨개진다.
    #
    # **모르는 값을 한국어로 떨어뜨리는 일은 여기서 안 한다.** 그건 분석 람다
    # 몫이다(`lambda_분석.카드뉴스한판`). 두 곳에서 하면 규칙이 두 벌이 된다.
    return _일걸기(event, {**칸, **_사진칸(body)}, "카드뉴스")


def _대본칸(body: dict) -> dict:
    """**대본을 짓는 데 드는 칸만.** `/make` 와 `/draft` 가 나눠 쓴다.

    두 벌로 두면 한쪽만 새 칸을 받게 된다 — 「언어」가 그렇게 조용히 버려진
    적이 있다(2026-09-18).
    """
    return {"주제": (body.get("주제") or "").strip(),
            "원고": (body.get("원고") or "").strip(),
            "틀": (body.get("틀") or 기본이름).strip(),
            "언어": (body.get("언어") or "").strip(),
            # **올린 사진은 대본 «전» 에 필요하다**(설계: 자리가 대본보다 먼저).
            # 그래서 굽는 칸이 아니라 대본 칸에 있다 — 대본 쓸 때 「이 장엔 이런
            # 사진」을 알려 주려면 그때 이미 꽂혀 있어야 한다.
            "사진들": _사진들칸(body)}


# 한 판에 받을 사진 수와 주소 길이의 상한. **막자는 것이 아니라 터지지 말자는
# 것이다** — 자리가 열둘인 틀에 서른 장이면 열여덟 장은 어차피 안 쓰인다.
_사진최대, _주소최대 = 30, 500


def _사진들칸(body: dict) -> list:
    """올린 사진 주소 목록. **글자인 것만, 상한까지만.**

    창고 것인지는 채팅 서버가 이미 걸렀다(`web/server/chat.쓸사진들`). 여기는
    모양만 본다 — 숫자나 사전이 섞여 오면 배치가 그 자리에서 죽는다.
    """
    온것 = body.get("사진들")
    if not isinstance(온것, list):
        return []
    난것 = []
    for u in 온것[:_사진최대]:
        글자 = u.strip() if isinstance(u, str) else ""
        if 글자 and len(글자) <= _주소최대:
            난것.append(글자)
    return 난것


def _사진칸(body: dict) -> dict:
    """**굽을 때만 드는 칸.** `/make` 와 `/bake` 가 나눠 쓴다 — 돈이 나가는 쪽이다."""
    return {# 사진 자리를 비울지 AI 로 만들지(「비움」·「만듦」·빈 글자).
            # 빈 글자는 「비움」과 같다 — 여태 해 오던 것이다.
            "사진": (body.get("사진") or "").strip(),
            # 올린 로고의 주소. **비면 굽는 쪽이 로고 자리를 뺀다** —
            # 남기면 완성 카드에 점선 네모와 물음표가 박힌다
            # (사람 지시 2026-09-19).
            "로고": (body.get("로고") or "").strip()}


def _사진계획칸(body: dict) -> dict:
    """**초안에만 드는 사진 계획 칸 셋**(2026-09-29). 글자가 아니면 빈 글자.

    여기 없으면 채팅이 보낸 「참조해서 만들기」·바람·화풍이 이 문에서 조용히
    버려진다 — 이 문이 봉투를 새로 짓기 때문이다(2026-09-18 「언어」와 같은 탈).
    값이 맞는지는 분석 쪽(`lambda_분석._시킴읽기`)이 본다.

    안쪽 함수를 안 쓴다 — `test_상자.test_모르는_이름을_쓰지_않는다` 가 안쪽 함수의
    바깥 이름(`body`)을 «임포트 안 한 이름» 으로 본다.
    """
    상한 = {"사진쓰임": 10, "바람": 500, "화풍": 20}
    return {이름: (body.get(이름).strip()[:n] if isinstance(body.get(이름), str) else "")
            for 이름, n in 상한.items()}


def _대본칸막힘(칸: dict) -> dict:
    """못 쓸 것이면 돌려줄 답, 쓸 만하면 빈 것."""
    if not 칸["주제"]:
        return _reply(400, {"ok": False, "why": "무엇으로 만들지 적어 주세요"})
    if len(칸["주제"]) > 200 or len(칸["원고"]) > rita.말_최대:
        return _reply(413, {"ok": False, "why": "글이 너무 깁니다"})
    return {}


def 초안걸기(event, body: dict) -> dict:
    """`POST /draft` — **굽기 «전» 까지만 만드는 문.**

    `/make` 와 받는 것이 같고 하는 일만 짧다. 대본을 쓰고 자리에 얹은 «밑그림»
    까지 내고 멈춘다 — 사진을 안 만들고 굽지도 않으니 **돈이 안 나간다.**

    사람이 그것을 보고 고친 뒤 `/bake` 로 돌려보낸다(사람 결정 2026-09-19:
    「항상 거친다」, `docs/superpowers/specs/2026-09-19-사진과-미리보기-design.md`).

    **사진·로고를 여기서 안 받는다.** 사람이 미리보기를 보는 사이에 바꿀 수
    있는 값이라 `/bake` 가 들고 온다.
    """
    칸 = _대본칸(body)
    막힘 = _대본칸막힘(칸)
    if 막힘:
        return 막힘
    return _일걸기(event, {**칸, **_사진계획칸(body)}, "미리보기")


def 굽기걸기(event, body: dict) -> dict:
    """`POST /bake` — **사람이 「이대로 만들기」를 누른 뒤 부르는 문.**

    `/draft` 가 낸 밑그림을 그대로 돌려받아 굽는다 — **사람이 고친 뒤라도
    된다.** 여기서 대본을 다시 짓지 않는다.

    **이 파일에 이미 있는 `굽기한판` 과 다른 것이다.** 저것은 «판에 든 영상을
    인코딩하는» 일이고(번호표 방식), 여기는 «카드뉴스를 그림으로 굽는» 일이다.

    **밑그림은 칸을 골라 담지 않는다.** 칸을 고르는 까닭은 «화면이 보내는 것»
    을 거르자는 것인데, 밑그림은 우리가 낸 것을 그대로 돌려받는 것이다. 대신
    **구울 카드가 있나** 만 본다 — 없으면 한 장도 안 굽고 여기서 막는다.
    """
    밑그림 = body.get("밑그림")
    카드 = 밑그림.get("카드") if isinstance(밑그림, dict) else None
    if not isinstance(카드, list) or not 카드:
        return _reply(400, {"ok": False,
                            "why": "만들 초안이 없습니다. 미리보기부터 다시 해 주세요."})
    return _일걸기(event, {"밑그림": 밑그림, **_사진칸(body)}, "굽기")


# ── 인스타 주소 읽기 ───────────────────────────────────────────────
#
# **`render/채팅.py` 에서 옮겨 왔다**(2026-09-24). 그 파일은 RITA 채팅 규격 길만
# 쓰던 것이라 통째로 지웠는데, 담기 길이 이 둘만 쓰고 있었다.
_주소꼴 = re.compile(r"https?://(?:www\.)?instagram\.com/\S+", re.I)
_코드꼴 = re.compile(r"instagram\.com/(?:p|reel)/([A-Za-z0-9_-]{5,})", re.I)


def 인스타주소(말: str) -> str:
    """말 안에서 인스타 주소 하나. 없으면 빈 글자."""
    m = _주소꼴.search(말 or "")
    return m.group(0).rstrip(").,") if m else ""


def 게시물코드(주소: str) -> str:
    """주소에서 게시물 코드. `/p/` 와 `/reel/` 둘 다 받는다."""
    m = _코드꼴.search(주소 or "")
    return m.group(1) if m else ""


def 담기걸기(event, body: dict) -> dict:
    """`POST /ingest` — **웹 화면이 부르는 문.** 인스타 주소 하나를 받아 «담김» 을 건다.

분석 Lambda `담김한판` 이 실제로 담는다(`_일걸기`). 열쇠가 없는 까닭은
    `만들기걸기` 와 같다.
    """
    코드 = 게시물코드(인스타주소(body.get("url") or ""))
    if not 코드:
        return _reply(400, {"ok": False,
                            "why": "인스타 게시물 주소(instagram.com/p/…)를 붙여 주세요"})
    # **언어를 같이 싣는다.** 안 실으면 담김이 끝났을 때 나오는 말이
    # 한국어로 떨어진다 — 「언어」가 만들기에서 당했던 그 자리다.
    return _일걸기(event, {"코드": 코드,
                        "언어": (body.get("언어") or "").strip()}, "담김")


def 그만두기(번호: str) -> dict:
    """`POST /make/<번호>/stop` — **사람이 「그만두기」를 눌렀다.**

    번호표에 `그만: true` 만 적는다. 실제로 멈추는 것은 만드는 쪽(분석 람다)이다 —
    사진 한 장의 상태를 물으러 갈 때마다 이 값을 보고 스스로 손을 뗀다
    (`analyze/lambda_분석._그만인가만들기`). 프로세스가 둘이라 이 길뿐이다.

    **돈을 아끼는 자리다.** fal 문서: 줄에 있을 때 취소하면 「즉시 빠지고 아예
    처리되지 않는다」, 「실제 추론 작업만 청구에 들어간다」. 이미 그리는 중인
    것은 못 되돌린다.

    **끝난 일은 안 건드린다** — 다 된 것에 「그만」을 적으면, 뒤에 같은 번호를
    다시 쓰는 길이 생겼을 때 엉뚱하게 멈춘다.

    **열쇠 없이 열어도 되는 까닭**은 물어보기와 같다 — 번호표가 256비트 무작위고,
    웹 쪽에 제 암호 관문이 또 있다.
    """
    if not rita.번호맞나(번호):
        return _reply(404, {"ok": False, "why": "그런 작업이 없습니다"})
    일 = 일읽기(번호)
    if 일 is None:
        return _reply(404, {"ok": False, "why": "그런 작업이 없습니다"})
    if 일.get("status") in ("succeeded", "failed"):
        return _reply(200, {"ok": True, "이미끝남": True})
    일["그만"] = True
    일저장(번호, 일)
    print(f"++ 그만두기: {번호}")
    return _reply(200, {"ok": True})


def 만들기물어보기(번호: str) -> dict:
    """`GET /make/<번호>` — **웹 화면이 물어보는 문.**

    `/jobs/<번호>`(RITA 것)와 답이 같다. 문을 따로 낸 까닭은 **열쇠 때문이다** —
    저 문은 RITA 규격대로 열쇠를 보는데, 웹이 그 문을 쓰려면 열쇠를 워커까지
    옮겨야 한다. 열쇠가 한 군데 더 사는 것보다 문을 하나 더 내는 편이 낫다.

    **열쇠 없이 열어도 되는 까닭**은 번호표가 256비트 무작위여서다. 아무도 못
    찍고, 웹 쪽은 그 앞에 제 암호 관문이 또 있다.
    """
    if not rita.번호맞나(번호):
        return _reply(404, {"status": "failed",
                            "error": {"code": "not_found", "message": "그런 작업이 없습니다"}})
    일 = 일읽기(번호)
    if 일 is None:
        return _reply(404, {"status": "failed",
                            "error": {"code": "not_found", "message": "그런 작업이 없습니다"}})
    봉투 = rita.폴링봉투(일)
    # **여기서만 «어디까지 왔는지» 한 줄을 얹는다**(사람 지시 2026-09-20).
    #
    # 위 글월에 「`/jobs/<번호>`(RITA 것)와 답이 같다」고 적었는데 **이 한 칸만
    # 갈린다.** 규격 문에 얹으면 봉투가 통째로 거부된다 — `폴링봉투` 머리에
    # 「status 와 progress 말고 아무것도 담지 않는다」고 빨갛게 적혀 있다(§7.2).
    # 웹 화면은 그 규격을 안 보므로 여기서는 된다.
    #
    # **빈 글자면 칸을 안 만든다** — 「없다」와 「있는데 비었다」는 다르다.
    말 = str((일 or {}).get("말") or "").strip()
    if 말:
        봉투["말"] = 말
    # **꽂힌 사진 주소도 같이 낸다**(2026-09-24). 화면이 굽는 동안 초안의 사진
    # 자리를 채우는 값이다 — 여태는 사진 일곱 장이면 3분을 빈 자리만 보고
    # 기다렸다. 열쇠는 `"{장}-{자리}"`(`analyze/lambda_분석._사진꽂기`).
    #
    # **위 「말」과 같은 자리다** — 규격 문(`/jobs`)에 얹으면 봉투가 통째로
    # 거부되지만(§7.2), 이 문은 웹 전용이라 된다.
    #
    # **모양을 여기서 한 번 더 본다.** 화면이 이 주소를 그대로 그림으로 붙이므로,
    # 묶음이 아니거나 글자가 아닌 것이 섞이면 아예 안 낸다.
    사진들 = (일 or {}).get("사진들")
    if isinstance(사진들, dict):
        걸른것 = {str(k): v for k, v in 사진들.items()
               if isinstance(v, str) and v.startswith(("http://", "https://"))}
        if 걸른것:
            봉투["사진들"] = 걸른것
    return _reply(200, 봉투)


웹열쇠칸 = "WEB_SECRET"
웹전용문 = ("/bake", "/make", "/draft", "/ingest",
         "/template/rename", "/upload/delete")


def 웹전용인가(path: str, method: str) -> bool:
    """이 요청이 «워커만 두드리는 문» 인가.

    **POST 만 본다.** 작업대가 부르는 `GET /make/{번호}` 와 갈라내는 자리다 —
    주소가 비슷해 보여도 하나는 굽기를 걸고(돈) 하나는 번호표를 물어볼 뿐이다.
    """
    if (method or "").upper() != "POST":
        return False
    return path.endswith(웹전용문) or bool(analyze_id_of(path))


def handler(event, context):
    # 자기 자신이 비동기로 부른 «영상 굽기». 게이트웨이 요청이 아니라 rawPath 가 없다.
    if isinstance(event, dict) and event.get("굽기일") and not event.get("rawPath"):
        return 굽기한판(event["굽기일"])
    path = event.get("rawPath") or event.get("path") or ""
    method = ((event.get("requestContext") or {}).get("http") or {}).get("method", "POST").upper()
    print(f"++ 들어온 주소: {method} {path!r}")

    # **자물쇠를 길 나누기보다 먼저 연다.** 뒤에 두면 인증 실패가 아래
    # `except` 에 걸려 500 이 되고, 화면에는 「서버가 터졌습니다」가 뜬다.
    # **돈이 나가는 문은 우리 워커만 두드린다**(사람 결정 2026-09-22).
    #
    # RITA 열쇠와 **다른 열쇠**를 본다(`웹열쇠칸`). 위 자물쇠와 같은 자리에 두는
    # 까닭도 같다 — 길 나누기보다 먼저 열어야 인증 실패가 500 으로 안 떨어진다.
    if 웹전용인가(path, method) and not rita.열쇠확인(
            event.get("headers") or {}, 웹열쇠칸):
        return _reply(401, {"error": "인증에 실패했습니다"})

    if method == "OPTIONS":
        # 프리플라이트는 여기서 끝낸다. 머릿말은 게이트웨이가 붙여 준다.
        return {"statusCode": 204, "headers": {}, "body": ""}
    try:
        if path.endswith("/upload/sign"):
            # **`/upload` 갈래 곁이다** — `body = json.loads(…)` 보다 위에 둔다.
            # `/upload` 는 multipart 라 그 뒤의 JSON 파싱을 안 거친다.
            난것 = upload_sign(json.loads(event.get("body") or "{}"))
            return _reply(200 if 난것["ok"] else 400, 난것)
        if path.endswith("/upload/delete"):
            # **`/upload` 보다 앞이다** — `/upload/sign` 과 같은 자리다. 이 문도
            # JSON 이라 아래 multipart 갈래를 안 지나야 한다.
            난것 = upload_delete(json.loads(event.get("body") or "{}"))
            return _reply(200 if 난것["ok"] else 400, 난것)
        if path.endswith("/upload"):
            # **여기만 JSON 이 아니다** — 사진 바이트가 통째로 온다.
            return _reply(200, upload_media(event))
        if edit_id_of(path) and method == "GET":
            판 = ((event.get("queryStringParameters") or {}) or {}).get("v")
            return _reply(200, edit_load(edit_id_of(path),
                                         int(판) if 판 not in (None, "") else None))
        if template_id_of(path) and method == "GET":
            return _reply(200, template_load(template_id_of(path)))
        # **`make_id_of` 보다 먼저 본다** — 그 함수는 셋째 조각을 안 봐서
        # `/make/{번호}/stop` 에서도 번호를 낸다(`그만둘번호` 글월 참고).
        if 그만둘번호(path) and method == "POST":
            return 그만두기(그만둘번호(path))
        if make_id_of(path):
            return 만들기물어보기(make_id_of(path))
        if path.endswith("/tones"):
            return _reply(200, {"말투": 말투목록()})
        if path.endswith("/templates"):
            return _reply(200, {"틀": _목록()})
        body = json.loads(event.get("body") or "{}")
        if edit_id_of(path):
            난것 = edit_save(edit_id_of(path), body)
            # 영상이 든 판은 번호표 — 202. 200 으로 주면 화면이 «끝났다» 로 읽는다.
            return _reply(202 if 난것.get("job_id") else (200 if 난것["ok"] else 400), 난것)
        if path.endswith("/tone/resolve"):
            return _reply(200, 말투찾기(body))
        if path.endswith("/template/rename"):
            # **`template_id_of` 앞이다** — 안 그러면 «rename» 이 id 로 잡힌다.
            난것 = template_rename(body)
            return _reply(200 if 난것["ok"] else 400, 난것)
        if path.endswith("/template/resolve"):
            # **`template_id_of` 갈래 앞에 둔다** — 그래야 «resolve» 가 id 로 안 잡힌다.
            return _reply(200, template_resolve(body))
        if template_id_of(path):
            난것 = template_save(template_id_of(path), body)
            return _reply(200 if 난것["ok"] else 400, 난것)
        if path.endswith("/ingest"):
            return 담기걸기(event, body)
        if path.endswith("/make"):
            return 만들기걸기(event, body)
        # **굽기 전에 멈추는 길**(사람 결정 2026-09-19). 둘로 나눠 부른다.
        if path.endswith("/draft"):
            return 초안걸기(event, body)
        if path.endswith("/bake"):
            return 굽기걸기(event, body)
        if path.endswith("/render/cardnews"):
            return _reply(200, build_cardnews(body))
        if path.endswith("/workbench"):
            return _reply(200, make_workbench(body))
        if analyze_id_of(path):
            # **기본이 개인이다**(사람 지시 2026-09-19). 공용은 일부러 말해야
            # 한다 — 수집기 화면만 `개인: false` 를 보낸다.
            난것 = 분석시키기(analyze_id_of(path), body.get("이름") or "",
                         body.get("개인", True))
            # 202 — 「받았고 아직 도는 중」. 200 으로 주면 «끝났다» 로 읽힌다.
            return _reply(202 if 난것["ok"] else 400, 난것)
        return _reply(404, {"error": f"모르는 주소: {path}"})
    except KeyError as e:
        # **못 찾은 것은 서버 탈이 아니다.** 「그런 말투가 없다 — 있는 것은 …」
        # 처럼 사람이 바로 고칠 수 있는 말을 이미 담아 던지는데, 500 으로 나가면
        # 부르는 쪽이 그것을 「서버가 터졌다」로 읽고 제 문장으로 덮는다. 실물
        # 2026-08-29: 말투 이름을 틀렸는데 화면에는 「잠시 뒤 다시 시도해
        # 주세요」만 떴다 — 무엇이 틀렸는지 알 길이 없었다.
        print(f"!! 못 찾음: {e}")
        return _reply(404, {"error": str(e.args[0] if e.args else e)})
    except Exception as e:
        print(f"!! {type(e).__name__}: {e}")
        return _reply(500, {"error": f"{type(e).__name__}: {e}"})


def _reply(code: int, data: dict) -> dict:
    return {
        "statusCode": code,
        "headers": {"Content-Type": "application/json; charset=utf-8"},
        "body": json.dumps(data, ensure_ascii=False),
    }
