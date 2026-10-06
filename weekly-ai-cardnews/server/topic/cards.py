# -*- coding: utf-8 -*-
"""새 분야 카드 만들기 — 소식 묶음을 AI 소식 단계(runs.본문·표지·그림·굽기)가 받는 꼴로 바꾼다(계획 3 설계 2장).

AI 소식 단계와 검사(nodes/)는 그대로 쓴다. 다른 점은 넷 — 넣는 글(brand=«소식N»), 지시문 덧붙임, 이름표, 굽기 전 고쳐 쓰기."""
import dataclasses
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from types import SimpleNamespace
from urllib.parse import quote, urlencode

import runs as 주간
import store
import weeks
from topic import conductor, judge


def 이름표(시작: str, 끝: str) -> str:
    """월~일 한 주면 AI 소식과 같은 «9월 3주차», 아니면 «9/28~10/4»."""
    가, 나 = date.fromisoformat(시작), date.fromisoformat(끝)
    if 가.weekday() == 0 and 나 == 가 + timedelta(days=6):
        return weeks.이름짓기(가)["label"]
    return f"{가.month}/{가.day}~{나.month}/{나.day}"


def 넣는글(이름표_: str, 소식들: list) -> tuple[str, list, list]:
    """AI 소식 «소식 고르기» 의 글 꼴로. brand 는 «소식N» — 같은 주인공의 소식이 여럿이어도 장·미디어 짝이 안 엉키게
    (AI 소식은 회사마다 한 건이라 brand 로 짝지었다)."""
    줄, 순서 = [이름표_], []
    for i, d in enumerate(소식들, 1):
        줄.append(f"[소식{i}] 주인공: {d['주인공']} · 사건: {d['사건']} · 날짜: {d['날짜']} · "
                 f"요약: {d['요약']} · 발췌: {d['발췌']}" + (f" · 그림 설명: {d['그림설명']}" if d.get("그림설명") else ""))
        순서.append({"brand": f"소식{i}"})
    return "\n\n".join(줄), 순서, [{"brand": x["brand"], "media": []} for x in 순서]


def 덧붙임(분야: str, 표지칸: dict | None = None) -> str:
    """이 판의 딥시크 지시문 끝에 붙이는 절 — 위 지시문은 AI 소식용이라 읽는 법을 바꿔 준다. 표지 인물의 얼굴 사진이
    있으면 주간 AI 소식처럼 그 사람 한 명의 밈 장면(서버가 실제 얼굴을 넣는다), 없으면 사람 없이(10-06)."""
    if 표지칸:
        그림 = (f"표지 그림은 {표지칸['사람']} 한 사람이 나오는 밈 장면 — write the scene with a single person facing the "
              f"camera (서버가 {표지칸['사람']}의 실제 사진으로 얼굴을 넣는다). 표지 제목(headline)도 그 사람 소식"
              f"(소식{표지칸['소식']})을 중심으로 쓴다.")
    else:
        그림 = ("The cover picture shows no person — build the meme scene around an object or place from the first "
              "story (표지에 나올 실제 인물이 없다 — 사람을 그리지 않는다).")
    return (f"\n\n---\n\n## 이번 판은 AI 소식이 아니라 «{분야}» 소식이다 — 위 지시문을 이렇게 읽는다\n"
            f"- 위 글의 «AI·회사·브랜드·제품» 은 «{분야}·주인공·작품/상품/경기» 로 읽는다. 말투·줄 길이·어미 규칙은 그대로.\n"
            "- 사실·숫자·날짜·이름은 아래 소식 목록(요약·발췌)에 있는 것만 쓴다. 목록에 없는 것은 지어내지 않는다.\n"
            "- brand 칸에는 소식 목록의 [ ] 안 글자 그대로 쓴다(예: «소식1»). 주인공 이름은 brand 가 아니라 글에 쓴다.\n"
            "- 소식 줄에 «그림 설명» 이 있는 소식은 gen_prompt_en 을 그 설명대로 쓴다 — 사람을 그리지 않는다(장소·물건·분위기).\n"
            "- 표지 2행은 검사 꼴대로 «{주차} AI 소식» 으로 쓴다 — 서버가 분야 이름으로 바꾼다.\n"
            f"- 표지 그림: {그림}\n")


표지인물지시 = ("너는 카드뉴스 표지 연출가다. 표지는 소식 속 실제 인물 한 사람의 얼굴을 밈 장면에 넣어 그린다. 아래 소식 "
          "목록에서 표지에 나올 실제 인물 한 사람을 고른다.\n"
          "- 소식 목록에 이름이 나온 실제 인물만 — 목록에 없는 이름·지어낸 사람은 안 된다.\n"
          "- 그룹·회사·단체·물건(국채·금값 등)은 사람이 아니다. 그룹 소식이면 목록에 이름이 나온 멤버 한 사람.\n"
          "- 가장 중요한(앞) 소식의 인물을 먼저, 그 소식에 사람이 없으면 다른 소식의 인물.\n"
          "- 두 사람 이상 나오는 소식이면 한 사람만.\n"
          "- «사람» 은 한국어로 흔히 쓰는 표기, «검색어» 는 그 사람 얼굴 사진을 이미지 검색할 말(예: «아이브 리즈», "
          "«Jerome Powell»), «소식» 은 그 사람이 나온 소식 번호.\n"
          'JSON 한 줄로만 답한다: {"사람": "이름", "검색어": "검색할 말", "소식": 번호} — 실제 인물이 없으면 {"사람": ""}')
표지인물한도 = 4000
얼굴세기최대 = 4  # 이미지 검색 결과 가운데 얼굴을 세 볼 사진 수(넓이 큰 것부터)


def _표지인물물음(소식들: list) -> str:
    return "\n".join(f"[소식{i}] 주인공: {d['주인공']} · 사건: {d['사건']} · 요약: {d['요약']} · 발췌: {str(d['발췌'])[:300]}"
                     for i, d in enumerate(소식들, 1))


def _이름나오나(이름: str, 글: str) -> bool:
    """이름 통째(띄어쓰기 무시)나 두 글자 이상인 이름 조각이 글에 있나 — «제롬 파월» 은 «파월 의장» 에서도 찾는다."""
    작은 = 글.lower()
    return 이름.replace(" ", "").lower() in 작은.replace(" ", "") or any(
        len(w) >= 2 and w.lower() in 작은 for w in 이름.split())


def 표지인물고르기(소식들: list, 딥시크한번, 재: dict) -> dict | None:
    """딥시크 pro 한 번(판단이라 pro — 사용자 규칙) — 표지에 나올 실제 인물. 소식 목록에 이름이 안 나오는 사람(지어낸 이름)·
    사람 없음·못 읽은 답·묻다 터짐은 None(얼굴 없이 그린다). 소식 번호가 틀리면 이름이 나온 첫 소식."""
    물음 = _표지인물물음(소식들)
    try:
        답 = 딥시크한번(표지인물지시, 물음, 표지인물한도)
        conductor.딥시크적기(재, 답, "카드표지인물", store.지금시각())
    except Exception as e:  # 표지 인물은 덤 — 못 고르면 사람 없이 그린다
        print(주간._가리기(f"!! 표지 인물 고르기 실패 {type(e).__name__}: {str(e)[:100]}"))
        return None
    j = {} if 답.get("넘침") else judge._제이슨(답.get("글"))
    이름 = j.get("사람")
    if not isinstance(이름, str) or not 이름.strip() or not _이름나오나(이름.strip(), 물음):
        return None
    이름 = 이름.strip()
    줄들 = 물음.split("\n")
    번 = j.get("소식")
    if not (isinstance(번, int) and not isinstance(번, bool) and 1 <= 번 <= len(소식들) and _이름나오나(이름, 줄들[번 - 1])):
        번 = next(i for i, 줄 in enumerate(줄들, 1) if _이름나오나(이름, 줄))
    검색어 = j.get("검색어") if isinstance(j.get("검색어"), str) and j["검색어"].strip() else 이름
    return {"사람": 이름, "검색어": 검색어.strip(), "소식": 번}


def 위키사진(이름: str, 검색어: str, 받기) -> str | None:
    """위키백과 그 사람 문서의 대표 사진(1280 폭 작은 그림 — 원본은 판정관이 못 받을 만큼 크기도 하다). 한국어 문서(이름)
    먼저, 없으면 영어 문서(검색어가 영어일 때만). 동음이의 문서는 그 사람 문서가 아니라 안 쓴다. 없거나 못 받으면 None."""
    for 말, 제목 in (("ko", 이름), ("en", 검색어 if 검색어.isascii() else "")):
        if not 제목:
            continue
        try:
            주소 = f"https://{말}.wikipedia.org/w/api.php?" + urlencode(
                {"action": "query", "titles": 제목, "prop": "pageimages|pageprops", "piprop": "thumbnail",
                 "pithumbsize": 1280, "ppprop": "disambiguation", "format": "json", "redirects": 1})
            몸, _, _ = 받기(주소, 1_000_000)
            for p in ((json.loads(몸).get("query") or {}).get("pages") or {}).values():
                if "disambiguation" not in (p.get("pageprops") or {}) and (p.get("thumbnail") or {}).get("source"):
                    return p["thumbnail"]["source"]
        except Exception:
            continue
    return None


def 얼굴사진찾기(인물: dict, 위키찾기, 그림찾기, 얼굴수) -> dict | None:
    """그 사람 얼굴 사진 — ① 위키백과 대표 사진에 얼굴이 한 명이면 그것 ② 아니면 이미지 검색(검색어 그대로) 결과 가운데
    짧은 변 600 이상 · 제목에 이름(또는 검색어 낱말) · 얼굴 한 명인 것, 넓이 큰 것부터. 없으면 None(얼굴 없이).
    돌려주는 것: {"주소", "출처": "위키"|"검색"}."""
    def 세기(주소):
        try:
            return 얼굴수(주소) or 0
        except Exception as e:  # 얼굴 세기는 덤 — 못 세면 그 사진은 안 쓴다
            print(f"!! 표지 얼굴 세기 실패 {type(e).__name__}: {str(e)[:80]}")
            return 0
    try:
        위 = 위키찾기(인물["사람"], 인물["검색어"])
    except Exception:
        위 = None
    if 위 and 세기(위) == 1:
        return {"주소": 위, "출처": "위키"}
    try:
        결과 = 그림찾기(인물["검색어"]) or []
    except Exception as e:  # 검색이 터져도 카드는 굽는다 — 얼굴 없이
        print(주간._가리기(f"!! 표지 얼굴 검색 실패 {type(e).__name__}: {str(e)[:100]}"))
        결과 = []
    낱말 = {w.lower() for w in f"{인물['사람']} {인물['검색어']}".split() if len(w) >= 2}
    후보 = sorted((x for x in 결과 if x.get("가로") and x.get("세로") and min(x["가로"], x["세로"]) >= 표지사진최소
                  and any(w in (x.get("제목") or "").lower() for w in 낱말)),
                 key=lambda x: x["가로"] * x["세로"], reverse=True)
    for x in 후보[:얼굴세기최대]:
        if 세기(x["주소"]) == 1:
            return {"주소": x["주소"], "출처": "검색"}
    return None


def _그림검색(기록, 손, 질: str) -> list:
    """정리의 사진 찾기와 같은 길(tools.부르기 — 예산·같은 호출 막기) — 지난 1년 이미지 검색. 이 호출엔 «사진찾기» 표시를
    붙여 지휘자가 부른 것과 가른다. 결과: [{"주소", "가로", "세로", "제목"}]."""
    from topic import flow  # flow 가 cards 를 싣는다 — 부를 때 싣는다
    현 = flow._현장(기록, 손)
    앞 = len(현.예산.기록)
    번호들 = flow._부른증거(현, "image_search", {"queries": [질], "count": 10, "time_range": "year"})
    for x in 현.예산.기록[앞:]:
        x["사진찾기"] = True
    현.창고.쓰기()
    난것 = []
    for x in (현.창고.꺼내기(b) for b in 번호들):
        if x and x.get("이미지검색") and x.get("미디어"):
            m = x["미디어"][0]
            난것.append({"주소": m["주소"], "가로": m.get("가로"), "세로": m.get("세로"), "제목": x.get("제목") or ""})
    return 난것


def _얼굴옮기기(job: str, 칸: dict, 손) -> dict | None:
    """위키백과·검색 사진은 창고로 옮긴다 — 옛 서버가 남의 사이트 사진을 못 받는 일이 없게."""
    try:
        몸, 꼴, _ = 손.받기(칸["주소"], 8_000_000)
        꼴 = (꼴 or "").split(";")[0].strip().lower()
        if not 꼴.startswith("image/") or not 몸:
            return None
        확장 = {"image/png": "png", "image/webp": "webp"}.get(꼴, "jpg")
        return {**칸, "키": 손.창고.미디어올리기(job, f"face.{확장}", 몸, 꼴)}
    except Exception as e:
        print(f"!! 표지 얼굴 사진을 못 옮김 {type(e).__name__}: {str(e)[:80]}")
        return None


def 표지고르기(기록, 손) -> None:
    """표지 인물(이름 먼저) → 그 이름으로 얼굴 사진 → 창고로. «표지인물»(누구) · «표지칸»(얼굴 사진, 없으면 None)."""
    재 = 기록["재료"]
    카 = 재["카드"]
    if 손.남은초() < 주간.부르기전필요초:  # pro 한 번은 읽기 780초까지 — 새 람다에서
        raise 주간.이어달리기()
    인물 = 표지인물고르기(기록["result"]["bundle"], 손.딥시크한번, 재)
    칸 = None
    if 인물:
        판 = judge.판정관(손.대화, _카드적기(재), 손.받기)
        찾은 = 얼굴사진찾기(인물, lambda 이름, 검색어: 위키사진(이름, 검색어, 손.받기),
                        lambda 질: _그림검색(기록, 손, 질), 판.얼굴수)
        if 찾은:
            옮김 = _얼굴옮기기(기록["job"], 찾은, 손)
            칸 = {"키": 옮김["키"], "사람": 인물["사람"], "소식": 인물["소식"], "출처": 찾은["출처"]} if 옮김 else None
    카.update(표지인물=인물, 표지칸=칸)


플랫폼말 = {"x": "X", "instagram": "인스타그램", "threads": "스레드", "web": "기사", "page": "기사"}


def _넘친장(폭: dict) -> set:
    return {x.get("no") for x in 폭.get("넘친것") or []}


def 고쳐쓰기(재: dict, 소식들: list, 분야: str, 이름표_: str, 표지칸: dict | None, 주소, 폭검사, 틀: str) -> str:
    """AI 소식 대본 합치기가 낸 장을 새 분야 꼴로 고친다 — 칩·출처 딱지·미디어·표지·마지막 장·자리표.
    고친 자리표(글)를 돌려준다. 표지 2행·마지막 장이 폭을 넘으면 줄여 쓴다(계획 3 설계 2-2 ④)."""
    짝 = {f"소식{i}": d for i, d in enumerate(소식들, 1)}
    장들 = 재["굽기장"]
    for s in 장들:
        if s.get("type") == "뉴스" and s.get("brand") in 짝:
            d = 짝[s["brand"]]
            키 = (d.get("미디어") or {}).get("키")
            s.update(brand=d["주인공"], source_kind=플랫폼말.get(d["출처"]["플랫폼"], d["출처"]["플랫폼"]),
                     source_name=d["출처"]["계정"], media_url=주소(키) if 키 else "", gen="" if 키 else "gemini")
    표 = 재["표지"]
    표["eyebrow"] = f"Weekly {분야}"
    표["accent_text"] = 이름표_
    표지얼굴(표, 표지칸, 주소, 소식들)
    t = json.loads(틀)
    t["slide_types"]["뉴스"]["brand_chip"]["format"] = "{brand}"
    t["slide_types"]["표지"]["eyebrow"]["text"] = 표["eyebrow"]
    새틀 = json.dumps(t, ensure_ascii=False)
    끝 = next((s for s in 장들 if s.get("type") == "CTA"), None)
    둘째들 = [f"{이름표_} {분야} 소식", f"{분야} 소식", f"{이름표_} 소식"]
    마지막들 = [f"{분야} 소식이 더 궁금하다면?", "소식이 더 궁금하다면?"]
    i = j = 0  # 넘친 장만 다음 글로 — 마지막 장이 넘쳤다고 표지 2행의 «9월 3주차» 강조를 빼지 않는다(계획 4 D-1)
    while True:
        표["headline"] = [표["headline"][0], 둘째들[i]]
        if 끝:
            끝["headline"] = ["매일 업데이트 되는", 마지막들[j]]
        넘친 = _넘친장(폭검사([표] + 장들, 새틀))
        표더 = 표["no"] in 넘친 and i + 1 < len(둘째들)
        끝더 = bool(끝) and 끝["no"] in 넘친 and j + 1 < len(마지막들)
        if not (표더 or 끝더):
            return 새틀
        i, j = i + 표더, j + 끝더


표지사진최소 = 600  # 표지 얼굴 사진의 짧은 변 — 카드 사진 규칙과 같다(flow.카드사진최소)
표지다시최대 = 1   # 그림 표지가 안전 검사에 막히면 얼굴 없이 한 번 더(사용자 «가», 10-05)


def 표지얼굴(표: dict, 표지칸: dict | None, 주소, 소식들: list) -> None:
    """표지 장의 얼굴 칸 — 표지 인물의 얼굴 사진이 있으면 주간 AI 소식처럼 face_url(옛 서버가 밈 장면에 그 얼굴을 넣어
    그린다), 없으면 face_none(옛 서버가 주인공 이름으로 위키미디어 회사 대표 얼굴 표를 찾지 않게, 계획 4 D-9) + 사람 없이.
    진짜 사진을 그대로 까는 표지(photo_url)는 더 쓰지 않는다(10-06). 다시 구울 때 앞 칸이 남지 않게 먼저 지운다."""
    for k in ("face_url", "face_person", "face_count", "face_none", "photo_url"):
        표.pop(k, None)
    if 표지칸:
        표.update(brand=표지칸["사람"], face_url=주소(표지칸["키"]), face_person=표지칸["사람"], face_count=1)
        return
    표["face_none"] = True
    표["brand"] = 소식들[0]["주인공"] if 소식들 else ""
    if 사람없이 not in (표.get("gen_prompt_en") or ""):
        표["gen_prompt_en"] = (표.get("gen_prompt_en") or "") + 사람없이


def _안전거절(빠진장: list) -> bool:
    """표지(1번 장)가 OpenAI 안전 검사에 막혀 빠졌나 — 다른 까닭(시간 초과 등)은 다시 구워도 같다."""
    return any(x.get("no") == 1 and "safety system" in str(x.get("why") or "") for x in 빠진장 or [])


def _표지다시(기록, 손) -> bool:
    """구운 결과에서 그림 표지가 안전 검사에 막혔으면 얼굴 없이(사람 없이) 한 번 더 굽게 한다."""
    재 = 기록["재료"]
    카 = 재["카드"]
    n = 카.get("표지다시") or 0
    if n >= 표지다시최대 or not _안전거절(((기록.get("result") or {}).get("카드") or {}).get("빠진장")):
        return False
    카.update(표지다시=n + 1, 표지칸=None)
    표지얼굴(재["표지"], None, lambda 키: 공개주소(손.창고.통, 키), 기록["result"]["bundle"])
    print(f"표지가 안전 검사에 막힘 — 얼굴 없이 다시 굽는다({n + 1}번째)")
    return True


# ── 카드 네 단계 — AI 소식 단계(runs)를 그대로 부른다 ──
카드단계 = ("카드대본", "카드표지", "카드그림", "카드굽기")


def 굽나(기록, 손) -> bool:
    """소식이 1건 이상이고, 이 판이 카드를 굽는 판이고(평가용 «카드: false» 가 아니고), 굽는 기계가 붙어 있으면."""
    return (bool((기록.get("result") or {}).get("bundle")) and 기록.get("카드") is not False
            and getattr(손, "옛서버", None) is not None)


def 공개주소(통: str, 키: str) -> str:
    """정리 때 옮겨 둔 미디어 — 창고 통은 누구나 읽기라 옛 서버가 바로 받는다(기록·대화·기억 칸만 막혀 있다)."""
    return f"https://{통}.s3.ap-northeast-2.amazonaws.com/{quote(키)}"


class _제목바꾼옛서버:
    """넘겨보기 제목만 «{이름표} {분야} 소식» 으로 — runs.굽기 는 «{주차} AI 소식» 으로 짓는다."""

    def __init__(self, 옛서버, 제목: str):
        self._옛서버, self._제목 = 옛서버, 제목

    def __getattr__(self, 이름):
        return getattr(self._옛서버, 이름)

    def 넘겨보기(self, 제목, 장들):
        return self._옛서버.넘겨보기(self._제목, 장들)


def _주간손(기록, 손):
    """주제 손 → AI 소식 단계가 받는 손. 딥시크 지시문 끝에 «이번 판은 {분야} 소식» 절, 자리표는 고친 것."""
    카 = 기록["재료"]["카드"]
    덧 = 덧붙임(카["분야"], 카.get("표지칸"))
    바꿈 = {}  # 표지 검사기는 app._노드들 이 씻어 싣는다(계획 4 E)
    if 카.get("틀"):
        바꿈["design_tpl"] = SimpleNamespace(main=lambda: {"tpl": 카["틀"]})
    노드 = SimpleNamespace(**{**vars(손.노드), **바꿈})
    return 주간.손(옛서버=_제목바꾼옛서버(손.옛서버, f"{카['이름표']} {카['분야']} 소식"),
                 딥시크=lambda 시스템, 사용자, 한도: 손.딥시크한번(시스템 + 덧, 사용자, 한도), 그림=손.그림,
                 창고=손.창고, 노드=노드, 잠자기=손.잠자기, 지금=손.지금, 다음부르기=손.다음부르기, 남은초=손.남은초)


def _묶음얹기(앞: dict, 결과: dict | None) -> dict:
    """runs.굽기 가 덮어쓴 AI 소식 꼴 결과(viewer·slides·missing_slides)를 소식 결과의 «카드» 칸으로. 덮이기 전이면 그대로."""
    결과 = 결과 or {}
    if "bundle" in 결과:
        return 결과
    return {**앞, **({"카드": {"보기": 결과["viewer"], "장수": 결과["slides"], "빠진장": 결과["missing_slides"]}}
                    if 결과.get("viewer") else {})}


class _묶음지키는창고:
    """runs.굽기 는 결과를 AI 소식 꼴로 덮어써 저장한다 — 되돌리기 전에 람다가 죽으면 창고에서 소식 묶음이 사라졌다
    (계획 4 D-2). 저장할 때마다 묶음을 다시 얹어 창고에는 늘 «묶음 + 카드» 가 남는다. 다른 칸은 창고로 넘긴다."""

    def __init__(self, 창고, 앞: dict):
        self._창고, self._앞 = 창고, 앞

    def __getattr__(self, 이름):
        return getattr(self._창고, 이름)

    def 쓰기(self, 기록):
        return self._창고.쓰기({**기록, "result": _묶음얹기(self._앞, 기록.get("result"))})


def _카드적기(재: dict):
    """카드 단계 판정관의 딥시크 기록 — 열쇠에 «카드» 를 붙여 걸음별 돈의 «카드» 줄로 간다(계획 4 D-7)."""
    return lambda 답, 열쇠: conductor.딥시크적기(재, 답, "카드" + 열쇠, store.지금시각())


그림설명지시 = ("너는 카드뉴스 그림 연출가다. 이 소식은 사진·영상을 못 찾아 그림을 그린다. 이 소식이 무엇인지 이해하고 무엇을 "
          "그릴지 정한다.\n"
          "- 모르는 이름(프로그램·가게·작품·행사 이름 등)은 «검색 결과» 로 무엇인지 이해한다. 검색 결과에도 없으면 지어내지 않고 "
          "아는 것(사건·요약·발췌)만으로 정한다.\n"
          "- 사람을 그리지 않는다 — 실제 인물이 나오는 소식이어도 장소·물건·분위기로 그린다(사람은 AI 로 그리지 않는다).\n"
          'JSON 한 줄로만 답한다: {"설명": "이 소식이 무엇인지 + 무엇을 그릴지(장소·물건·분위기), 한국어 2문장"}')
그림설명한도 = 8000


def _그림설명물음(d: dict, 검색: list) -> str:
    줄 = [f"주인공: {d['주인공']}", f"사건: {d['사건']}", f"요약: {d['요약']}", f"발췌: {d['발췌']}"]
    return "\n".join(줄 + (["검색 결과:\n" + "\n".join(f"- {x}" for x in 검색)] if 검색 else []))


def 그림설명(기록, 손) -> None:
    """카드 미디어가 없는 소식만 딥시크 pro 한 번씩(사용자 규칙 «머리는 pro») — 이 소식이 무엇이고 무엇을 그릴지(«그림설명»,
    사람 없이 — 42++ C). 정리의 사진 찾기가 남긴 웹 검색 제목·요약을 같이 준다(계획 4 과제 42+ F). 답을 못 읽으면
    빈칸으로 두고(다시 안 묻는다), 묻다 터지면 칸 없이 둔다(다음 달리기에 다시)."""
    재 = 기록["재료"]
    할것 = [d for d in 기록["result"]["bundle"] if not (d.get("미디어") or {}).get("키") and "그림설명" not in d]
    if not 할것:
        return
    if 손.남은초() < 주간.부르기전필요초:  # pro 한 번은 읽기 780초까지 — 새 람다에서
        raise 주간.이어달리기()
    찾기 = 재.get("사진찾기") or {}

    def 하나(d):
        try:
            return d, 손.딥시크한번(그림설명지시, _그림설명물음(d, 찾기.get((d.get("출처") or {}).get("증거")) or []),
                                그림설명한도)
        except Exception as e:  # 그림 설명은 덤 — 못 하면 지금처럼 그린다
            print(주간._가리기(f"!! 그림 설명 실패 {d.get('사건')} {type(e).__name__}: {str(e)[:100]}"))
            return d, None

    with ThreadPoolExecutor(max_workers=4) as 풀:
        for d, 답 in 풀.map(하나, 할것):
            if 답 is None:
                continue
            conductor.딥시크적기(재, 답, "카드그림설명", store.지금시각())
            j = {} if 답.get("넘침") else judge._제이슨(답.get("글"))
            d["그림설명"] = str(j.get("설명") or "").strip()[:300]


def 카드대본(기록, 손) -> str:
    재, o = 기록["재료"], 기록["order"]
    소식들 = 기록["result"]["bundle"]
    카 = 재.setdefault("카드", {})
    if "이름표" not in 카:  # 이어 달리기면 다시 안 센다
        카.update(분야=o.get("분야이름") or o["주제"], 이름표=이름표(o["시작"], o["끝"]))
    그림설명(기록, 손)  # 사진 없는 소식 — 무엇을 그릴지(42+ F)
    if "표지인물" not in 카:  # 표지 — 소식 속 인물 얼굴을 밈 장면에(10-06). 대본 덧붙임이 표지 인물을 알게 본문 전에
        표지고르기(기록, 손)
    기록["week"] = 카["이름표"]  # AI 소식 단계는 기록의 week 로 표지 2행·검사를 한다
    글, 순서, picked = 넣는글(카["이름표"], 소식들)
    재.update(news=글, count=len(소식들), 순서=순서, picked=picked)
    주간.본문(기록, _주간손(기록, 손))
    return "카드표지"


def 카드표지(기록, 손) -> str:
    재 = 기록["재료"]
    카 = 재["카드"]
    기록["week"] = 카["이름표"]
    주간.표지(기록, _주간손(기록, 손))
    카["틀"] = 고쳐쓰기(재, 기록["result"]["bundle"], 카["분야"], 카["이름표"], 카.get("표지칸"),
                     lambda 키: 공개주소(손.창고.통, 키), 손.옛서버.폭검사, 손.노드.design_tpl.main()["tpl"])
    return "카드그림"


사람없이 = "\n\nno people — show only the place, objects and mood; do not draw any person."


def 카드그림(기록, 손) -> str:
    """사진·영상 없는 소식 장은 늘 사람 없이 그린다 — 사람은 절대 AI 로 그리지 않는다(사용자 «ㅇㅇ», 42++ C)."""
    for s in 기록["재료"].get("굽기장") or []:
        if s.get("type") == "뉴스" and not s.get("media_url") and 사람없이 not in (s.get("gen_prompt_en") or ""):
            s["gen_prompt_en"] = (s.get("gen_prompt_en") or "") + 사람없이
    주간.그림(기록, _주간손(기록, 손))
    return "카드굽기"


def 카드굽기(기록, 손) -> None:
    앞 = 기록["result"]
    try:
        주간.굽기(기록, dataclasses.replace(_주간손(기록, 손), 창고=_묶음지키는창고(손.창고, 앞)))
    finally:  # runs.굽기 는 결과를 AI 소식 꼴로 덮어쓴다 — 오류가 나도 소식 결과에 «카드» 로 되돌린다(계획 4 D-2)
        기록["result"] = _묶음얹기(앞, 기록.get("result"))
    return "카드굽기" if _표지다시(기록, 손) else None
