# -*- coding: utf-8 -*-
"""**말투를 고르면 그 템플릿의 글을 다 배워 따라 쓴다**(사람 결정 2026-08-29).

여태는 정반대였다. 말투를 «고르기만 하면» 자리별 원문(본보기)을 껐고, 남는 것은
축 이름 몇 개와 짧은 문장 셋뿐이었다. 여덟 장 분량의 글이 세 줄로 쪼그라들었으니
모델이 대부분을 스스로 지어냈다 — 그게 「너무 AI 스럽다」의 정체다.
"""
import json
import os
import sys
from pathlib import Path

여기 = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(여기))
sys.path.insert(0, str(여기.parent / "dify"))
os.environ.setdefault("CARDNEWS_DATA", str(여기 / "data"))

import 말투틀  # noqa: E402
import 카드뉴스만들기 as 만들기  # noqa: E402


def _잰것(코드="ABC"):
    def 줄(t):
        return {"kind": "글자", "text": {"line_detail": [{"text": t}]}}
    return {"shortcode": 코드, "post_type": "교육", "hook_strategy": "함축",
            "slides": [
                {"index": 1, "role": "훅", "ending": "명사형", "is_question": True,
                 "tone": {"humor": "낮음", "respect": "중간", "enthusiasm": "중간",
                          "formality": "중간"},
                 "regions": [줄("5세대 아이돌?")]},
                {"index": 2, "role": "사례", "ending": "명사형",
                 "tone": {"humor": "낮음", "respect": "중간", "enthusiasm": "중간",
                          "formality": "중간"},
                 "regions": [줄("얼마전 스타쉽 여돌이 공개 되었는데"), 줄("이름하여 바로 키키!")]},
                {"index": 3, "role": "요약", "ending": "명사형",
                 "tone": {"humor": "낮음", "respect": "중간", "enthusiasm": "중간",
                          "formality": "중간"},
                 "regions": [줄("브랜딩 포인트가 있다면 댓글로")]},
            ]}


# ── 말투가 원문을 담는다 ───────────────────────────────────────────

def test_역할별로_원문을_싣는다():
    """훅은 훅끼리 보고 배워야 한다 — 훅 문장과 요약 문장은 결이 딴판이다."""
    말투 = 말투틀.뽑기(_잰것(), "키키")
    원문 = 말투["원문"]
    assert set(원문) == {"훅", "사례", "요약"}, 원문
    assert 원문["훅"] == ["5세대 아이돌?"]
    assert len(원문["사례"]) == 2


def test_짧은_줄도_원문에는_담는다():
    """본보기는 8자 미만을 버린다. 원문은 안 버린다 — 「키키!」도 그 결이다."""
    말투 = 말투틀.뽑기(_잰것(), "키키")
    담긴것 = [x for 줄들 in 말투["원문"].values() for x in 줄들]
    assert "5세대 아이돌?" in 담긴것, "여덟 자 미만이 빠졌다"


def test_프롬프트가_역할을_밝혀_보여_준다():
    글 = 말투틀.프롬프트글(말투틀.뽑기(_잰것(), "키키"))
    assert "[훅]" in 글 and "[요약]" in 글, 글
    assert "5세대 아이돌?" in 글
    assert "배워 써라" in 글


def test_옛_말투_파일은_본보기로_물러선다():
    """이미 저장된 말투에는 «원문» 이 없다. 터지면 안 된다."""
    글 = 말투틀.프롬프트글({"어미": "명사형", "격식": "중간", "재미": "낮음",
                      "정중": "중간", "열정": "높음", "본보기": ["옛 문장입니다"]})
    assert "옛 문장입니다" in 글


def test_말투가_없으면_빈_글자다():
    assert 말투틀.프롬프트글({}) == ""


# ── 제 말투인지 남의 말투인지 ──────────────────────────────────────

def _틀(코드):
    return json.dumps({"코드": 코드, "슬라이드": []}, ensure_ascii=False)


def test_제_말투면_원문을_안_끈다():
    """**여기가 이번 변경의 핵심이다.** 「키키 템플릿에 키키 말투」."""
    assert 만들기._같은게시물(_틀("ABC"), {"코드": "ABC"})


def test_남의_말투면_끈다():
    """「키키 템플릿에 여행 말투」 — 목소리가 둘이 되면 안 된다."""
    assert not 만들기._같은게시물(_틀("ABC"), {"코드": "XYZ"})


def test_말투를_안_골랐으면_남의_것이_아니다():
    assert not 만들기._같은게시물(_틀("ABC"), {})


def test_코드를_못_읽으면_남의_것으로_본다():
    """잘못 켜서 두 목소리를 섞는 것보다 낫다."""
    assert not 만들기._같은게시물("망가진 json", {"코드": "ABC"})
    assert not 만들기._같은게시물(_틀(""), {"코드": ""})
