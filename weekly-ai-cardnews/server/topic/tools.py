# -*- coding: utf-8 -*-
"""도구 상자 — 지휘자가 부르는 도구 11개(설계 3장). 이름·결과 모양은 고정, 뒤의 Apify 도구는 장부에서 고른다.

한 번 부를 때: 예산 «끝» 이면 안 한다 → 꺼진 도구면 안 한다 → 같은 지문이면 안 하고 앞 증거를 알려 준다 →
실행 → 공통 모양 → 증거 창고에 번호 → 짧은 결과 글 + 남은 예산 한 줄. 예외는 밖으로 안 낸다 — 늘 글로.
실패에는 «다음에 무엇을 하라» 를 붙인다. 같은 판에서 같은 도구가 두 번 «고장·입력» 이면 그 판에서 끄고,
«돈» 이면 Apify 도구를 모두 끈다(계획 1 은 고치지 않는다 — 수리공은 계획 2).
지휘자가 한 응답에 낸 도구들은 나란히 돈다 — 증거 번호·호출 기록·작업판을 바꾸는 곳은 `현장.자물쇠` 안에서만."""
import re
import threading
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from typing import Callable

from topic import board, budget, normalize, registry, trace
from topic.apify import 도구탈
from topic.page import 페이지탈

최대한번돈 = 0.30
아피파이도구 = ("web_search", "x_search", "x_account", "instagram_search", "instagram_account", "threads_account")
_다음말 = {"입력": "도구 입력 형식이 바뀐 것 같다 — 같은 일을 다른 플랫폼 도구로 해 보라",
         "고장": "이 도구가 지금 안 된다 — 다른 플랫폼으로 옮겨라",
         "막힘": "잠시 막혔다 — 다른 도구를 먼저 쓰고 나중에 다시",
         "돈": "Apify 분량이 모자라다 — Apify 도구는 그만, 모은 것으로 정리하라",
         "이상함": "이 검색어·계정은 못 읽는다 — 결과에 «못 읽음» 으로 적고 다른 곳으로"}
_플랫폼 = {"x": "X", "instagram": "인스타", "threads": "스레드"}


@dataclass
class 현장:
    job: str
    주문서: dict
    재료: dict
    창고: object
    예산: object
    판정관: object
    실행: Callable
    읽기: Callable
    지금글: Callable[[], str]
    자물쇠: threading.Lock = field(default_factory=threading.Lock, repr=False)
    흔적: trace.흔적 = field(default_factory=trace.흔적, repr=False)  # 나만 보는 기록(Task 12-2) — 기본은 안 남김

    @property
    def 판(self) -> dict:
        return self.재료["작업판"]


def _칸(종류: str, 설명: str, **더) -> dict:
    return {"type": 종류, "description": 설명, **더}


def _함수(이름: str, 설명: str, 칸들: dict, 필수=()) -> dict:
    return {"type": "function", "function": {"name": 이름, "description": 설명, "parameters": {
        "type": "object", "properties": 칸들, "required": list(필수)}}}


_곳설명 = "x:계정 · instagram:계정 · threads:계정 · web:도메인 · page:도메인 꼴"
도구설명 = [
    _함수("update_board", "작업판에 판단을 적는다 — 생각의 사슬이 남는 곳. 판단이 바뀔 때마다 바로 적어라(대화는 언제든 "
                         "끊기고 작업판만 남는다). 근거는 증거 번호로.", {
        "stage": _칸("string", "지금 단계", enum=list(board.단계이름)),
        "judgment": _칸("string", "이번에 바뀐 판단 한 줄 — 사람 화면에 그대로 뜬다. 예: «x:cortis_official 공식 — 소속사 사이트가 "
                                  "이 계정을 링크, 최근 글 5개 모두 공지»"),
        "guess_map": _칸("array", "② 짐작 지도 — 이 소식이 있을 확률이 높은 곳을 순서대로, 까닭과 함께(통째로 바꾼다)",
                         items={"type": "object", "properties": {"place": _칸("string", _곳설명), "why": _칸("string", "까닭")},
                                "required": ["place", "why"]}),
        "source_verdicts": _칸("array", "출처 판정 — 들어가 본 곳이 공식인지", items={"type": "object", "properties": {
            "place": _칸("string", _곳설명), "verdict": _칸("string", "판정", enum=list(board.판정들)),
            "basis": _칸("string", "근거 — 증거 번호나 확인한 사실")}, "required": ["place", "verdict", "basis"]}),
        "closed": _칸("array", "닫은 길 — 더 안 볼 곳과 까닭", items={"type": "object", "properties": {
            "place": _칸("string", _곳설명), "why": _칸("string", "까닭")}, "required": ["place", "why"]}),
        "events": _칸("array", "사건 묶기 — 같은 일을 다룬 글을 사건 하나로. 이름이 같으면 합친다", items={
            "type": "object", "properties": {"name": _칸("string", "사건 이름"),
                                             "evidence": _칸("array", "증거 번호들", items={"type": "string"}),
                                             "status": _칸("string", "상태", enum=list(board.사건상태)),
                                             "note": _칸("string", "메모")}, "required": ["name"]}),
    }, ["judgment"]),
    _함수("web_search", "웹·뉴스 검색 — 제목·주소·날짜·요약. 공식 사이트·공식 계정 찾기, 기사 찾기용. 기본은 주문서 기간 안 "
                       "결과만, use_period=false 면 기간 없이(공식 계정·소속사 찾기처럼 날짜와 상관없을 때).", {
        "query": _칸("string", "짧은 검색어"), "region": _칸("string", "kr 한국어 결과(기본) · us 영어 결과", enum=["kr", "us"]),
        "use_period": _칸("boolean", "기간 안만 (기본 true)")}, ["query"]),
    _함수("x_search", "X 글을 검색어로 찾는다 — 주문서 기간 안만. 특정 계정의 글이면 x_account 를 써라.", {
        "query": _칸("string", "짧은 검색어 (X 검색 문법 가능)"), "count": _칸("integer", "몇 건 (1~60, 기본 20)"),
        "sort": _칸("string", "Top 인기순(기본) · Latest 최신순", enum=["Top", "Latest"])}, ["query"]),
    _함수("x_account", "X 계정 보기 — 계정 정보(인증·팔로워·소개)와 글. deep=false 면 최근 5개만(떠 보기, 기간 상관없이 — "
                       "공식인지·활발한지 볼 때), deep=true 면 주문서 기간 전체(최대 count).", {
        "account": _칸("string", "계정 이름(@ 없어도 됨)"), "deep": _칸("boolean", "기간 전체를 깊게 (기본 false)"),
        "count": _칸("integer", "deep 일 때 몇 건 (기본 40, 최대 100)")}, ["account"]),
    _함수("instagram_search", "인스타 게시물을 해시태그나 낱말로 찾는다. 기간을 못 정해서 최근·인기 위주로 오고, 기간 밖은 "
                             "숨긴다. 팬 글이 많다 — 공식 계정을 찾는 단서로 써라.", {
        "query": _칸("string", "해시태그(# 없이)나 낱말"), "keyword": _칸("boolean", "true 면 낱말 검색, false 면 해시태그(기본)"),
        "count": _칸("integer", "몇 건 (1~40, 기본 20)")}, ["query"]),
    _함수("instagram_account", "인스타 계정 보기 — deep=false 면 계정 정보(인증·팔로워·소개·링크) + 최근 게시물 12개, "
                              "deep=true 면 주문서 기간 시작 이후 게시물(최대 count). 릴스는 영상 주소가 온다.", {
        "account": _칸("string", "계정 이름"), "deep": _칸("boolean", "기간 전체 (기본 false)"),
        "count": _칸("integer", "deep 일 때 몇 건 (기본 30, 최대 60)")}, ["account"]),
    _함수("threads_account", "스레드 계정의 최근 글 — 계정마다 최근 4~8개뿐이고 날짜를 못 정한다. «오늘·이번 주» 소식에서 "
                            "X·인스타에 영상이 없을 때만 써라.", {
        "accounts": _칸("array", "계정 이름들 (최대 5)", items={"type": "string"})}, ["accounts"]),
    _함수("read_page", "기사·공식 사이트 읽기 — 제목·발행일·본문 앞부분·SNS 링크 목록(공식 계정 찾기)·사진 후보(E7#1 꼴 "
                      "번호). 로그인·유료 벽이면 «못 읽음».", {"url": _칸("string", "주소")}, ["url"]),
    _함수("view_images", "사진 후보를 판정관(그림을 보는 모델)이 장면/로고/기자얼굴/광고/무관으로 가른다. 그 글·기사에서 "
                        "나온 사진만 — read_page 사진 후보(E7#1)나 글의 사진(E3#1). 한 번에 4장까지.", {
        "images": _칸("array", "사진 번호들", items={"type": "string"})}, ["images"]),
    _함수("get_evidence", "증거 번호로 원본을 다시 본다 — 글 전체·미디어·계정 소개처럼 작업판에 없는 세부가 필요할 때만. "
                         "한 번에 5개까지.", {"ids": _칸("array", "증거 번호들", items={"type": "string"})}, ["ids"]),
    _함수("submit_result", "소식 묶음을 낸다 → 관문이 검사한다(증거 번호가 이번 판 것인가 · 발췌가 원문에 글자 그대로 있나 · "
                          "날짜가 기간 안인가 · 요약의 숫자가 발췌에 있나 · 미디어가 그 글에 붙은 것인가). 칸이 비었는데 "
                          "예산이 남았으면 아직 내지 마라.", {
        "items": _칸("array", "소식들", items={"type": "object", "properties": {
            "hero": _칸("string", "칩에 들어갈 말 — 한 장의 주인공(멤버 이름·«그룹»·회사)"),
            "event": _칸("string", "사건 이름 (작업판과 같게)"),
            "summary": _칸("string", "2~3문장. 문장마다 끝에 [E3] 처럼 증거 번호. 숫자·날짜는 발췌에 있는 것만, «지난주·"
                                     "최근» 대신 절대 날짜"),
            "date": _칸("string", "원문 게시일 YYYY-MM-DD"),
            "source": _칸("string", "1차 출처 증거 번호 — 공식 계정 글·회사 발표·주요 언론"),
            "quote": _칸("string", "source 원문에서 글자 그대로 옮긴 발췌 (요약의 사실이 다 들어 있게)"),
            "media": _칸("string", "미디어 — source 글 자체(E3), 그 글의 사진(E3#1), 기사 사진 후보(E7#1), 없으면 «없음»"),
            "tags": _칸("array", "딱지", items={"type": "string", "enum": ["2차", "불확실"]})},
            "required": ["hero", "event", "summary", "date", "source", "quote", "media"]}),
        "unfilled": _칸("array", "못 채운 칸 — 어디까지 찾아봤고 왜 없는지", items={"type": "object", "properties": {
            "slot": _칸("string", "어떤 칸"), "searched": _칸("array", "찾아본 곳 (" + _곳설명 + ")", items={"type": "string"}),
            "why": _칸("string", "왜 없는지"), "more_cost": _칸("string", "더 쓰면 얼마")},
            "required": ["slot", "searched", "why"]})}, ["items"]),
]
이름들 = tuple(d["function"]["name"] for d in 도구설명)


# ── 공통 ─────────────────────────────────────────────────────────────────

def _값(현: 현장, **더) -> dict:
    시작, 끝 = date.fromisoformat(현.주문서["시작"]), date.fromisoformat(현.주문서["끝"])
    utc = lambda d: (datetime.combine(d, time()) - timedelta(hours=9)).strftime("%Y-%m-%d_%H:%M:%S_UTC")  # noqa: E731
    return {"시작UTC": utc(시작), "끝UTC": utc(끝 + timedelta(days=1)), "시작하루전": (시작 - timedelta(days=1)).isoformat(),
            "끝다음": (끝 + timedelta(days=1)).isoformat(), **더}


def _아피파이(현: 현장, 장부이름: str, 값: dict, 개수: int) -> list:
    항목 = registry.읽기()[장부이름]
    상한 = round(min(최대한번돈, max(0.01, 항목.get("시작삯", 0) + 항목["건당"] * 개수 * 1.2)), 4)
    상한 = max(상한, 항목.get("최소상한", 0))  # 도구가 정한 최저 상한(구글 검색 $0.50) — 청구는 쓴 만큼
    결과 = 현.실행(항목["도구"], registry.채우기(항목["입력"], 값), 상한)
    with 현.자물쇠:
        현.재료.setdefault("아피파이기록", []).append({
            "도구": 장부이름, "액터": 항목["도구"], "건수": len(결과["것들"]),
            "돈": registry.값셈(항목, 결과["청구"], len(결과["것들"])), "걸음": 현.재료.get("지금걸음"),
            "시각": 현.지금글()})
    return 결과["것들"]


def _넣기(현: 현장, 글들: list, 출처: str) -> tuple[list, int]:
    o, 번호들, 새것 = 현.주문서, [], 0
    with 현.자물쇠:
        for g in 글들:
            g = {**g, "기간밖": bool(g.get("날짜")) and not (o["시작"] <= g["날짜"] <= o["끝"])}
            번, 새 = 현.창고.넣기(g, 출처)
            번호들.append(번)
            새것 += 새
    return 번호들, 새것


def _글한줄(x: dict, 배수: float) -> str:
    r, 정보 = x.get("반응") or {}, x.get("계정정보") or {}
    if x["플랫폼"] in _플랫폼:
        누구 = f"{_플랫폼[x['플랫폼']]} @{x['계정']}" + (" ✓인증" if 정보.get("인증") else "")
    else:
        누구 = x.get("계정", "")
    반응 = (f" ♥{r.get('좋아요', 0):,}" + (f" ↻{r['공유']:,}" if r.get("공유") else "")
          + (f" ▶{r['조회']:,}" if r.get("조회") else "")) if r else ""
    배 = f" 평소의 {배수:g}배" if 배수 and 배수 >= 1.5 else ""
    미 = x.get("미디어") or []
    영상 = next((m for m in 미 if m["갈래"] == "영상"), None)
    미디어 = (f"영상 {영상['가로']}x{영상['세로']}" if 영상 and 영상.get("가로") else "영상") if 영상 else \
        "사진" if 미 else "미디어 없음"
    본 = (x["제목"] + " — " if x.get("제목") else "") + re.sub(r"\s+", " ", x.get("글") or "")[:90]
    return (f"{x['번호']} · {누구} · {x.get('날짜') or '날짜 모름'}{반응}{배} · {미디어}"
            + (" · 답글" if x.get("답글") else "") + f' · "{본}"')


def _결과글(현: 현장, 머리: str, 번호들: list, 버림: int = 0) -> str:
    # 나란히 도는 다른 도구가 창고에 넣는 동안 훑으면 «dictionary changed size» 로 판이 실패한다 — 읽기도 자물쇠 안(최종 검토)
    with 현.자물쇠:
        return _결과글안(현, 머리, 번호들, 버림)


def _결과글안(현: 현장, 머리: str, 번호들: list, 버림: int) -> str:
    안 = [b for b in 번호들 if not 현.창고.꺼내기(b).get("기간밖")]
    밖 = len(번호들) - len(안)
    줄 = [f"{머리} — {len(번호들)}건" + (f" (기간 밖 {밖}건 숨김)" if 밖 else "") + (f" (광고·빈 줄 {버림}건 버림)" if 버림 else "")]
    줄 += [_글한줄(현.창고.꺼내기(b), 현.창고.배수(b)) for b in 안[:25]]
    if len(안) > 25:
        줄.append(f"…그 밖 {len(안) - 25}건은 get_evidence 로 ({안[25]}~{안[-1]})")
    if not 번호들:
        줄.append("0건 — 검색어를 바꾸거나(짧게, 영문·한글 둘 다) 다른 도구로")
    return "\n".join(줄)


def _계정머리(정보: dict, 플랫폼: str, 계정: str) -> str:
    if not 정보:
        return f"{_플랫폼[플랫폼]} @{계정}"
    return (f"{_플랫폼[플랫폼]} @{계정}" + (" ✓인증" if 정보.get("인증") else " (인증 없음)")
            + f" · 팔로워 {정보.get('팔로워', 0):,} · 소개: {(정보.get('소개') or '-')[:80]}"
            + (f" · 링크: {정보['링크']}" if 정보.get("링크") else ""))


def _개수(값, 기본: int, 최대: int) -> int:
    return max(1, min(최대, int(값 if 값 is not None else 기본)))


class _이상함(Exception):
    pass


# ── 도구마다 ──────────────────────────────────────────────────────────────

def _x(현, 원본, 머리, 출처):
    글들, 버림 = normalize.x글들(원본)
    if 원본 and not 글들:
        raise _이상함(f"가져온 {len(원본)}줄이 전부 광고·빈 줄이다")
    번호들, 새것 = _넣기(현, 글들, 출처)
    정보 = (글들[0].get("계정정보") if 글들 else None) or {}
    return 머리(정보) if callable(머리) else 머리, 번호들, 새것, 버림


def x_search(현, 인자, 출처):
    질 = str(인자["query"]).strip()
    개수, 정렬 = _개수(인자.get("count"), 20, 60), 인자.get("sort") if 인자.get("sort") in ("Top", "Latest") else "Top"
    원본 = _아피파이(현, "x_search", _값(현, 검색어=질, 개수=개수, 정렬=정렬), 개수)
    머리, 번호들, 새것, 버림 = _x(현, 원본, f"x_search «{질}»", 출처)
    return f"x_search «{질}» {정렬} {개수}", _결과글(현, 머리, 번호들, 버림), 번호들, 새것


def x_account(현, 인자, 출처):
    계정 = str(인자["account"]).strip().lstrip("@")
    깊게 = bool(인자.get("deep"))
    개수 = _개수(인자.get("count"), 40, 100) if 깊게 else 5
    원본 = _아피파이(현, "x_account_기간" if 깊게 else "x_account", _값(현, 계정=계정, 개수=개수), 개수)
    머리, 번호들, 새것, 버림 = _x(현, 원본, lambda 정보: _계정머리(정보, "x", 계정.lower()), 출처)
    요약 = f"x_account @{계정} ({'깊게 ' + str(개수) if 깊게 else '떠 보기'})"
    return 요약, _결과글(현, 머리, 번호들, 버림), 번호들, 새것


def instagram_search(현, 인자, 출처):
    질 = str(인자["query"]).strip().lstrip("#")
    개수 = _개수(인자.get("count"), 20, 40)
    원본 = _아피파이(현, "instagram_search", _값(현, 검색어=질, 개수=개수, 낱말검색=bool(인자.get("keyword"))), 개수)
    번호들, 새것 = _넣기(현, normalize.인스타글들(원본), 출처)
    return f"instagram_search «{질}»", _결과글(현, f"instagram_search «{질}»", 번호들), 번호들, 새것


def instagram_account(현, 인자, 출처):
    계정 = str(인자["account"]).strip().lstrip("@").lower()
    if 인자.get("deep"):
        개수 = _개수(인자.get("count"), 30, 60)
        글들, 정보 = normalize.인스타글들(_아피파이(현, "instagram_account_기간", _값(현, 계정=계정, 개수=개수), 개수)), {}
        요약 = f"instagram_account @{계정} (깊게 {개수})"
    else:
        원본 = _아피파이(현, "instagram_account", _값(현, 계정=계정), 1)
        정보, 글들 = normalize.인스타프로필(원본[0]) if 원본 else ({}, [])
        요약 = f"instagram_account @{계정} (떠 보기)"
    번호들, 새것 = _넣기(현, 글들, 출처)
    return 요약, _결과글(현, _계정머리(정보, "instagram", 계정), 번호들), 번호들, 새것


def threads_account(현, 인자, 출처):
    계정들 = [str(a).strip().lstrip("@").lower() for a in 인자["accounts"]][:5]
    원본 = _아피파이(현, "threads_account", _값(현, 계정들=계정들), len(계정들))
    머리들, 번호들, 새것 = [], [], 0
    for 한줄 in 원본:
        정보, 글들 = normalize.스레드프로필(한줄)
        머리들.append(_계정머리(정보, "threads", 정보["계정"]))
        b, n = _넣기(현, 글들, 출처)
        번호들 += b
        새것 += n
    요약 = "threads_account " + ", ".join("@" + a for a in 계정들)
    return 요약, "\n".join(머리들) + "\n" + _결과글(현, 요약, 번호들), 번호들, 새것


def web_search(현, 인자, 출처):
    질 = str(인자["query"]).strip()
    나라, 언어 = ("us", "en") if 인자.get("region") == "us" else ("kr", "ko")
    기간 = 인자.get("use_period") is not False
    원본 = _아피파이(현, "web_search" if 기간 else "web_search_전체", _값(현, 검색어=질, 나라=나라, 언어=언어), 10)
    번호들, 새것 = _넣기(현, normalize.구글결과(원본), 출처)
    요약 = f"web_search «{질}»" + ("" if 기간 else " (기간 없이)")
    return 요약, _결과글(현, 요약, 번호들), 번호들, 새것


def read_page(현, 인자, 출처):
    d = 현.읽기(str(인자["url"]).strip())
    번호들, 새것 = _넣기(현, [d], 출처)
    번 = 번호들[0]
    줄 = [f"{번} · {d['계정']} · {d.get('날짜') or '날짜 모름'} · {d.get('제목') or '제목 없음'}",
         re.sub(r"\s+", " ", d.get("글") or "")[:600]]
    if d.get("링크"):
        줄.append("SNS 링크: " + ", ".join(d["링크"]))
    if d.get("사진후보"):
        줄.append("사진 후보: " + ", ".join(f"{번}#{i} ({x.get('설명') or '-'})" for i, x in enumerate(d["사진후보"], 1)))
    return f"read_page {d['주소'][:80]}", "\n".join(줄), 번호들, 새것


def _사진주소(현, 번호: str) -> str | None:
    m = re.fullmatch(r"(E\d+)#(\d+)", 번호.strip())
    x = 현.창고.꺼내기(m.group(1)) if m else None
    if not x:
        return None
    후보 = x.get("사진후보") or [{"주소": y.get("대표화면") or y["주소"]} for y in x.get("미디어") or []]
    i = int(m.group(2)) - 1
    return 후보[i]["주소"] if 0 <= i < len(후보) else None


def view_images(현, 인자, 출처):
    요청 = [str(b).strip() for b in 인자["images"]][:4]
    후보 = [{"번호": b, "주소": _사진주소(현, b)} for b in 요청]
    판정 = 현.판정관.사진들([x for x in 후보 if x["주소"]]) if any(x["주소"] for x in 후보) else {}
    with 현.자물쇠:
        for b, 갈래 in 판정.items():
            번, 차례 = b.split("#")
            현.창고.꺼내기(번).setdefault("사진판정", {})[차례] = 갈래
    글 = " · ".join(f"{x['번호']} {판정.get(x['번호'], '없는 번호')}" for x in 후보)
    return "view_images " + ", ".join(요청), "사진 판정: " + 글, [], 0


def get_evidence(현, 인자):
    줄 = []
    for b in [str(x).strip() for x in 인자["ids"]][:5]:
        x = 현.창고.꺼내기(b)
        if not x:
            줄.append(f"{b}: 없는 번호")
            continue
        미 = "; ".join(f"{m['갈래']} {m['주소'][:100]}" for m in x.get("미디어") or []) or "없음"
        줄.append(f"{b} · {x['플랫폼']} {x.get('계정', '')} · {x.get('날짜') or '날짜 모름'} · {x['주소']}\n"
                 f"계정 정보: {x.get('계정정보') or '-'}\n반응: {x.get('반응') or '-'} · 미디어: {미}\n"
                 f"글: {(x.get('제목') + ' — ') if x.get('제목') else ''}{(x.get('글') or '')[:3000]}")
    return "\n\n".join(줄)


_손잡이 = {"x_search": x_search, "x_account": x_account, "instagram_search": instagram_search,
         "instagram_account": instagram_account, "threads_account": threads_account, "web_search": web_search,
         "read_page": read_page, "view_images": view_images}


def _끄기(현: 현장, 이름: str, 종류: str, 말: str) -> None:
    판 = 현.판
    if 종류 == "돈":
        for 도구 in 아피파이도구:
            판["꺼진도구"].setdefault(도구, "Apify 분량이 모자라다")
    elif 종류 in ("고장", "입력"):
        if sum(1 for x in 현.예산.기록 if x["도구"] == 이름 and x["탈"].startswith(("고장", "입력"))) >= 2:
            판["꺼진도구"].setdefault(이름, f"두 번 실패 ({말[:80]})")


def 부르기(현: 현장, 호출: dict) -> str:
    이름, 인자 = 호출.get("이름") or "", 호출.get("인자") or {}
    if 호출.get("인자탈"):
        return f"{호출['인자탈']} — 인자를 JSON 객체로 다시 불러라."
    if 이름 not in 이름들:
        return f"없는 도구 «{이름}» — 쓸 수 있는 것: {', '.join(이름들)}"
    try:
        if 이름 == "update_board":
            return board.적기(현.판, 인자, 현.지금글(), lambda b: 현.창고.꺼내기(b) is not None)
        if 이름 == "get_evidence":
            return get_evidence(현, 인자)
        if 이름 == "submit_result":
            if not isinstance(인자.get("items"), list):
                return "items 는 소식 목록이어야 한다 — 다시 submit_result"
            현.재료["제출"] = {"items": 인자["items"], "unfilled": 인자.get("unfilled") or [], "시각": 현.지금글()}
            return "받았다 — 관문이 검사한다. 걸린 것이 있으면 작업판 «관문이 돌려보낸 것» 에 적혀 돌아온다."
        한줄 = 현.예산.한줄
        if 현.예산.상태() == "끝":
            return "예산을 다 썼다 — 이제 submit_result 만 부를 수 있다.\n" + 한줄()
        if 이름 in 현.판["꺼진도구"]:
            return f"{이름} 는 이 판에서 껐다 — {현.판['꺼진도구'][이름]}. 다른 도구로.\n" + 한줄()
        지 = budget.지문(이름, 인자)
        앞 = 현.예산.했나(지)
        if 앞:
            with 현.자물쇠:
                현.판["경고"].append(f"같은 호출 반복 막음: {앞['요약']}")
            범위 = (f"{앞['증거'][0]}~{앞['증거'][-1]}" if len(앞["증거"]) > 1 else (앞["증거"] or ["0건"])[0])
            return f"같은 호출을 이미 했다(→ {범위}). get_evidence 로 다시 보거나 다른 검색어·도구로.\n" + 한줄()
        출처 = f"{이름}#{현.예산.호출수() + 1}"
        try:
            요약, 글, 번호들, 새것 = _손잡이[이름](현, 인자, 출처)
        except (도구탈, _이상함, 페이지탈) as e:
            종류 = e.종류 if isinstance(e, 도구탈) else "이상함" if isinstance(e, _이상함) else "못읽음"
            말 = e.말 if isinstance(e, 도구탈) else str(e)
            with 현.자물쇠:
                현.예산.적기({"도구": 이름, "인자": 인자, "지문": "탈:" + 지, "요약": f"{이름} {인자}"[:120], "증거": [],
                           "새것": 0, "돈": 0, "탈": f"{종류}: {말}"[:200], "걸음": 현.재료.get("지금걸음"),
                           "시각": 현.지금글()})
                _끄기(현, 이름, 종류, 말)
            다음 = _다음말.get(종류, "다른 기사·다른 도구로")
            return f"{이름} 실패({종류}) — {말}. {다음}.\n" + 한줄()
        except (KeyError, TypeError, ValueError):
            raise  # 인자가 틀린 것 — 바깥에서 «인자가 맞지 않다»
        except Exception as e:  # 모르는 고장도 판을 멈추지 않고 탈로 적는다 — 예산·같은 호출 막기에 세어지게(최종 검토)
            말 = f"{type(e).__name__}: {str(e)[:100]}"
            with 현.자물쇠:
                현.예산.적기({"도구": 이름, "인자": 인자, "지문": "탈:" + 지, "요약": f"{이름} {인자}"[:120], "증거": [],
                           "새것": 0, "돈": 0, "탈": f"오류: {말}"[:200], "걸음": 현.재료.get("지금걸음"),
                           "시각": 현.지금글()})
                _끄기(현, 이름, "고장", 말)
            return f"{이름} 실패(오류) — {말}. 다른 도구로.\n" + 한줄()
        with 현.자물쇠:
            현.예산.적기({"도구": 이름, "인자": 인자, "지문": 지, "요약": 요약, "증거": 번호들, "새것": 새것,
                       "돈": 0, "탈": "", "걸음": 현.재료.get("지금걸음"), "시각": 현.지금글()})
        return 글 + "\n" + 한줄()
    except (KeyError, TypeError, ValueError) as e:
        return f"인자가 맞지 않다 — {type(e).__name__}: {e}. 도구 설명의 칸 이름대로 다시."
