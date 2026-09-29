# -*- coding: utf-8 -*-
"""주소를 붙이면 **라벨할 수 있는 상태까지** 담는다.

여태는 사람이 준 주소를 되돌려 주고 「웹에서 하세요」라고만 했다 — 웹이 어디인지도
안 알려 줬다(사람 지적 2026-08-28). 여기서 못 박는 것은 셋이다: 게시판이 받는
모양으로 바꾸는가, 돈 나가는 문에 빗장이 걸리는가, 못 담을 때 길을 남기는가.
"""
import os
import sys
from pathlib import Path

여기 = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(여기))
os.environ.setdefault("CARDNEWS_DATA", str(여기 / "data"))

import pytest  # noqa: E402

import 담기  # noqa: E402


def _캔것(장수=3, 영상자리=()):
    낱장 = []
    for i in range(장수):
        낱 = {"displayUrl": f"https://cdn.example/{i}.jpg"}
        if i in 영상자리:
            낱["videoUrl"] = f"https://cdn.example/{i}.mp4"
        낱장.append(낱)
    return {"childPosts": 낱장, "caption": "본문", "ownerUsername": "누구",
            "likesCount": 12, "commentsCount": 3, "timestamp": "2026-08-28"}


# ── 게시판이 받는 모양 ─────────────────────────────────────────────

def test_낱장을_게시판_모양으로_바꾼다():
    줄, 주소들 = 담기.줄만들기("ABC123", _캔것(3))
    assert 줄["id"] == "ABC123"
    assert 줄["contentType"] == "cardnews"
    assert 줄["slideCount"] == 3
    assert len(주소들) == 3


def test_영상_낱장에_표를_남긴다():
    """`kinds` 가 어긋나면 게시판이 없는 파일을 가리킨다(`server/picks.js`)."""
    줄, 주소들 = 담기.줄만들기("ABC123", _캔것(3, 영상자리=(1,)))
    assert 줄["slideKinds"] == "010"
    assert len(줄["slideKinds"]) == 줄["slideCount"]
    assert 주소들[1].endswith(".mp4")


def test_낱장이_없으면_담지_않는다():
    with pytest.raises(담기.담기탈):
        담기.줄만들기("ABC123", {"childPosts": []})


def test_한_장짜리_게시물도_담는다():
    줄, 주소들 = 담기.줄만들기("ABC123", {"displayUrl": "https://cdn.example/a.jpg"})
    assert 줄["slideCount"] == 1 and 주소들 == ["https://cdn.example/a.jpg"]


def test_게시판_한도까지만_담는다():
    줄, 주소들 = 담기.줄만들기("ABC123", _캔것(40))
    assert 줄["slideCount"] == 담기.낱장상한 == len(주소들)


def test_본문을_인스타_한도로_자른다():
    줄, _ = 담기.줄만들기("ABC123", {"displayUrl": "https://cdn.example/a.jpg",
                                "caption": "가" * 5000})
    assert len(줄["caption"]) == 2200


# ── 돈 나가는 문 ───────────────────────────────────────────────────

def test_열쇠가_없으면_돌지_않는다(monkeypatch):
    """**Apify 를 부르기 전에 막는다.** 부르고 나서 실패하면 돈은 이미 나갔다."""
    monkeypatch.delenv("APIFY_TOKEN", raising=False)
    assert not 담기.열쇠있나()
    with pytest.raises(담기.담기탈) as 난것:
        담기.낱장캐기("ABC123")
    assert 난것.value.열쇠없음


def test_열쇠가_있으면_있다고_한다(monkeypatch):
    monkeypatch.setenv("APIFY_TOKEN", "apify_api_아무거나")
    assert 담기.열쇠있나()


def test_건당_값을_적어_둔다():
    """빗장 수를 정한 근거다. 액터를 바꾸면 이 값도 같이 바뀐다."""
    assert 담기.액터돈 == 0.0023
    assert 담기.액터 == "apify~instagram-scraper", "계정 액터는 주소를 안 받는다"


def test_라벨_주소는_장수까지_담는다():
    주소 = 담기.라벨주소("https://예.example", "ABC123", 7)
    assert 주소 == "https://예.example/label.html?id=ABC123&n=7"


# ── 하루 50건 빗장 ─────────────────────────────────────────────────

def _분석기(monkeypatch):
    monkeypatch.setenv("BUCKET", "시험통")
    monkeypatch.setenv("BOARD_URL", "https://게시판.example")
    import lambda_분석
    return lambda_분석


def test_열쇠가_없으면_웹_링크로_물러선다(monkeypatch):
    분석 = _분석기(monkeypatch)
    적힌것 = {}
    monkeypatch.delenv("APIFY_TOKEN", raising=False)
    monkeypatch.setattr(분석, "_일적기", lambda 번호, 일: 적힌것.update(일))
    monkeypatch.setattr(담기, "낱장캐기", lambda 코드: pytest.fail("돈을 썼다"))

    분석.담김한판({"번호": "job_x", "코드": "ABC123"})
    assert 적힌것["status"] == "succeeded"
    assert 적힌것["result"]["components"][0]["url"] == "https://게시판.example"


def test_담기면_라벨_주소를_준다(monkeypatch):
    분석 = _분석기(monkeypatch)
    적힌것 = {}
    monkeypatch.setenv("APIFY_TOKEN", "apify_api_아무거나")
    monkeypatch.setenv("BOARD_PASSWORD", "1234")
    monkeypatch.setattr(분석, "_일적기", lambda 번호, 일: 적힌것.update(일))
    monkeypatch.setattr(담기, "낱장캐기", lambda 코드: _캔것(7))
    monkeypatch.setattr(담기, "게시판에얹기", lambda 줄, 주소들, 게시판, 출입증: 7)

    난것 = 분석.담김한판({"번호": "job_x", "코드": "ABC123"})
    assert 난것["ok"]
    링크 = [c for c in 적힌것["result"]["components"] if c["type"] == "link"][0]
    assert 링크["url"] == "https://게시판.example/label.html?id=ABC123&n=7"
    assert "분석해줘" in 적힌것["result"]["content"], "다음에 뭘 할지 알려 준다"


def test_담다가_터져도_길은_남긴다(monkeypatch):
    분석 = _분석기(monkeypatch)
    적힌것 = {}
    monkeypatch.setenv("APIFY_TOKEN", "apify_api_아무거나")
    monkeypatch.setattr(분석, "_일적기", lambda 번호, 일: 적힌것.update(일))

    def 터짐(코드):
        raise 담기.담기탈("인스타에서 게시물을 못 가져왔습니다")
    monkeypatch.setattr(담기, "낱장캐기", 터짐)

    분석.담김한판({"번호": "job_x", "코드": "ABC123"})
    assert 적힌것["status"] == "succeeded"
    assert "못 가져왔습니다" in 적힌것["result"]["content"]


def test_images_로만_오는_게시물도_담는다():
    """범용 액터는 `childPosts` 대신 `images` 만 줄 때가 있다."""
    줄, 주소들 = 담기.줄만들기("ABC123", {"images": [
        {"displayUrl": "https://cdn.example/1.jpg"},
        {"displayUrl": "https://cdn.example/2.jpg"}]})
    assert 줄["slideCount"] == 2 and len(주소들) == 2
