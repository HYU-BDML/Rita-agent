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
    상태, 목록 = 부르기("GET", "/jobs", **kw)
    assert {x["job"] for x in 목록["jobs"]} == {첫["job"], 둘["job"]}


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
