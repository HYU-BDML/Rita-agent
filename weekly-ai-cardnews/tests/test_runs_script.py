# -*- coding: utf-8 -*-
import json
from pathlib import Path

import runs
from fakes import 가짜딥시크, 가짜옛서버, 손만들기

재료 = Path(__file__).resolve().parent / "재료"
소식 = json.loads((재료 / "procure_efbe7c38.json").read_text(encoding="utf-8"))
디파이 = json.loads((재료 / "dify_53a92a48.json").read_text(encoding="utf-8"))
글 = 디파이["글"]


def 판(딥답들):
    옛 = 가짜옛서버(소식들=[소식])
    딥 = 가짜딥시크(딥답들)
    손, 시, 다음 = 손만들기(옛서버=옛, 딥시크=딥)
    job = "20260930-000000-00000000"
    손.창고.쓰기(runs.새기록(job, "9월 3주차", 2026))
    runs.달리기(job, "소식", 손)
    return 손, 옛, 딥, 다음, job


def test_본문은_Dify_처럼_한번_걸리고_같은_지적으로_고쳐_통과():
    손, 옛, 딥, 다음, job = 판([글["본문 대본"], 글["본문 다시 쓰기"]])
    runs.달리기(job, "본문", 손)
    기록 = 손.창고.읽기(job)
    assert 기록["단계"] == "표지", 기록.get("error")
    assert len(딥.받은것) == 2
    # Dify 가 «본문 다시 쓰기» 에 준 지적과 우리가 준 지적이 같다 = 같은 코드·같은 입력
    assert 디파이["검사"]["본문 검증"]["blocked"] in 딥.받은것[1]
    assert 기록["재료"]["slides"]
    assert "고쳐 쓰기 1번 · 딥시크 2번" in 기록["steps"][-1]["note"]
    assert 다음[-1] == (job, "표지")
    assert all(x["시각"].endswith("Z") for x in 기록["재료"]["딥시크기록"])
    assert 기록["cost"]["딥시크"] > 0  # 단계가 끝날 때마다 쓴 돈을 다시 센다


def test_본문이_두번_고쳐도_걸리면_표지로_안_간다():
    나쁜 = 글["본문 대본"]
    손, 옛, 딥, 다음, job = 판([나쁜, 나쁜, 나쁜])
    runs.달리기(job, "본문", 손)
    기록 = 손.창고.읽기(job)
    assert 기록["state"] == "실패" and 기록["error"].startswith("본문이 두 번 고쳐도 규칙에 걸림 — ")
    assert len(딥.받은것) == 3
    assert 다음 == [(job, "본문")]  # 소식 뒤에 부른 것 하나뿐


def test_표지는_고친_사람판정으로_두번째에_통과하고_합친다():
    손, 옛, 딥, 다음, job = 판([글["본문 대본"], 글["본문 다시 쓰기"], 글["표지 훅"], 글["훅 다시 쓰기"]])
    # Dify 와 같은 지적인지 보려면 꼭지 차례도 Dify(명단 순서)와 같아야 한다 — 첫 꼭지 회사가 표지 얼굴이다
    기록 = 손.창고.읽기(job)
    기록["재료"]["순서"] = [{"brand": b} for b in ("ChatGPT", "Claude", "Gemini", "Cursor", "Perplexity",
                                                 "Meta AI", "NVIDIA")]
    손.창고.쓰기(기록)
    runs.달리기(job, "본문", 손)
    runs.달리기(job, "표지", 손)
    기록 = 손.창고.읽기(job)
    assert 기록["단계"] == "그림", 기록.get("error")
    # Dify(옛 판정)는 세 번 다 막혀 멈췄지만, 새 판정은 두 번째(다시 쓰기 1)에서 통과한다
    assert 디파이["검사"]["훅 검증 3"]["ok"] == "0"
    assert len(딥.받은것) == 4
    assert 디파이["검사"]["훅 검증"]["blocked"] in 딥.받은것[3]  # 첫 지적은 Dify 와 같다
    장들 = 기록["재료"]["굽기장"]
    assert 장들[-1]["type"] == "CTA" and all(s["type"] == "뉴스" for s in 장들[:-1])
    assert (장들[-1]["logo_text"], 장들[-1]["handle"]) == ("HANYANG NEWS", "@hanyang_news")  # 2026-10-01 사용자
    assert len(장들) - 1 == 기록["재료"]["count"]
    assert 기록["재료"]["표지"]["no"] == 1
    assert ("폭검사", len(장들)) in 옛.부른것


def test_표지가_두번_고쳐도_걸리면_멈춘다():
    손, 옛, 딥, 다음, job = 판([글["본문 대본"], 글["본문 다시 쓰기"], 글["표지 훅"], 글["표지 훅"], 글["표지 훅"]])
    runs.달리기(job, "본문", 손)
    runs.달리기(job, "표지", 손)
    기록 = 손.창고.읽기(job)
    assert 기록["state"] == "실패" and 기록["error"].startswith("표지 문구가 두 번 고쳐도 규칙에 걸림 — ")
    assert not any(x[0] == "폭검사" for x in 옛.부른것)


def test_본문_꼭지도_평소보다_많이_터진_회사부터_줄세운다():
    손, 옛, 딥, 다음, job = 판([글["본문 대본"], 글["본문 다시 쓰기"]])
    runs.달리기(job, "본문", 손)
    재 = 손.창고.읽기(job)["재료"]
    순서 = [x["brand"] for x in 재["순서"]]
    꼭지 = [s["brand"] for s in 재["slides"]]
    assert 꼭지 == [b for b in 순서 if b in 꼭지] and 꼭지[0] == 순서[0]
