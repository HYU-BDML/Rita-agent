# -*- coding: utf-8 -*-
"""주제 판 달리기 — 모으기 → 검증 → 정리(설계 1장 흐름 4~6), 그리고 주제 다듬기 대화 한 턴.

판 기록은 주간 판과 같은 곳(`weekly/jobs/{job}.json`)에 `kind: "주제"` 로 쓴다. 단계 시작·끝·실패·이어 달리기는
주간 판 달리기(runs.py)의 도우미를 그대로 쓴다. 걸음마다 기록을 다시 써서 화면이 작업판 요약·판단 줄·남은 예산을 본다.
관문이 돌려보내면 «모으기» 로 되돌아간다 — 최대 3번, 같은 것을 두 번 내거나 강제로 낸 것이면 바로 마지막 검사."""
import hashlib
import json
import re
import time
import traceback
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Callable

import cost
import runs as 주간
import store
from topic import (board, budget, cards, conductor, evidence, gate, instructions, judge, memory, order, repair,
                   tools, trace, watchlist)

# 진행률: 모으기 0~40 · 검증 45 · 정리 48 · 카드 50~99(runs 가 쓰는 값) · 끝 100 — 줄지 않게(계획 4 D-3)
# 목록보기는 매주 볼 곳이 있는 판만(계획 4), 카드 넷은 정리 뒤 — 이름이 주간 판 단계(소식·본문·표지·그림·굽기)와 안 겹친다
단계순서 = ["목록보기", "모으기", "검증", "정리", *cards.카드단계]
최대되돌림 = 3
미디어최대바이트 = 80_000_000
다듬기한도 = 8000
다듬기최대 = 16000  # 넘치면 한 번 이 한도로 다시 (같은 한도로 다시 하면 또 넘친다)
_확장자 = {"video/mp4": "mp4", "video/quicktime": "mov", "image/jpeg": "jpg", "image/png": "png",
         "image/webp": "webp", "image/gif": "gif"}


@dataclass
class 손:
    창고: object
    대화: Callable
    실행: Callable
    읽기: Callable
    받기: Callable
    다음부르기: Callable
    남은초: Callable[[], float]
    벽시계: Callable[[], datetime]
    지금: Callable[[], float] = time.monotonic
    # 카드 굽는 기계(계획 3) — AI 소식 단계와 같은 것. 없으면(시험·옛 손) 소식에서 끝난다
    옛서버: object = None
    딥시크한번: Callable | None = None
    그림: Callable | None = None
    노드: object = None
    잠자기: Callable[[float], None] = time.sleep
    # 수리공(계획 4) — 창고 장부. 없으면(시험·옛 손) 저장소 씨앗을 읽는다
    장부: object = None
    수리부르기: Callable | None = None


def 새기록(job: str, 주문서: dict, 대화번호: str | None = None) -> dict:
    return {"job": job, "kind": "주제", "order": 주문서, "chat": 대화번호, "state": "만드는 중", "pct": 0,
            "step": "시작 기다리는 중", "단계": "모으기", "steps": [], "result": None, "error": None,
            "started": store.지금시각(), "updated": store.지금시각(), "cost": None, "board": None, "lines": [], "spend": [],
            "재료": {"작업판": board.새판(), "되돌림": 0}}


def _시각글(손) -> str:
    return 손.벽시계().astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _한국날(손) -> str:
    return (손.벽시계() + timedelta(hours=9)).date().isoformat()


def _현장(기록, 손) -> tools.현장:
    재료 = 기록["재료"]
    시작 = datetime.strptime(기록["started"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    흔적 = trace.흔적(손.창고.s3, 손.창고.통, 손.창고.앞, 기록["job"])
    판정관 = judge.판정관(trace.감싼대화(손.대화, 흔적, "판정관", lambda: 재료.get("지금걸음")),
                        lambda 답, 열쇠: conductor.딥시크적기(재료, 답, 열쇠, _시각글(손)), 손.받기)
    return tools.현장(job=기록["job"], 주문서=기록["order"], 재료=재료, 흔적=흔적,
                    창고=evidence.증거창고(손.창고.s3, 손.창고.통, 기록["job"], 손.창고.앞),
                    예산=budget.예산(기록["order"]["예산"], 재료, 시작, 손.벽시계), 판정관=판정관,
                    실행=손.실행, 읽기=손.읽기, 지금글=lambda: _시각글(손),
                    기억=memory.기억창고(손.창고.s3, 손.창고.통, 손.창고.앞), 장부=손.장부,
                    수리부르기=손.수리부르기,
                    수리상태=repair.상태창고(손.창고.s3, 손.창고.통, 손.창고.앞, 손.장부.키).읽기 if 손.장부 else None)


def _저장(기록, 현, 손) -> None:
    판 = 현.판
    기록["board"] = board.화면요약(판, 현.주문서, 현.창고, 현.예산)
    기록["lines"] = board.판단줄(판)
    기록["cost"] = cost.합계(기록["재료"])
    기록["spend"] = cost.걸음별(기록["재료"])
    if 기록["단계"] == "모으기":
        채움 = sum(1 for x in 기록["board"]["칸"] if x["상태"] == "채움")
        기록["pct"] = max(기록.get("pct") or 0, min(40, 5 + round(35 * 채움 / 현.주문서["목표건수"])))
        for 단계 in 기록["steps"][-1:]:
            if 단계["state"] == "하는 중" and 단계["name"] == "모으기":
                단계["note"] = (f"{판['단계']} {board.단계이름[판['단계']]} · 도구 {현.예산.호출수()}번"
                              f" · 증거 {len(현.창고.것들)}건")
    현.창고.쓰기()
    손.창고.쓰기(기록)


def _지휘대화(기록, 손):
    """판 기록에 «지휘모델» 이 있으면 지휘자 부르기에 싣는다 — flash 지휘 비교(계획 3 평가)."""
    모델 = 기록.get("지휘모델")
    return (lambda 메시지들, 한도, **kw: 손.대화(메시지들, 한도, **{**kw, "모델": 모델})) if 모델 else 손.대화


_탈말 = {"이상함": "글이 없거나 못 읽음", "고장": "도구 고장", "입력": "도구 입력 형식이 바뀜", "막힘": "잠시 막힘",
        "돈": "자료 모으기 분량이 모자람", "못읽음": "페이지를 못 읽음", "오류": "오류"}


def _못본까닭(현, 줄: dict, 글: str) -> str:
    """사람이 결과 화면에서 읽을 까닭 — 호출 기록의 탈 종류를 쉬운 말로(도구 이름·오류 번호 없이)."""
    지 = "탈:" + budget.지문(줄["도구"], 줄["인자"])
    틀 = next((x for x in 현.예산.기록 if x["지문"] == 지), None)
    if 틀:
        return _탈말.get(틀["탈"].split(":")[0], "못 읽음")
    if " 는 이 판에서 껐다" in 글:
        return "이 판에서 꺼진 도구"
    return "예산을 다 써서" if 글.startswith("예산을 다 썼다") else "목록 줄을 못 읽음"


목록필요초 = 300  # 목록 넷 한 바퀴의 최악 — 액터 150초 + 묻기 60초 + 사진 판정 60초(가지 전체 검토 I-5)
_글없음 = "글 없음 — 계정이 없거나 이 기간 글이 없음"


def 목록보기(기록, 손) -> str | None:
    """저장한 분야의 «매주 볼 곳» 을 지휘자보다 먼저 서버가 그대로 본다(계획 4 설계 A-4) — 지휘자가 부를 때와 같은 길
    (tools.부르기: 예산 세기·같은 호출 막기·긁은 결과 창고·실패 기록·도구 끄기). 4개씩 나란히, 호출 한도를 넘는 줄은 앞에서부터."""
    단계, 시작 = 주간._시작(기록, "매주 볼 곳 보기", 손)
    현 = _현장(기록, 손)
    재 = 기록["재료"]
    목록 = 기록.get("목록") or []
    본, 못본 = list(재.get("목록글") or []), list(재.get("못본곳") or [])  # 이어 달릴 때 앞에서 한 것
    한것 = {x["글"] for x in 본 + 못본}
    남은줄 = [줄 for 줄 in 목록 if watchlist.화면글(줄) not in 한것]
    남은 = max(0, 현.예산.한도["호출"] - 현.예산.호출수())
    할것, 넘친 = 남은줄[:남은], 남은줄[남은:]
    현.재료["지금걸음"] = 0  # 걸음마다 쓴 돈의 «매주 볼 곳 보기» 줄
    try:
        for i in range(0, len(할것), 4):
            if 손.남은초() < 목록필요초:  # 람다 15분을 넘겨 «멈춤» 으로 보이지 않게 — 한 것까지 적고 이어 달린다(검토 I-5)
                재["목록글"], 재["못본곳"] = 본, 못본
                _저장(기록, 현, 손)
                raise 주간.이어달리기()
            묶음 = 할것[i:i + 4]
            with ThreadPoolExecutor(max_workers=4) as 풀:
                글들 = list(풀.map(lambda 줄: tools.부르기(현, {"이름": 줄["도구"], "인자": 줄["인자"], "인자탈": ""}), 묶음))
            with 현.자물쇠:  # 목록보기가 부른 호출 — 진짜 시험이 «목록대로 먼저 돌았나» 를 걸음 0 으로만 짐작하지 않게(계획 4 F)
                for x in 현.예산.기록:
                    if x.get("걸음") == 0:
                        x["목록"] = True
            for 줄, 글 in zip(묶음, 글들):
                한 = 현.예산.했나(budget.지문(줄["도구"], 줄["인자"]))
                if not 한:
                    못본.append({"글": watchlist.화면글(줄), "까닭": _못본까닭(현, 줄, 글)})
                elif not 한.get("증거"):  # 없는 인스타·스레드 계정은 빈 목록으로 온다(검토 I-6)
                    못본.append({"글": watchlist.화면글(줄), "까닭": _글없음})
                else:
                    본.append({"글": watchlist.화면글(줄), "결과": 글})
    finally:
        현.재료["지금걸음"] = None
    못본 += [{"글": watchlist.화면글(줄), "까닭": "이 판의 도구 호출 한도를 넘어서"} for 줄 in 넘친]
    재["목록글"], 재["못본곳"] = 본, 못본
    현.판["목록"] = {"전체": len(목록), "본곳": len(본)}
    현.판["경고"] += [f"매주 볼 곳 «{x['글']}» 은 못 봤다 — {x['까닭']}" for x in 못본]
    _저장(기록, 현, 손)
    주간._끝(기록, 단계, 시작, 손, f"{len(목록)}곳 중 {len(본)}곳 봄" + (f" · 못 본 곳 {len(못본)}" if 못본 else ""), 5)
    return "모으기"


def 모으기(기록, 손) -> str | None:
    단계, 시작 = 주간._시작(기록, "모으기", 손)
    현 = _현장(기록, 손)
    while True:
        끝 = conductor.구간(현, _지휘대화(기록, 손), 손.남은초, lambda: _저장(기록, 현, 손))
        if 끝 == "냄":
            break
        if 끝 == "시간":
            _저장(기록, 현, 손)
            raise 주간.이어달리기()
    _저장(기록, 현, 손)
    주간._끝(기록, 단계, 시작, 손, f"도구 {현.예산.호출수()}번 · 증거 {len(현.창고.것들)}건"
                                 f" · 낸 소식 {len(기록['재료']['제출']['items'])}건", 40)
    return "검증"


def 검증(기록, 손) -> str | None:
    단계, 시작 = 주간._시작(기록, "검증", 손)
    현 = _현장(기록, 손)
    재 = 기록["재료"]
    제출 = 재.get("제출") or {"items": [], "unfilled": []}
    지문 = hashlib.sha1(json.dumps([제출.get("items"), 제출.get("unfilled")], sort_keys=True,
                                  ensure_ascii=False).encode("utf-8")).hexdigest()[:16]
    마지막 = 재["되돌림"] >= 최대되돌림 or 지문 == 재.get("지난제출") or bool(제출.get("강제"))
    결과 = gate.검사(현, 제출, 마지막)
    현.흔적.쓰기("관문", {"되돌림": 재["되돌림"], "마지막": 마지막, "제출": 제출, "결과": 결과})
    if 결과["돌려보낼말"]:
        재["되돌림"] += 1
        재["지난제출"] = 지문
        현.판["관문"] = 결과["돌려보낼말"] + 결과["잠금말"]
        현.판["판단줄"].append({"시각": _시각글(손), "단계": "⑦",
                             "말": f"관문이 {len(결과['돌려보낼말'])}가지를 돌려보냄 ({재['되돌림']}번째)"})
        재.pop("제출", None)
        _저장(기록, 현, 손)
        주간._끝(기록, 단계, 시작, 손, f"돌려보냄 {재['되돌림']}번째 — {결과['돌려보낼말'][0][:80]}", 45)
        return "모으기"
    재["통과"], 재["뺀것"] = 결과["통과"], 결과["뺀것"]
    현.판["관문"] = []
    _저장(기록, 현, 손)
    주간._끝(기록, 단계, 시작, 손, f"통과 {len(결과['통과'])}건" + (f" · 뺀 소식 {len(결과['뺀것'])}건" if 결과["뺀것"] else ""),
            45)
    return "정리"


카드사진최소 = 600  # 짧은 변 — 기사 썸네일 300×225·이벤트 배너 285×120 이 카드에서 흐렸다(계획 4 과제 42+ D)


def _쓸만한가(항목: dict, 갈래: str | None, 크기=None) -> bool:
    """카드에 넣어도 되나 — 사진은 «장면»·«공식그림» 이고 크기를 알면 짧은 변 600 이상(42+ D), 영상은 대표 화면이
    «광고»·«무관» 일 때만 뺀다(공식 영상은 로고 화면으로 시작하는 일이 많다, 계획 4 B)."""
    if 항목["갈래"] == "영상":
        return 갈래 not in ("광고", "무관")
    return 갈래 in ("장면", "공식그림") and not (크기 and min(크기) < 카드사진최소)


def _카드크기(x: dict, 차례: int) -> list | None:
    """카드에 들어갈 그림의 크기 — 글 미디어가 원본 크기(가로·세로)를 알면 그것(X 판정관은 작은 대표화면을 본다),
    아니면 판정관이 머리에서 읽은 크기(42+ B·D)."""
    m = {} if x.get("사진후보") else ((x.get("미디어") or [])[차례 - 1:차례] or [{}])[0]
    return [m["가로"], m["세로"]] if m.get("가로") and m.get("세로") else (x.get("사진크기") or {}).get(str(차례))


def _카드미디어(현, s: dict, x: dict) -> dict | None:
    """카드에 넣을 미디어(계획 4 B) — 지휘자가 고른 것이 쓸만하면 그대로, 아니면 같은 글의 다른 쓸만한 것(영상 먼저),
    그것도 없으면 없음(카드 단계가 그린다). «없음» 을 고른 소식은 기사의 «장면» 사진(161d797). 모을 때 한도로 판정을
    못 받은 그림은 여기서 4장까지 묻는다."""
    mm = re.fullmatch(r"(E\d+)(?:#(\d+))?", str(s.get("media") or "").strip())
    if not mm:
        # «없음» 이어도 출처 글에 붙은 쓸만한 그림을 먼저 — 공식 트랙리스트 그림을 두고 AI 로 그렸다(진짜 시험, 10-05)
        if x.get("미디어") and not x.get("사진후보"):
            tools.사진판정채우기(현, [x["번호"]], 한도무시=True)
            판정 = x.get("사진판정") or {}
            for i, y in enumerate(x["미디어"], 1):
                항목 = {"갈래": y["갈래"], "주소": y["주소"], "대표화면": y.get("대표화면") or ""}
                if 판정.get(str(i)) is not None and _쓸만한가(항목, 판정.get(str(i)), _카드크기(x, i)):
                    return 항목
        return _기사사진고르기(현, x)
    목록 = ([{"갈래": "사진", "주소": c["주소"], "대표화면": ""} for c in x["사진후보"]] if x.get("사진후보") else
          [{"갈래": y["갈래"], "주소": y["주소"], "대표화면": y.get("대표화면") or ""} for y in x.get("미디어") or []])
    if not 목록:
        return None
    tools.사진판정채우기(현, [x["번호"]], 한도무시=True)
    판정 = x.get("사진판정") or {}
    차례들 = sorted(range(1, len(목록) + 1), key=lambda i: 목록[i - 1]["갈래"] != "영상")
    if mm.group(2):
        고른 = int(mm.group(2))
        차례들 = [고른] + [i for i in 차례들 if i != 고른]
    고른 = 차례들[0]
    for i in 차례들:
        if not 1 <= i <= len(목록):
            continue
        갈래, 크기 = 판정.get(str(i)), _카드크기(x, i)
        if 갈래 is None and i == 고른 and 목록[i - 1]["갈래"] == "사진":
            # 판정관이 그때 답하지 않은 것 — «장면 아님» 으로 보고 버리면 판정관이 막힌 날 카드가 전부 AI 그림이 됐다
            # (가지 전체 검토 I-4). 지휘자가 고른 것은 그대로 넣고 센다. «못받음»·«불확실» 은 판정이 있는 것이라 뺀다.
            if 크기 and min(크기) < 카드사진최소:  # 판정이 없어도 작은 줄 알면 안 넣는다(42+ D)
                continue
            현.재료["판정없이넣음"] = (현.재료.get("판정없이넣음") or 0) + 1
            return 목록[i - 1]
        if _쓸만한가(목록[i - 1], 갈래, 크기):
            return 목록[i - 1]
    return None


def _판정없음줄(재: dict) -> list:
    """판정 없이 넣은 사진이 있으면 결과의 «도중에 끈 도구» 에 한 줄(검토 I-4)."""
    n = 재.get("판정없이넣음") or 0
    return [{"도구": "사진 판정", "까닭": f"판정관이 그때 답하지 않아 사진 {n}장은 판정 없이 지휘자가 고른 대로 넣음"}] if n else []


def _기사사진고르기(현, x: dict) -> dict | None:
    """미디어 없는 소식 — 기사 사진 후보 가운데 카드에 쓸만한(«장면»·«공식그림», 짧은 변 600 이상, 42+ D) 첫 사진. 지휘자는
    작업판에서 «미디어 없음» 만 보고 기사 사진을 안 썼다(평가 77건 중 30건, 사진 후보 2~8장씩). 판정이 없는 후보는 4장까지 묻는다."""
    후보 = x.get("사진후보") or []
    if not 후보:
        return None
    판정 = x.setdefault("사진판정", {})
    물을 = [tools.판정물음(x, i) for i in range(1, len(후보) + 1) if str(i) not in 판정][:4]
    if 물을:
        try:
            for 번, d in 현.판정관.사진보기(물을).items():
                tools._판정적기(x, 번.split("#")[1], d)  # 크기도 — 원본을 못 받았으면 후보 주소가 작은 그림으로 바뀐다(42+ C)
        except Exception as e:  # 사진 판정은 덤 — 못 하면 미디어 없이(그림 단계가 그린다)
            print(f"!! 기사 사진 판정 실패 {x['번호']} {type(e).__name__}: {str(e)[:80]}")
    for i, c in enumerate(후보, 1):
        if _쓸만한가({"갈래": "사진"}, 판정.get(str(i)), _카드크기(x, i)):
            return {"갈래": "사진", "주소": c["주소"], "대표화면": ""}
    return None


사진찾기최대 = 4      # 카드 미디어가 끝내 없는 소식 가운데 사진을 더 찾아볼 건수(계획 4 과제 42+ E)
사진찾기필요초 = 300  # 남은 람다 시간이 이보다 적으면 그만 — 미디어 옮기기·기억 적기를 남긴다


_영상주소 = re.compile(r"youtube\.com|youtu\.be|/reel/|tiktok\.com", re.I)  # 읽어도 사진 후보가 없다(42++ B)
자료얼굴최대 = 4  # 자료 사진 후보 가운데 얼굴을 세어 볼 장 수


def _겹침빼기(글: str) -> str:
    """겹치는 낱말은 한 번(대소문자 무시) — «아이브 안유진 안유진 우주떡집» → «아이브 안유진 우주떡집»."""
    낱말 = []
    for w in 글.split():
        if w.lower() not in {x.lower() for x in 낱말}:
            낱말.append(w)
    return " ".join(낱말)


def _이름들(주인공: str, 분야: str) -> list:
    """주인공을 «·,&/» 로 쪼갠 이름들 — «그룹» 은 칩 말이지 이름이 아니라 분야 이름(42++ B)."""
    if 주인공 == "그룹":
        return [분야]
    return [w.strip() for w in re.split(r"[·,&/]", 주인공) if w.strip()] or [분야]


def _검색어들(주인공: str, 사건: str, 분야: str) -> list:
    """짧은 검색어 여럿(최대 3) — «{분야} {이름들} {사건핵심}» + 이름마다 «{분야} {이름} {사건핵심}». 사건핵심은 사건 이름에서
    분야·주인공 이름을 뺀 앞 두 낱말. 한 줄 긴 검색어로 X 0건이었다(레이·리즈 출국, 42++ B)."""
    이름들 = _이름들(주인공, 분야)
    뺄 = {분야.lower(), *(x.lower() for x in 이름들)}
    핵심 = " ".join([w for w in 사건.split()
                    if not all(p.strip().lower() in 뺄 for p in re.split(r"[·,&/]", w) if p.strip())][:2])
    질들 = [_겹침빼기(f"{분야} {' '.join(이름들)} {핵심}")] + [_겹침빼기(f"{분야} {n} {핵심}") for n in 이름들]
    return list(dict.fromkeys(질들))[:3]


def _부른증거(현, 이름: str, 인자: dict) -> list:
    """도구를 부르고(예산·같은 호출 막기·꺼진 도구는 tools.부르기 가 본다) 그 호출이 낸 증거 번호 — 이미 한 호출이면 그때 것."""
    tools.부르기(현, {"이름": 이름, "인자": 인자, "인자탈": ""})
    return list((현.예산.했나(budget.지문(이름, 인자)) or {}).get("증거") or [])


def _한줄(글: str | None, 길이: int) -> str:
    return re.sub(r"\s+", " ", 글 or "").strip()[:길이]


def _나란히(현, 호출들: list) -> list:
    """도구 여럿을 나란히 — 호출마다 증거 번호 목록."""
    if not 호출들:
        return []
    with ThreadPoolExecutor(max_workers=len(호출들)) as 풀:
        return list(풀.map(lambda a: _부른증거(현, *a), 호출들))


def _사진찾기한건(현, d: dict, 분야: str) -> tuple:
    """한 소식 — 사람은 진짜 사진만(42++). ① 그 사건 사진: 짧은 검색어 여럿으로 이미지 검색 · X 최신 20건 · 웹(기간 안),
    웹 결과 가운데 영상 주소는 건너뛰고 위 5개를 읽어 사진 후보까지. 기간 안이고(이미지 검색은 날짜 대신) 제목·글에 이름
    (또는 사건 낱말)이 든 글의 사진을 판정해 카드에 쓸만한 것 중 공식 계정 먼저·넓이 큰 것. ② 없으면 그 사람의 자료 사진.
    돌려주는 것: (빌린 미디어 또는 None, 웹 검색 결과 «제목 — 요약»). 이 호출들엔 «사진찾기» 표시 — 지휘자가 부른 것과 가른다."""
    앞 = len(현.예산.기록)
    이름들, 질들 = _이름들(d["주인공"], 분야), _검색어들(d["주인공"], d["사건"], 분야)
    그림, 엑스, 웹 = _나란히(현, [("image_search", {"queries": 질들, "count": 10}),
                              ("x_search", {"query": 질들[0], "count": 20, "sort": "Latest"}),
                              ("web_search", {"query": 질들[0], "use_period": True})])
    읽을 = [번 for 번 in 웹 if not _영상주소.search(현.창고.꺼내기(번)["주소"])][:5]
    읽은 = [b for 묶 in _나란히(현, [("read_page", {"url": 현.창고.꺼내기(번)["주소"]}) for 번 in 읽을]) for b in 묶]
    o = 현.주문서
    낱말 = {w.lower() for w in [d["주인공"], *이름들, *d["사건"].split()] if len(w) >= 2}

    def 맞나(x) -> bool:
        제목 = (x.get("제목") or "").lower()
        if x.get("이미지검색"):  # 날짜를 모른다 — 기간은 액터가 걸렀고, 제목에 이름·사건 낱말이 있어야
            return any(w in 제목 for w in 낱말)
        return bool(x.get("날짜")) and o["시작"] <= x["날짜"] <= o["끝"] and any(
            w in f"{제목} {(x.get('글') or '').lower()}" for w in 낱말)

    후보 = [x for x in (현.창고.꺼내기(번) for 번 in dict.fromkeys(그림 + 엑스 + 웹 + 읽은)) if x and 맞나(x)]
    tools.사진판정채우기(현, [x["번호"] for x in 후보], 한도무시=True, 옛것도=True)  # 옛 판의 글이면 새 규칙으로(42+ G)
    쓸것 = []
    for x in 후보:
        기사 = bool(x.get("사진후보"))
        for i, y in enumerate(x.get("사진후보") or x.get("미디어") or [], 1):
            크기 = _카드크기(x, i)
            if (기사 or y.get("갈래") == "사진") and _쓸만한가({"갈래": "사진"}, (x.get("사진판정") or {}).get(str(i)), 크기):
                쓸것.append(((gate._판정(현, x) == "공식", 크기[0] * 크기[1] if 크기 else 0),
                            {"갈래": "사진", "주소": y["주소"], "대표화면": "" if 기사 else y.get("대표화면") or "",
                             "빌려온곳": x["번호"]}))
    글들 = [f"{x.get('제목') or ''} — {_한줄(x.get('앞글') or x.get('글'), 200)}"
           for x in (현.창고.꺼내기(번) for 번 in 웹[:5]) if x]
    고른 = max(쓸것, key=lambda t: t[0])[1] if 쓸것 else _자료사진(현, 이름들, 분야)
    for x in 현.예산.기록[앞:]:
        x["사진찾기"] = True
    return 고른, 글들


def _자료사진(현, 이름들: list, 분야: str) -> dict | None:
    """그 사건 사진이 없을 때 — 이름마다 «{분야} {이름}» 으로 지난 1년 이미지 검색. 판정 «장면» · 짧은 변 600 이상 · 제목에
    이름 · 얼굴 1명 이상인 것 가운데 둘이 같이 나온 것(제목에 이름 모두) 먼저, 없으면 첫 이름, 넓이 큰 것(42++ B)."""
    번호들 = [b for 묶 in _나란히(현, [("image_search", {"queries": [_겹침빼기(f"{분야} {n}")], "count": 10,
                                                      "time_range": "year"}) for n in 이름들]) for b in 묶]
    후보 = [x for x in (현.창고.꺼내기(b) for b in dict.fromkeys(번호들)) if x and x.get("이미지검색")]
    tools.사진판정채우기(현, [x["번호"] for x in 후보], 한도무시=True, 옛것도=True)
    줄 = []
    for x in 후보:
        제목, 크기 = (x.get("제목") or "").lower(), _카드크기(x, 1)
        if (x.get("사진판정") or {}).get("1") != "장면" or not 크기 or min(크기) < 카드사진최소:
            continue
        둘 = all(n.lower() in 제목 for n in 이름들)
        if 둘 or 이름들[0].lower() in 제목:
            줄.append(((둘, 크기[0] * 크기[1]), x))
    for _, x in sorted(줄, key=lambda t: t[0], reverse=True)[:자료얼굴최대]:
        주소 = x["미디어"][0]["주소"]
        try:
            n = 현.판정관.얼굴수(주소) or 0
        except Exception as e:  # 얼굴 세기는 덤 — 못 세면 그 사진은 안 쓴다
            print(f"!! 자료 사진 얼굴 세기 실패 {type(e).__name__}: {str(e)[:80]}")
            n = 0
        if n >= 1:
            return {"갈래": "사진", "주소": 주소, "대표화면": "", "빌려온곳": x["번호"], "자료사진": True}
    return None


def _사진더찾기(현, 손, 소식들: list, 분야: str) -> None:
    """카드 미디어가 끝내 없는 소식(4건까지)만 사진을 더 찾아 빌려 온다(계획 4 과제 42+ E). 예산(호출·돈)이 끝났으면
    tools.부르기 가 막는다. 웹 검색 결과 제목·요약은 «사진찾기» 에 남겨 카드 그림 설명이 읽는다."""
    for d in [d for d in 소식들 if not d["미디어"]][:사진찾기최대]:
        if 손.남은초() < 사진찾기필요초:
            break
        d["미디어"], 글들 = _사진찾기한건(현, d, 분야)
        현.재료.setdefault("사진찾기", {})[d["출처"]["증거"]] = 글들


def _옮기기(job: str, 순서: int, 미디어: dict, 손) -> dict:
    난것 = {"갈래": 미디어["갈래"], "원주소": 미디어["주소"],
          **({"빌려온곳": 미디어["빌려온곳"]} if 미디어.get("빌려온곳") else {}),  # 다른 글에서 빌린 사진(42+ E)
          **({"자료사진": True} if 미디어.get("자료사진") else {})}  # 그 사람의 자료 사진(42++ B)
    try:
        몸, 꼴, _ = 손.받기(미디어["주소"], 미디어최대바이트)
        꼴 = (꼴 or "").split(";")[0].strip().lower()
        if len(몸) >= 미디어최대바이트:
            raise ValueError("80MB 넘음")
        if 꼴 not in _확장자:
            raise ValueError(f"미디어가 아님({꼴 or '꼴 모름'})")
        난것["키"] = 손.창고.미디어올리기(job, f"{순서:02d}.{_확장자[꼴]}", 몸, 꼴)
        크기 = judge.그림크기(몸) if 꼴.startswith("image/") else None
        if 크기:  # 표지 사진 고르기가 짧은 변을 본다(42++ D)
            난것["크기"] = list(크기)
    except Exception as e:
        난것["못옮김"] = f"{type(e).__name__}: {e}"[:150]
    if 미디어.get("대표화면") and 미디어["대표화면"] != 미디어["주소"]:
        try:
            몸, 꼴, _ = 손.받기(미디어["대표화면"], 5_000_000)
            꼴 = (꼴 or "").split(";")[0].strip().lower()
            if 꼴.startswith("image/") and 꼴 in _확장자:
                난것["대표키"] = 손.창고.미디어올리기(job, f"{순서:02d}_t.{_확장자[꼴]}", 몸, 꼴)
        except Exception:
            pass
    return 난것


def 정리(기록, 손) -> str | None:
    단계, 시작 = 주간._시작(기록, "정리", 손)
    현 = _현장(기록, 손)
    재 = 기록["재료"]
    tools.수리살피기(현)  # 끝나기 전에 수리공 결과를 한 번 더 본다(계획 4 C-5)
    재["판정없이넣음"] = 0  # 정리를 다시 돌려도 두 번 세지 않게
    # 옛 판을 정리부터 다시 돌릴 때 — 카드에 들어갈 소식의 출처 글에 크기 없이 남은 옛 판정은 다시 묻는다(42+ G)
    tools.사진판정채우기(현, [s["source"] for s in 재.get("통과") or []], 한도무시=True, 옛것도=True)
    소식들 = []
    for s in 재.get("통과") or []:
        x = 현.창고.꺼내기(s["source"])
        소식들.append({"주인공": s["hero"], "사건": s["event"], "요약": s["summary"], "날짜": x["날짜"],
                     "출처": {"주소": x["주소"], "계정": x["계정"], "플랫폼": x["플랫폼"], "증거": x["번호"]},
                     "발췌": s["quote"], "미디어": _카드미디어(현, s, x), "반응": x.get("반응") or {},
                     "배수": 현.창고.배수(x["번호"]), "딱지": s.get("tags") or []})
    _사진더찾기(현, 손, 소식들, 기록["order"].get("분야이름") or 기록["order"]["주제"])
    소식들.sort(key=lambda d: -d["배수"])  # 평소 대비 인기 순(설계 2장 «순서»)
    for i, d in enumerate(소식들, 1):
        d["순서"] = i
        if d["미디어"]:
            d["미디어"] = _옮기기(기록["job"], i, d["미디어"], 손)
    기록["result"] = {"bundle": 소식들, "unfilled": (재.get("제출") or {}).get("unfilled") or [],
                     "dropped": 재.get("뺀것") or [],
                     # 도중에 끈 도구와 까닭 — 못 본 곳을 «소식이 적었다» 로 읽지 않게(최종 검토)
                     "blocked": [{"도구": 도구, "까닭": 까닭} for 도구, 까닭 in 현.판["꺼진도구"].items()]
                     + _판정없음줄(재)}
    수리 = tools.수리결과(재)
    if 수리["고침"] or 수리["못고침"] or 수리["고치는중"]:
        기록["result"]["수리"] = 수리  # 고친·못 고친 도구(계획 4 C-5)
    목록 = 기록.get("목록")  # 저장한 분야의 매주 볼 곳(계획 4 설계 A) — 있으면 «목록 판»
    기록["result"]["목록후보"] = watchlist.후보만들기((재.get("제출") or {}).get("weekly_sources"),
                                                 재.get("호출기록") or [], 현.창고.것들, 소식들, 목록)
    if 목록 is not None:
        못본 = 재.get("못본곳") or []
        기록["result"]["목록"] = {"전체": len(목록), "본곳": len(목록) - len(못본), "못본곳": 못본}
    try:  # 기억은 없으면 없는 대로 — 판을 멈추지 않는다(계획 2-1 설계 2장)
        if 현.기억:
            memory.판끝적기(현.기억, 기록, 현.창고.것들, _한국날(손))
            현.기억.묵은것치우기(tools._지금(현))  # 다시 쓸 일 없는 긁은 결과를 치운다(작은 것 11)
    except Exception as e:
        print(주간._가리기(f"!! {기록['job']} 기억 적기 실패 {type(e).__name__}: {e}"))
    _저장(기록, 현, 손)
    못옮김 = sum(1 for d in 소식들 if d["미디어"] and d["미디어"].get("못옮김"))
    주간._끝(기록, 단계, 시작, 손, f"소식 {len(소식들)}건" + (f" · 미디어 못 옮김 {못옮김}" if 못옮김 else ""), 48)
    return "카드대본" if cards.굽나(기록, 손) else None  # 모으기가 끝나면 저절로 굽는다(사용자 2026-10-04)


def 달리기(job: str, 단계: str, 손) -> dict:
    기록 = 손.창고.읽기(job)
    if 기록 is None or 기록.get("kind") != "주제":
        print(f"!! {job} 주제 판 기록이 없다 — [{단계}] 안 한다")
        return {"ok": False}
    try:
        다음 = {"목록보기": 목록보기, "모으기": 모으기, "검증": 검증, "정리": 정리,
               **{이름: getattr(cards, 이름) for 이름 in cards.카드단계}}[단계](기록, 손)
        기록["cost"] = cost.합계(기록["재료"])
        기록["spend"] = cost.걸음별(기록["재료"])
        if 다음:
            기록["단계"] = 다음
            손.창고.쓰기(기록)
            손.다음부르기(job, 다음)
        else:
            기록.update(state="됨", pct=100, step="끝")
            손.창고.쓰기(기록)
    except 주간.이어달리기:
        주간._시간적기(기록, 손)
        기록["cost"] = cost.합계(기록["재료"])
        기록["spend"] = cost.걸음별(기록["재료"])
        손.창고.쓰기(기록)
        손.다음부르기(job, 단계)
    except Exception as e:
        멈춤 = isinstance(e, 주간.멈춤)
        if not 멈춤:
            print(주간._가리기(f"!! {job} [{단계}] {type(e).__name__}: {e}\n{traceback.format_exc()}"))
        말 = str(e) if 멈춤 else f"{단계} 단계에서 오류 — {type(e).__name__}: {e}"
        if 단계 in cards.카드단계 and (기록.get("result") or {}).get("bundle"):
            _카드실패(기록, 말, 손)
        else:
            주간._실패(기록, 말, 손)
    return {"ok": True}


def _카드실패(기록, 말: str, 손) -> None:
    """카드 단계가 실패해도 판은 «됨» — 모은 소식은 그대로 두고 카드 오류 한 줄만(계획 3 설계 2-1)."""
    주간._시간적기(기록, 손)
    for 단계_ in 기록["steps"]:
        if 단계_["state"] == "하는 중":
            단계_["state"] = "실패"
    기록["result"]["카드"] = {"오류": 주간._가리기(말)[:400]}
    기록["cost"] = cost.합계(기록["재료"])
    기록["spend"] = cost.걸음별(기록["재료"])
    기록.update(state="됨", pct=100, step="끝")
    손.창고.쓰기(기록)


def _받는꼴(o: dict) -> dict:
    """정리된 주문서를 서버가 받는 꼴로 — 정리된 꼴(기간말·시작·끝)을 보여 주며 «같은 꼴로» 라 해서 AI 가 기간 종류를
    빠뜨려 검사에 걸렸다(판 3 대화). 종류는 남아 있지 않으니 «직접» + 그 날짜. 예산은 서버가 등급으로 다시 센다."""
    본 = {k: v for k, v in o.items() if k not in ("기간말", "시작", "끝", "예산")}
    return {**본, "기간": {"말": o.get("기간말", ""), "종류": "직접", "시작": o["시작"], "끝": o["끝"]}}


def 대화한턴(번호: str, 손, 오늘: date) -> dict:
    """주제 다듬기 한 번. 주문서가 틀리면 한 번은 «고쳐 달라» 고 되묻고, 두 번째도 틀리면 말만 보이고 주문서는 안 만든다."""
    d = 손.창고.대화읽기(번호)
    if d is None:
        print(f"!! 대화 {번호} 기록이 없다")
        return {"ok": False}
    재 = d.setdefault("재료", {})
    흔적 = trace.흔적(손.창고.s3, 손.창고.통, 손.창고.앞, 번호)
    대화 = trace.감싼대화(손.대화, 흔적, "다듬기")
    지시 = instructions.다듬기(오늘)
    if d.get("order"):  # 지금 주문서를 보여 줘야 «~도» 를 «그것만» 으로 새로 쓰지 않는다(진짜 한 판 10-01)
        지시 += "\n\n지금 주문서(고칠 칸만 바꿔 같은 JSON 꼴로 다시 낸다): " + json.dumps(_받는꼴(d["order"]), ensure_ascii=False)
    메시지들 = [{"role": "system", "content": 지시}] + [
        {"role": "user" if m["who"] == "사람" else "assistant", "content": m["text"]} for m in d["messages"]]
    try:
        한도 = 다듬기한도
        for 번 in range(2):
            답 = 대화(메시지들, 한도, 읽기=conductor.읽기초(한도))
            conductor.딥시크적기(재, 답, "다듬기", _시각글(손))
            if 답["넘침"]:
                한도 = 다듬기최대
                continue
            j = judge._제이슨(답["글"])
            말, 주문, 주문서, 탈, 이유 = str(j.get("말") or "").strip(), j.get("주문서"), None, "", ""
            if not 말:
                탈 = 'JSON 한 줄로만 답하라 — {"말": "...", "주문서": null 또는 {...}}'
            elif 주문:
                try:
                    주문서 = order.다듬기(주문, 오늘)
                except order.주문서탈 as e:
                    이유 = str(e)
                    탈 = (f"주문서에 문제가 있다: {e}. 사용자에게 다시 묻거나, 고친 주문서를 같은 JSON 으로 내라. "
                         "고친 사정은 사용자에게 말하지 말고, 말에는 사람에게 할 말만 쓴다(사용자는 주문서 속을 모른다).")
            if 말 and (not 탈 or 번 == 1):
                d["messages"].append({"who": "지휘자", "text": 말})
                if 이유:  # 두 번째도 틀렸다 — 왜 주문서가 안 나왔는지 사람에게(합격 판정 장면 6)
                    d["messages"].append({"who": "지휘자", "text": f"주문서를 아직 못 만들었어요: {이유}"})
                d.update(state="답함", order=주문서, error=None, job=None)  # 새 답이면 새 주문서 — 다시 모을 수 있다
                break
            메시지들 += [{"role": "assistant", "content": 답["글"] or "(빈 답)"}, {"role": "user", "content": 탈}]
        else:
            d.update(state="실패", error="주제 다듬기가 답을 못 냈어요 — 다시 보내 주세요")
    except Exception as e:
        print(주간._가리기(f"!! 대화 {번호} {type(e).__name__}: {e}"))
        d.update(state="실패", error=주간._가리기(f"{type(e).__name__}: {e}")[:200])
    흔적.쓰기("다듬기끝", {"상태": d["state"], "말": d["messages"][-1]["text"] if d["state"] == "답함" else "",
                       "주문서": d.get("order"), "오류": d.get("error")})
    d["cost"] = cost.합계(재)
    손.창고.대화쓰기(d)
    return {"ok": True}
