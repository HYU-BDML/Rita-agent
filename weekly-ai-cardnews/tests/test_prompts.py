# -*- coding: utf-8 -*-
import pytest

import prompts


def test_본문대본_채우기():
    s, u = prompts.채우기("본문대본", {"소식고르기.count": 7, "소식고르기.news": "[ChatGPT] 소식 하나"})
    assert "[ChatGPT] 소식 하나" in u
    assert "{{소식고르기" not in u
    assert len(s) > 10000  # 본문대본_쓰기 문서가 통째로 들어 있다


def test_표지훅은_장목록을_한글_그대로_JSON_으로():
    s, u = prompts.채우기("표지훅", {"시작.week": "9월 3주차",
                                  "본문검증3.slides": [{"brand": "클로드", "headline": ["가", "나"]}]})
    assert '"brand": "클로드"' in u
    assert "9월 3주차" in u


def test_값이_없으면_조용히_넘기지_않는다():
    with pytest.raises(KeyError):
        prompts.채우기("본문다시쓰기", {"소식고르기.count": 7})
