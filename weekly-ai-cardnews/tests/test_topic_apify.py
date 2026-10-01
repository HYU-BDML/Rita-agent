# -*- coding: utf-8 -*-
import pytest

from topic import apify, registry

값들 = {"검색어": "CORTIS", "계정": "cortis_official", "계정들": ["a", "b"], "개수": 20, "정렬": "Top",
       "낱말검색": False, "시작UTC": "2026-09-20_15:00:00_UTC", "끝UTC": "2026-09-27_15:00:00_UTC",
       "시작하루전": "2026-09-20", "끝다음": "2026-09-28", "나라": "kr", "언어": "ko"}


def test_틀_채우기는_통째_자리는_꼴_그대로_섞인_자리는_글로():
    틀 = {"searchTerms": ["{검색어} since:{시작UTC}"], "maxItems": "{개수}", "usernames": "{계정들}", "kw": "{낱말검색}"}
    assert registry.채우기(틀, 값들) == {"searchTerms": ["CORTIS since:2026-09-20_15:00:00_UTC"], "maxItems": 20,
                                       "usernames": ["a", "b"], "kw": False}
    with pytest.raises(KeyError, match="없는자리"):
        registry.채우기({"a": "{없는자리}"}, 값들)


def test_씨앗_장부는_아홉_칸이_다_채워진다():
    장부 = registry.읽기()
    assert set(장부) == {"x_search", "x_account", "x_account_기간", "instagram_search", "instagram_account",
                       "instagram_account_기간", "threads_account", "web_search", "web_search_전체"}
    for 이름, 항목 in 장부.items():
        assert 항목["도구"].count("~") == 1 and 항목["건당"] > 0 and 항목["모양"], 이름
        registry.채우기(항목["입력"], 값들)
    # 구글 검색 도구는 상한을 $0.50 아래로 못 잡는다(Task 1 실제 400 — max-total-charge-usd-below-minimum)
    assert 장부["web_search"]["최소상한"] == 장부["web_search_전체"]["최소상한"] == 0.5


def test_값셈은_청구_사건으로_없으면_건수로():
    구글 = {"건당": 0.0045, "시작삯": 0.001}
    assert registry.값셈(구글, {"actor-start": 1, "search-page-scraped": 1}, 10) == 0.0055
    assert registry.값셈({"건당": 0.00025, "시작삯": 0}, {"apify-default-dataset-item": 20}, 20) == 0.005
    assert registry.값셈({"건당": 0.005, "시작삯": 0}, {}, 3) == 0.015


@pytest.fixture
def 열쇠둘(monkeypatch):
    monkeypatch.setenv("APIFY_TOKENS", "apify_api_AAAA1111\napify_api_BBBB2222")
    monkeypatch.setenv("APIFY_SHARED", "1")
    apify._지갑.update(때=0.0, 값=None)


def 한도(쓴돈):
    return 200, {"data": {"limits": {"maxMonthlyUsageUsd": 5}, "current": {"monthlyUsageUsd": 쓴돈}}}


def test_지갑_같이_쓰는_열쇠는_1달러를_남긴다(monkeypatch, 열쇠둘):
    남은 = {"apify_api_AAAA1111": 4.5, "apify_api_BBBB2222": 3.0}  # 쓴 돈
    monkeypatch.setattr(apify, "_보내기", lambda 방법, 길, 열쇠, 몸=None, 시간=90: 한도(남은[열쇠]))
    d = apify.지갑(새로=True)
    assert [x["쓸수있는"] for x in d["열쇠"]] == [0.5, 1.0] and d["쓸수있는합"] == 1.5
    assert d["낮음"] is True and d["멈춤"] is False and d["모름"] is False


def test_지갑을_하나도_못_읽으면_모름이고_막지_않는다(monkeypatch, 열쇠둘):
    monkeypatch.setattr(apify, "_보내기", lambda *a, **k: (0, {"error": {"message": "끊김"}}))
    d = apify.지갑(새로=True)
    assert d["모름"] is True and d["멈춤"] is False and d["낮음"] is False


def test_실행은_돈상한을_걸고_열쇠는_머리글로만(monkeypatch, 열쇠둘):
    받은 = []
    def 보내기(방법, 길, 열쇠, 몸=None, 시간=90):
        받은.append((방법, 길, 열쇠, 몸))
        if 길 == "/users/me/limits":
            return 한도(0.0)
        if 방법 == "POST" and "/runs?" in 길:
            return 201, {"data": {"id": "r1", "status": "RUNNING", "defaultDatasetId": "d1"}}
        if 길.startswith("/actor-runs/r1"):
            return 200, {"data": {"id": "r1", "status": "SUCCEEDED", "defaultDatasetId": "d1",
                                  "chargedEventCounts": {"apify-default-dataset-item": 2}}}
        if 길.startswith("/datasets/d1/items"):
            return 200, [{"text": "a"}, {"text": "b"}]
        raise AssertionError(길)
    monkeypatch.setattr(apify, "_보내기", 보내기)
    답 = apify.실행("kaitoeasyapi~x", {"maxItems": 2}, 0.05)
    assert 답 == {"것들": [{"text": "a"}, {"text": "b"}], "청구": {"apify-default-dataset-item": 2},
                 "상태": "SUCCEEDED", "열쇠순번": 0}
    시작 = next(x for x in 받은 if "/runs?" in x[1])
    assert "maxTotalChargeUsd=0.0500" in 시작[1] and "timeout=150" in 시작[1] and 시작[3] == {"maxItems": 2}
    assert all("apify_api_" not in 길 for _, 길, _, _ in 받은)


@pytest.mark.parametrize("상태, 몸, 종류", [
    (400, {"error": {"type": "invalid-input", "message": "Input is not valid: field maxItems"}}, "입력"),
    (402, {"error": {"type": "not-enough-usage-to-run-paid-actor", "message": "x"}}, "돈"),
    (403, {"error": {"type": "user-or-token-not-found", "message": "x"}}, "돈"),
    (404, {"error": {"type": "record-not-found", "message": "Actor was not found"}}, "고장"),
    (429, {"error": {"type": "rate-limit-exceeded", "message": "x"}}, "막힘"),
    (0, {"error": {"message": "timed out"}}, "막힘"),
])
def test_시작이_실패하면_종류로_나눈다(monkeypatch, 열쇠둘, 상태, 몸, 종류):
    monkeypatch.setattr(apify, "_보내기", lambda 방법, 길, 열쇠, 몸_=None, 시간=90:
                        한도(0.0) if 길 == "/users/me/limits" else (상태, 몸))
    with pytest.raises(apify.도구탈) as e:
        apify.실행("a~b", {}, 0.05)
    assert e.value.종류 == 종류


def test_실패한_실행에_결과가_없으면_고장_결과가_있으면_받는다(monkeypatch, 열쇠둘):
    상태들 = {"r": "FAILED"}
    def 보내기(방법, 길, 열쇠, 몸=None, 시간=90):
        if 길 == "/users/me/limits":
            return 한도(0.0)
        if "/runs?" in 길:
            return 201, {"data": {"id": "r", "status": 상태들["r"], "defaultDatasetId": "d", "statusMessage": "죽음"}}
        return 200, 상태들.get("것들", [])
    monkeypatch.setattr(apify, "_보내기", 보내기)
    with pytest.raises(apify.도구탈, match="고장"):
        apify.실행("a~b", {}, 0.05)
    상태들.update(r="TIMED-OUT", 것들=[{"x": 1}])
    assert apify.실행("a~b", {}, 0.05)["것들"] == [{"x": 1}]


def test_쓸_수_있는_돈이_상한보다_적으면_부르지_않는다(monkeypatch, 열쇠둘):
    부른길 = []
    monkeypatch.setattr(apify, "_보내기", lambda 방법, 길, 열쇠, 몸=None, 시간=90:
                        부른길.append(길) or 한도(4.99))
    with pytest.raises(apify.도구탈) as e:
        apify.실행("a~b", {}, 0.05)
    assert e.value.종류 == "돈" and not any("/runs" in 길 for 길 in 부른길)


def test_너무_오래_걸리면_멈추고_고장(monkeypatch, 열쇠둘):
    시 = [0.0]
    받은 = []
    def 보내기(방법, 길, 열쇠, 몸=None, 시간=90):
        받은.append((방법, 길))
        if 길 == "/users/me/limits":
            return 한도(0.0)
        시[0] += 70
        return 201 if "/runs?" in 길 else 200, {"data": {"id": "r", "status": "RUNNING", "defaultDatasetId": "d"}}
    monkeypatch.setattr(apify, "_보내기", 보내기)
    with pytest.raises(apify.도구탈, match="고장"):
        apify.실행("a~b", {}, 0.05, 지금=lambda: 시[0])
    assert ("POST", "/actor-runs/r/abort") in 받은


def test_실행이_시작된_뒤_받은_글이_깨지면_고장_탈(monkeypatch, 열쇠둘):
    # 돈이 나간 뒤 JSON 이 깨지면 ValueError 가 «인자가 맞지 않다» 로 잘못 알려지고 기록에도 안 남았다(최종 검토 I2)
    def 보내기(방법, 길, 열쇠, 몸=None, 시간=90):
        if 길 == "/users/me/limits":
            return 한도(0.0)
        if 방법 == "POST" and "/runs?" in 길:
            return 201, {"data": {"id": "r1", "status": "RUNNING", "defaultDatasetId": "d1"}}
        raise ValueError("Expecting value: line 1 column 1")
    monkeypatch.setattr(apify, "_보내기", 보내기)
    with pytest.raises(apify.도구탈, match="결과를 못 받음") as 탈:
        apify.실행("kaitoeasyapi~x", {"maxItems": 2}, 0.05, 잠자기=lambda s: None)
    assert 탈.value.종류 == "고장"
