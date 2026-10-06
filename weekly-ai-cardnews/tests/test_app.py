# -*- coding: utf-8 -*-
import json
from datetime import date, datetime, timezone

import app
import store
from fakes import 가짜S3


def 준비():
    창 = store.창고(가짜S3(), "통")
    불린 = []
    return 창, 불린, dict(창고=창, 다음부르기=lambda j, s: 불린.append((j, s)), 오늘=date(2026, 9, 30))


def 부르기(방법, 길, 몸=None, **kw):
    event = {"rawPath": 길, "requestContext": {"http": {"method": 방법}},
             "body": json.dumps(몸, ensure_ascii=False) if 몸 is not None else None}
    답 = app.처리(event, **kw)
    return 답["statusCode"], json.loads(답["body"])


def test_만들기는_번호표를_주고_소식부터_부른다():
    창, 불린, kw = 준비()
    상태, 몸 = 부르기("POST", "/make", {"week": "9월 3주차", "year": 2026}, **kw)
    assert 상태 == 202
    assert 불린 == [(몸["job"], "소식")]
    assert 창.읽기(몸["job"])["state"] == "만드는 중"


def test_같은_주차를_둘이_눌러도_따로_돈다():
    창, 불린, kw = 준비()
    _, 첫 = 부르기("POST", "/make", {"week": "9월 3주차", "year": 2026}, **kw)
    _, 둘 = 부르기("POST", "/make", {"week": "9월 3주차", "year": "2026"}, **kw)
    assert 첫["job"] != 둘["job"]
    assert {x["job"] for x in 창.목록()} == {첫["job"], 둘["job"]}


def _주간판(창, 번호, **더):
    import runs
    기록 = runs.새기록(번호, "9월 3주차", 2026)
    기록.update(더)
    창.쓰기(기록)
    return 번호


def _주제판(창, 번호, **더):
    from fakes_topic import 주문서
    from topic import flow
    기록 = flow.새기록(번호, {**주문서, "분야이름": "아이브(IVE)", "시작": "2026-09-28", "끝": "2026-10-04"})
    기록.update(더)
    창.쓰기(기록)
    return 번호


def test_지난_결과는_카드뉴스가_된_판만_카드이름과_함께():
    # 새 분야로 넓히는 과정은 지난 결과에 섞이지 않는다 — 카드뉴스들만(사용자 2026-10-05)
    창, 불린, kw = 준비()
    주간 = _주간판(창, "20261001-000001-aaaaaaaa", state="됨", result={"viewer": "https://x/v.html", "slides": 9})
    _주간판(창, "20261001-000002-aaaaaaaa")  # 만드는 중
    _주간판(창, "20261001-000003-aaaaaaaa", state="실패", error="소식 0건")
    주제 = _주제판(창, "20261001-000004-aaaaaaaa", state="됨",
                result={"bundle": [{"순서": 1}], "카드": {"보기": "https://x/w.html", "장수": 8, "빠진장": []}})
    _주제판(창, "20261001-000005-aaaaaaaa", state="됨", result={"bundle": [{"순서": 1}], "카드": {"오류": "막힘"}})
    _주제판(창, "20261001-000006-aaaaaaaa", state="됨", result={"bundle": []})
    _주제판(창, "20261001-000007-aaaaaaaa")  # 모으는 중
    상태, 몸 = 부르기("GET", "/jobs", **kw)
    assert 상태 == 200 and [x["job"] for x in 몸["jobs"]] == [주제, 주간]
    assert [x["카드이름"] for x in 몸["jobs"]] == ["아이브(IVE) 9월 4주차 카드뉴스", "9월 3주차 AI 소식 카드뉴스"]
    _, 판 = 부르기("GET", f"/jobs/{주제}", **kw)
    assert 판["카드이름"] == "아이브(IVE) 9월 4주차 카드뉴스"
    assert app._카드이름({"kind": "주제", "order": {"분야이름": "아이브(IVE)"}}) == "아이브(IVE) 카드뉴스"  # 기간 없는 판


def test_판_지우기는_누구나_사본을_남기고_지난_결과에서_뺀다():
    창, 불린, kw = 준비()
    번호 = _주간판(창, "20261001-000001-aaaaaaaa", state="됨", result={"viewer": "https://x/v.html", "slides": 9})
    원본 = 창.읽기(번호)
    assert 부르기("POST", f"/jobs/{번호}/delete", {}, **kw) == (200, {"지움": 번호})
    assert 창.읽기(번호) is None and 부르기("GET", "/jobs", **kw)[1]["jobs"] == []
    assert 창._읽기키(f"weekly/memory/backup/jobs/{번호}.json") == 원본
    assert 부르기("POST", f"/jobs/{번호}/delete", {}, **kw) == (404, {"error": "없는 결과입니다"})
    assert 부르기("POST", "/jobs/..%2Fx/delete", {}, **kw)[0] == 404


def test_없는_주차는_400():
    창, 불린, kw = 준비()
    for 주 in ("13월 1주차", "9월 5주차", ""):
        상태, 몸 = 부르기("POST", "/make", {"week": 주, "year": 2026}, **kw)
        assert 상태 == 400 and 몸["error"]
    assert 불린 == [] and 창.목록() == []


def test_결과는_재료_없이_준다():
    창, 불린, kw = 준비()
    _, 몸 = 부르기("POST", "/make", {"week": "9월 3주차", "year": 2026}, **kw)
    상태, 판 = 부르기("GET", f"/jobs/{몸['job']}", **kw)
    assert 상태 == 200 and 판["week"] == "9월 3주차" and "재료" not in 판 and "cost" in 판


def test_모양이_이상한_번호표는_404():
    창, 불린, kw = 준비()
    for 길 in ("/jobs/..%2F..%2Fsecret", "/jobs/20260930-000000-deadbeef", "/jobs/"):
        상태, 몸 = 부르기("GET", 길, **kw)
        assert 상태 == 404 and 몸["error"] == "없는 결과입니다"


def test_30분_넘게_안_바뀌면_멈춤():
    창, 불린, kw = 준비()
    _, 몸 = 부르기("POST", "/make", {"week": "9월 3주차", "year": 2026}, **kw)
    기록 = 창.읽기(몸["job"])
    기록["updated"] = "2026-09-30T00:00:00Z"
    창.s3.put_object(Bucket="통", Key=f"weekly/jobs/{몸['job']}.json",
                     Body=json.dumps(기록, ensure_ascii=False).encode("utf-8"))
    상태, 판 = 부르기("GET", f"/jobs/{몸['job']}", 지금=datetime(2026, 9, 30, 0, 31, tzinfo=timezone.utc), **kw)
    assert 판["state"] == "멈춤" and "30분" in 판["error"]


def test_주차목록():
    창, 불린, kw = 준비()
    상태, 몸 = 부르기("GET", "/weeks", **kw)
    assert 상태 == 200 and 몸["weeks"][0]["label"] == "9월 3주차"


def test_모르는_길은_404():
    창, 불린, kw = 준비()
    assert 부르기("DELETE", "/jobs", **kw)[0] == 404


def test_뒤에서_부르면_달리기로_간다(monkeypatch):
    받은 = []
    monkeypatch.setattr(app, "손만들기", lambda context=None: "손")
    monkeypatch.setattr(app.runs, "달리기", lambda job, 단계, 손: 받은.append((job, 단계, 손)) or {"ok": True})
    assert app.handler({"_job": "20260930-000000-aaaaaaaa", "_stage": "굽기"}, None) == {"ok": True}
    assert 받은 == [("20260930-000000-aaaaaaaa", "굽기", "손")]


def test_터지면_500과_이유(monkeypatch, capsys):
    monkeypatch.setattr(app, "_창고", lambda: (_ for _ in ()).throw(RuntimeError("창고 없음")))
    답 = app.handler({"rawPath": "/jobs", "requestContext": {"http": {"method": "GET"}}, "body": None}, None)
    assert 답["statusCode"] == 500 and "창고 없음" in json.loads(답["body"])["error"]
    assert "!! 500 GET /jobs" in capsys.readouterr().out
