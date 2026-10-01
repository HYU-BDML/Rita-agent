# -*- coding: utf-8 -*-
import json
from datetime import date, datetime, timezone

import app
import runs
import store
from fakes import 가짜S3
from fakes_topic import 주문서
from topic import flow

넉넉 = {"apify": {"쓸수있는합": 9.0, "낮음": False, "멈춤": False, "모름": False}, "deepseek": {"남은": 56.0, "멈춤": False}}
바닥 = {"apify": {"쓸수있는합": 0.6, "낮음": True, "멈춤": True, "모름": False}, "deepseek": {"남은": 56.0, "멈춤": False}}


def 준비(지갑=넉넉):
    창, 불린 = store.창고(가짜S3(), "통"), []
    kw = dict(창고=창, 다음부르기=lambda j, s: 불린.append((j, s)), 대화부르기=lambda 번호: None, 지갑=lambda: 지갑,
              오늘=date(2026, 10, 1), 지금=datetime(2026, 10, 1, 3, 0, tzinfo=timezone.utc))
    return 창, 불린, kw


def 부르기(방법, 길, 몸=None, **kw):
    event = {"rawPath": 길, "requestContext": {"http": {"method": 방법}},
             "body": json.dumps(몸, ensure_ascii=False) if 몸 is not None else None}
    답 = app.처리(event, **kw)
    return 답["statusCode"], json.loads(답["body"])


def 끝난판(창, 번호="20261001-030000-dddddddd", **더):
    기록 = flow.새기록(번호, 주문서, "20261001-020000-cccccccc")
    기록.update({"state": "됨", "result": {"bundle": [{"순서": 1}], "unfilled": [], "dropped": []}})
    기록.update(더)
    창.쓰기(기록)
    return 번호


def test_끝난_판을_분야로_저장하면_목록에_새것부터():
    창, _, kw = 준비()
    번호 = 끝난판(창)
    바뀐때 = 창.읽기(번호)["updated"]
    상태, 몸 = 부르기("POST", "/topic/fields", {"job": 번호}, **kw)
    assert 상태 == 201
    f = 창.분야읽기(몸["field"])
    assert (f["이름"], f["job"]) == ("코르티스", 번호)
    assert f["본"] == {k: 주문서[k] for k in ("주제", "범위", "넣을것", "뺄것", "목표건수", "한장단위", "분야이름", "등급")}
    assert 창.읽기(번호)["updated"] == 바뀐때  # 판 기록은 안 건드린다 — 걸린 시간이 늘지 않게
    assert 부르기("POST", "/topic/fields", {"job": 번호}, **kw) == (200, {"field": 몸["field"]})  # 두 번 눌러도 하나
    상태, 목록 = 부르기("GET", "/topic/fields", **kw)
    assert 상태 == 200 and [x["field"] for x in 목록["fields"]] == [몸["field"]]
    assert 목록["fields"][0]["본"]["주제"] == 주문서["주제"]


def test_저장_못_하는_판():
    창, _, kw = 준비()
    assert 부르기("POST", "/topic/fields", {"job": "20000101-000000-00000000"}, **kw)[0] == 404
    assert 부르기("POST", "/topic/fields", {"job": 끝난판(창, state="만드는 중")}, **kw)[0] == 409
    빈 = 끝난판(창, "20261001-030000-eeeeeeee", result={"bundle": [], "unfilled": [], "dropped": []})
    assert 부르기("POST", "/topic/fields", {"job": 빈}, **kw)[0] == 409
    창.쓰기(runs.새기록("20261001-030000-12121212", "9월 3주차", 2026))
    assert 부르기("POST", "/topic/fields", {"job": "20261001-030000-12121212"}, **kw)[0] == 409  # AI 소식 판
    assert 부르기("POST", "/topic/fields", {"job": 끝난판(창, "20261001-030000-ffffffff")}, **kw)[0] == 201
    상태, d = 부르기("POST", "/topic/fields", {"job": 끝난판(창, "20261001-030000-abababab")}, **kw)
    assert 상태 == 409 and "같은 이름" in d["error"]


def test_저장된_분야로_기간만_골라_모은다():
    창, 불린, kw = 준비()
    _, 몸 = 부르기("POST", "/topic/fields", {"job": 끝난판(창)}, **kw)
    상태, d = 부르기("POST", "/topic/make", {"field": 몸["field"], "기간": {"종류": "이번주"}}, **kw)
    assert 상태 == 202 and 불린 == [(d["job"], "모으기")]
    기록 = 창.읽기(d["job"])
    assert (기록["kind"], 기록["field"], 기록["chat"]) == ("주제", 몸["field"], None)
    o = 기록["order"]
    assert (o["시작"], o["끝"], o["기간말"]) == ("2026-09-28", "2026-10-04", "이번 주")
    assert (o["주제"], o["목표건수"], o["예산"]) == (주문서["주제"], 주문서["목표건수"], 주문서["예산"])
    _, d = 부르기("POST", "/topic/make", {"field": 몸["field"], "기간": {"종류": "최근N일", "N": 7}}, **kw)
    assert 창.읽기(d["job"])["order"]["기간말"] == "최근 7일"


def test_저장된_분야로_모으기_거절():
    창, 불린, kw = 준비(바닥)
    _, 몸 = 부르기("POST", "/topic/fields", {"job": 끝난판(창)}, **kw)  # 저장은 지갑과 상관없다
    assert 부르기("POST", "/topic/make", {"field": "20000101-000000-00000000", "기간": {"종류": "지난주"}}, **kw)[0] == 404
    상태, d = 부르기("POST", "/topic/make", {"field": 몸["field"],
                                         "기간": {"종류": "직접", "시작": "2026-01-01", "끝": "2026-01-02"}}, **kw)
    assert 상태 == 400 and "기간은" in d["error"]
    상태, d = 부르기("POST", "/topic/make", {"field": 몸["field"], "기간": {"종류": "지난주"}}, **kw)
    assert 상태 == 503 and "AI 소식은 그대로" in d["error"] and 불린 == []
