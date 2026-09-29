# -*- coding: utf-8 -*-
"""역할 판정을 장에 붙이는 자리 — **자리로 맞춘다, 번호로 찾지 않는다.**

프롬프트는 장을 「1번부터 차례로」 매겨 보낸다. 그러니 돌아온 `index` 는 «몇
번째로 보낸 것인가» 이지 «게시물의 몇 번째 장인가» 가 아니다.

여태 진짜 장 번호로 찾고 있었다. 라벨한 장이 1번부터 빈틈없이 이어지면 우연히
맞지만, 사람이 몇 장만 골라 라벨하면 어긋난다 — 실물 2026-08-29(ai소식): 장
번호가 1·6·12·15·16·17 인데 모델은 1~6 으로 답했고, 넷이 「미정」이 됐다.
"""
import os
import sys
from pathlib import Path

여기 = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(여기))
os.environ.setdefault("CARDNEWS_DATA", str(여기 / "data"))


def _붙이기(장번호들, 판정들):
    """`merge_labeled` 의 그 고리만 떼어 낸 것. 셈이 같아야 뜻이 있다."""
    슬라이드 = [{"index": n, "formality": "중간"} for n in 장번호들]
    for 자리, s in enumerate(슬라이드):
        t = 판정들[자리] if 자리 < len(판정들) else {}
        s["role"] = t.get("role", "미정")
    return [s["role"] for s in 슬라이드]


_판정 = [{"index": i, "role": r} for i, r in
        enumerate(["훅", "사례", "사례", "사례", "사례", "CTA"], start=1)]


def test_번호가_띄엄띄엄해도_제자리에_붙는다():
    """**이 시험이 이번 고침의 전부다.**"""
    난것 = _붙이기([1, 6, 12, 15, 16, 17], _판정)
    assert 난것 == ["훅", "사례", "사례", "사례", "사례", "CTA"], 난것
    assert "미정" not in 난것


def test_번호가_이어져도_그대로_맞는다():
    """옛 방식이 우연히 맞던 경우 — 여기서도 같아야 한다."""
    assert _붙이기([1, 2, 3, 4, 5, 6], _판정) == \
        ["훅", "사례", "사례", "사례", "사례", "CTA"]


def test_판정이_모자라면_남는_장만_미정이다():
    """`ask` 가 채워 주지만, 그래도 여기서 안 터져야 한다."""
    난것 = _붙이기([1, 6, 12], _판정[:2])
    assert 난것 == ["훅", "사례", "미정"], 난것


def test_실제_코드가_자리로_맞춘다():
    """떼어 낸 셈이 아니라 **그 파일이** 그렇게 하는지 본다."""
    글 = (여기 / "merge_labeled.py").read_text(encoding="utf-8")
    assert "for 자리, s in enumerate(slides):" in 글
    assert "by_i.get(s[\"index\"]" not in 글, "번호로 찾는 옛 방식이 남아 있다"
