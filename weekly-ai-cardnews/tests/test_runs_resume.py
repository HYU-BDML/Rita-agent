# -*- coding: utf-8 -*-
"""딥시크가 넘치거나 시간이 모자랄 때 «그 부분만» 다시 하는지 — 소식 긁기부터 다시 하지 않는지."""
import json
from pathlib import Path

import app
import runs
from fakes import 가짜딥시크, 가짜옛서버, 넘침, 손만들기

재료 = Path(__file__).resolve().parent / "재료"
소식 = json.loads((재료 / "procure_efbe7c38.json").read_text(encoding="utf-8"))
글 = json.loads((재료 / "dify_53a92a48.json").read_text(encoding="utf-8"))["글"]


def 판(딥답들):
    옛 = 가짜옛서버(소식들=[소식])
    딥 = 가짜딥시크(딥답들)
    손, 시, 다음 = 손만들기(옛서버=옛, 딥시크=딥)
    job = "20260930-000000-00000000"
    손.창고.쓰기(runs.새기록(job, "9월 3주차", 2026))
    runs.달리기(job, "소식", 손)
    return 손, 옛, 딥, 다음, job


def 이어서다시(손, job):
    불린 = []
    event = {"rawPath": f"/jobs/{job}/retry", "requestContext": {"http": {"method": "POST"}}, "body": None}
    답 = app.처리(event, 창고=손.창고, 다음부르기=lambda j, s: 불린.append((j, s)))
    return 답["statusCode"], json.loads(답["body"]), 불린


def 긁은횟수(옛):
    return [x[0] for x in 옛.부른것].count("소식긁기")


def test_넘치면_그_대본만_한도를_두배로_다시_쓴다():
    손, 옛, 딥, 다음, job = 판([넘침, 글["본문 대본"], 글["본문 다시 쓰기"]])
    runs.달리기(job, "본문", 손)
    기록 = 손.창고.읽기(job)
    assert 기록["단계"] == "표지", 기록.get("error")
    assert 딥.한도들 == [32000, 64000, 32000]  # 다시 쓰기는 다시 32000 부터
    assert "넘침 1번" in 기록["steps"][-1]["note"] and "딥시크 3번" in 기록["steps"][-1]["note"]
    assert [x["열쇠"] for x in 기록["재료"]["딥시크기록"]] == ["본문대본", "본문대본", "본문다시쓰기"]


def test_가장_큰_한도에서도_넘치면_멈추고_이어서_다시는_본문만_그_한도로():
    손, 옛, 딥, 다음, job = 판([넘침, 넘침, 넘침])
    runs.달리기(job, "본문", 손)
    기록 = 손.창고.읽기(job)
    assert 기록["state"] == "실패" and "128,000토큰" in 기록["error"], 기록.get("error")
    assert 딥.한도들 == [32000, 64000, 128000]

    딥.답들 += [글["본문 대본"], 글["본문 다시 쓰기"]]
    상태, 몸, 불린 = 이어서다시(손, job)
    assert 상태 == 202 and 불린 == [(job, "본문")]
    runs.달리기(job, "본문", 손)
    기록 = 손.창고.읽기(job)
    assert 기록["단계"] == "표지" and 기록["state"] == "만드는 중", 기록.get("error")
    assert 딥.한도들[3:] == [128000, 32000]
    assert 긁은횟수(옛) == 1  # 소식은 다시 안 긁었다
    assert [s["name"] for s in 기록["steps"]].count("본문 대본") == 1


def test_시간이_모자라면_저장하고_같은_단계를_이어_달린다():
    손, 옛, 딥, 다음, job = 판([글["본문 대본"], 글["본문 다시 쓰기"]])
    남은 = [900.0, 100.0]  # 첫 부르기 전엔 넉넉, 두 번째 부르기 전엔 모자람
    손.남은초 = lambda: 남은.pop(0) if 남은 else 900.0
    원래 = 손.딥시크
    손.딥시크 = lambda *a: (손.잠자기(30), 원래(*a))[1]  # 한 번 부르는 데 30초
    runs.달리기(job, "본문", 손)
    기록 = 손.창고.읽기(job)
    assert 기록["state"] == "만드는 중" and 기록["단계"] == "본문", 기록.get("error")
    assert 다음[-1] == (job, "본문") and len(딥.받은것) == 1
    assert 기록["재료"]["딥시크"]["본문대본"]["글"] == 글["본문 대본"]
    assert 기록["steps"][-1]["sec"] == 30  # 첫 달리기에서 쓴 시간이 남는다

    runs.달리기(job, "본문", 손)
    기록 = 손.창고.읽기(job)
    assert 기록["단계"] == "표지" and len(딥.받은것) == 2  # 첫 대본은 다시 안 썼다
    assert [s["name"] for s in 기록["steps"]].count("본문 대본") == 1


def test_규칙에_두번_걸려_멈춘_본문은_이어서_다시하면_본문만_새로_쓴다():
    나쁜 = 글["본문 대본"]
    손, 옛, 딥, 다음, job = 판([나쁜, 나쁜, 나쁜])
    runs.달리기(job, "본문", 손)
    assert 손.창고.읽기(job)["state"] == "실패"

    딥.답들 += [글["본문 대본"], 글["본문 다시 쓰기"]]
    상태, 몸, 불린 = 이어서다시(손, job)
    runs.달리기(job, "본문", 손)
    기록 = 손.창고.읽기(job)
    assert 상태 == 202 and 기록["단계"] == "표지", 기록.get("error")
    assert len(딥.받은것) == 5 and 긁은횟수(옛) == 1


def test_이어서_다시는_실패하거나_30분_멈춘_판만():
    손, 옛, 딥, 다음, job = 판([])
    assert 이어서다시(손, job)[0] == 409  # 지금 만드는 중
    기록 = 손.창고.읽기(job)
    기록["state"] = "됨"
    손.창고.쓰기(기록)
    assert 이어서다시(손, job)[0] == 409  # 이미 다 됨
    assert 이어서다시(손, "20000101-000000-00000000")[0] == 404

    기록.update(state="만드는 중", updated="2026-09-30T00:00:00Z")
    손.창고.s3.put_object(Bucket="통", Key=f"weekly/jobs/{job}.json",
                         Body=json.dumps(기록, ensure_ascii=False).encode("utf-8"))
    상태, 몸, 불린 = 이어서다시(손, job)  # 30분 넘게 멈춘 판
    assert 상태 == 202 and 불린 == [(job, 기록["단계"])]
