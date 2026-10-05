# -*- coding: utf-8 -*-
"""수리공(계획 4 설계 C) — 창고 장부 · Apify 조사 · 수리공 · 판 쪽 연결. Apify·딥시크는 가짜, 돈 0."""
import json
from datetime import date
from types import SimpleNamespace

import pytest

import cost
import store
from fakes import 가짜S3
from fakes_topic import KAITO, 가짜대화, 가짜실행, 주문서, 주제손, 트윗, 현장만들기
from topic import apify, flow, registry, repair, tools


def 장부만들기(s3=None, 키=registry.운영키):
    return registry.장부(s3 or 가짜S3(), "통", "weekly/", 키=키)


# ── 창고 장부(과제 25) ────────────────────────────────────────────────────────

def test_장부는_없으면_씨앗을_복사해_시작한다():
    s3 = 가짜S3()
    d = 장부만들기(s3).읽기()
    assert {k for k in d if not k.startswith("_")} == set(registry.읽기())
    assert d["x_search"]["도구"] == KAITO and d["x_search"]["예전"] == [] and d["x_search"]["계정예외"] == {}
    assert d["_씨앗"] == registry._씨앗지문() and "weekly/memory/registry.json" in s3.것들


def test_장부는_1분_동안_다시_안_읽고_새로면_읽는다():
    s3 = 가짜S3()
    시 = [0.0]
    장 = registry.장부(s3, "통", "weekly/", 지금=lambda: 시[0])
    장.읽기()
    d = json.loads(s3.것들["weekly/memory/registry.json"])
    d["x_search"]["도구"] = "바뀐~도구"
    s3.put_object(Bucket="통", Key="weekly/memory/registry.json", Body=json.dumps(d, ensure_ascii=False))
    assert 장.읽기()["x_search"]["도구"] == KAITO  # 받아 둔 것
    assert 장.읽기(새로=True)["x_search"]["도구"] == "바뀐~도구"
    d["x_search"]["도구"] = "또~바뀜"
    s3.put_object(Bucket="통", Key="weekly/memory/registry.json", Body=json.dumps(d, ensure_ascii=False))
    시[0] = 61.0
    assert 장.읽기()["x_search"]["도구"] == "또~바뀜"


def test_씨앗이_바뀌면_수리공이_안_고친_칸만_씨앗을_따른다(monkeypatch):
    s3 = 가짜S3()
    장부만들기(s3).고치기("x_search", {"도구": "새~도구", "입력": {"q": "{검색어}"}, "건당": 0.0004, "시작삯": 0}, "시험", 0.01)
    씨앗 = registry.읽기()
    monkeypatch.setattr(registry, "읽기", lambda: {**씨앗, "web_search": {**씨앗["web_search"], "건당": 0.009}})
    monkeypatch.setattr(registry, "_씨앗지문", lambda: "바뀐씨앗")
    d = 장부만들기(s3).읽기()
    assert d["web_search"]["건당"] == 0.009 and d["x_search"]["도구"] == "새~도구" and d["_씨앗"] == "바뀐씨앗"


def test_고치기는_옛_칸을_예전에_두고_기록을_남긴다():
    장 = 장부만들기()
    장.고치기("web_search", {"도구": "새~구글", "입력": {"q": "{검색어}"}, "건당": 0.0003, "시작삯": 0.001}, "도구 없음 — 갈아탐", 0.031)
    칸 = 장.읽기(새로=True)["web_search"]
    assert (칸["도구"], 칸["건당"], 칸["시작삯"]) == ("새~구글", 0.0003, 0.001)
    assert "최소상한" not in 칸  # 갈아탄 도구에 옛 도구의 최저 상한을 안 물린다
    assert 칸["예전"][0]["도구"] == "apify~google-search-scraper" and 칸["예전"][0]["최소상한"] == 0.5
    기록 = 칸["고친기록"][-1]
    assert (기록["까닭"], 기록["돈"], 기록["후"]["도구"], 기록["계정"]) == ("도구 없음 — 갈아탐", 0.031, "새~구글", "")


def test_입력만_고치면_같은_도구의_최소상한은_그대로():
    장 = 장부만들기()
    장.고치기("web_search", {"입력": {"queries": "{검색어}"}}, "입력 형식이 바뀜", 0.01)
    칸 = 장.읽기()["web_search"]
    assert 칸["도구"] == "apify~google-search-scraper" and 칸["최소상한"] == 0.5 and 칸["입력"] == {"queries": "{검색어}"}


def test_계정예외는_그_계정만_다른_도구로():
    장 = 장부만들기()
    장.고치기("x_account_기간", {"도구": "새~X", "입력": {"handle": "{계정}"}, "건당": 0.0004, "시작삯": 0}, "광고만 옴", 0.02,
            계정="XAI")
    assert 장.항목("x_account_기간", 계정="xai")["도구"] == "새~X"
    assert 장.항목("x_account_기간", 계정="nasa")["도구"] == KAITO and 장.항목("x_account_기간")["도구"] == KAITO
    assert 장.읽기()["x_account_기간"]["예전"] == []  # 계정예외는 본 칸을 안 바꾼다


def test_잇단_실패는_따로_세고_장부_파일은_안_건드린다():
    s3 = 가짜S3()
    장 = 장부만들기(s3)
    장.읽기()
    전 = s3.것들["weekly/memory/registry.json"]
    assert 장.실패적기("x_search") == 1 and 장.실패적기("x_search") == 2
    assert s3.것들["weekly/memory/registry.json"] == 전 and "weekly/memory/registry-fails/x_search.json" in s3.것들
    장.성공적기("x_search")
    assert 장.실패적기("x_search") == 1


def test_수리공이_바꾼_칸만_예전_것으로_되돌린다():
    장 = 장부만들기()
    assert not 장.되돌릴까("x_search")  # 씨앗 그대로인 칸은 되돌릴 것이 없다
    장.고치기("x_search", {"도구": "새~X", "입력": {"q": "{검색어}"}, "건당": 0.0004, "시작삯": 0}, "갈아탐", 0.02)
    assert 장.되돌릴까("x_search") and 장.되돌리기("x_search")
    칸 = 장.읽기()["x_search"]
    assert 칸["도구"] == KAITO and 칸["예전"] == [] and 칸["고친기록"][-1]["되돌림"] is True
    assert not 장.되돌릴까("x_search")  # 되돌린 것을 또 되돌리지 않는다


def test_시험용_장부는_운영_장부와_떨어져_있다():
    s3 = 가짜S3()
    장부만들기(s3, 키="memory/registry-test.json").고치기("x_search", {"입력": {"bad": 1}}, "시험", 0)
    assert "weekly/memory/registry-test.json" in s3.것들 and "weekly/memory/registry.json" not in s3.것들
    assert "weekly/memory/registry-test-fails/x_search.json" in s3.것들


# ── 도구 상자가 창고 장부를 쓴다(과제 26) ──────────────────────────────────────────

def 부르기(현, 이름, **인자):
    return tools.부르기(현, {"이름": 이름, "인자": 인자, "인자탈": ""})


def test_창고_장부가_있으면_거기서_도구를_고른다():
    장 = 장부만들기()
    장.고치기("x_search", {"도구": "새~X", "입력": {"searchTerms": ["{검색어}"], "maxItems": "{개수}"}, "건당": 0.0004,
                         "시작삯": 0}, "시험", 0)
    실행 = 가짜실행({"새~X": [트윗(1)]})
    현 = 현장만들기(실행)
    현.장부 = 장
    부르기(현, "x_search", query="CORTIS")
    assert 실행.받은[0][:2] == ("새~X", {"searchTerms": ["CORTIS"], "maxItems": 20})


def test_계정예외가_있는_계정만_그_도구로():
    장 = 장부만들기()
    장.고치기("x_account_기간", {"도구": "새~X", "입력": {"handle": "{계정}", "n": "{개수}"}, "건당": 0.0004, "시작삯": 0},
            "광고만", 0, 계정="cortis_official")
    실행 = 가짜실행({"새~X": [트윗(1)], KAITO: [트윗(2, 계정="other")]})
    현 = 현장만들기(실행)
    현.장부 = 장
    부르기(현, "x_account", account="@CORTIS_official", deep=True)
    부르기(현, "x_account", account="other", deep=True)
    assert [x[0] for x in 실행.받은] == ["새~X", KAITO]


def test_수리공이_바꾼_칸이_두_번_잇달아_고장이면_예전_것으로_되돌린다():
    장 = 장부만들기()
    장.고치기("x_search", {"도구": "새~X", "입력": {"q": "{검색어}"}, "건당": 0.0004, "시작삯": 0}, "갈아탐", 0.02)
    현 = 현장만들기(가짜실행({"새~X": apify.도구탈("고장", "실행 FAILED")}))
    현.장부 = 장
    부르기(현, "x_search", query="a")
    assert 장.읽기(새로=True)["x_search"]["도구"] == "새~X"  # 한 번은 참는다
    부르기(현, "x_search", query="b")
    assert 장.읽기(새로=True)["x_search"]["도구"] == KAITO
    assert any("예전 것으로 되돌렸다" in x for x in 현.판["경고"])


def test_성공하면_잇단_실패를_0으로_막힘은_안_센다():
    s3 = 가짜S3()
    장 = 장부만들기(s3)
    실행 = 가짜실행({KAITO: apify.도구탈("고장", "실행 FAILED")})
    현 = 현장만들기(실행)
    현.장부 = 장

    def 실패():
        return json.loads(s3.것들["weekly/memory/registry-fails/x_search.json"])["연속실패"]
    부르기(현, "x_search", query="a")
    assert 실패() == 1
    실행.답들[KAITO] = [트윗(1)]
    부르기(현, "x_search", query="b")
    assert 실패() == 0
    실행.답들[KAITO] = apify.도구탈("막힘", "HTTP 429")
    부르기(현, "x_search", query="c")
    assert 실패() == 0  # 막힘은 도구 탓이 아니다


def test_기간값은_한국_날짜를_UTC_로():
    from datetime import date
    assert tools.기간값(date(2026, 9, 21), date(2026, 9, 27)) == {
        "시작UTC": "2026-09-20_15:00:00_UTC", "끝UTC": "2026-09-27_15:00:00_UTC", "시작하루전": "2026-09-20",
        "끝다음": "2026-09-28"}


def test_실패한_실행에는_열쇠_순번과_실행_번호를_단다(monkeypatch):
    monkeypatch.setenv("APIFY_TOKENS", "apify_api_AAAA1111")
    apify._지갑.update(때=0.0, 값=None)
    받은 = []

    def 보내기(방법, 길, 열쇠, 몸=None, 시간=90):
        받은.append(길)
        if 길 == "/users/me/limits":
            return 200, {"data": {"limits": {"maxMonthlyUsageUsd": 5}, "current": {"monthlyUsageUsd": 0}}}
        if "/runs?" in 길:
            return 201, {"data": {"id": "run7", "status": "FAILED", "defaultDatasetId": "d", "statusMessage": "죽음"}}
        return 200, []
    monkeypatch.setattr(apify, "_보내기", 보내기)
    with pytest.raises(apify.도구탈) as e:
        apify.실행("a~b", {}, 0.05, 시간=60, 기다림=90)
    assert e.value.종류 == "고장" and e.value.실행 == (0, "run7")
    assert any("timeout=60" in 길 for 길 in 받은)


def test_주제_손은_창고_장부를_갖는다(monkeypatch):
    import app
    import store
    monkeypatch.setattr(app, "_창고", lambda: store.창고(가짜S3(), "통"))
    손 = app.주제손만들기()
    assert isinstance(손.장부, registry.장부) and 손.장부.키 == "memory/registry.json" and 손.장부.통 == "통"


# ── Apify 조사(과제 27) ─────────────────────────────────────────────────────────

가게답 = {"data": {"items": [
    {"username": "apidojo", "name": "tweet-scraper",
     "stats": {"totalUsers30Days": 8371, "publicActorRunStats30Days": {"SUCCEEDED": 98, "TOTAL": 100}},
     "currentPricingInfo": {"pricingModel": "PAY_PER_EVENT", "pricingPerEvent": {"actorChargeEvents": {
         "apify-default-dataset-item": {"isPrimaryEvent": True, "eventTieredPricingUsd": {
             "FREE": {"tieredEventPriceUsd": 0.0004}, "GOLD": {"tieredEventPriceUsd": 0.0003}}}}}}},
    {"username": "x", "name": "lite", "stats": {},
     "currentPricingInfo": {"pricingModel": "PAY_PER_EVENT", "minimalMaxTotalChargeUsd": 0.02, "pricingPerEvent": {
         "actorChargeEvents": {"list-query": {"eventPriceUsd": 0.016}, "apify-actor-start": {"eventPriceUsd": 0.00005}}}}},
    {"name": "이름만"}]}}


def test_가게찾기는_성적과_값을_꺼내고_열쇠가_없으면_빈_열쇠로(monkeypatch):
    받은 = []
    monkeypatch.delenv("APIFY_TOKENS", raising=False)
    monkeypatch.setattr(apify, "_보내기", lambda 방법, 길, 열쇠, 몸=None, 시간=90: 받은.append((방법, 길, 열쇠)) or (200, 가게답))
    난것 = apify.가게찾기("twitter scraper", 5)
    assert 받은 == [("GET", "/store?search=twitter%20scraper&limit=5", "")]
    assert [x["액터"] for x in 난것] == ["apidojo~tweet-scraper", "x~lite"]
    assert (난것[0]["성공률"], 난것[0]["사용자30"]) == (0.98, 8371)
    assert 난것[0]["값매김"] == {"모델": "PAY_PER_EVENT", "사건": {"apify-default-dataset-item": 0.0004},
                             "주사건": "apify-default-dataset-item", "최소상한": None}
    둘 = 난것[1]["값매김"]
    assert 둘["주사건"] is None and 둘["최소상한"] == 0.02 and 둘["사건"]["list-query"] == 0.016
    assert apify.실제값(둘, {"list-query": 1, "apify-actor-start": 1, "모르는": 3}) == 0.01605


def test_액터정보는_중단과_성적_입력형식은_글로_온_스키마도(monkeypatch):
    def 보내기(방법, 길, 열쇠, 몸=None, 시간=90):
        if 길 == "/acts/a~b":
            return 200, {"data": {"isDeprecated": True, "stats": {"totalUsers30Days": 3, "publicActorRunStats30Days": {
                "SUCCEEDED": 1, "TOTAL": 4}}, "pricingInfos": [{"pricingModel": "FLAT_PRICE_PER_MONTH"}, {
                "pricingModel": "PAY_PER_EVENT", "pricingPerEvent": {"actorChargeEvents": {"r": {"eventPriceUsd": 0.002}}}}]}}
        if 길 == "/acts/a~b/builds/default":
            return 200, {"data": {"inputSchema": json.dumps({"properties": {"q": {"type": "string"}}, "required": ["q"]})}}
        return 404, {"error": {"message": "없음"}}
    monkeypatch.setattr(apify, "_보내기", 보내기)
    정보 = apify.액터정보("a~b")
    assert (정보["중단"], 정보["성공률"], 정보["사용자30"], 정보["값매김"]["모델"]) == (True, 0.25, 3, "PAY_PER_EVENT")
    assert apify.입력형식("a~b") == {"properties": {"q": {"type": "string"}}, "required": ["q"]}
    assert apify.액터정보("없는~것") is None and apify.입력형식("없는~것") is None


class _가짜답:
    def __init__(self, 글=b"{}"):
        self.status, self.글 = 200, 글

    def read(self):
        return self.글

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def test_열쇠는_머리글로만_없으면_머리글_없이(monkeypatch):
    받은 = []
    monkeypatch.setattr(apify.urllib.request, "urlopen", lambda 요청, timeout=0: 받은.append(요청) or _가짜답())
    apify._보내기("GET", "/store?search=x", "")
    apify._보내기("GET", "/acts/a~b", "apify_api_AAAA1111")
    assert "Authorization" not in 받은[0].headers
    assert 받은[1].headers["Authorization"] == "Bearer apify_api_AAAA1111" and "apify_api_" not in 받은[1].full_url


def test_실행기록은_끝_2000자를_그_열쇠로_머리글에(monkeypatch):
    monkeypatch.setenv("APIFY_TOKENS", "apify_api_AAAA1111\napify_api_BBBB2222")
    받은 = []
    monkeypatch.setattr(apify.urllib.request, "urlopen",
                        lambda 요청, timeout=0: 받은.append(요청) or _가짜답(("앞" * 3000 + "끝").encode("utf-8")))
    글 = apify.실행기록(1, "run7")
    assert 글.endswith("끝") and len(글) == 2000
    assert 받은[0].full_url == "https://api.apify.com/v2/actor-runs/run7/log"
    assert 받은[0].headers["Authorization"] == "Bearer apify_api_BBBB2222"
    assert apify.실행기록(0, "../x") == "" and len(받은) == 1  # 이상한 번호는 안 묻는다


# ── 수리공 뼈대(과제 28) ────────────────────────────────────────────────────────

빈조회 = SimpleNamespace(액터정보=lambda a: None, 입력형식=lambda a: None, 가게찾기=lambda q, n=20: [],
                       실행기록=lambda i, r: "")


def 수리손(s3=None, 실행=None, 한번=None, 조회=None, 기억=None, 남은=900.0):
    return SimpleNamespace(s3=s3 or 가짜S3(), 통="통", 앞="weekly/", 실행=실행 or 가짜실행(), 한번=한번,
                           조회=조회 or 빈조회, 기억=기억, 지금글=lambda: "2026-10-04T05:00:00Z",
                           오늘=lambda: date(2026, 10, 4), 잠자기=lambda s: None, 남은초=lambda: 남은)


def nasa트윗(번=1, 시각="2026-10-02T03:00:00Z", 글=None):
    return 트윗(번, 계정="NASA", 시각=시각, 글=글 or f"NASA 소식 {번}")


def test_잡기는_한_도구에_하나만_묵은_것은_다시():
    s3 = 가짜S3()
    판 = repair.상태창고(s3, "통")
    assert 판.잡기("x_search", "j1", "고장", "2026-10-04T05:00:00Z", lambda s: None)
    assert 판.잡기("x_search", "j2", "고장", "2026-10-04T05:05:00Z", lambda s: None) is None
    assert 판.잡기("x_search", "j3", "고장", "2026-10-04T05:20:00Z", lambda s: None)  # 15분 넘은 «고치는중» 은 묵은 것
    assert 판.읽기("x_search")["job"] == "j3" and "weekly/memory/repairs/x_search.json" in s3.것들

    def 끼어들기(s):  # 적고 기다리는 사이 다른 수리공이 적었다 — 나중에 쓴 쪽이 이긴다
        판.쓰기("web_search", {"상태": "고치는중", "시작": "2026-10-04T05:00:00Z", "표": "남의표"})
    assert 판.잡기("web_search", "j4", "고장", "2026-10-04T05:00:00Z", 끼어들기) is None
    assert repair.상태키("weekly/", "memory/registry-test.json", "x_search") == "weekly/memory/repairs-test/x_search.json"


def test_늘_활발한_대상에서_멀쩡하면_글없음으로_끝내고_장부는_그대로():
    s3 = 가짜S3()
    실행 = 가짜실행({KAITO: [nasa트윗(1), nasa트윗(2)]})
    r = repair.수리({"도구": "x_search", "job": "j", "탈": {"종류": "이상함", "말": "광고"}}, 수리손(s3=s3, 실행=실행))
    assert r["상태"] == "글없음" and "NASA" in r["까닭"] and (r["시험수"], r["돈"]) == (1, 0.0005)
    도구, 입력, 상한 = 실행.받은[0]
    assert 도구 == KAITO and 상한 == 0.01 and 입력 == {
        "searchTerms": ["nasa since:2026-09-27_15:00:00_UTC until:2026-10-04_15:00:00_UTC"], "maxItems": 5,
        "queryType": "Latest"}
    assert repair.상태창고(s3, "통").읽기("x_search")["상태"] == "글없음"
    칸 = registry.장부(s3, "통", "weekly/").읽기()["x_search"]
    assert 칸["도구"] == KAITO and 칸["고친기록"] == []


def test_다른_수리공이_고치는_중이면_바로_돌아온다():
    s3 = 가짜S3()
    repair.상태창고(s3, "통").쓰기("x_search", {"상태": "고치는중", "시작": "2026-10-04T04:58:00Z", "표": "남의표"})
    실행 = 가짜실행({KAITO: [nasa트윗(1)]})
    assert repair.수리({"도구": "x_search", "job": "j", "탈": {"종류": "고장", "말": "x"}}, 수리손(s3=s3, 실행=실행)) == {
        "상태": "이미고치는중"}
    assert 실행.받은 == [] and repair.상태창고(s3, "통").읽기("x_search")["표"] == "남의표"


def test_재현도_두_번_실패하면_못고침과_사람이_할_일():
    s3 = 가짜S3()
    실행 = 가짜실행({KAITO: apify.도구탈("고장", "실행 FAILED")})
    r = repair.수리({"도구": "x_search", "job": "j", "탈": {"종류": "고장", "말": "실행 FAILED"}}, 수리손(s3=s3, 실행=실행))
    assert r["상태"] == "못고침" and r["까닭"].startswith("재현: 고장: 실행 FAILED") and r["시험수"] == 2 and r["사람할일"]
    assert repair.상태창고(s3, "통").읽기("x_search")["상태"] == "못고침"


def test_울타리_시험_한_번_5센트_다섯_번_돈_상한():
    손 = 수리손(실행=가짜실행({KAITO: [nasa트윗(1)]}))
    활발, 기간 = repair.늘활발값("x_search", date(2026, 10, 4))
    셈 = repair._셈(0.20)
    비싼 = {**registry.읽기()["x_search"], "건당": 0.02}
    assert "넘음" in repair.시험(비싼, "x_search", 활발, 기간, 손, 셈)["까닭"] and 셈.시험수 == 0
    항목 = registry.읽기()["x_search"]
    for _ in range(5):
        assert repair.시험(항목, "x_search", 활발, 기간, 손, 셈)["통과"]
    assert repair.시험(항목, "x_search", 활발, 기간, 손, 셈)["멈춤"] and 셈.시험수 == 5
    assert repair.시험(항목, "x_search", 활발, 기간, 손, repair._셈(0.0))["멈춤"]
    assert repair.시험(항목, "x_search", 활발, 기간, 수리손(남은=100.0), repair._셈(0.2))["멈춤"]  # 람다 시간


@pytest.mark.parametrize("답, 까닭", [
    ([{"text": "From KaitoEasyAPI, a reminder"}] * 3, "우리 꼴로 읽힌 글이 없다"),
    ([nasa트윗(1, 시각="2026-08-01T03:00:00Z")], "기간 안 글이 없다"),
    ([nasa트윗(i, 글="같은 광고") for i in range(5)], "광고문"),
])
def test_시험은_우리_꼴로_읽히고_기간_안이고_광고문이_아니어야_받는다(답, 까닭):
    활발, 기간 = repair.늘활발값("x_search", date(2026, 10, 4))
    r = repair.시험(registry.읽기()["x_search"], "x_search", 활발, 기간, 수리손(실행=가짜실행({KAITO: 답})), repair._셈(0.2))
    assert r["통과"] is False and 까닭 in r["까닭"]


def test_읽는_꼴은_장부_칸마다_도구_상자와_같다():
    assert len(repair.읽은글들("x_account_기간", [nasa트윗(1)])) == 1
    assert repair.읽은글들("instagram_account", []) == [] and repair.읽은글들("web_search", []) == []
    assert set(repair.자리들) == set(registry.읽기()) == set(repair.가게검색어) == set(repair.하는일)


def test_모르는_칸이면_못고침_수리공이_터져도_상태는_남긴다():
    assert repair.수리({"도구": "nope"}, 수리손())["상태"] == "못고침"
    s3 = 가짜S3()
    손 = 수리손(s3=s3)

    def 고장난시계():
        raise RuntimeError("시계 고장")
    손.오늘 = 고장난시계
    r = repair.수리({"도구": "x_search", "job": "j", "탈": {"종류": "고장", "말": "x"}}, 손)
    assert r["상태"] == "못고침" and "수리공 오류 — RuntimeError" in r["까닭"]
    assert repair.상태창고(s3, "통").읽기("x_search")["상태"] == "못고침"


# ── 수리공 고치기(과제 29) ──────────────────────────────────────────────────────

def 조회만들기(정보=None, 형식=None, 가게=()):
    정보, 형식 = dict(정보 or {}), dict(형식 or {})
    return SimpleNamespace(액터정보=lambda a: 정보.get(a), 입력형식=lambda a: 형식.get(a),
                           가게찾기=lambda q, n=20: list(가게), 실행기록=lambda i, r: "로그 끝: searchTerms is not allowed")


def 값매김(사건=None, 주="apify-default-dataset-item"):
    return {"모델": "PAY_PER_EVENT", "사건": 사건 or {"apify-default-dataset-item": 0.0004}, "주사건": 주, "최소상한": None}


def 정보(액터, 사건=None, 중단=False):
    return {"액터": 액터, "성공률": 0.99, "사용자30": 5000, "중단": 중단, "값매김": 값매김(사건)}


def 가게줄(액터, 사용자=5000, 사건=None, 주="apify-default-dataset-item"):
    return {"액터": 액터, "성공률": 0.99, "사용자30": 사용자, "값매김": 값매김(사건, 주)}


class 가짜한번:
    """딥시크 pro 자리 — 받은 사용자 글을 적고 차례로 틀을 낸다."""

    def __init__(self, *틀들):
        self.틀들, self.받은 = list(틀들), []

    def __call__(self, 시스템, 사용자, 한도):
        self.받은.append(사용자)
        틀 = self.틀들.pop(0) if self.틀들 else {}
        return {"글": "생각한 뒤 " + json.dumps({"입력": 틀}, ensure_ascii=False), "넘침": False, "입력토큰": 3000,
                "캐시토큰": 0, "출력토큰": 500}


def test_입력_형식이_바뀌면_딥시크가_새_틀을_쓰고_시험해_고친다():
    새틀 = {"searchQueries": ["{검색어} since:{시작UTC} until:{끝UTC}"], "maxTweets": "{개수}"}

    def 카이토(입력):
        if "searchQueries" in 입력:
            return [nasa트윗(1), nasa트윗(2)]
        raise apify.도구탈("입력", "Input is not valid: field searchTerms is not allowed")
    형식 = {"properties": {"searchQueries": {"type": "array", "title": "검색어들"}, "maxTweets": {"type": "integer"}},
          "required": ["searchQueries"]}
    한번 = 가짜한번(새틀)
    s3 = 가짜S3()
    손 = 수리손(s3=s3, 실행=가짜실행({KAITO: 카이토}), 한번=한번, 조회=조회만들기({KAITO: 정보(KAITO)}, {KAITO: 형식}))
    r = repair.수리({"도구": "x_search", "job": "j", "탈": {"종류": "입력", "말": "Input is not valid", "실행": [0, "run7"]}}, 손)
    assert r["상태"] == "고침" and r["시험수"] == 3 and r["딥시크"] > 0 and r["까닭"] == "입력 형식이 바뀌어 새 형식으로 맞춤"
    칸 = registry.장부(s3, "통", "weekly/").읽기(새로=True)["x_search"]
    assert 칸["입력"] == 새틀 and 칸["도구"] == KAITO and 칸["고친기록"][-1]["까닭"] == "입력 형식이 바뀌어 새 형식으로 맞춤"
    물음 = 한번.받은[0]
    assert "꼭 쓸 자리: {검색어}" in 물음 and "오류: Input is not valid" in 물음 and "- searchQueries (array, 필수)" in 물음
    assert "로그 끝: searchTerms is not allowed" in 물음


class 가짜맨틀(가짜한번):
    """«입력» 껍데기 없이 틀만 내는 딥시크 — 받은 한도도 적는다."""

    def __call__(self, 시스템, 사용자, 한도):
        self.받은.append(사용자)
        self.한도 = 한도
        틀 = self.틀들.pop(0) if self.틀들 else {}
        return {"글": json.dumps(틀, ensure_ascii=False), "넘침": False, "입력토큰": 3000, "캐시토큰": 0, "출력토큰": 500}


def test_딥시크가_입력_껍데기_없이_틀만_내도_받고_생각할_자리를_넉넉히_준다():
    # 갈아탈 후보 셋이 모두 «딥시크 답이 한도에서 잘림·틀을 안 냈다» 로 못고침이었다(진짜 시험 6, 2026-10-05)
    새틀 = {"searchQueries": ["{검색어} since:{시작UTC} until:{끝UTC}"], "maxTweets": "{개수}"}

    def 카이토(입력):
        if "searchQueries" in 입력:
            return [nasa트윗(1), nasa트윗(2)]
        raise apify.도구탈("입력", "Input is not valid: field searchTerms is not allowed")
    형식 = {"properties": {"searchQueries": {"type": "array"}, "maxTweets": {"type": "integer"}}, "required": ["searchQueries"]}
    한번 = 가짜맨틀(새틀)
    s3 = 가짜S3()
    손 = 수리손(s3=s3, 실행=가짜실행({KAITO: 카이토}), 한번=한번, 조회=조회만들기({KAITO: 정보(KAITO)}, {KAITO: 형식}))
    r = repair.수리({"도구": "x_search", "job": "j", "탈": {"종류": "입력", "말": "Input is not valid"}}, 손)
    assert r["상태"] == "고침" and registry.장부(s3, "통", "weekly/").읽기(새로=True)["x_search"]["입력"] == 새틀
    assert 한번.한도 >= 16000


def test_딥시크가_자리를_따옴표_없이_써도_읽는다():
    # «자리가 칸 값 전체면 숫자 꼴 그대로» 를 따라 {"maxItems": {개수}} 로 써서 «틀을 안 냈다» 가 됐다(진짜 시험 6 다시)
    글 = '생각 끝 {"입력": {"twitterHandles": ["{계정}"], "maxItems": {개수}, "sort": "Latest", "q": "from:{계정} x",' \
        ' "n": [{개수}, 3]}}'
    assert repair._json(글) == {"입력": {"twitterHandles": ["{계정}"], "maxItems": "{개수}", "sort": "Latest",
                                       "q": "from:{계정} x", "n": ["{개수}", 3]}}
    assert repair._json('{"입력": {"q": "{검색어}"}}') == {"입력": {"q": "{검색어}"}}
    assert repair._json("틀 없음") is None


def test_딥시크가_모르는_자리를_쓰면_안_받고_사람에게():
    s3 = 가짜S3()
    손 = 수리손(s3=s3, 실행=가짜실행({KAITO: apify.도구탈("입력", "bad")}), 한번=가짜한번({"q": "{없는자리} {검색어}"}),
             조회=조회만들기({KAITO: 정보(KAITO)}, {KAITO: {"properties": {"q": {}}}}))
    r = repair.수리({"도구": "x_search", "job": "j", "탈": {"종류": "입력", "말": "bad"}}, 손)
    assert r["상태"] == "못고침" and "모르는 자리 ['없는자리']" in r["까닭"] and r["시험수"] == 2
    assert registry.장부(s3, "통", "weekly/").읽기(새로=True)["x_search"]["고친기록"] == []


def test_도구가_없어지면_거른_후보로_갈아타고_값은_시험에서_정한다():
    s3 = 가짜S3()
    장 = registry.장부(s3, "통", "weekly/")
    장.고치기("x_search", {"도구": "nobody~gone"}, "시험 준비", 0)
    실행 = 가짜실행({"nobody~gone": apify.도구탈("고장", "없는 도구 — Actor was not found"),
                  "apidojo~tweet-scraper": [nasa트윗(1), nasa트윗(2), nasa트윗(3)]})
    가게 = [가게줄("login~scraper", 사용자=20000), 가게줄("few~users", 사용자=50),
           가게줄("pricey~query", 사건={"list-query": 0.016}, 주=None), 가게줄("apidojo~tweet-scraper", 사용자=8000)]
    조회 = 조회만들기({"login~scraper": 정보("login~scraper"), "apidojo~tweet-scraper": 정보("apidojo~tweet-scraper")},
                    {"login~scraper": {"properties": {"q": {}, "cookies": {}}},
                     "apidojo~tweet-scraper": {"properties": {"searchTerms": {}, "maxItems": {}}, "required": ["searchTerms"]}},
                    가게)
    한번 = 가짜한번({"searchTerms": ["{검색어} since:{시작UTC} until:{끝UTC}"], "maxItems": "{개수}"})
    r = repair.수리({"도구": "x_search", "job": "j", "탈": {"종류": "고장", "말": "없는 도구"}},
                   수리손(s3=s3, 실행=실행, 한번=한번, 조회=조회))
    assert r["상태"] == "고침" and "apidojo~tweet-scraper" in r["까닭"]
    칸 = 장.읽기(새로=True)["x_search"]
    assert (칸["도구"], 칸["건당"], 칸["시작삯"]) == ("apidojo~tweet-scraper", 0.0004, 0.0)
    assert 칸["예전"][0]["도구"] == "nobody~gone"
    assert {x[0] for x in 실행.받은} == {"nobody~gone", "apidojo~tweet-scraper"}  # 로그인·사용자 적음·비싼 도구는 안 돌림
    assert len(한번.받은) == 1  # 로그인 칸 있는 도구는 딥시크도 안 부른다


def test_시험에서_실제_값이_4배를_넘으면_안_받는다():
    s3 = 가짜S3()
    registry.장부(s3, "통", "weekly/").고치기("x_search", {"도구": "nobody~gone"}, "시험 준비", 0)

    def 실행(도구, 입력, 돈상한, **kw):
        if 도구 == "nobody~gone":
            raise apify.도구탈("고장", "없는 도구")
        return {"것들": [nasa트윗(1), nasa트윗(2), nasa트윗(3)], "청구": {"apify-default-dataset-item": 3, "premium": 3},
                "상태": "SUCCEEDED", "열쇠순번": 0}
    사건 = {"apify-default-dataset-item": 0.0004, "premium": 0.01}
    조회 = 조회만들기({"sneaky~x": 정보("sneaky~x", 사건=사건)}, {"sneaky~x": {"properties": {"searchTerms": {}}}},
                    [가게줄("sneaky~x", 사건=사건)])
    r = repair.수리({"도구": "x_search", "job": "j", "탈": {"종류": "고장", "말": "없는 도구"}},
                   수리손(s3=s3, 실행=실행, 한번=가짜한번({"searchTerms": ["{검색어}"]}), 조회=조회))
    assert r["상태"] == "못고침" and "sneaky~x: 값이 지금의 4배를 넘음" in r["까닭"]
    assert registry.장부(s3, "통", "weekly/").읽기(새로=True)["x_search"]["도구"] == "nobody~gone"


def 광고계정손(s3, 기억, 한번=None):
    def 카이토(입력):
        return [nasa트윗(1)] if "from:nasa" in 입력["searchTerms"][0] else [{"text": "From KaitoEasyAPI, a reminder"}] * 3
    실행 = 가짜실행({KAITO: 카이토, "apidojo~tweet-scraper": [트윗(1, 계정="xai", 시각="2026-09-24T03:00:00Z", 글="Grok 5 출시")]})
    조회 = 조회만들기({"apidojo~tweet-scraper": 정보("apidojo~tweet-scraper")},
                    {"apidojo~tweet-scraper": {"properties": {"searchTerms": {}, "maxItems": {}}}},
                    [가게줄("apidojo~tweet-scraper")])
    return 수리손(s3=s3, 실행=실행, 한번=한번 or 가짜한번(
        {"searchTerms": ["from:{계정} since:{시작UTC} until:{끝UTC}"], "maxItems": "{개수}"}), 조회=조회, 기억=기억)


def test_전에_글이_나오던_계정만_광고면_그_계정만_다른_도구로():
    from topic import memory
    s3 = 가짜S3()
    기억 = memory.기억창고(s3, "통")
    기억.출처쓰기({"출처": "x:xai", "이름들": ["xAI"], "판정": "공식", "근거": "", "확인한날": "",
                 "판들": [{"판": "p", "가져온글": 12, "쓰인": 1, "영상비율": 0}]})
    값 = {**tools.기간값(date(2026, 9, 21), date(2026, 9, 27)), "계정": "xai", "개수": 40}
    r = repair.수리({"도구": "x_account_기간", "job": "j", "탈": {"종류": "이상함", "말": "전부 광고·빈 줄"}, "값": 값},
                   광고계정손(s3, 기억))
    assert r["상태"] == "고침" and "@xai" in r["까닭"] and "계정 예외" in r["까닭"]
    장 = registry.장부(s3, "통", "weekly/")
    assert 장.항목("x_account_기간", 계정="xai")["도구"] == "apidojo~tweet-scraper"
    assert 장.항목("x_account_기간")["도구"] == KAITO


def test_성적표에_글이_없던_계정은_계정_예외를_안_찾고_글없음():
    from topic import memory
    s3 = 가짜S3()
    한번 = 가짜한번()
    값 = {**tools.기간값(date(2026, 9, 21), date(2026, 9, 27)), "계정": "MapleStory_Kor", "개수": 5}
    r = repair.수리({"도구": "x_account_기간", "job": "j", "탈": {"종류": "이상함", "말": "전부 광고·빈 줄"}, "값": 값},
                   광고계정손(s3, memory.기억창고(s3, "통"), 한번))
    assert r["상태"] == "글없음" and 한번.받은 == [] and r["시험수"] == 1


def test_판에_남은_수리_돈이_없으면_시험도_안_한다():
    실행 = 가짜실행({KAITO: [nasa트윗(1)]})
    r = repair.수리({"도구": "x_search", "job": "j", "탈": {"종류": "고장", "말": "x"}, "판남은돈": 0.0}, 수리손(실행=실행))
    assert r["상태"] == "못고침" and "울타리" in r["까닭"] and 실행.받은 == []


def test_값나누기는_시작_사건과_줄당_값을_가른다():
    assert repair.값나누기(값매김({"apify-actor-start": 0.0005, "apify-default-dataset-item": 0.001}),
                         {"apify-actor-start": 1, "apify-default-dataset-item": 4}, 4) == (0.0005, 0.001)
    assert repair.값나누기(값매김({"list-query": 0.016}, 주=None), {"list-query": 1}, 5) == (0.0, 0.0032)
    assert repair.값나누기(값매김({"apify-actor-start": 0.0005, "apify-default-dataset-item": 0.001}), {}, 3) == (0.0005, 0.001)


# ── 판 쪽 연결(과제 30) ─────────────────────────────────────────────────────────

def 수리현장(실행, s3=None):
    s3 = s3 or 가짜S3()
    현 = 현장만들기(실행)
    현.장부 = registry.장부(s3, "통", "weekly/")
    받은 = []
    현.수리부르기 = 받은.append
    현.수리상태 = repair.상태창고(s3, "통", "weekly/").읽기
    return 현, 받은, s3


def 고침적기(s3, 장부이름, job, 끝="2026-10-01T03:00:01Z", 돈=0.031):
    repair.상태창고(s3, "통", "weekly/").쓰기(장부이름, {
        "상태": "고침", "까닭": "입력 형식이 바뀌어 새 형식으로 맞춤", "사람할일": "", "끝": 끝, "job": job, "돈": 돈,
        "딥시크": 0.02, "아피파이": round(돈 - 0.02, 4)})


def test_입력_고장_이상함이면_수리공을_부르고_무엇을_넘기는지():
    현, 받은, _ = 수리현장(가짜실행({KAITO: apify.도구탈("고장", "실행 FAILED")}))
    글 = 부르기(현, "x_account", account="@CORTIS_official", deep=True, count=40)
    assert "수리공이 이 도구를 알아보는 중" in 글
    요청 = 받은[0]
    assert (요청["도구"], 요청["job"], 요청["탈"]["종류"], 요청["장부키"]) == ("x_account_기간", 현.job, "고장",
                                                                       "memory/registry.json")
    assert 요청["값"]["계정"] == "CORTIS_official" and 요청["값"]["개수"] == 40 and 요청["판남은돈"] == 0.5
    assert 요청["인자"] == {"account": "@CORTIS_official", "deep": True, "count": 40}
    assert 현.재료["수리중"]["x_account_기간"]["도구"] == "x_account"
    assert any("수리공이 알아보는 중" in x["말"] for x in 현.판["판단줄"])
    부르기(현, "x_account", account="other", deep=True)  # 고치는 중이면 또 안 부른다
    assert len(받은) == 1


def test_막힘과_돈은_수리공을_안_부른다():
    현, 받은, _ = 수리현장(가짜실행({KAITO: apify.도구탈("막힘", "HTTP 429"),
                                   "apify~instagram-hashtag-scraper": apify.도구탈("돈", "월 한도")}))
    부르기(현, "x_search", query="a")
    부르기(현, "instagram_search", query="b")
    assert 받은 == []


def test_수리공이_고치면_끈_도구를_다시_켜고_경고와_돈을_남긴다():
    현, 받은, s3 = 수리현장(가짜실행({KAITO: apify.도구탈("고장", "실행 FAILED")}))
    부르기(현, "x_search", query="a")
    부르기(현, "x_search", query="b")  # 두 번 고장 → 끈다(이미 고치는 중이라 또 안 부른다)
    assert 현.판["꺼진도구"]["x_search"].startswith("두 번 실패") and len(받은) == 1
    고침적기(s3, "x_search", 현.job)
    현.실행.답들[KAITO] = [트윗(1)]
    글 = 부르기(현, "x_search", query="c")
    assert "x_search" not in 현.판["꺼진도구"] and "E1" in 글
    assert any("x_search 고쳤다" in x for x in 현.판["경고"]) and 현.재료["수리중"] == {}
    assert 현.재료["수리기록"][0]["돈"] == 0.031 and cost.합계(현.재료)["수리"] == 0.031
    assert tools.수리결과(현.재료) == {"고침": [{"도구": "x_search", "까닭": "입력 형식이 바뀌어 새 형식으로 맞춤", "돈": 0.031}],
                                    "못고침": [], "고치는중": []}


def test_다른_판의_수리공이_고친_것은_다시_켜되_돈은_안_센다():
    현, 받은, s3 = 수리현장(가짜실행({KAITO: apify.도구탈("고장", "실행 FAILED")}))
    부르기(현, "x_search", query="a")
    고침적기(s3, "x_search", "다른판")
    부르기(현, "update_board", stage="④", judgment="다음")
    assert 현.재료["수리기록"][0]["돈"] == 0.0 and "수리" not in cost.합계(현.재료)


def test_끝난_지_오래된_상태는_이번_수리의_끝으로_안_본다():
    현, 받은, s3 = 수리현장(가짜실행({KAITO: apify.도구탈("고장", "실행 FAILED")}))
    고침적기(s3, "x_search", 현.job, 끝="2026-10-01T02:00:00Z")  # 지난번 수리의 끝
    부르기(현, "x_search", query="a")
    부르기(현, "update_board", stage="④", judgment="다음")
    assert "x_search" in 현.재료["수리중"] and not 현.재료.get("수리기록")


def test_15분이_지나도_안_끝나면_못고침으로_본다():
    현, 받은, s3 = 수리현장(가짜실행())
    현.재료["수리중"] = {"x_search": {"도구": "x_search", "시작": "2026-10-01T02:40:00Z"}}
    부르기(현, "update_board", stage="④", judgment="시험")
    기록 = 현.재료["수리기록"][0]
    assert 기록["상태"] == "못고침" and "15분" in 기록["까닭"] and 현.재료["수리중"] == {}
    assert tools.수리결과(현.재료)["못고침"][0]["도구"] == "x_search"


def test_한_판에서_한_칸은_두_번까지_고치고_또_고장이면_끈다():
    현, 받은, s3 = 수리현장(가짜실행({KAITO: apify.도구탈("고장", "실행 FAILED")}))
    부르기(현, "x_search", query="a")                 # 고장 → 수리 1
    고침적기(s3, "x_search", 현.job, 끝="2026-10-01T03:00:01Z")
    부르기(현, "x_search", query="b")                 # 고침 반영 → 또 고장 → 꺼짐(두 번 실패) → 수리 2
    고침적기(s3, "x_search", 현.job, 끝="2026-10-01T03:00:02Z")
    부르기(현, "x_search", query="c")                 # 고침 반영(다시 켬) → 또 고장 → 수리는 두 번까지
    assert len(받은) == 2 and 현.판["꺼진도구"]["x_search"] == "두 번 고치고도 또 실패"


def test_수리_돈이_한_판_50센트에_닿으면_안_부르고_못_부르면_되돌린다():
    현, 받은, _ = 수리현장(가짜실행({KAITO: apify.도구탈("고장", "실행 FAILED")}))
    현.재료["수리기록"] = [{"도구": "web_search", "이름": "web_search", "상태": "고침", "까닭": "", "사람할일": "", "돈": 0.47}]
    부르기(현, "x_search", query="a")
    assert 받은 == []
    현2, _, _ = 수리현장(가짜실행({KAITO: apify.도구탈("고장", "실행 FAILED")}))

    def 못부름(요청):
        raise RuntimeError("람다 막힘")
    현2.수리부르기 = 못부름
    부르기(현2, "x_search", query="a")
    assert 현2.재료["수리중"] == {}


def test_돈_합계와_걸음별에_도구_고치기_줄():
    재료 = {"수리기록": [{"돈": 0.031, "딥시크": 0.02, "아피파이": 0.011}, {"돈": 0.0}]}
    assert cost.합계(재료)["합계"] == 0.031 and cost.합계(재료)["수리"] == 0.031
    assert cost.걸음별(재료) == [{"걸음": None, "단계": "도구 고치기", "생각토큰": 0, "도구": [], "딥시크": 0.02,
                                "아피파이": 0.011, "그림": 0.0, "합계": 0.031}]
    assert "수리" not in cost.합계({})


def test_판에서_고장난_도구를_수리공이_고치면_결과와_돈에_남는다():
    JOB = "20261001-030000-cccccccc"
    좋은 = {"hero": "그룹", "event": "뮤직비디오 공개", "summary": "코르티스가 9월 24일 뮤직비디오 «FaSHioN» 을 공개했다 [E1].",
          "date": "2026-09-24", "source": "E1", "quote": "CORTIS 'FaSHioN' 뮤직비디오 공개", "media": "E1"}
    실행 = 가짜실행({KAITO: [트윗(1, 좋아요=12400, 영상=True, 글="CORTIS 'FaSHioN' 뮤직비디오 공개")],
                  "apify~instagram-hashtag-scraper": apify.도구탈("고장", "실행 FAILED")})
    대본 = [[("x_account", {"account": "CORTIS_official", "deep": True}),
            ("update_board", {"stage": "④", "judgment": "x:cortis_official 공식 — 인증 계정",
                              "source_verdicts": [{"place": "x:cortis_official", "verdict": "공식", "basis": "인증"}]}),
            ("instagram_search", {"query": "cortis"})],
           [("submit_result", {"items": [좋은], "unfilled": [],
                               "weekly_sources": [{"tool": "x_account", "args": {"account": "CORTIS_official"},
                                                   "why": "공식 계정"}]})]]
    손, 부른다음 = 주제손(가짜대화(대본), 실행)
    손.장부 = registry.장부(손.창고.s3, 손.창고.통, 손.창고.앞)
    상태 = repair.상태창고(손.창고.s3, 손.창고.통, 손.창고.앞)
    받은 = []

    def 수리부르기(요청):  # 수리공이 바로 고쳤다고 친다
        받은.append(요청)
        상태.쓰기(요청["도구"], {"상태": "고침", "까닭": "입력 형식이 바뀌어 새 형식으로 맞춤", "사람할일": "",
                              "끝": "2026-10-01T03:00:30Z", "job": 요청["job"], "돈": 0.04, "딥시크": 0.03, "아피파이": 0.01})
    손.수리부르기 = 수리부르기
    기록 = flow.새기록(JOB, 주문서)
    기록["started"] = "2026-10-01T03:00:00Z"
    손.창고.쓰기(기록)
    flow.달리기(JOB, "모으기", 손)
    for _ in range(10):
        if not 부른다음:
            break
        flow.달리기(*부른다음.pop(0), 손)
    기록 = 손.창고.읽기(JOB)
    assert 기록["state"] == "됨", 기록.get("error")
    assert 받은[0]["도구"] == "instagram_search" and 받은[0]["탈"]["종류"] == "고장" and 받은[0]["job"] == JOB
    assert 기록["result"]["수리"]["고침"] == [{"도구": "instagram_search", "까닭": "입력 형식이 바뀌어 새 형식으로 맞춤", "돈": 0.04}]
    assert 기록["cost"]["수리"] == 0.04 and abs(sum(x["합계"] for x in 기록["spend"]) - 기록["cost"]["합계"]) < 0.001
    assert any("instagram_search 고쳤다" in 줄 for 줄 in 기록["lines"])


def test_handler_는_수리공_사건을_수리공에게(monkeypatch):
    import app
    받은 = []
    monkeypatch.setattr(app, "수리손만들기", lambda context=None: "수리손")
    monkeypatch.setattr(app.repair, "수리", lambda 요청, 손: 받은.append((요청, 손)) or {"상태": "글없음"})
    assert app.handler({"_repair": {"도구": "x_search"}}, None) == {"상태": "글없음"}
    assert 받은 == [({"도구": "x_search"}, "수리손")]


def test_수리공_부르기는_람다를_뒤에서_부르고_손은_pro_와_조회를_갖는다(monkeypatch):
    import app
    받은 = []
    monkeypatch.setenv("AWS_LAMBDA_FUNCTION_NAME", "weekly-ai")
    monkeypatch.setattr(app, "_lam", SimpleNamespace(invoke=lambda **kw: 받은.append(kw)))
    app._수리부르기({"도구": "x_search", "job": "j"})
    assert 받은[0]["InvocationType"] == "Event" and json.loads(받은[0]["Payload"]) == {"_repair": {"도구": "x_search", "job": "j"}}
    monkeypatch.setattr(app, "_창고", lambda: store.창고(가짜S3(), "통"))
    손 = app.수리손만들기()
    assert (손.통, 손.앞) == ("통", "weekly/") and 손.조회 is app.apify and 손.한번 is app.deepseek.한번
    assert 손.실행 is app.apify.실행 and len(손.지금글()) == 20 and 손.남은초() == 900.0
    assert app.주제손만들기().수리부르기 is app._수리부르기


# ── 진짜 시험 도구(과제 32) ─────────────────────────────────────────────────────

def test_진짜_시험_도구는_시험용_장부만_망가뜨린다():
    import repair_try
    s3 = 가짜S3()
    d = repair_try.시험장부만들기(s3, "입력틀림", "통")
    assert "searchTermz" in d["x_search"]["입력"] and "searchTerms" not in d["x_search"]["입력"]
    assert d["x_search"]["도구"] == KAITO and d["web_search"] == registry._씨앗칸(registry.읽기()["web_search"])
    assert "weekly/memory/registry-test.json" in s3.것들 and "weekly/memory/registry.json" not in s3.것들
    assert repair.상태창고(s3, "통", "weekly/", "memory/registry-test.json").읽기("x_search")["상태"] == "시험 준비"
    assert repair_try.시험장부만들기(s3, "도구없음", "통")["x_search"]["도구"].startswith("nobody~")
    with pytest.raises(ValueError):
        repair_try.시험장부만들기(s3, "모르는것", "통")


# ── 가지 전체 검토(과제 36) ─────────────────────────────────────────────────────

def test_장부_읽기가_S3_오류면_씨앗으로_덮어쓰지_않는다():
    # S3 가 잠깐 막히면 «없음» 으로 보고 씨앗으로 덮어써 수리 기록이 통째로 사라졌다(검토 I-1)
    s3 = 가짜S3()
    장 = 장부만들기(s3)
    장.고치기("x_search", {"도구": "고친~도구"}, "시험", 0.01)
    키 = "weekly/memory/registry.json"
    고친것 = s3.것들[키]
    원래get = s3.get_object

    def 막힘(Bucket, Key):
        if Key == 키:
            raise TimeoutError("S3 잠깐 막힘")
        return 원래get(Bucket=Bucket, Key=Key)

    s3.get_object = 막힘
    assert 장.읽기(새로=True)["x_search"]["도구"] == "고친~도구"  # 받아 둔 것으로 돈다
    assert 장부만들기(s3).읽기()["x_search"]["도구"] == KAITO  # 처음 읽는 람다는 씨앗으로 돌되
    assert s3.것들[키] == 고친것  # 창고 장부는 그대로


def test_두_수리공이_겹쳐_써도_내_고침이_남는다():
    # 장부가 파일 하나라 다른 도구 수리공이 사이에 통째로 쓰면 앞 수리가 지워졌다(검토 I-2)
    s3 = 가짜S3()
    장 = 장부만들기(s3)
    장.읽기()
    키 = "weekly/memory/registry.json"
    남의것 = json.loads(s3.것들[키])
    남의것["instagram_search"]["도구"] = "남이~고친~도구"
    원래put = s3.put_object
    끼어듦 = [True]

    def put(Bucket, Key, Body, ContentType=None):
        원래put(Bucket=Bucket, Key=Key, Body=Body, ContentType=ContentType)
        if Key == 키 and 끼어듦[0]:
            끼어듦[0] = False  # 다른 수리공이 조금 전에 읽은 것으로 바로 뒤에 통째로 쓴다
            원래put(Bucket=Bucket, Key=Key, Body=json.dumps(남의것, ensure_ascii=False))

    s3.put_object = put
    장.고치기("x_search", {"도구": "새~도구"}, "시험", 0.01)
    d = json.loads(s3.것들[키])
    assert d["x_search"]["도구"] == "새~도구" and d["x_search"]["고친기록"][-1]["까닭"] == "시험"
    assert d["instagram_search"]["도구"] == "남이~고친~도구"  # 남의 고침도 지우지 않는다


def test_갈아탈_후보는_최저_상한이_크면_안_돌리고_실제_값이_넘으면_안_받는다():
    # 시험 상한이 후보의 «최소상한» 을 따라 울타리(한 번 5센트·한 수리 20센트)를 넘길 수 있었다(검토 I-3)
    활발, 기간 = repair.늘활발값("x_search", date(2026, 10, 4))
    실행 = 가짜실행({"누구~후보": [nasa트윗(i) for i in range(1, 11)]})
    값매김 = {"사건": {"apify-default-dataset-item": 0.001}, "주사건": "apify-default-dataset-item"}
    후보 = {**registry.읽기()["x_search"], "도구": "누구~후보", "최소상한": 0.5}
    r = repair.시험(후보, "x_search", 활발, 기간, 수리손(실행=실행), repair._셈(0.20), 값매김)
    assert not r["통과"] and "최저 상한" in r["까닭"] and 실행.받은 == []
    비싼 = {"사건": {"apify-default-dataset-item": 0.009}, "주사건": "apify-default-dataset-item"}  # 어림 5개 $0.045
    후보 = {**registry.읽기()["x_search"], "도구": "누구~후보"}
    r = repair.시험(후보, "x_search", 활발, 기간, 수리손(실행=실행), repair._셈(0.20), 비싼)  # 실제 10개 청구 $0.09
    assert not r["통과"] and "비쌌다" in r["까닭"] and r["돈"] > 0.05


def test_창고_장부에_없던_새_칸은_씨앗이_바뀌면_들어온다():
    # 계획 4 과제 42++ A — 이미지 검색을 씨앗에 더했다. 수리공이 고친 칸은 그대로 두고 없던 칸만 씨앗에서
    s3 = 가짜S3()
    장부만들기(s3).고치기("x_search", {"도구": "새~도구"}, "시험", 0.01)
    d = json.loads(s3.get_object(Bucket="통", Key="weekly/memory/registry.json")["Body"].read())
    d.pop("image_search")
    d["_씨앗"] = "옛씨앗"
    s3.put_object(Bucket="통", Key="weekly/memory/registry.json", Body=json.dumps(d, ensure_ascii=False))
    새 = 장부만들기(s3).읽기()
    assert 새["image_search"]["도구"] == "simple.actor~google-images" and 새["x_search"]["도구"] == "새~도구"
