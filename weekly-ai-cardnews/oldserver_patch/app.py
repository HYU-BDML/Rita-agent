# -*- coding: utf-8 -*-
"""Lambda 껍데기 — 틀 렌더러와 합성기를 HTTP 로 연다.

안쪽(template_render · composer)은 이 파일을 모른다. 여기서 하는 일은 셋뿐이다.

    미디어를 URL 로 받아 /tmp 에 내린다  →  안쪽 함수를 부른다  →  결과를 S3 에 올려 주소를 준다

    POST /procure/week          주차 라벨    → 브랜드 일곱의 그 주 X·블로그 후보 (**Apify 돈**)
    POST /procure               발행처      → 후보 목록 (블로그·유튜브)
    POST /procure/media         글 주소     → 그 글의 대표 이미지 주소
    POST /procure/from_url      원문 주소   → 그 주소에 걸린 미디어 (X·유튜브·블로그)
    POST /render/build          대본        → 글자판 PNG 주소 (바로 준다, 1초 안)
    POST /render/cardnews       cards_json  → 장마다 구운 PNG 주소 목록 (라벨링 기반
                                             카드뉴스 전용, slide_types 안 씀, 바로 준다)
    POST /render/compose        대본+미디어 → 번호표
    POST /render/check          대본        → 카드 밖으로 나갈 줄 목록 (돈 안 듦. 굽기 전에)
    POST /render/caption        표지 사진 주소 → 헤드라인 상단/하단 (비전 한 번. 사실상 공짜, 즉답)
    POST /render/cover          표지 대본    → 번호표 한 줄 (배경을 구글로 만든다. **돈**)
    POST /render/slide          대본(또는 장번호)+원문주소 → 번호표 한 줄
                                slide:{...} 를 주면 서버 대본 대신 그걸 쓴다
                                search:"Sam Altman" 이면 위키미디어에서 찾아 쓴다
                                gen:"gemini"|"openai" 이면 AI 로 **그림**을 만들어 굽는다 (돈)
    POST /viewer                구운 장 목록 → 손가락으로 넘겨보는 카드뉴스 한 쪽
    GET  /render/compose/{번호}  번호표      → 다 됐으면 완성 파일 주소

**왜 번호표인가.** 이 계정은 Lambda Function URL 이 막혀 있어(관리자가 서명해도
403) API Gateway 로 들어오는데, 거기가 30초에서 끊는다. 그런데 가장 긴 장
(24초 영상)은 Lambda 에서 37초가 걸린다. 그래서 굽는 일은 뒤로 넘기고 번호표만
즉시 준다. 뒤에서 도는 쪽은 Lambda 자체 제한(5분)만 지키면 된다.
"""
import base64
import json
import os
import shutil
import time
import urllib.request
import uuid
from email.parser import BytesParser
from email.policy import default as _EMAIL
from pathlib import Path
from urllib.parse import urlparse

import boto3
from PIL import Image

import cardnews_compose
import composer
import edit_store
import procure_api
import template_out
import template_render as tr

HERE = Path(__file__).resolve().parent
TMP = Path("/tmp")
BUCKET = os.environ["BUCKET"]
REGION = os.environ.get("AWS_REGION", "ap-northeast-2")

_s3 = boto3.client("s3")
_lam = boto3.client("lambda")
TPL = json.loads((HERE / "template.json").read_text(encoding="utf-8"))
CONTENT = json.loads((HERE / "content.json").read_text(encoding="utf-8"))
FONTS = tr.FontBook(TPL["fonts"], HERE)   # 글꼴은 한 번만 읽는다 (따뜻한 호출에서 재사용)

MIME = {".png": "image/png", ".jpg": "image/jpeg", ".mp4": "video/mp4"}


# ---------------------------------------------------------------- 잔심부름

def _고친틀(body: dict, slide: dict = None):
    """부르는 쪽이 준 «고친 자리표». 없으면 None.

    **글자로 와도 받는다.** Dify 는 코드 노드가 내놓는 객체의 깊이를 5층까지만
    받는다 — 자리표를 장 «안» 에 객체로 넣으면
    `slides → 장 → template → slide_types → 뉴스 → headline` 로 6층이 되어
    「대본 합치기」가 «Depth limit 5 reached, object too deep» 로 죽는다
    (실측 2026-08-19). 그래서 yml 은 자리표를 JSON 글자 한 덩이로 넘기고
    여기서 도로 푼다. 객체로 오면 그대로 쓴다 — curl 시험은 그쪽이 편하다.
    """
    위 = body.get("template") or (slide or {}).get("template")
    if isinstance(위, str):
        위 = 위.strip()
        if not 위:
            return None
        try:
            위 = json.loads(위)
        except json.JSONDecodeError as e:
            raise ValueError(f"template 이 JSON 이 아니다 — {e}") from None
    return 위 or None


def _틀(body: dict, slide: dict = None) -> dict:
    """이 부름에만 쓰는 자리표. 부르는 쪽이 `template` 을 주면 기본값 «위에» 얹는다.

    **장 «안» 에 들어 있어도 받는다.** Dify 의 반복 안에서는 장을 통째로 보내는 길이
    이미 나 있어서, 자리표가 그 장에 얹혀 오는 편이 새 참조를 뚫는 것보다 안전하다.

    **왜 서버가 안 갖고 부르는 쪽이 갖나.** yml 은 사람끼리 주고받는 파일이고, 받은
    사람이 고칠 수 있어야 하는 것은 «판단» 이다 — 글자를 어디에 얼마만 하게 놓을지가
    그렇다. 서버가 갖는 것은 «손» 뿐이다: 글꼴 파일(16MB)·밈(46MB)·열쇠. 그건
    파일에 담을 수도, 담아서도 안 된다.

    안 주면 서버 기본값(원본 실측치) 그대로다. 시험·curl 은 예전과 똑같이 돈다.
    """
    위 = _고친틀(body, slide)
    if not 위:
        return TPL
    틀 = tr.깊이얹기(TPL, 위)
    # 글꼴 «파일» 은 서버 것이라 못 바꾼다. 이름만 고르는 것이고, 없는 이름을 고르면
    # 그리다가 KeyError 로 죽는다 — 그 전에 무엇을 고를 수 있는지 알려주고 멈춘다.
    for 자리 in ("headline_default", "body_default"):
        이름 = 틀["fonts"][자리]
        if 이름 not in TPL["fonts"]["candidates"]:
            raise ValueError(f"fonts.{자리} 가 «{이름}» 인데 서버에 그 글꼴이 없다 — "
                             f"쓸 수 있는 것: {sorted(TPL['fonts']['candidates'])}")
    return 틀


def _slide(body: dict) -> dict:
    """슬라이드 대본. Dify 는 통째로 넘기고, curl 시험은 번호만 넘긴다."""
    if body.get("slide"):
        return body["slide"]
    no = body.get("no")
    if no is None:
        raise ValueError("slide 나 no 중 하나는 있어야 한다")
    return next(s for s in CONTENT["slides"] if s["no"] == int(no))


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


# ---------------------------------------------------------------- 작업대

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
    난것["cards"] = [{**c, "배경CSS": workbench.배경CSS(c.get("배경"))}
                    for c in 난것["cards"]]
    난것["강조색"] = workbench._강조색유추(난것["cards"])
    return 난것


def edit_save(edit_id: str, body: dict, 굽기=None, 때=None) -> dict:
    """고친 설계도를 굽고 새 판으로 쌓는다.

    **탈이 있으면 아무것도 안 굽고 판도 안 쌓는다** — 반쯤 저장된 판이
    남는 것이 제일 나쁘다. 화면 쪽은 고친 상태를 그대로 들고 있다가 다시
    저장하면 된다.
    """
    cards = body.get("cards")
    탈 = edit_store.설계도_탈(cards)
    if 탈:
        return {"ok": False, "탈": 탈}
    굽기 = 굽기 or (lambda c: build_cardnews({"slides": c})["slides"])
    때 = 때 or time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    주소들 = 굽기(cards)
    창고 = _창고()
    판 = edit_store.다음판(창고, edit_id)
    난것 = edit_store.판저장(창고, edit_id, 판, cards, 주소들, 때)
    import workbench
    쪽 = workbench.쪽만들기(edit_id, cards, 주소들)
    창고.쓰기(f"viewer/{edit_id}.html", 쪽.encode("utf-8"), "text/html; charset=utf-8")
    return {"ok": True, "판": 난것["판"], "판목록": 난것["판목록"], "slides": 주소들,
            "url": f"https://{BUCKET}.s3.{REGION}.amazonaws.com/viewer/{edit_id}.html"}


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
    틀 = template_out.틀뽑기(난것["cards"], FONTS, body.get("강조색") or "#C9FC95")
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
        raise KeyError(f"그런 틀이 없다 — {키}")
    return json.loads(raw.decode("utf-8"))


def template_resolve(body: dict) -> dict:
    """틀 하나를 준다. **주소가 비면 기본 틀.**

    Dify 쪽에 갈래를 두지 않으려고 서버가 이 판단을 한다 — 「틀 받기」 노드는 늘
    같은 자리를 부르고, 빈 주소면 기본이 온다. 시작 칸 `template_url` 값(사용자가
    넣는 S3 주소)은 슬래시 같은 문자를 담을 수 있어 URL 경로 조각으로 못 끼우므로,
    「틀 받기」 HTTP 노드가 **몸통에** 담아 POST 로 보낸다.
    """
    주소 = (body.get("url") or "").strip()
    if not 주소:
        raw = _창고().읽기("templates/기본.json")
        if not raw:
            raise ValueError("기본 틀이 창고에 없다 — deploy.sh 가 올리는 자리다")
        return json.loads(raw.decode("utf-8"))
    return json.loads(_fetch(주소).read_bytes().decode("utf-8"))


# ---------------------------------------------------------------- 사진 받기

_UPLOAD_MIME = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
                ".gif": "image/gif", ".webp": "image/webp"}
"""올리기 전용 확장자표. `MIME` 을 늘리지 않는다 — 저건 `_fetch` 가 «MIME→확장자»
로 거꾸로도 쓰는 표라, .jpeg 를 더하면 image/jpeg 의 되돌림이 .jpg 에서 .jpeg 로
바뀐다. 쓰임이 다른 표는 따로 둔다."""

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


def 자막판정(body: dict) -> dict:
    """표지 사진 하나 → 헤드라인을 상단/하단 어디 둘지. **비전 한 번, 사실상 공짜.**

    /render/cover·/render/slide 처럼 번호표를 주지 않는다 — 비전 호출은 나노바나나
    그림 생성과 달리 몇 초 안에 끝나 API Gateway 30초 벽에 안 걸린다.
    """
    media_url = (body.get("media_url") or "").strip()
    if not media_url:
        raise ValueError("media_url 이 비어 있다")
    p = _fetch(media_url)
    import cover
    return {"자리": cover.헤드라인_자리(p)}


def 폭검사(body: dict) -> dict:
    """굽기 전에 «카드 밖으로 나갈 줄» 을 찾는다. **돈이 안 든다.**

    대본을 쓴 직후에 이걸 부르면 된다. 넘치면 다시 쓰게 하고, 통과하면 굽는다.
    그리기 직전에도 한 번 더 막는다(`_glyph_of`) — 여기를 건너뛰고 들어와도
    조용히 잘린 그림이 나가는 일은 없어야 한다.
    """
    if "slides" in body and not body["slides"]:
        # 빈 목록을 그냥 흘리면 아래에서 «slide 나 no 중 하나는 있어야 한다» 로 죽는데,
        # 그건 원인과 딴판인 말이라 부르는 쪽이 헤맨다. 여기서 제대로 말한다.
        raise ValueError("slides 가 빈 목록이다 — 앞 노드가 장을 하나도 안 내놨다")
    낱장 = body.get("slides") or [_slide(body)]

    # **자리표를 먼저 본다.** 망가진 자리표로 재려 들면 재는 쪽이 먼저 죽고, 그러면
    # «무엇이 잘못됐나» 를 말해 줄 기회까지 같이 사라진다 — `body: 42` 하나로
    # 500 이 나면서 탈 목록이 통째로 묻혔다(실측 2026-08-19).
    #
    # 같은 자리표가 장마다 붙어 오므로 한 번만 본다. 여덟 번 봐야 같은 말이 여덟 줄이다.
    고친것 = _고친틀(body) or next(
        (_고친틀(body, s) for s in 낱장 if s.get("template")), None)
    틀탈 = tr.틀탈(고친것 or {}, TPL)

    난것, 못잼 = [], ""
    for s in 낱장:
        틀 = _틀(body, s)
        try:
            for x in tr.넘치는_줄(s, 틀, FONTS,
                                body.get("headline_font", 틀["fonts"]["headline_default"]),
                                body.get("body_font", 틀["fonts"]["body_default"])):
                난것.append({"no": s.get("no"), "type": s.get("type"), **x})
        except Exception as e:
            # 자리표가 같으니 나머지 장도 똑같이 죽는다. 한 번만 말하고 그만둔다.
            못잼 = f"{s.get('no')}번 장을 못 쟀다 — 자리표가 망가졌다: {type(e).__name__}: {e}"
            틀탈.append(못잼)
            break
    # 굽기 전 무료 관문이 하나뿐이라 둘을 한 자리에서 본다 — 넘치는 줄과 자리표 탈.
    return {"ok": not 난것 and not 못잼, "넘친것": 난것, "틀탈": 틀탈,
            "잰것": sum(len(s.get("headline") or []) + len(s.get("body") or []) for s in 낱장)}


def _glyph_of(body: dict, slide: dict) -> Image.Image:
    """글자판. 미리 구워뒀으면 창고에서 꺼내고, 아니면 여기서 굽는다."""
    # 미디어가 없는 장은 그 자리에 회색 자리표시를 그린다(표지·CTA·AI 생성 예정).
    slide = {**slide, "_has_media": bool(body.get("media_url"))}
    key = body.get("glyph_key")
    if key:
        p = TMP / f"glyph-in-{uuid.uuid4().hex}.png"
        _s3.download_file(BUCKET, key, str(p))
        return Image.open(p).convert("RGBA")
    틀 = _틀(body, slide)
    # 마지막 관문. 여기서 막지 않으면 잘린 그림이 그대로 나간다.
    넘침 = tr.넘치는_줄(slide, 틀, FONTS,
                     body.get("headline_font", 틀["fonts"]["headline_default"]),
                     body.get("body_font", 틀["fonts"]["body_default"]))
    if 넘침 and not body.get("검사끄기"):
        어디 = " · ".join(f'{x["자리"]} {x["넘침"]:.0f}px 넘침 «{x["글"]}»' for x in 넘침)
        raise ValueError(f"{slide.get('no')}번 장의 글이 카드 밖으로 나간다 — {어디}")
    return tr.draw_slide(slide, 틀, FONTS,
                         body.get("headline_font", 틀["fonts"]["headline_default"]),
                         body.get("body_font", 틀["fonts"]["body_default"]))


# ---------------------------------------------------------------- 두 통로

def media_from_url(body: dict) -> dict:
    """원문 주소 하나 → 그 주소에 걸린 미디어 주소.

    procure/from_url.py 를 그대로 부른다 — X·유튜브는 yt-dlp, 블로그는 og 태그
    (안 되면 본문에 박힌 mp4). 받은 파일을 곧장 S3 에 올려 주소로 돌려준다.
    Dify 「원문 고르기」 가 고른 글 주소를 여기로 던지면 이 한 번으로 끝난다.

    스레드와 (Lambda 에서의) 유튜브는 Apify 를 거친다 — 전자는 브라우저가
    있어야 <video> 가 생기고, 후자는 유튜브가 데이터센터 IP 를 봇으로 본다.
    둘 다 from_url 안에서 알아서 갈라진다.
    """
    import sys
    sys.path.insert(0, str(HERE / "procure"))
    import from_url

    url = (body.get("url") or "").strip()
    if not url:
        raise ValueError("url 이 비어 있다")
    이름 = f"u{uuid.uuid4().hex[:10]}"
    난것 = from_url.가져오기(url, 이름, TMP / "from_url")
    key = f"from_url/{uuid.uuid4().hex}{난것['file'].suffix}"
    return {"media_url": _put(난것["file"], key), "kind": 난것["kind"], "via": 난것["via"]}


def build(body: dict) -> dict:
    slide = _slide(body)
    glyph = _glyph_of({k: v for k, v in body.items() if k != "glyph_key"}, slide)
    p = TMP / f"glyph-{uuid.uuid4().hex}.png"
    glyph.save(p)
    key = f"glyph/{uuid.uuid4().hex}.png"
    return {"glyph_key": key, "url": _put(p, key)}


def build_cardnews(body: dict) -> dict:
    """라벨링 기반 카드뉴스(Task 10) 전용 — `cardnews_compose.py` 참고.

    `slide_types` 레지스트리를 안 쓴다. `cards_json` 이 이미 장마다 box·색·
    글꼴을 다 담고 있어서 타입을 찾을 필요가 없다. 사진 자리는 전부 회색
    자리표시로 나간다 — 이 판에는 사진을 구해오는 단계가 아직 없다."""
    imgs = cardnews_compose.build(body, FONTS)
    urls = []
    for img in imgs:
        p = TMP / f"cardnews-{uuid.uuid4().hex}.png"
        img.save(p)
        key = f"cardnews/{uuid.uuid4().hex}.png"
        urls.append(_put(p, key))
        p.unlink(missing_ok=True)
    return {"slides": urls}


def _구운것_확인(p: Path, slide: dict) -> str:
    """구워 나온 장이 멀쩡한가. 문제 없으면 빈 문자열.

    **내보내기 전에 본다.** 나중에 사람이 눈으로 찾게 두지 않는다 — 표지가 뭉개진
    것도, 8번이 잘린 것도, AI 영상이 2.37초에 끊긴 것도 전부 사용자가 찾아냈다
    (2026-08-19). 기계가 먼저 봐야 한다.
    """
    if not p.exists() or p.stat().st_size < 20_000:
        return f"파일이 너무 작다({p.stat().st_size if p.exists() else 0}바이트)"
    if p.suffix.lower() == ".mp4":
        import re as _re
        import subprocess as _sp
        r = _sp.run(["ffmpeg", "-hide_banner", "-i", str(p)], capture_output=True)
        말 = (r.stderr or b"").decode("utf-8", "replace")
        m = _re.search(r"Stream #.*Video:.*?(\d{2,5})x(\d{2,5})", 말)
        if not m:
            return "영상 줄기가 없다"
        if (int(m.group(1)), int(m.group(2))) != (1080, 1350):
            return f"크기가 다르다({m.group(1)}x{m.group(2)})"
        d = _re.search(r"Duration: (\d+):(\d+):([\d.]+)", 말)
        초 = (int(d.group(1))*3600 + int(d.group(2))*60 + float(d.group(3))) if d else 0
        if 초 < 1.5:
            return f"너무 짧다({초:.2f}초)"
        return ""
    try:
        with Image.open(p) as im:
            if im.size != (1080, 1350):
                return f"크기가 다르다({im.size})"
    except Exception as e:
        return f"그림을 못 연다({type(e).__name__})"
    return ""


def compose(body: dict) -> dict:
    slide = _slide(body)
    glyph = _glyph_of(body, slide)
    media_url = body.get("media_url")
    media = _fetch(media_url) if media_url else None

    out_dir = TMP / uuid.uuid4().hex
    out_dir.mkdir()
    # 글자판과 «같은» 자리표로 사진을 얹는다. 둘이 다르면 글자와 사진이 어긋난다.
    p = composer.compose(slide, media, glyph, out_dir, _틀(body, slide))
    탈 = _구운것_확인(p, slide)
    key = f"out/{uuid.uuid4().hex}/{p.name}"
    url = _put(p, key)
    size = p.stat().st_size
    shutil.rmtree(out_dir, ignore_errors=True)   # /tmp 는 따뜻한 호출끼리 공유된다
    if media:
        media.unlink(missing_ok=True)
    난것 = {"url": url, "bytes": size, "no": slide["no"], "type": slide["type"]}
    if 탈:
        난것["경고"] = 탈        # 막지는 않는다 — 결과는 주되 이상하다고 알린다
    return 난것


def one_slide(body: dict) -> dict:
    """장 하나를 통째로 — **미디어 조달부터 굽기까지 한 번에.**

    받는 것:  {"no": 8, "url": "https://x.com/..."}   url 은 없어도 된다(표지·CTA)
    주는 것:  compose 와 같은 모양 {"url","bytes","no","type"} + 어디서 왔는지

    왜 이걸 따로 두나: Dify 쪽 노드를 줄이려고. 이게 없으면 워크플로우가
    「미디어 가져오기 → 굽기 시작 → 다 됐나 루프」 세 단계인데, 이걸 두면
    「굽기 시작 → 다 됐나 루프」 두 단계로 끝난다. 노드가 줄면 틀릴 자리도 준다.
    """
    url = (body.get("url") or "").strip()
    gen = (body.get("gen") or "").strip()
    찾을말 = (body.get("search") or "").strip()
    몸 = {k: v for k, v in body.items() if k not in ("url", "gen", "search")}
    if 찾을말 and not url:
        # 출처 주소가 없고 «무엇을 찾아라» 만 있는 장 (표지가 그렇다).
        import sys as _s
        _s.path.insert(0, str(HERE / "procure"))
        import from_url
        난것 = from_url.검색으로(찾을말, TMP / "search", uuid.uuid4().hex[:10])
        key = f"search/{uuid.uuid4().hex}{난것['file'].suffix}"
        몸["media_url"] = _put(난것["file"], key)
        몸["_via"] = 난것["via"]
    elif gen and not url:
        # AI 로 만드는 장 — **돈이 나간다** (구글 $0.134/장, OpenAI 장당 수 센트).
        import generate
        장 = _slide(몸)
        만든것 = generate.만들기(gen, 장)
        key = f"gen/{uuid.uuid4().hex}{만든것.suffix}"
        몸["media_url"] = _put(만든것, key)
        몸["_via"] = f"{gen}/생성(돈)"
        # **만든 영상은 자르지 않는다.** duration_sec 은 원본 제작자가 «자기가 만든
        # 영상» 을 그 길이로 쓴 값이다. 우리가 새로 만든 영상은 다른 영상이라,
        # 그 길이로 자르면 동작이 끝나기 전에 뚝 끊긴다(2번 장이 2.37초였다).
        # 만든 것은 통째로 쓴다 — 생성 모델의 최소 길이가 5초라 대개 5초다.
        몸["slide"] = {**장, "duration_sec": None}
    elif url:
        if url.lower().split("?")[0].endswith((".mp4", ".mov", ".m4v", ".jpg", ".jpeg",
                                               ".png", ".webp", ".gif")):
            몸["media_url"] = url          # 이미 미디어 주소면 그대로 쓴다
            몸["_via"] = "주소 그대로"
        else:
            난것 = media_from_url({"url": url})
            몸["media_url"] = 난것["media_url"]
            몸["_via"] = 난것["via"]
    난것 = compose(몸)
    난것["via"] = 몸.get("_via", "미디어 없음")
    return 난것


def make_viewer(body: dict) -> dict:
    """구운 장 목록 → 넘겨보는 한 쪽. 주소 하나로 돌려준다.

    받는 것: {"slides": ["01 됨 https://…", …]}  또는
             {"slides": [{"no":1,"url":"…","state":"됨"}, …]}
    Dify 반복이 내놓는 것이 «한 줄짜리 글» 목록이라 두 모양을 다 받는다.
    """
    import viewer
    것들 = body.get("slides") or []
    장들 = []
    for x in 것들:
        if isinstance(x, dict):
            장들.append(x)
            continue
        글 = str(x).strip()
        조각 = 글.split(None, 2)
        try:
            no = int(조각[0]) if 조각 else None
        except ValueError:
            no = None
        if no is not None:
            장들.append({"no": no,
                         "state": 조각[1] if len(조각) > 1 else "",
                         "url": 조각[2] if len(조각) > 2 else ""})
        elif 글:
            # 번호·상태 없이 주소 하나만 온 경우 — /render/cardnews 가 이 모양이다
            # (「01 됨 https://…」가 아니라 그냥 URL 배열). 그걸 숫자로 바꾸려다
            # 실패해서 장을 통째로 건너뛰면 빈 뷰어가 만들어진다(실측
            # 2026-08-24) — 순서대로 번호를 매겨 그대로 쓴다.
            장들.append({"no": len(장들) + 1, "state": "됨", "url": 글})

    # 설계도가 같이 오면 **작업대**를 낸다. 안 오면 예전처럼 보기 전용 뷰어다 —
    # 다른 파이프라인(주차소식·경제뉴스)도 이 문을 쓰므로 그 길을 안 바꾼다.
    cards = body.get("cards")
    if cards:
        import workbench
        탈 = edit_store.설계도_탈(cards)
        if 탈:
            raise ValueError("설계도에 탈이 있다 — " + " · ".join(탈[:3]))
        창고 = _창고()
        edit_id = uuid.uuid4().hex
        주소들 = [x.get("url") for x in 장들 if x.get("url")]
        edit_store.판저장(창고, edit_id, 0, cards, 주소들,
                        time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
        쪽 = workbench.쪽만들기(edit_id, cards, 주소들)
        창고.쓰기(f"viewer/{edit_id}.html", 쪽.encode("utf-8"),
                "text/html; charset=utf-8")
        return {"url": f"https://{BUCKET}.s3.{REGION}.amazonaws.com/viewer/{edit_id}.html",
                "edit_id": edit_id}

    html = viewer.만들기(장들, body.get("title") or "카드뉴스")
    key = f"viewer/{uuid.uuid4().hex}.html"
    # **`_s3` 를 직접 안 부른다.** `_창고()` 를 거치면 시험이 가짜 창고로 갈아
    # 끼울 수 있다 — 진짜 배포에서는 `_S3창고.쓰기` 가 똑같이 `_s3.put_object` 를
    # 부르므로 동작은 그대로다(edit_save 가 이미 이 결로 짠다).
    _창고().쓰기(key, html.encode("utf-8"), "text/html; charset=utf-8")
    return {"url": f"https://{BUCKET}.s3.{REGION}.amazonaws.com/{key}",
            "count": len(장들)}


def start_job(body: dict, 일: str) -> dict:
    """번호표를 끊고, 오래 걸리는 일은 나 자신에게 뒤로 넘긴다."""
    job = uuid.uuid4().hex
    _write_status(job, {"state": "굽는 중"})
    _lam.invoke(FunctionName=os.environ["AWS_LAMBDA_FUNCTION_NAME"],
                InvocationType="Event",
                Payload=json.dumps({"_job": job, "_kind": 일, "payload": body},
                                   ensure_ascii=False).encode())
    return {"job": job, "state": "굽는 중", "poll": f"/render/compose/{job}"}


def start_compose(body: dict) -> dict:
    return start_job(body, "compose")


def one_cover(body: dict) -> dict:
    """표지 한 장 — **배경 생성부터 굽기까지 한 번에. 돈이 나간다 ($0.15).**

    받는 것:  {"slide": {"type":"표지","eyebrow":...,"headline":[2줄],
                        "accent_text":"8월 2주차","brand":"ChatGPT",
                        "gen_prompt_en":"..."}}
    주는 것:  compose 와 같은 모양 + 얼굴을 누구로 썼는지·사진 출처

    뉴스 장의 `one_slide` 와 같은 자리다. 다른 건 미디어를 «찾아오는» 게 아니라
    «만든다» 는 것뿐이다.
    """
    import cover
    slide = _slide(body)
    # 새 분야 표지에 진짜 사진이 오면 그리지 않고 그 사진을 깐다 — 돈 0(주간 소식 계획 4 과제 42++ D)
    난것 = cover.사진깔기(slide) if slide.get("photo_url") else cover.만들기(slide)
    p = 난것["path"]
    몸 = {k: v for k, v in body.items() if k != "slide"}
    몸["slide"] = slide
    몸["media_url"] = _put(p, f"cover/{uuid.uuid4().hex}{p.suffix}")
    p.unlink(missing_ok=True)
    결과 = compose(몸)
    결과.update({"via": "사진" if slide.get("photo_url") else f'{난것["모델"]}/생성(돈)',
                 "얼굴": 난것["인물"], "사진출처": 난것["사진출처"],
                 "사용량": 난것.get("사용량")})  # 주간 AI 소식이 쓴 돈을 센다(2026-10-01)
    return 결과


def _run_job(job: str, payload: dict, 일: str = "compose") -> dict:
    """뒤에서 도는 쪽. 결과를 번호표 앞으로 적어둔다.

    **여기서 죽으면 로그에 안 남았다 — 그게 제일 나빴다 (2026-08-20).**
    이 함수는 «뒤로 넘긴» 부름이라 API Gateway 를 안 거친다. 그래서 500 로그가
    안 찍히고, 부르는 쪽은 번호표에 적힌 한 줄(`error`)만 본다. 장 셋이 그렇게
    조용히 죽었는데 **왜 죽었는지 아무 데도 안 남아 있었다.**

    번호표 한 줄은 Dify 화면용이고, 여기 찍는 것은 **원인을 찾기 위한 것**이다.
    둘은 쓰임이 달라서 둘 다 있어야 한다.
    """
    try:
        해라 = {"slide": one_slide, "cover": one_cover,
               "week": procure_api.week, "jobs": procure_api.jobs,
               "econ_week": procure_api.econ_week,
               "econ_daily": procure_api.econ_daily,
               "econ_photo": procure_api.econ_photo}.get(일, compose)
        난것 = 해라(payload)
        _write_status(job, {"state": "됨", **난것})
        print(f"++ 번호표 {job} [{일}] 됨")
    except Exception as e:
        import traceback
        속 = json.dumps(payload, ensure_ascii=False)[:300]
        print(f"!! 번호표 {job} [{일}] 실패\n"
              f"   {type(e).__name__}: {e}\n"
              f"   받은 것 앞머리 300자: {속}\n"
              f"{traceback.format_exc()}")
        _write_status(job, {"state": "실패", "error": f"{type(e).__name__}: {e}"})
    return {"ok": True}


def _write_status(job: str, data: dict) -> None:
    _s3.put_object(Bucket=BUCKET, Key=f"jobs/{job}.json",
                   Body=json.dumps(data, ensure_ascii=False).encode(),
                   ContentType="application/json; charset=utf-8")


def job_status(job: str, wait: float = 0.0) -> dict:
    """번호표 확인. wait 초가 주어지면 **다 될 때까지 서버가 기다려준다.**

    왜 기다려주나: 안 그러면 부르는 쪽(Dify)이 루프를 수십 바퀴 돌아야 한다.
    Dify 에는 «잠깐 쉬기» 노드가 없어서 루프가 그냥 쉴 새 없이 두들긴다.
    여기서 25초쯤 붙들어 두면 대개 한 바퀴에 끝난다.

    API Gateway 가 30초에서 끊으므로 wait 은 25초를 넘기지 않는다.
    """
    import time
    끝 = time.monotonic() + min(max(wait, 0.0), 25.0)
    while True:
        try:
            raw = _s3.get_object(Bucket=BUCKET, Key=f"jobs/{job}.json")["Body"].read()
            난것 = json.loads(raw)
        except Exception as e:
            # **`NoSuchKey` 만 잡으면 안 된다.** 이 역할에는 `s3:ListBucket` 이 없어서
            # 없는 열쇠를 물으면 S3 가 `NoSuchKey` 가 아니라 **`AccessDenied`** 를 준다
            # (실측 2026-08-20). 그러면 여기서 안 잡히고 500 이 나가면서
            # 「없는 번호표」가 「권한 없음」으로 둔갑한다 — 원인을 딴 데서 찾게 된다.
            이름 = type(e).__name__
            코드 = getattr(e, "response", {}).get("Error", {}).get("Code", "")
            if 코드 in ("NoSuchKey", "AccessDenied", "404") or 이름 == "NoSuchKey":
                난것 = {"state": "없는 번호표", "job": job,
                       "why": "그런 번호표가 없다 — 번호표를 자르거나 잘못 옮겨 적었을 것"}
            else:
                raise
        if 난것.get("state") != "굽는 중" or time.monotonic() >= 끝:
            난것["done"] = 난것.get("state") in ("됨", "실패", "없는 번호표")
            return 난것
        time.sleep(1.5)


def handler(event, context):
    if "_job" in event:                       # 내가 뒤로 넘긴 일
        return _run_job(event["_job"], event["payload"], event.get("_kind", "compose"))

    path = event.get("rawPath") or event.get("path") or ""
    method = ((event.get("requestContext") or {}).get("http") or {}).get("method", "POST").upper()
    print(f"++ 들어온 주소: {method} {path!r}")
    if method == "OPTIONS":
        # **프리플라이트는 여기서 끝낸다.** API Gateway 의 CORS 설정은 OPTIONS 에
        # 맞는 라우트가 없을 때만 대신 답해 주는데, 우리 라우트는 `$default` 하나라
        # 전부를 삼킨다 — 그래서 OPTIONS 가 아래로 흘러 400 이 되고, 브라우저는
        # 2xx 가 아닌 프리플라이트를 거절한다(저장·사진 올리기가 통째로 막힌다).
        # 머릿말은 게이트웨이가 붙여 주므로 여기서는 빈 204 만 준다.
        return {"statusCode": 204, "headers": {}, "body": ""}
    try:
        if path.endswith("/upload"):
            # **여기만 JSON 이 아니다.** 사진 바이트가 통째로 오기 때문에
            # 아래 json.loads 보다 먼저 가로챈다 — 뒤에 두면 파싱에서 죽는다.
            return _reply(200, upload_media(event))
        if edit_id_of(path) and method == "GET":
            판 = ((event.get("queryStringParameters") or {}) or {}).get("v")
            return _reply(200, edit_load(edit_id_of(path),
                                         int(판) if 판 not in (None, "") else None))
        if template_id_of(path) and method == "GET":
            return _reply(200, template_load(template_id_of(path)))
        body = json.loads(event.get("body") or "{}")
        if edit_id_of(path):
            난것 = edit_save(edit_id_of(path), body)
            return _reply(200 if 난것["ok"] else 400, 난것)
        if path.endswith("/template/resolve"):
            # **`template_id_of` 갈래 앞에 둔다** — 그래야 «resolve» 가 id 로 안 잡힌다.
            return _reply(200, template_resolve(body))
        if template_id_of(path):
            난것 = template_save(template_id_of(path), body)
            return _reply(200 if 난것["ok"] else 400, 난것)
        if path.endswith("/procure/media"):
            # 여기만 JSON 이 아니라 주소 한 줄을 그대로 준다. Dify 쪽에서 껍질을
            # 벗기는 노드를 하나 덜 만들려고 그렇게 한다 — HTTP 노드의 body 가
            # 곧 미디어 주소가 된다.
            return {"statusCode": 200,
                    "headers": {"Content-Type": "text/plain; charset=utf-8"},
                    "body": procure_api.media_of(body)["media_url"]}
        if path.endswith("/procure"):
            return _reply(200, procure_api.procure(body))
        if path.endswith("/procure/week"):
            # **번호표를 준다. 곧바로 답하지 않는다.**
            #
            # X 7계정을 Apify 로 긁으면 30초를 넘는데 API Gateway 가 거기서 끊는다
            # (실측 2026-08-20: 30.1초에 503 Service Unavailable). 예전엔 열쇠가
            # 없어 긁기가 «즉시 실패» 했기 때문에 8초에 끝나 이 벽이 안 보였다 —
            # **버그가 설계 결함을 가리고 있었다.**
            #
            # 굽는 쪽과 같은 방식이다: 번호표 한 줄을 주고 `/render/compose/{번호}`
            # 로 되묻는다.
            return {"statusCode": 200,
                    "headers": {"Content-Type": "text/plain; charset=utf-8"},
                    "body": start_job(body, "week")["job"]}
        if path.endswith("/procure/jobs"):
            # week 와 같은 이유로 번호표만 준다 — 사람인 긁기 + 회사 이미지
            # 검색을 공고 수만큼 반복하면 30초를 넘긴다.
            return {"statusCode": 200,
                    "headers": {"Content-Type": "text/plain; charset=utf-8"},
                    "body": start_job(body, "jobs")["job"]}
        if path.endswith("/procure/econ_week"):
            return {"statusCode": 200,
                    "headers": {"Content-Type": "text/plain; charset=utf-8"},
                    "body": start_job(body, "econ_week")["job"]}
        # **날마다 쌓기.** 스케줄러가 때리는 자리 — 번호표를 안 쓴다(빨리 끝나고,
        # 되물을 사람도 없다). 자세한 건 procure_api.econ_daily 참고.
        if path.endswith("/procure/econ_daily"):
            import json as _j
            return {"statusCode": 200,
                    "headers": {"Content-Type": "application/json; charset=utf-8"},
                    "body": _j.dumps(procure_api.econ_daily(body), ensure_ascii=False)}
        if path.endswith("/procure/econ_photo"):
            return {"statusCode": 200,
                    "headers": {"Content-Type": "text/plain; charset=utf-8"},
                    "body": start_job(body, "econ_photo")["job"]}
        if path.endswith("/procure/from_url"):
            return _reply(200, media_from_url(body))
        if path.endswith("/render/build"):
            return _reply(200, build(body))
        if path.endswith("/render/cardnews"):
            # 라벨링 기반 카드뉴스(Task 10) 전용 — slide_types 레지스트리를 안
            # 쓰는 자기서술형 그리기라 이 판에는 사진 조달이 없어 바로 준다
            # (미디어 fetch 가 없어 /render/build 처럼 30초 벽에 안 걸린다).
            return _reply(200, build_cardnews(body))
        if method == "GET" and "/render/compose/" in path:
            q = event.get("queryStringParameters") or {}
            return _reply(200, job_status(path.rstrip("/").rsplit("/", 1)[-1],
                                          float(q.get("wait") or 0)))
        if path.endswith("/render/compose"):
            return _reply(200, start_compose(body))
        if path.endswith("/viewer"):
            # 여기도 주소 한 줄만 준다 — Dify 가 그대로 출력에 꽂을 수 있게.
            return {"statusCode": 200,
                    "headers": {"Content-Type": "text/plain; charset=utf-8"},
                    "body": make_viewer(body)["url"]}
        if path.endswith("/render/check"):
            return _reply(200, 폭검사(body))
        if path.endswith("/render/caption"):
            return _reply(200, 자막판정(body))
        if path.endswith("/render/cover"):
            # 표지도 오래 걸린다(나노바나나가 수십 초). 번호표 한 줄만 준다 —
            # /render/slide 와 같은 뜻이고, 같은 /render/compose/{번호} 로 묻는다.
            return {"statusCode": 200,
                    "headers": {"Content-Type": "text/plain; charset=utf-8"},
                    "body": start_job(body, "cover")["job"]}
        if path.endswith("/render/slide"):
            # 여기도 JSON 이 아니라 번호표 한 줄만 준다(/procure/media 와 같은 뜻).
            # Dify 가 다음 노드의 주소 끝에 그대로 이어 붙일 수 있어야 하는데,
            # JSON 덩어리를 주면 껍질 벗기는 코드 노드가 하나 더 필요해진다.
            return {"statusCode": 200,
                    "headers": {"Content-Type": "text/plain; charset=utf-8"},
                    "body": start_job(body, "slide")["job"]}
        return _reply(404, {"error": f"모르는 주소: {method} {path}"})
    except Exception as e:
        # **반드시 남긴다.** 예전엔 여기서 조용히 500 만 돌려줬다. 그러면 Dify 는
        # «Request failed with status code 500» 이라고만 하고, CloudWatch 에도
        # 아무것도 안 남아서 «1.4ms 만에 죽었다» 는 것 말고는 알 길이 없었다
        # (실측 2026-08-19: 폭 검사가 네 번 연속 500 인데 로그가 비어 있었다).
        #
        # 몸통 «앞머리» 도 같이 남긴다 — 대개 부르는 쪽이 만든 JSON 이 깨진 것이라
        # 그 생김새를 봐야 안다. 열쇠는 몸통에 안 실리므로(헤더로만 받는다) 안전하다.
        import traceback
        원몸통 = event.get("body") or ""
        print(f"!! 500 {method} {path}\n"
              f"   {type(e).__name__}: {e}\n"
              f"   몸통 {len(원몸통)}자 · 앞머리 300자: {원몸통[:300]}\n"
              f"{traceback.format_exc()}")
        return _reply(500, {"error": f"{type(e).__name__}: {e}"})


def _reply(code: int, data: dict) -> dict:
    return {
        "statusCode": code,
        "headers": {"Content-Type": "application/json; charset=utf-8"},
        "body": json.dumps(data, ensure_ascii=False),
    }
