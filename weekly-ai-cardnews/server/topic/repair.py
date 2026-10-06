# -*- coding: utf-8 -*-
"""수리공 — 자료 모으는 Apify 도구가 고장 나면 스스로 고친다(계획 4 설계 C, 지휘자 설계 4장).

판이 기다리지 않게 람다를 따로 불러(`{"_repair": 요청}`) 돈다. 고치는 것은 창고 도구 장부의 칸뿐 — 코드는 고치지 않는다.
잡기(한 도구는 모든 판을 통틀어 한 번에 하나) → 재현(늘 활발한 NASA — 멀쩡하면 «글 없음») → 조사(돈 0) →
입력 맞추기 → 다른 도구로 갈아타기 → 작은 시험 → 기록. 울타리: 한 번 $0.20 · 시험 5번 · 시험 한 번 $0.05 ·
갈아탈 도구 값은 지금의 4배까지. 고칠 방법을 정하는 머리는 딥시크 pro(사용자 2026-10-04 «브레인은 pro»)."""
import json
import re
import secrets
from datetime import date, datetime, timedelta

import cost
from topic import apify, normalize, registry, tools
from topic.apify import 도구탈

한번돈 = 0.20
시험최대 = 5
시험한번돈 = 0.05
값배수 = 4.0              # 갈아탈 도구는 지금 도구 값의 4배까지(사용자 2026-10-04)
성공률선, 사용자선 = 0.95, 100
후보최대 = 3
묵은분 = 15
시험개수 = 5
시험시간, 시험기다림 = 60, 90  # 시험 실행은 짧게 — 람다 15분 안에 다섯 번
남길초 = 200                  # 람다 남은 시간이 이보다 적으면 더 시험하지 않는다
사람할일 = "Apify 가게에서 같은 일을 하는 도구를 골라 창고 장부(weekly/memory/registry.json)의 이 칸을 사람이 고친다"
딥시크한도 = 16000             # 생각 + 답 — 입력 형식이 길다. 8000 에선 후보 셋이 다 잘리거나 틀을 못 냈다(진짜 시험 6)
딥시크여유 = 0.04              # 딥시크 한 번이 쓸 수 있는 돈(바쁜 시간 두 배까지)
_로그인칸 = re.compile(r"cookie|session|password|passwd|login|auth.?token|access.?token", re.I)
_자리꼴 = re.compile(r"\{(\w+)\}")
_틀지시 = (
    "너는 «주제 소식» 의 도구 장부 수리공이다. Apify 도구(액터)에 넣을 입력 틀을 JSON 으로 쓴다. "
    "우리가 채울 값은 «{자리}» 로 둔다 — 쓸 수 있는 자리는 아래 «자리» 목록뿐이다. 자리가 칸 값 전체이면 그 값의 꼴"
    "(숫자·참거짓·목록) 그대로 들어가고, 글 안에 섞이면 글로 들어간다. 입력 형식(JSON 스키마)의 필수 칸은 반드시 넣고, "
    "로그인·쿠키·비밀번호·토큰 칸은 넣지 않는다. 결과 수를 정하는 칸이 있으면 {개수} 를, 기간을 정하는 칸이 있으면 기간 "
    "자리를 쓴다. «꼭 쓸 자리» 는 반드시 쓴다. 답은 JSON 한 덩어리만: {\"입력\": {…}}")
_날짜도구 = {"x_search", "x_account_기간", "instagram_account_기간", "web_search"}

_기간자리 = {"시작UTC": "기간 시작 0시(한국)를 UTC 로 — 2026-09-20_15:00:00_UTC 꼴",
           "끝UTC": "기간 끝 다음 날 0시(한국)를 UTC 로 — 같은 꼴",
           "시작하루전": "기간 시작 하루 전 날짜 — 2026-09-20 꼴", "끝다음": "기간 끝 다음 날짜 — 같은 꼴"}
_개수자리 = {"개수": "가져올 글 수(숫자)"}
_나라말 = {"나라": "kr·us 같은 나라 두 글자", "언어": "ko·en 같은 언어 두 글자"}
자리들 = {
    "x_search": {"검색어": "X 검색어", **_개수자리, "정렬": "Top 또는 Latest", **_기간자리},
    "x_account": {"계정": "X 계정 이름(@ 없이)", **_개수자리, **_기간자리},
    "x_account_기간": {"계정": "X 계정 이름(@ 없이)", **_개수자리, **_기간자리},
    "instagram_search": {"검색어": "해시태그(# 없이)", **_개수자리, "낱말검색": "참이면 낱말 검색(참거짓)", **_기간자리},
    "instagram_account": {"계정": "인스타 계정 이름", **_기간자리},
    "instagram_account_기간": {"계정": "인스타 계정 이름", **_개수자리, **_기간자리},
    "threads_account": {"계정들": "스레드 계정 이름 목록(목록)", **_기간자리},
    "web_search": {"검색어": "구글 검색어", **_나라말, **_기간자리},
    "web_search_전체": {"검색어": "구글 검색어", **_나라말, **_기간자리},
    "image_search": {"검색어들": "구글 이미지 검색어 목록(목록)", **_개수자리,
                     "기간말": "day·week·month·year·any 가운데 하나 — 최근 얼마 안의 그림만", **_기간자리},
}
_꼭자리 = {"x_search": "검색어", "x_account": "계정", "x_account_기간": "계정", "instagram_search": "검색어",
         "instagram_account": "계정", "instagram_account_기간": "계정", "threads_account": "계정들",
         "web_search": "검색어", "web_search_전체": "검색어", "image_search": "검색어들"}
하는일 = {
    "x_search": "X(트위터) 글을 검색어로 찾는다 — 기간 안 글만",
    "x_account": "X 계정 한 곳의 최근 글 몇 개",
    "x_account_기간": "X 계정 한 곳의 기간 안 글",
    "instagram_search": "인스타 게시물을 해시태그·낱말로 찾는다",
    "instagram_account": "인스타 계정 정보와 최근 게시물(프로필 한 장)",
    "instagram_account_기간": "인스타 계정 한 곳의 기간 안 게시물",
    "threads_account": "스레드 계정들의 정보와 최근 글",
    "web_search": "구글 검색 결과 한 쪽 — 기간 안",
    "web_search_전체": "구글 검색 결과 한 쪽 — 기간 없이",
    "image_search": "구글 이미지 검색 — 그림 주소·원본 가로세로·제목·그림이 실린 쪽 주소",
}
가게검색어 = {"x_search": "twitter scraper", "x_account": "twitter scraper", "x_account_기간": "twitter scraper",
           "instagram_search": "instagram hashtag scraper", "instagram_account": "instagram profile scraper",
           "instagram_account_기간": "instagram post scraper", "threads_account": "threads profile scraper",
           "web_search": "google search scraper", "web_search_전체": "google search scraper",
           "image_search": "google images scraper"}


def 상태키(앞: str, 장부키: str, 도구: str) -> str:
    칸 = "repairs" if 장부키 == registry.운영키 else "repairs-test"  # 시험용 장부는 상태도 따로
    return f"{앞}memory/{칸}/{도구}.json"


def 묵었나(시작글: str, 지금글: str, 분: int = 묵은분) -> bool:
    try:
        return (datetime.strptime(지금글, "%Y-%m-%dT%H:%M:%SZ")
                - datetime.strptime(시작글 or "", "%Y-%m-%dT%H:%M:%SZ")) > timedelta(minutes=분)
    except (TypeError, ValueError):
        return True


class 상태창고:
    """수리공 상태 파일 — 판 쪽은 «끝났나» 를 보고, 수리공은 «다른 수리공이 잡았나» 를 본다."""

    def __init__(self, s3, 통: str, 앞: str = "weekly/", 장부키: str = registry.운영키):
        self.s3, self.통, self.앞, self.장부키 = s3, 통, 앞, 장부키

    def 읽기(self, 도구: str) -> dict | None:
        try:
            return json.loads(self.s3.get_object(Bucket=self.통, Key=상태키(self.앞, self.장부키, 도구))["Body"].read())
        except Exception:
            return None

    def 쓰기(self, 도구: str, d: dict) -> None:
        self.s3.put_object(Bucket=self.통, Key=상태키(self.앞, self.장부키, 도구),
                           Body=json.dumps(d, ensure_ascii=False).encode("utf-8"),
                           ContentType="application/json; charset=utf-8")

    def 잡기(self, 도구: str, job, 까닭: str, 지금글: str, 잠자기) -> str | None:
        """한 도구는 한 번에 하나 — 적고 잠깐 기다려 다시 읽어 내 표가 남아 있을 때만(나중에 쓴 쪽이 이긴다)."""
        있던 = self.읽기(도구)
        if 있던 and 있던.get("상태") == "고치는중" and not 묵었나(있던.get("시작"), 지금글):
            return None
        표 = secrets.token_hex(8)
        self.쓰기(도구, {"상태": "고치는중", "시작": 지금글, "job": job, "까닭": str(까닭)[:200], "표": 표})
        잠자기(1.5)
        return 표 if (self.읽기(도구) or {}).get("표") == 표 else None


class _셈:
    def __init__(self, 상한: float):
        self.상한, self.돈, self.딥, self.아, self.시험수 = 상한, 0.0, 0.0, 0.0, 0

    def 시험돼(self, 어림: float) -> bool:
        return self.시험수 < 시험최대 and self.돈 + 어림 <= self.상한 + 1e-9


def 늘활발값(도구: str, 오늘: date) -> tuple[dict, tuple[str, str]]:
    """늘 글이 올라오는 NASA — 여기서 멀쩡하면 도구는 산 것이다(설계 C-3 ③ 재현)."""
    시작, 끝 = 오늘 - timedelta(days=6), 오늘
    값 = {**tools.기간값(시작, 끝), "검색어": "nasa", "개수": 시험개수, "정렬": "Latest", "계정": "nasa",
         "계정들": ["nasa"], "낱말검색": False, "나라": "us", "언어": "en"}
    return 값, (시작.isoformat(), 끝.isoformat())


def 읽은글들(도구: str, 것들: list) -> list:
    """도구 상자와 같은 꼴로 읽는다 — 장부 칸마다 읽는 꼴이 정해져 있다(갈아탈 도구도 이 꼴로 읽혀야 받는다)."""
    if 도구.startswith("x_"):
        return normalize.x글들(것들)[0]
    if 도구 in ("instagram_search", "instagram_account_기간"):
        return normalize.인스타글들(것들)
    if 도구 == "instagram_account":
        return normalize.인스타프로필(것들[0])[1] if 것들 and isinstance(것들[0], dict) else []
    if 도구 == "threads_account":
        return [g for 줄 in 것들 if isinstance(줄, dict) for g in normalize.스레드프로필(줄)[1]]
    if 도구 == "image_search":
        return normalize.그림검색결과(것들)
    return normalize.구글결과(것들)


def 어림(항목: dict, 개수: int) -> float:
    return float(항목.get("시작삯") or 0) + float(항목.get("건당") or 0) * max(1, int(개수))


def 후보어림(값매김: dict, 개수: int) -> float | None:
    """사건 값으로 한 번 어림 — 시작 사건 + 주사건 × 개수. 주사건이 없으면(검색어 한 번에 값) 가장 싼 사건 하나."""
    사건 = 값매김.get("사건") or {}
    시작 = sum(v for e, v in 사건.items() if "start" in e)
    주 = 사건.get(값매김.get("주사건") or "")
    if 주 is None:
        나머지 = [v for e, v in 사건.items() if "start" not in e]
        return round(시작 + min(나머지), 5) if 나머지 else None
    return round(시작 + 주 * max(1, int(개수)), 5)


def 시험(항목: dict, 도구: str, 값: dict, 기간: tuple, 손, 셈: _셈, 값매김: dict | None = None) -> dict:
    """작게 한 번 돌려 우리 꼴로 읽히나 본다. 받는 조건: 글 1개 이상 · (날짜 도구면) 기간 안 글 · 광고문 아님."""
    개수 = int(값.get("개수") or 시험개수)
    if 값매김 is None:
        한번 = 어림(항목, 개수)
    else:
        한번 = 후보어림(값매김, 개수)
        한번 = 시험한번돈 if 한번 is None else 한번
    if 한번 > 시험한번돈 + 1e-9:
        return {"통과": False, "까닭": f"시험 한 번 어림 ${한번:.3f} — ${시험한번돈} 넘음", "돈": 0.0}
    최소 = float(항목.get("최소상한") or 0)
    if 값매김 is not None and 최소 > 시험한번돈 + 1e-9:  # 값을 모르는 후보는 최저 상한까지 청구될 수 있다(검토 I-3)
        return {"통과": False, "까닭": f"최저 상한 ${최소:.2f} — 시험 한 번 ${시험한번돈} 을 넘을 수 있어 안 돌림", "돈": 0.0}
    if not 셈.시험돼(한번):
        return {"통과": False, "까닭": "수리 울타리(돈·시험 수)에 닿음", "돈": 0.0, "멈춤": True}
    if 손.남은초() < 남길초:
        return {"통과": False, "까닭": "람다 시간이 모자람", "돈": 0.0, "멈춤": True}
    셈.시험수 += 1
    상한 = round(max(min(시험한번돈, max(0.01, 한번 * 1.2)), float(항목.get("최소상한") or 0)), 4)
    try:
        결과 = 손.실행(항목["도구"], registry.채우기(항목["입력"], 값), 상한, 시간=시험시간, 기다림=시험기다림)
    except 도구탈 as e:
        return {"통과": False, "까닭": f"{e.종류}: {e.말}"[:200], "돈": 0.0}
    except KeyError as e:
        return {"통과": False, "까닭": f"틀의 자리를 못 채움 — {e}"[:200], "돈": 0.0}
    것들 = 결과.get("것들") or []
    청구 = 결과.get("청구") or {}
    if 값매김 is None:
        돈 = registry.값셈(항목, 청구, len(것들))
    else:
        돈 = max(apify.실제값(값매김, 청구), 후보어림(값매김, len(것들)) or 0.0)
    셈.돈 += 돈
    셈.아 += 돈
    밑 = {"돈": round(돈, 5), "청구": 청구, "줄수": len(것들)}
    if 값매김 is not None and 돈 > 시험한번돈 + 1e-9:  # 어림이 틀린 후보 — 울타리를 지키려 받지 않는다(검토 I-3)
        return {**밑, "통과": False, "까닭": f"시험 한 번에 ${돈:.3f} — ${시험한번돈} 보다 비쌌다"}
    글들 = 읽은글들(도구, 것들)
    if not 글들:
        return {**밑, "통과": False, "까닭": f"우리 꼴로 읽힌 글이 없다(받은 줄 {len(것들)})"}
    시작, 끝 = 기간
    날들 = [g["날짜"] for g in 글들 if g.get("날짜")]
    if 도구 in _날짜도구 and 시작 and 날들 and not any(시작 <= d <= 끝 for d in 날들):
        return {**밑, "통과": False, "까닭": "기간 안 글이 없다"}
    본문들 = [re.sub(r"\s+", " ", g.get("글") or "")[:60] for g in 글들]
    if len(글들) >= 4 and len(set(본문들)) * 2 < len(글들):
        return {**밑, "통과": False, "까닭": "거의 같은 글뿐(광고문)"}
    return {**밑, "통과": True, "글수": len(글들)}


def 수리(요청: dict, 손) -> dict:
    """람다 사건 `{"_repair": 요청}` 하나. 상태 파일에 끝을 적고 같은 것을 돌려준다."""
    도구 = str(요청.get("도구") or "")
    if 도구 not in 자리들:
        return {"상태": "못고침", "까닭": f"모르는 장부 칸 «{도구}»"}
    장부키 = 요청.get("장부키") or registry.운영키
    장 = registry.장부(손.s3, 손.통, 손.앞, 키=장부키)
    판 = 상태창고(손.s3, 손.통, 손.앞, 장부키)
    탈 = 요청.get("탈") or {}
    시작 = 손.지금글()
    표 = 판.잡기(도구, 요청.get("job"), f"{탈.get('종류', '')}: {탈.get('말', '')}", 시작, 손.잠자기)
    if not 표:
        return {"상태": "이미고치는중"}
    셈 = _셈(min(한번돈, max(0.0, float(요청.get("판남은돈", 한번돈)))))
    try:
        결과 = _고치기(요청, 장, 손, 셈)
    except Exception as e:  # 수리공이 터져도 상태는 남긴다 — 판이 15분 «고치는 중» 을 기다리지 않게
        결과 = {"상태": "못고침", "까닭": f"수리공 오류 — {type(e).__name__}: {str(e)[:150]}",
              "사람할일": "람다 기록(CloudWatch)을 보고 사람이 고친다"}
    끝 = {"상태": 결과["상태"], "까닭": 결과.get("까닭", ""), "사람할일": 결과.get("사람할일", ""), "시작": 시작,
          "끝": 손.지금글(), "job": 요청.get("job"), "표": 표, "돈": round(셈.돈, 4), "딥시크": round(셈.딥, 4),
          "아피파이": round(셈.아, 4), "시험수": 셈.시험수}
    판.쓰기(도구, 끝)
    print(f"수리공 {도구}: {끝['상태']} — {끝['까닭'][:150]} (${끝['돈']}, 시험 {셈.시험수}번)")
    return 끝


def _고치기(요청: dict, 장, 손, 셈: _셈) -> dict:
    도구 = 요청["도구"]
    항목 = 장.항목(도구)
    활발, 기간 = 늘활발값(도구, 손.오늘())
    재현 = None
    for _ in range(2):  # 실패 한 번으로 버리지 않는다
        재현 = 시험(항목, 도구, 활발, 기간, 손, 셈)
        if 재현["통과"] or 재현.get("멈춤"):
            break
    if 재현["통과"]:
        계정 = str((요청.get("값") or {}).get("계정") or "")
        if (요청.get("탈") or {}).get("종류") == "이상함" and 계정 and _전에글있음(손.기억, 도구, 계정):
            return _계정예외(요청, 장, 항목, 계정, 손, 셈)
        return {"상태": "글없음", "까닭": "늘 글이 올라오는 계정(NASA)에서는 도구가 멀쩡하다 — 그 계정·검색어에 기간 안 글이 없었다"}
    if 재현.get("멈춤"):
        return {"상태": "못고침", "까닭": 재현["까닭"], "사람할일": "다음 판에서 다시 고친다"}
    return _고칠길(요청, 장, 항목, 활발, 기간, 손, 셈, 재현)


_맨자리 = re.compile(r'([:\[,]\s*)\{(\w+)\}(?=\s*[,\]\}])')  # 값 자리에 따옴표 없이 쓴 «{개수}»


def _json(글: str) -> dict | None:
    m = re.search(r"\{.*\}", 글 or "", re.S)
    if not m:
        return None
    for 몸 in (m.group(0), _맨자리.sub(r'\1"{\2}"', m.group(0))):
        # 딥시크가 «자리가 칸 값 전체면 숫자 꼴 그대로» 를 따라 {"maxItems": {개수}} 로 쓴다 — 따옴표를 붙여 다시 읽는다
        # (진짜 시험 6). 글 안의 자리(«from:{계정}») 는 뒤가 , ] } 가 아니라 건드리지 않는다.
        try:
            d = json.loads(몸)
        except ValueError:
            continue
        return d if isinstance(d, dict) else None
    return None


def _스키마요약(형식: dict) -> str:
    필수 = set(형식.get("required") or [])
    줄 = []
    for 이름, p in list((형식.get("properties") or {}).items())[:40]:
        p = p if isinstance(p, dict) else {}
        예 = p.get("prefill", p.get("default"))
        줄.append(f"- {이름} ({p.get('type', '?')}{', 필수' if 이름 in 필수 else ''}): "
                  f"{str(p.get('title') or '')[:60]} — {str(p.get('description') or '')[:160]}"
                  + (f" · 예: {json.dumps(예, ensure_ascii=False)[:80]}" if 예 is not None else "")
                  + (f" · 고를 것: {p['enum'][:8]}" if p.get("enum") else ""))
    return "\n".join(줄)


def _틀검사(도구: str, 틀, 형식: dict | None) -> str:
    """틀이 쓸 만하면 빈 글, 아니면 까닭."""
    if not isinstance(틀, dict) or not 틀:
        return "딥시크가 틀을 안 냈다"
    글 = json.dumps(틀, ensure_ascii=False)
    모르는 = sorted(set(_자리꼴.findall(글)) - set(자리들[도구]))
    if 모르는:
        return f"모르는 자리 {모르는}"
    if "{" + _꼭자리[도구] + "}" not in 글:
        return f"꼭 쓸 자리 {{{_꼭자리[도구]}}} 가 없다"
    if any(_로그인칸.search(str(k)) for k in 틀):
        return "로그인·쿠키 칸을 넣었다"
    빠진 = [k for k in ((형식 or {}).get("required") or []) if k not in 틀]
    return f"필수 칸이 빠졌다 {빠진}" if 빠진 else ""


def _새틀(도구: str, 액터: str, 형식: dict, 지금틀: dict, 탈말: str, 기록글: str, 손, 셈: _셈,
         갈아탐: bool) -> tuple[dict | None, str]:
    """딥시크 pro 가 입력 틀을 쓴다 — 고칠 방법을 정하는 «머리» 일(사용자 «브레인은 pro»)."""
    if 셈.돈 + 딥시크여유 > 셈.상한 + 1e-9:
        return None, "수리 울타리(돈)에 닿음"
    if 손.남은초() < 남길초:
        return None, "람다 시간이 모자람"
    줄 = [f"하는 일: {하는일[도구]}", "자리:"] + [f"- {{{k}}}: {v}" for k, v in 자리들[도구].items()]
    줄 += [f"꼭 쓸 자리: {{{_꼭자리[도구]}}}",
          f"새로 갈아탈 도구: {액터} (지금 쓰던 도구의 틀은 참고만)" if 갈아탐 else f"도구: {액터}",
          "지금 틀: " + json.dumps(지금틀, ensure_ascii=False)]
    if 탈말 and not 갈아탐:
        줄.append("오류: " + 탈말[:300])
    if 기록글:
        줄.append("실행 기록 끝:\n" + 기록글[-1500:])
    줄.append("입력 형식:\n" + _스키마요약(형식))
    try:
        답 = 손.한번(_틀지시, "\n".join(줄), 딥시크한도)
    except Exception as e:
        return None, f"딥시크를 못 불렀다 — {type(e).__name__}"
    값 = cost.딥시크값({"모델": "deepseek-v4-pro", "시각": 손.지금글(), "입력토큰": 답.get("입력토큰") or 0,
                      "캐시토큰": 답.get("캐시토큰") or 0, "출력토큰": 답.get("출력토큰") or 0})
    셈.돈 += 값
    셈.딥 += 값
    if 답.get("넘침"):
        return None, "딥시크 답이 한도에서 잘림"
    d = _json(답.get("글") or "") or {}
    # «입력» 껍데기가 없이 틀만 낸 답도 받는다 — 자리(«{…}») 가 들어 있으면 틀이다(진짜 시험 6)
    틀 = d.get("입력") if isinstance(d.get("입력"), dict) else (
        d if d and _자리꼴.search(json.dumps(d, ensure_ascii=False)) else None)
    왜 = _틀검사(도구, 틀, 형식)
    if 왜:
        print(f"!! 수리공 {도구} {액터}: {왜} — 딥시크 답 앞 {(답.get('글') or '')[:200]!r}")
    return (None, 왜) if 왜 else (틀, "")


def 값나누기(값매김: dict, 청구: dict, 줄수: int) -> tuple[float, float]:
    """시험에서 실제로 매겨진 사건으로 장부의 시작삯·건당을 정한다 — «start» 사건은 시작삯, 나머지는 줄 수로 나눈다."""
    사건 = 값매김.get("사건") or {}
    남 = [v for e, v in 사건.items() if "start" not in e]
    if not 청구:
        시작 = sum(v for e, v in 사건.items() if "start" in e)
        주 = 사건.get(값매김.get("주사건") or "")
        return round(시작, 6), round(주 if 주 is not None else (min(남) if 남 else 0.0), 6)
    시작 = sum(사건.get(e, 0.0) * n for e, n in 청구.items() if "start" in e)
    나머지 = sum(사건.get(e, 0.0) * n for e, n in 청구.items() if "start" not in e)
    건당 = 나머지 / max(1, 줄수)
    if 건당 <= 0:
        건당 = min(남) if 남 else 0.0
    return round(시작, 6), round(건당, 6)


def _후보들(도구: str, 지금액터: str, 지금값: float, 손) -> list[dict]:
    """같은 일의 다른 도구 — 30일 성공률 95% · 사용자 100명 · 사건별 값 · 시험 5개 값이 지금의 4배까지. 사용자 많은 순."""
    난것 = []
    for c in 손.조회.가게찾기(가게검색어[도구], 20):
        값 = c.get("값매김") or {}
        if c["액터"] == 지금액터 or c["성공률"] < 성공률선 or c["사용자30"] < 사용자선:
            continue
        if 값.get("모델") != "PAY_PER_EVENT" or not 값.get("사건"):
            continue
        한번 = 후보어림(값, 시험개수)
        if 한번 is None or 한번 > 값배수 * 지금값 + 1e-9:
            continue
        난것.append(c)
    return sorted(난것, key=lambda c: -c["사용자30"])


def _후보시험(도구: str, 후보: dict, 항목: dict, 값: dict, 기간: tuple, 손, 셈: _셈) -> tuple[dict, dict | None]:
    정보 = 손.조회.액터정보(후보["액터"])
    if not 정보 or 정보["중단"]:
        return {"통과": False, "까닭": "판매 중단이거나 정보를 못 읽음"}, None
    형식 = 손.조회.입력형식(후보["액터"])
    if not 형식:
        return {"통과": False, "까닭": "입력 형식을 못 읽음"}, None
    if any(_로그인칸.search(str(k)) for k in 형식.get("properties") or {}):
        return {"통과": False, "까닭": "로그인·쿠키 칸이 있는 도구"}, None
    틀, 왜 = _새틀(도구, 후보["액터"], 형식, 항목["입력"], "", "", 손, 셈, 갈아탐=True)
    if not 틀:
        return {"통과": False, "까닭": 왜, "멈춤": 왜.startswith(("수리 울타리", "람다 시간"))}, None
    값매김_ = 정보["값매김"]
    새칸 = {"도구": 후보["액터"], "입력": 틀, "건당": 0.0, "시작삯": 0.0}
    if 값매김_.get("최소상한"):
        새칸["최소상한"] = float(값매김_["최소상한"])
    r = 시험(새칸, 도구, 값, 기간, 손, 셈, 값매김=값매김_)
    if r.get("통과"):
        새칸["시작삯"], 새칸["건당"] = 값나누기(값매김_, r["청구"], r["줄수"])
    return r, 새칸


def _전에글있음(기억, 도구: str, 계정: str) -> bool:
    """출처 성적표에 이 계정에서 글을 가져온 판이 있었나 — 있었는데 지금 광고만 오면 도구 쪽 탓일 수 있다(@xai)."""
    if not 기억:
        return False
    플랫폼 = "x" if 도구.startswith("x_") else "instagram" if 도구.startswith("instagram") else "threads"
    카드 = 기억.출처읽기(f"{플랫폼}:{계정}") or {}
    return any((p.get("가져온글") or 0) > 0 for p in 카드.get("판들") or [])


def _계정예외(요청: dict, 장, 항목: dict, 계정: str, 손, 셈: _셈) -> dict:
    """도구는 멀쩡한데 한 계정만 광고·빈 줄 — 그 계정만 다른 도구로 읽게 한다(설계서 4장 표 «이 계정은 이 도구»)."""
    도구 = 요청["도구"]
    값 = {**(요청.get("값") or {}), "개수": 시험개수}
    try:
        시작 = (date.fromisoformat(값["시작하루전"]) + timedelta(days=1)).isoformat()
        끝 = (date.fromisoformat(값["끝다음"]) - timedelta(days=1)).isoformat()
    except (KeyError, ValueError):
        시작 = 끝 = ""
    지금값 = 어림(항목, 시험개수)
    for 후보 in _후보들(도구, 항목["도구"], 지금값, 손)[:2]:
        r, 새칸 = _후보시험(도구, 후보, 항목, 값, (시작, 끝), 손, 셈)
        if r.get("통과") and r["돈"] <= 값배수 * 지금값 + 1e-9:
            장.고치기(도구, 새칸, f"@{계정} 은 «{항목['도구']}» 로 광고·빈 줄만 와 «{후보['액터']}» 로 읽음", 셈.돈, 계정=계정)
            return {"상태": "고침", "까닭": f"@{계정} 만 «{후보['액터']}» 로 읽게 함(계정 예외)"}
        if r.get("멈춤"):
            break
    return {"상태": "글없음", "까닭": f"도구는 멀쩡하고, 다른 도구로도 @{계정} 의 기간 안 글이 안 나왔다"}


def _고칠길(요청: dict, 장, 항목: dict, 활발: dict, 기간: tuple, 손, 셈: _셈, 재현: dict) -> dict:
    """늘 활발한 대상에서도 안 된다 — ① 입력을 새 형식에 맞추기 → ② 같은 일의 다른 도구로 갈아타기(싼 것부터)."""
    도구, 탈 = 요청["도구"], 요청.get("탈") or {}
    까닭들 = [f"재현: {재현['까닭']}"]
    정보 = 손.조회.액터정보(항목["도구"])
    형식 = 손.조회.입력형식(항목["도구"]) if 정보 and not 정보["중단"] else None
    if 형식:
        실행 = 탈.get("실행")
        기록글 = 손.조회.실행기록(실행[0], 실행[1]) if 실행 else ""
        틀, 왜 = _새틀(도구, 항목["도구"], 형식, 항목["입력"], str(탈.get("말") or ""), 기록글, 손, 셈, 갈아탐=False)
        if 틀:
            r = 시험({**항목, "입력": 틀}, 도구, 활발, 기간, 손, 셈)
            if r["통과"]:
                장.고치기(도구, {"입력": 틀}, "입력 형식이 바뀌어 새 형식으로 맞춤", 셈.돈)
                return {"상태": "고침", "까닭": "입력 형식이 바뀌어 새 형식으로 맞춤"}
            까닭들.append(f"입력 맞추기 시험: {r['까닭']}")
            if r.get("멈춤"):
                return {"상태": "못고침", "까닭": " · ".join(까닭들)[:400], "사람할일": 사람할일}
        else:
            까닭들.append(f"입력 맞추기: {왜}")
    else:
        까닭들.append("지금 도구가 판매 중단이거나 입력 형식을 못 읽음")
    지금값 = 어림(항목, 시험개수)
    for 후보 in _후보들(도구, 항목["도구"], 지금값, 손)[:후보최대]:
        r, 새칸 = _후보시험(도구, 후보, 항목, 활발, 기간, 손, 셈)
        if r.get("통과") and r["돈"] <= 값배수 * 지금값 + 1e-9:
            장.고치기(도구, 새칸, f"«{항목['도구']}» 가 안 돼 «{후보['액터']}» 로 갈아탐", 셈.돈)
            return {"상태": "고침", "까닭": f"다른 도구 «{후보['액터']}» 로 갈아탐"}
        까닭들.append(후보["액터"] + ": " + (r.get("까닭") or f"값이 지금의 {값배수:g}배를 넘음"))
        if r.get("멈춤"):
            break
    return {"상태": "못고침", "까닭": " · ".join(까닭들)[:400], "사람할일": 사람할일}
