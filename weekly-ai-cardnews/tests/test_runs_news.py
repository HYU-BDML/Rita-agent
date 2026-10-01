# -*- coding: utf-8 -*-
import hashlib
import json
from pathlib import Path

import runs
from fakes import 가짜옛서버, 손만들기

재료 = Path(__file__).resolve().parent / "재료"
소식 = json.loads((재료 / "procure_efbe7c38.json").read_text(encoding="utf-8"))
디파이 = json.loads((재료 / "dify_53a92a48.json").read_text(encoding="utf-8"))


def 새판(손, 번호="20260930-000000-00000000"):
    기록 = runs.새기록(번호, "9월 3주차", 2026)
    손.창고.쓰기(기록)
    return 번호


def _X실패(몸, 몇곳):
    return {**몸, "탈": list(몸.get("탈") or [])
            + [f"가짜{i} X(@x{i}): RuntimeError: 키 상태를 확인할 수 없음" for i in range(몇곳)]}


def _덩어리(news):
    머리, 몸 = news.split("\n\n", 1)
    return 머리, sorted(몸.split("\n\n"))


def test_소식달리기는_Dify_와_같은_소식을_고른다():
    from nodes import pick_news
    # 옮긴 코드 그대로면 Dify 와 글자 하나까지 같다
    골라 = pick_news.main(body=json.dumps(소식, ensure_ascii=False))
    assert hashlib.sha256(골라["news"].encode("utf-8")).hexdigest() == 디파이["소식고르기"]["news_sha256"]
    손, 시, 다음 = 손만들기(옛서버=가짜옛서버(소식들=[소식]))
    job = 새판(손)
    runs.달리기(job, "소식", 손)
    기록 = 손.창고.읽기(job)
    assert 기록["state"] == "만드는 중" and 기록["단계"] == "본문", 기록.get("error")
    assert 기록["재료"]["count"] == 디파이["소식고르기"]["count"]
    assert _덩어리(기록["재료"]["news"]) == _덩어리(골라["news"])  # 순서만 바뀌고 내용은 같다
    빠진 = [b.strip() for b in (디파이["소식고르기"]["dropped"] or "").split(",") if b.strip()]
    assert [x["brand"] for x in 기록["재료"]["missing_brands"]] == 빠진
    assert 다음 == [(job, "본문")]
    assert 기록["pct"] == 25
    assert [s["name"] for s in 기록["steps"]] == ["소식 긁기", "소식 고르기"]
    assert 기록["steps"][1]["note"].startswith("7건 (Grok 없음) · 첫 소식 ")
    assert 기록["steps"][0]["note"] == "X 185건 · 블로그 28건"


def test_Grok_은_X_를_못_읽어_빠졌다고_말한다():
    손, 시, 다음 = 손만들기(옛서버=가짜옛서버(소식들=[소식]))
    job = 새판(손)
    runs.달리기(job, "소식", 손)
    까닭 = {x["brand"]: x["why"] for x in 손.창고.읽기(job)["재료"]["missing_brands"]}
    assert 까닭.get("Grok") == "X 계정을 못 읽음"


def test_X_절반넘게_실패하면_90초_뒤_한번_다시_긁는다():
    옛 = 가짜옛서버(소식들=[_X실패(소식, 7), 소식])
    손, 시, 다음 = 손만들기(옛서버=옛)
    job = 새판(손)
    시작 = 시.t
    runs.달리기(job, "소식", 손)
    assert [x[0] for x in 옛.부른것].count("소식긁기") == 2
    assert 시.t - 시작 >= 90
    assert 손.창고.읽기(job)["단계"] == "본문"


def test_두번_다_X_절반넘게_실패하면_멈춘다():
    손, 시, 다음 = 손만들기(옛서버=가짜옛서버(소식들=[_X실패(소식, 7), _X실패(소식, 8)]))
    job = 새판(손)
    runs.달리기(job, "소식", 손)
    기록 = 손.창고.읽기(job)
    assert 기록["state"] == "실패" and "X 12곳 중 9곳 못 읽음" in 기록["error"]
    assert 기록["steps"][-1]["state"] == "실패"
    assert 다음 == []


def test_소식이_0건이면_멈춘다():
    빈 = {**소식, "브랜드": [{**b, "x": [], "blog": [], "youtube": [], "threads": []} for b in 소식["브랜드"]]}
    손, 시, 다음 = 손만들기(옛서버=가짜옛서버(소식들=[빈]))
    job = 새판(손)
    runs.달리기(job, "소식", 손)
    기록 = 손.창고.읽기(job)
    assert 기록["state"] == "실패" and "고를 소식이 없음" in 기록["error"]
    assert 다음 == []


def test_기록이_없으면_아무것도_안_한다():
    손, 시, 다음 = 손만들기()
    assert runs.달리기("20260930-000000-ffffffff", "소식", 손) == {"ok": False}


def test_오류에_열쇠같은_글은_가린다(capsys):
    class 터지는옛서버(가짜옛서버):
        def 소식긁기(self, 주, 해):
            raise RuntimeError("Your api key sk-abcdef1234567890 is invalid")

    손, 시, 다음 = 손만들기(옛서버=터지는옛서버())
    job = 새판(손)
    runs.달리기(job, "소식", 손)
    기록 = 손.창고.읽기(job)
    assert 기록["state"] == "실패" and "sk-***" in 기록["error"]
    assert "abcdef1234567890" not in 기록["error"] + capsys.readouterr().out


def test_X_계정_수는_긁은_명단에서_센다():
    그록뺌 = {**소식, "브랜드": [b for b in 소식["브랜드"] if b["brand"] != "Grok"],
             "탈": [t for t in 소식.get("탈") or [] if not str(t).startswith("Grok")]}
    손, 시, 다음 = 손만들기(옛서버=가짜옛서버(소식들=[_X실패(그록뺌, 6), _X실패(그록뺌, 6)]))
    job = 새판(손)
    runs.달리기(job, "소식", 손)
    기록 = 손.창고.읽기(job)
    assert 기록["state"] == "실패" and "X 11곳 중 6곳 못 읽음" in 기록["error"], 기록.get("error")


def _글(이름, i, 반응):
    return {"text": f"{이름} 소식 {i}", "url": f"https://x.com/{이름}/status/{i}", "date": "2026-09-22",
            "media": [], "likes": 반응, "retweets": 0, "replies": 0, "views": 0}


def test_소식은_평소보다_많이_터진_회사부터():
    # ChatGPT 는 평소 1000 인데 1200(1.2배), Claude 는 평소 100 인데 1000(10배) — Claude 가 먼저
    칸 = lambda 이름, 반응들: {"brand": 이름, "x계정": "@" + 이름, "블로그": None, "blog": [], "youtube": [],
                            "threads": [], "x": [_글(이름, i, r) for i, r in enumerate(반응들)]}
    몸 = {**소식, "브랜드": [칸("ChatGPT", [1000, 1000, 1000, 1200]), 칸("Claude", [100, 100, 100, 1000])],
         "탈": []}
    손, 시, 다음 = 손만들기(옛서버=가짜옛서버(소식들=[몸]))
    job = 새판(손)
    runs.달리기(job, "소식", 손)
    재 = 손.창고.읽기(job)["재료"]
    assert [p["brand"] for p in 재["picked"]] == ["Claude", "ChatGPT"]
    assert 재["news"].split("\n\n")[1].startswith("[Claude]")
    assert [(x["brand"], x["배수"]) for x in 재["순서"]] == [("Claude", 10.0), ("ChatGPT", 1.2)]
    assert 손.창고.읽기(job)["steps"][1]["note"] == "2건 · 첫 소식 Claude (평소의 10배 인기)"


def test_평소는_고른_글을_올린_그_계정으로_센다():
    # OpenAI 는 큰 계정(@OpenAI)과 반응이 작은 계정(@OpenAIDevs)이 섞여 있다 — 회사 단위로 섞어 세면
    # «평소» 가 10 이 되어 6000배로 늘 1등이다. 올린 계정의 평소(5000)로 세면 12배라 Claude(20배)가 먼저다.
    오 = [_글("OpenAI", i, r) for i, r in enumerate([5000, 5000, 5000, 60000])]
    오 += [_글("OpenAIDevs", i, 10) for i in range(5)]
    몸 = {**소식, "탈": [], "브랜드": [
        {"brand": "ChatGPT", "x계정": "@OpenAI, @OpenAIDevs", "블로그": None, "blog": [], "youtube": [],
         "threads": [], "x": 오},
        {"brand": "Claude", "x계정": "@claudeai", "블로그": None, "blog": [], "youtube": [], "threads": [],
         "x": [_글("claudeai", i, r) for i, r in enumerate([100, 100, 100, 2000])]}]}
    손, 시, 다음 = 손만들기(옛서버=가짜옛서버(소식들=[몸]))
    job = 새판(손)
    runs.달리기(job, "소식", 손)
    재 = 손.창고.읽기(job)["재료"]
    assert [(x["brand"], x["배수"]) for x in 재["순서"]] == [("Claude", 20.0), ("ChatGPT", 12.0)]
