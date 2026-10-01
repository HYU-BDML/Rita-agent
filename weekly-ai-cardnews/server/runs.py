# -*- coding: utf-8 -*-
"""한 판을 다섯 번에 나눠 달린다 — 소식 / 본문 / 표지 / 그림 / 굽기.

Dify 판의 순서를 그대로 따르되, Dify 의 한계 때문에 붙어 있던 장치(펼쳐 놓은 «다 됐나» 13개,
같은 검사 세 벌, 갈림길 넷)는 반복문으로 바꿨다. 옮긴 코드(nodes/)는 한 글자도 안 고쳤다 —
빈 값 확인은 여기, 단계 사이에서 한다(설계 «오류 막기»).

한 달리기가 끝나면 기록을 창고에 적고 다음 달리기를 부른다. 어디서 멈추든 기록에 «왜» 가 남는다.
"""
import json
import re
import statistics
import time
import traceback
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import Callable

import cost
import poll
import prompts
import store

단계순서 = ["소식", "본문", "표지", "그림", "굽기"]
소식최대초 = 360
장당최대초 = 360
묻는간격 = 10
동시굽기 = 5  # 계정의 람다 동시 한도 10 을 카드뉴스와 나눠 쓴다(설계 «한 판이 도는 순서»)
동시그림 = 4
기본한도 = 32000   # 딥시크 max_tokens — Dify 판과 같다. 넘치면 두 배씩
최대한도 = 128000  # 여기서도 넘치면 멈춘다. «이어서 다시» 는 이 한도로 한 번 더
부르기전필요초 = 840  # deepseek.읽기상한 780 + 여유. 이보다 적게 남았으면 새 달리기로 넘긴다
CTA로고, CTA계정 = "HANYANG NEWS", "@hanyang_news"  # 마지막 장 — 옛 판은 AI FREAKS · @ai_freaks.kr


class 멈춤(Exception):
    """사람에게 보여 줄 한 줄로 멈춘다."""


class 이어달리기(Exception):
    """람다 시간이 모자라다 — 한 것은 기록에 적었으니 같은 단계를 새 달리기로 잇는다."""


@dataclass
class 손:
    옛서버: object
    딥시크: Callable[[str, str], str]
    그림: Callable[[str], bytes]
    창고: object
    노드: object
    잠자기: Callable[[float], None] = time.sleep
    지금: Callable[[], float] = time.monotonic
    다음부르기: Callable[[str, str], None] = lambda job, 단계: None
    남은초: Callable[[], float] = lambda: 900.0


def 새기록(job: str, 주: str, 해: int) -> dict:
    return {"job": job, "week": 주, "year": 해, "state": "만드는 중", "pct": 0, "step": "시작 기다리는 중",
            "단계": "소식", "steps": [], "result": None, "error": None,
            "started": store.지금시각(), "updated": store.지금시각(), "재료": {}, "cost": None}


def _첫줄(글: str) -> str:
    글 = (글 or "").strip()
    return 글.splitlines()[0][:300] if 글 else "이유 없음"


def _가리기(글: str) -> str:
    """기록·로그에 열쇠처럼 생긴 글자가 새지 않게 가린다(설계 «오류 막기»)."""
    return re.sub(r"(sk-|AIza|apify_api_)[A-Za-z0-9_\-]{6,}", lambda m: m.group(1) + "***", 글)


def _시작(기록, 이름, 손):
    """마지막 단계가 같은 이름으로 «하는 중» 이면 이어 달리기다 — 새 줄을 안 만들고 그 줄을 잇는다."""
    마지막 = 기록["steps"][-1] if 기록["steps"] else None
    if 마지막 and 마지막["name"] == 이름 and 마지막["state"] == "하는 중":
        단계 = 마지막
    else:
        단계 = {"name": 이름, "state": "하는 중", "sec": 0, "note": ""}
        기록["steps"].append(단계)
    시작 = 손.지금() - 단계["sec"]  # 앞 달리기에서 쓴 시간까지 센다
    단계["_시작"] = 시작
    기록["step"] = 이름
    손.창고.쓰기(기록)
    return 단계, 시작


def _시간적기(기록, 손):
    for 단계 in 기록["steps"]:
        if "_시작" in 단계:
            단계["sec"] = round(손.지금() - 단계.pop("_시작"))


def _끝(기록, 단계, 시작, 손, 적을말="", pct=None):
    단계.pop("_시작", None)
    단계.update(state="됨", sec=round(손.지금() - 시작), note=적을말)
    if pct is not None:
        기록["pct"] = pct
    손.창고.쓰기(기록)


def _실패(기록, 말, 손):
    _시간적기(기록, 손)
    기록["cost"] = cost.합계(기록.get("재료") or {})
    for 단계 in 기록["steps"]:
        if 단계["state"] == "하는 중":
            단계["state"] = "실패"
    기록.update(state="실패", error=_가리기(말)[:500])
    손.창고.쓰기(기록)


def 달리기(job: str, 이번: str, 손: 손) -> dict:
    기록 = 손.창고.읽기(job)
    if 기록 is None:
        print(f"!! {job} 기록이 없다 — [{이번}] 달리기를 안 한다")
        return {"ok": False}
    try:
        {"소식": 소식, "본문": 본문, "표지": 표지, "그림": 그림, "굽기": 굽기}[이번](기록, 손)
        기록["cost"] = cost.합계(기록["재료"])
        다음 = 단계순서.index(이번) + 1
        if 다음 < len(단계순서):
            기록["단계"] = 단계순서[다음]
            손.창고.쓰기(기록)
            손.다음부르기(job, 단계순서[다음])
        else:
            기록.update(state="됨", pct=100, step="끝")
            손.창고.쓰기(기록)
    except 이어달리기:
        _시간적기(기록, 손)
        기록["cost"] = cost.합계(기록["재료"])
        손.창고.쓰기(기록)
        손.다음부르기(job, 이번)
    except 멈춤 as e:
        _실패(기록, str(e), 손)
    except Exception as e:
        print(_가리기(f"!! {job} [{이번}] {type(e).__name__}: {e}\n{traceback.format_exc()}"))
        _실패(기록, f"{이번} 단계에서 오류 — {type(e).__name__}: {e}", 손)
    return {"ok": True}


# ── 소식 ────────────────────────────────────────────────────────────────

def _X계정수(d: dict) -> int:
    """옛 서버 명단(procure/week.py)에서 센다 — 명단이 바뀌어도(2026-10-01 Grok 뺌) 따라간다."""
    return sum(len([a for a in (b.get("x계정") or "").split(",") if a.strip()]) for b in d.get("브랜드") or [])


def _X실패수(d: dict) -> int:
    return sum(1 for t in d.get("탈") or [] if " X(@" in str(t))


def _빠진까닭(브랜드: str, d: dict) -> str:
    for t in d.get("탈") or []:
        if str(t).startswith(브랜드 + " X"):
            return "X 계정을 못 읽음"
    return "그 주에 고를 소식이 없음"


def 소식(기록, 손):
    단계, 시작 = _시작(기록, "소식 긁기", 손)
    for 몇번째 in (1, 2):
        번 = 손.옛서버.소식긁기(기록["week"], 기록["year"])
        d = poll.기다리기(손.옛서버.번호표, 번, 소식최대초, 묻는간격, 손.잠자기, 손.지금)
        if d.get("timed_out"):
            raise 멈춤(f"소식 긁기가 {소식최대초 // 60}분 안에 안 끝남")
        if d.get("state") != "됨":
            raise 멈춤(f"소식 긁기 실패 — {d.get('error') or d.get('why') or d.get('state')}")
        실패 = _X실패수(d)
        계정수 = _X계정수(d)
        if 실패 * 2 <= 계정수:
            break
        if 몇번째 == 1:
            단계["note"] = f"X {계정수}곳 중 {실패}곳 못 읽음 — 90초 뒤 다시 긁기"
            손.창고.쓰기(기록)
            손.잠자기(90)
    else:
        raise 멈춤(f"소식 긁기 실패 — X {계정수}곳 중 {실패}곳 못 읽음 (Apify 가 흔들린 것일 수 있음)")
    셈 = d.get("count") or {}
    _끝(기록, 단계, 시작, 손, f"X {셈.get('x', 0)}건 · 블로그 {셈.get('blog', 0)}건", 20)

    단계, 시작 = _시작(기록, "소식 고르기", 손)
    try:
        골라 = 손.노드.pick_news.main(body=json.dumps(d, ensure_ascii=False))
    except Exception as e:
        raise 멈춤(f"이 주에 고를 소식이 없음 — {e}"[:400]) from e
    if not 골라.get("count"):
        raise 멈춤("이 주에 고를 소식이 없음" + (f" — 빠진 브랜드: {골라['dropped']}" if 골라.get("dropped") else ""))
    빠진 = [b.strip() for b in (골라.get("dropped") or "").split(",") if b.strip()]
    순서 = _배수순서(d, 골라["picked"], 손)
    news, picked = _줄세우기(골라["news"], 골라["picked"], 순서)
    기록["재료"].update(news=news, picked=picked, count=골라["count"], 순서=순서,
                      missing_brands=[{"brand": b, "why": _빠진까닭(b, d)} for b in 빠진])
    _끝(기록, 단계, 시작, 손, f"{골라['count']}건" + (f" ({', '.join(빠진)} 없음)" if 빠진 else "")
        + f" · 첫 소식 {순서[0]['brand']} (평소의 {순서[0]['배수']:g}배 인기)", 25)


_계정꼴 = re.compile(r"(?:x\.com|twitter\.com|threads\.(?:net|com))/@?([A-Za-z0-9_.]+)")


def _계정(주소: str) -> str:
    m = _계정꼴.search(주소 or "")
    return m.group(1).lower() if m else ""


def _배수순서(d: dict, picked: list, 손) -> list:
    """회사마다 «고른 글의 반응 ÷ 그 글을 올린 계정이 그 주에 올린 글들 반응의 가운데값» — 큰 것부터.

    원래 사람 판은 그 주 가장 큰 소식을 첫 장에 두었고, 표지 주인공도 첫 소식의 회사다. 명단 순서대로
    두면 ChatGPT 가 늘 첫 장·표지였다. 반응 수 그대로 줄 세우면 팔로워가 많은 곳이 늘 이기니,
    «평소보다 몇 배 터졌나» 로 본다 — 사용자 «100 나오던 게 1000 나온 것이 1000 나오던 게 1200 나온
    것보다 먼저» (2026-10-01). 반응은 소식 고르기와 같은 셈(좋아요 + 리트윗).

    **평소는 계정마다 센다.** 회사 단위로 섞으면 @OpenAI(평소 4,766)와 @OpenAIDevs 가 섞여 평소가
    188 이 되고 ChatGPT 가 312배로 늘 1등이었다(9월 3주차 실측). 계정별로 세면 Claude 가 154배로 1등."""
    반응 = 손.노드.pick_news.반응
    계정별 = {}
    for b in d.get("브랜드") or []:
        for c in (b.get("x") or []) + (b.get("threads") or []):
            if c.get("url"):
                계정별.setdefault(_계정(c["url"]), []).append(반응(c))
    줄 = []
    for p in picked:
        수들 = 계정별.get(_계정(p.get("x_url"))) or [0]
        평소 = statistics.median(수들)
        줄.append({"brand": p["brand"], "계정": _계정(p.get("x_url")), "반응": 반응(p), "평소": 평소,
                  "배수": round(반응(p) / max(평소, 1), 1)})
    return sorted(줄, key=lambda x: -x["배수"])


def _줄세우기(news: str, picked: list, 순서: list) -> tuple:
    """소식 글(«라벨\\n\\n[브랜드] …\\n\\n[브랜드] …»)과 picked 를 `순서` 대로 다시 놓는다 — 둘은 같은 차례다."""
    머리, 몸 = news.split("\n\n", 1)
    덩어리 = dict(zip([p["brand"] for p in picked], 몸.split("\n\n"), strict=True))
    짝 = {p["brand"]: p for p in picked}
    브랜드들 = [x["brand"] for x in 순서]
    return 머리 + "\n\n" + "\n\n".join(덩어리[b] for b in 브랜드들), [짝[b] for b in 브랜드들]


# ── 딥시크 한 번 — 저장하면서 ──────────────────────────────────────────────

def _딥시크(기록, 열쇠: str, 지시문: tuple, 손) -> str:
    """`열쇠` 자리의 대본 하나. 이미 써 둔 것이면 다시 안 부른다(이어 달리기·이어서 다시).

    넘치면 한도를 두 배로 **이 대본만** 다시 쓴다. 최대한도에서도 넘치면 멈춘다 — 늘린 한도가
    기록에 남아 «이어서 다시» 는 그 한도로 한 번 더 쓴다. 부르기 전에 람다 시간이 모자라면
    기록에 적고 새 달리기로 넘긴다. 부를 때마다 토큰·초를 `딥시크기록` 에 남긴다."""
    재 = 기록["재료"]
    칸 = 재.setdefault("딥시크", {}).setdefault(열쇠, {"한도": 기본한도})
    if 칸.get("글"):
        return 칸["글"]
    while True:
        if 손.남은초() < 부르기전필요초:
            raise 이어달리기()
        답 = 손.딥시크(*지시문, 칸["한도"])
        재.setdefault("딥시크기록", []).append(
            {"열쇠": 열쇠, "한도": 칸["한도"], "넘침": 답["넘침"], "입력토큰": 답["입력토큰"],
             "캐시토큰": 답.get("캐시토큰", 0), "출력토큰": 답["출력토큰"], "생각토큰": 답["생각토큰"],
             "초": 답["초"], "시각": store.지금시각()})
        if not 답["넘침"]:
            칸["글"] = 답["글"]
            손.창고.쓰기(기록)
            return 답["글"]
        if 칸["한도"] >= 최대한도:
            손.창고.쓰기(기록)
            raise 멈춤(f"딥시크가 생각하다 한도({칸['한도']:,}토큰)를 넘김 — «이어서 다시» 를 누르면 "
                     f"이 대본만 {칸['한도']:,}토큰으로 한 번 더 씁니다")
        칸["한도"] *= 2
        손.창고.쓰기(기록)


def _딥시크지우기(기록, 열쇠들):
    """규칙에 걸려 멈춘 단계 — «이어서 다시» 가 같은 글로 또 걸리지 않게 그 단계 대본을 지운다."""
    for 열쇠 in 열쇠들:
        기록["재료"].get("딥시크", {}).pop(열쇠, None)


def _딥시크메모(기록, 열쇠들) -> str:
    쓴것 = [x for x in 기록["재료"].get("딥시크기록", []) if x["열쇠"] in 열쇠들]
    if not 쓴것:
        return ""
    넘친수 = sum(1 for x in 쓴것 if x["넘침"])
    return (f" · 딥시크 {len(쓴것)}번 · 생각 {sum(x['생각토큰'] for x in 쓴것):,}토큰"
            + (f" · 넘침 {넘친수}번" if 넘친수 else ""))


# ── 본문 ────────────────────────────────────────────────────────────────

본문열쇠 = ("본문대본", "본문다시쓰기", "본문다시쓰기2")


def 본문(기록, 손):
    """Dify: 본문 대본 → 검증 → (막혔나) 다시 쓰기 → 검증 2 → (막혔나) 다시 쓰기 2 → 검증 3.
    검증은 «늦게 고친 것부터» 읽는다(고친것2 → 고친것 → text) — 옮긴 코드가 그렇게 짜여 있다."""
    재 = 기록["재료"]
    단계, 시작 = _시작(기록, "본문 대본", 손)
    수, 글 = 재["count"], 재["news"]
    t0 = _딥시크(기록, "본문대본", prompts.채우기("본문대본", {"소식고르기.count": 수, "소식고르기.news": 글}), 손)
    v1 = 손.노드.check_body.main(text=t0, 소식수=수, 소식글=글)
    t1 = ""
    if v1["ok"] == "0":
        t1 = _딥시크(기록, "본문다시쓰기", prompts.채우기("본문다시쓰기", {
            "소식고르기.count": 수, "본문대본.text": t0, "본문검증1.blocked": v1["blocked"]}), 손)
    v2 = 손.노드.check_body.main(text=t0, 소식수=수, 소식글=글, 고친것=t1)
    t2 = ""
    if v2["ok"] == "0":
        t2 = _딥시크(기록, "본문다시쓰기2", prompts.채우기("본문다시쓰기2", {
            "소식고르기.count": 수, "본문다시쓰기.text": t1, "본문검증2.blocked": v2["blocked"]}), 손)
    v3 = 손.노드.check_body.main(text=t0, 소식수=수, 소식글=글, 고친것=t1, 고친것2=t2)
    if v3["ok"] == "0":
        _딥시크지우기(기록, 본문열쇠)
        raise 멈춤("본문이 두 번 고쳐도 규칙에 걸림 — " + _첫줄(v3["blocked"]))
    if not v3.get("slides"):
        _딥시크지우기(기록, 본문열쇠)
        raise 멈춤(f"소식은 {수}건인데 꼭지가 0개 — 본문 검사: {_첫줄(v3.get('blocked'))}")
    # 딥시크가 차례를 바꿔 써도 «평소보다 많이 터진 회사부터» 로 맞춘다 — 첫 꼭지가 표지 주인공이다
    순위 = {x["brand"]: i for i, x in enumerate(재.get("순서") or [])}
    꼭지 = sorted(v3["slides"], key=lambda s: 순위.get(s.get("brand"), len(순위)))
    재.update(slides=꼭지, 본문막힘=v3["blocked"], 본문점수표=v3["report"])
    고친횟수 = (1 if t1 else 0) + (1 if t2 else 0)
    _끝(기록, 단계, 시작, 손, f"꼭지 {len(v3['slides'])}개" + (f" · 고쳐 쓰기 {고친횟수}번" if 고친횟수 else "")
        + _딥시크메모(기록, 본문열쇠), 50)


# ── 표지 ────────────────────────────────────────────────────────────────

표지열쇠 = ("표지훅", "훅다시쓰기", "훅다시쓰기2")


def 표지(기록, 손):
    재 = 기록["재료"]
    주, 장들 = 기록["week"], 재["slides"]
    단계, 시작 = _시작(기록, "표지 문구", 손)
    h0 = _딥시크(기록, "표지훅", prompts.채우기("표지훅", {"시작.week": 주, "본문검증3.slides": 장들}), 손)
    k1 = 손.노드.check_hook.main(text=h0, week=주, slides=장들)
    h1 = ""
    if k1["ok"] == "0":
        h1 = _딥시크(기록, "훅다시쓰기", prompts.채우기("훅다시쓰기", {
            "표지훅.text": h0, "훅검증1.blocked": k1["blocked"]}), 손)
    k2 = 손.노드.check_hook.main(text=h0, week=주, 고친것=h1, slides=장들)
    h2 = ""
    if k2["ok"] == "0":
        h2 = _딥시크(기록, "훅다시쓰기2", prompts.채우기("훅다시쓰기2", {
            "훅다시쓰기.text": h1, "훅검증2.blocked": k2["blocked"]}), 손)
    k3 = 손.노드.check_hook.main(text=h0, week=주, 고친것=h1, 고친것2=h2, slides=장들)
    if k3["ok"] == "0":
        _딥시크지우기(기록, 표지열쇠)
        raise 멈춤("표지 문구가 두 번 고쳐도 규칙에 걸림 — " + _첫줄(k3["blocked"]))
    고친횟수 = (1 if h1 else 0) + (1 if h2 else 0)
    메모 = (f"고쳐 쓰기 {고친횟수}번" if 고친횟수 else "") + _딥시크메모(기록, 표지열쇠)
    _끝(기록, 단계, 시작, 손, 메모.removeprefix(" · "), 60)

    단계, 시작 = _시작(기록, "대본 합치기", 손)
    try:
        합 = 손.노드.merge_script.main(slides=장들, cover=k3["cover"], picked=재["picked"], week=주,
                                      본문막힘=재.get("본문막힘", ""), 훅막힘=k3["blocked"])
    except ValueError as e:
        raise 멈춤(str(e)[:400]) from e
    for s in 합["slides"]:  # 옮긴 대본 합치기는 옛 계정 그대로다 — 우리 계정으로(2026-10-01 사용자)
        if s.get("type") == "CTA":
            s.update(logo_text=CTA로고, handle=CTA계정)
    틀 = 손.노드.design_tpl.main()["tpl"]
    폭 = 손.옛서버.폭검사(합["slides"], 틀)
    재.update(굽기장=합["slides"], 표지=합["cover"], 대본=합["대본"], 훅점수표=k3["report"], 폭검사=폭)
    _끝(기록, 단계, 시작, 손, f"{len(합['slides']) + 1}장 (표지 포함)", 65)


# ── 그림 ────────────────────────────────────────────────────────────────

def _영상(s: dict) -> bool:
    return (s.get("media_url") or "").lower().split("?")[0].endswith((".mp4", ".mov", ".m4v"))


def 그림(기록, 손):
    """사진·영상 없는 소식 카드만 GPT 이미지 2.5 로 그려 창고에 올리고, 그 주소를 장에 넣는다.
    옛 서버는 주소가 있으면 그 그림을 쓴다 — Gemini 를 안 부른다."""
    재 = 기록["재료"]
    할것 = [s for s in 재["굽기장"] if s.get("type") == "뉴스" and not s.get("media_url")]
    for s in 할것:  # «이어서 다시» — 앞에서 못 만든 장도 다시 해 본다
        s.pop("_빠짐", None)
    단계, 시작 = _시작(기록, "그림 만들기", 손)

    def 한장(s):
        try:
            바이트, 쓴것 = 손.그림(s.get("gen_prompt_en") or "")
            return s, 손.창고.그림올리기(기록["job"], s["no"], 바이트), None, 쓴것
        except Exception as e:  # 그림탈 포함 — 그 장만 뺀다(설계 «오류 막기»)
            return s, None, str(e), None

    with ThreadPoolExecutor(max_workers=동시그림) as 풀:
        for s, 주소, 탈, 쓴것 in 풀.map(한장, 할것):
            if 쓴것:
                재.setdefault("그림기록", []).append({"종류": "소식", "no": s["no"], **쓴것})
            if 주소:
                s.update(media_url=주소, gen="", _내그림=True)
            else:
                s["_빠짐"] = f"그림 못 만듦 — {탈}"[:200]
    만든수 = sum(1 for s in 할것 if not s.get("_빠짐"))
    _끝(기록, 단계, 시작, 손, f"{len(할것)}장 중 {만든수}장 만듦" if 할것 else "만들 그림 없음", 70)


# ── 굽기 ────────────────────────────────────────────────────────────────

def 굽기(기록, 손):
    """표지와 영상 카드부터 동시에 5장까지 굽는다. 다 된 장만 넘겨보기에 넣는다 — 검은 칸 없음.
    Dify 판은 «굽는 중» 글자를 주소로 착각해 검은 «0번 장» 을 넣었다(2026-09-30 확인)."""
    재 = 기록["재료"]
    틀 = 손.노드.design_tpl.main()["tpl"]
    장들 = 재["굽기장"]
    for s in 장들:  # 만든 그림 주소는 한 시간짜리 — «이어서 다시» 로 늦게 구워도 되게 새로 받는다
        if s.get("_내그림"):
            s["media_url"] = 손.창고.그림주소(기록["job"], s["no"])
    빠진장 = [{"no": s["no"], "why": s["_빠짐"]} for s in 장들 if s.get("_빠짐")]
    대기 = [("표지", 재["표지"])] + [("장", s) for s in sorted(
        (s for s in 장들 if not s.get("_빠짐")), key=lambda s: (not _영상(s), s["no"]))]
    전체 = len(대기)
    단계, 시작 = _시작(기록, "카드 굽기", 손)
    도는중, 됨 = {}, {}
    마감 = 손.지금() + max(60.0, 손.남은초() - 90.0)
    while 대기 or 도는중:
        if 손.지금() >= 마감:
            빠진장 += [{"no": s["no"], "why": "시간이 모자라 못 기다림"} for _, s, _ in 도는중.values()]
            빠진장 += [{"no": s["no"], "why": "시간이 모자라 못 구움"} for _, s in 대기]
            break
        while 대기 and len(도는중) < 동시굽기:
            종류, s = 대기.pop(0)
            try:
                if 종류 == "표지":
                    번 = 손.옛서버.표지굽기(s, 틀)
                else:
                    번 = 손.옛서버.장굽기({k: v for k, v in s.items() if not k.startswith("_")}, 틀)
                도는중[번] = (종류, s, 손.지금())
            except Exception as e:
                빠진장.append({"no": s["no"], "why": f"굽기 시작 실패 — {e}"[:200]})
        for 번, (종류, s, 시각) in list(도는중.items()):
            try:
                d = 손.옛서버.번호표(번)
            except Exception as e:  # 묻다 끊긴 것 — 다음 바퀴에 다시 묻는다
                print(f"!! {번} 묻기 실패: {e}")
                d = {"done": False}
            if d.get("done"):
                del 도는중[번]
                if 종류 == "표지":  # 옛 서버가 표지를 GPT 로 그렸다 — 고친 옛 서버는 사용량을 싣는다
                    재.setdefault("그림기록", []).append(
                        {"종류": "표지", **d["사용량"]} if d.get("사용량") else {"종류": "표지", "모름": True})
                if d.get("state") == "됨" and d.get("url"):
                    됨[s["no"]] = d["url"]
                else:
                    빠진장.append({"no": s["no"],
                                 "why": f"굽기 실패 — {d.get('error') or d.get('why') or d.get('state')}"[:200]})
            elif 손.지금() - 시각 >= 장당최대초:
                del 도는중[번]
                빠진장.append({"no": s["no"], "why": ("영상, " if _영상(s) else "") + f"시간 초과({장당최대초 // 60}분)"})
        단계["note"] = f"{len(됨)} / {전체}장"
        기록["pct"] = 70 + round(25 * len(됨) / max(1, 전체))
        손.창고.쓰기(기록)
        if 대기 or 도는중:
            손.잠자기(묻는간격)

    뉴스번호 = {s["no"] for s in 장들 if s.get("type") == "뉴스"}
    if not 뉴스번호 & set(됨):
        raise 멈춤("소식 카드를 한 장도 못 구움 — " + "; ".join(f"{x['no']}번 {x['why']}" for x in 빠진장[:3]))
    _끝(기록, 단계, 시작, 손, f"{len(됨)} / {전체}장" + (f" · 빠진 장 {len(빠진장)}" if 빠진장 else ""), 95)

    단계, 시작 = _시작(기록, "넘겨보기 만들기", 손)
    넘길것 = [{"no": n, "state": "됨", "url": 됨[n]} for n in sorted(됨)]
    주소 = 손.옛서버.넘겨보기(f"{기록['week']} AI 소식", 넘길것)
    if not 주소.startswith("https://"):
        raise 멈춤(f"넘겨보기를 못 만듦 — {주소[:120]}")
    기록["result"] = {"viewer": 주소, "slides": len(넘길것),
                     "missing_slides": sorted(빠진장, key=lambda x: x["no"]),
                     "missing_brands": 재.get("missing_brands") or []}
    _끝(기록, 단계, 시작, 손, f"{len(넘길것)}장", 99)
