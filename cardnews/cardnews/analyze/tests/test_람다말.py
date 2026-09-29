# -*- coding: utf-8 -*-
"""람다가 사람 화면으로 내보내는 말이 두 언어로 나오나.

**눈으로는 못 잡는 종류다.** 한 자리만 빠뜨리면 거기서만 한국어가 뜨는데,
그 자리는 「게시물을 담았습니다」처럼 사람이 제일 먼저 보는 한 줄이다.
"""
import inspect
import re

import 람다말

한글 = re.compile(r"[가-힣]")


def _값들(함수):
    """그 말이 받는 값 개수만큼 «X» 를 만들어 준다."""
    return ["X"] * len(inspect.signature(함수).parameters)


def test_열쇠마다_두_언어가_다_있다():
    빠진것 = [k for k, v in 람다말._말.items()
           if 람다말.한국어 not in v or 람다말.영어 not in v]
    assert 빠진것 == []


def test_영어에_한글이_안_남는다():
    남은것 = []
    for k, v in 람다말._말.items():
        난것 = v[람다말.영어](*_값들(v[람다말.영어]))
        if 한글.search(난것):
            남은것.append((k, 난것))
    assert 남은것 == []


def test_한국어도_비어_있지_않다():
    빈것 = [k for k, v in 람다말._말.items()
          if not str(v[람다말.한국어](*_값들(v[람다말.한국어]))).strip()]
    assert 빈것 == []


def test_모르는_언어는_한국어로_떨어진다():
    """안 나오는 것보다 한국어로 나오는 편이 낫다 — `web/lib/언어.js` 와 같은 규칙."""
    for 이상한것 in ("", "en", "English", "영어 ", None):
        assert 람다말.쓸말(이상한것) == 람다말.한국어, 이상한것
    assert 람다말.쓸말("영어") == 람다말.영어


def test_값이_글에_그대로_들어간다():
    """「N장」·「템플릿 이름」이 빠지면 말이 반쪽이 된다."""
    assert "7" in 람다말.말("담았다", 람다말.한국어, 7)
    assert "7" in 람다말.말("담았다", 람다말.영어, 7)
    난것 = 람다말.말("템플릿저장", 람다말.영어, "코스모스", 8)
    assert "코스모스" in 난것 and "8" in 난것


def test_담김_말이_두_언어로_나온다():
    """**사람이 제일 먼저 보는 한 줄이다.** 인스타 주소를 붙이면 바로 이게 뜬다."""
    한 = 람다말.말("담았다", 람다말.한국어, 7)
    영 = 람다말.말("담았다", 람다말.영어, 7)
    assert 한 != 영
    assert not 한글.search(영)


def test_언어값이_프롬프트와_같은_글자다():
    """한 글자라도 어긋나면 조용히 한국어로 떨어진다."""
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "dify"))
    import 프롬프트

    assert 람다말.한국어 == 프롬프트.한국어
    assert 람다말.영어 == 프롬프트.영어
