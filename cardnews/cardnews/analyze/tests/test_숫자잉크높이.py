# -*- coding: utf-8 -*-
"""**한글이 없는 줄도 크기를 잰다** — 숫자·대문자·소문자 차례로.

장 번호를 스스로 찾아내 놓고도 틀에 한 칸도 안 실렸다(실물 2026-09-01). 「03」에는
한글이 없어 잉크 높이가 `None` 이 되고, 그러면 `pt` 가 없어 `recipe.슬롯이_되나`
가 그 칸을 버렸기 때문이다 — **찾는 데는 성공하고 재는 데서 조용히 잃었다.**

라틴도 똑같은 일을 당했다(실물 2026-09-22). 틀 두 벌에서 제목 자리 14개가
통째로 사라졌는데, 빠진 것이 전부 영문이었다 — Switzerland·Mongolia·Peru·
Iceland·Egypt·Weekly AI. 라벨엔 그어져 있고 못그림에도 한 줄 없었다.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE))

import layout  # noqa: E402


def _줄(글, 높이=50):
    return {"symbols": [{"text": c, "box": [i * 40, 100, i * 40 + 35, 100 + 높이]}
                        for i, c in enumerate(글)]}


def test_한글이_있으면_한글로_잰다():
    assert layout.ink_height(_줄("가나다", 60)) == 60.0


def test_숫자만_있으면_숫자로_잰다():
    """예전엔 `None` 이라 그 칸이 통째로 버려졌다."""
    난것 = layout.ink_height(_줄("03", 50))
    assert 난것 is not None
    assert round(난것, 1) == round(50 / layout.숫자대한글, 1)


def test_숫자는_한글보다_작으니_키워_잰다():
    """같은 크기로 그려도 숫자가 한글보다 낮다 — 그대로 쓰면 pt 를 작게 본다."""
    assert layout.ink_height(_줄("03", 50)) > 50


def test_한글이_섞이면_한글이_이긴다():
    """숫자는 대신 쓰는 잣대다 — 진짜 잣대가 있으면 그것을 쓴다."""
    assert layout.ink_height(_줄("3위", 60)) == 60.0


def test_빈_줄은_못_잰다():
    assert layout.ink_height({"symbols": []}) is None


def test_비가_실측_범위_안이다():
    """글꼴 파일 15개에 재 보니 0.787~0.978 이었다 — 가운뎃값을 쓴다."""
    assert 0.787 <= layout.숫자대한글 <= 0.978


# ── 라틴 (사람 지시 2026-09-22) ────────────────────────────────────


def _줄각각(쌍들):
    """글자마다 높이를 다르게 주는 줄. 「키 고른 것만 고르나」를 보려는 것이다."""
    return {"symbols": [{"text": c, "box": [i * 40, 100, i * 40 + 35, 100 + h]}
                        for i, (c, h) in enumerate(쌍들)]}


def test_대문자만_있으면_대문자로_잰다():
    """실물에서 사라졌던 그 자리다 — 「Switzerland」·「Weekly AI」."""
    난것 = layout.ink_height(_줄("MOT", 50))
    assert 난것 is not None
    assert round(난것, 1) == round(50 / layout.대문자대한글, 1)


def test_소문자만_있으면_x높이로_잰다():
    난것 = layout.ink_height(_줄("acorn", 40))
    assert 난것 is not None
    assert round(난것, 1) == round(40 / layout.x높이대한글, 1)


def test_소문자는_키_고른_것만_고른다():
    """`b`·`d` 는 위로 솟아 높이가 다르다 — 섞어 재면 값이 엉킨다.

    이것이 여태 라틴을 통째로 뺐던 까닭이다(「`dpf` 처럼 …」). 섞이는 것이
    탈이지 라틴이 탈이 아니라서, 고른 것만 뽑으면 잣대가 된다.
    """
    난것 = layout.ink_height(_줄각각([("b", 76), ("a", 53), ("d", 76)]))
    # `a` 하나만 세야 한다. 셋을 다 세면 가운뎃값이 76 이 된다.
    assert round(난것, 1) == round(53 / layout.x높이대한글, 1)


def test_대문자가_소문자보다_앞선다():
    """대문자가 덜 흔들린다(±13% 대 ±29%) — 둘 다 있으면 대문자로 잰다."""
    난것 = layout.ink_height(_줄각각([("A", 70), ("c", 50)]))
    assert round(난것, 1) == round(70 / layout.대문자대한글, 1)


def test_한글이_있으면_라틴을_안_본다():
    """라틴은 대신 쓰는 잣대다 — 진짜 잣대가 있으면 그것을 쓴다."""
    assert layout.ink_height(_줄각각([("가", 60), ("A", 90)])) == 60.0


def test_잴_글자가_하나도_없으면_못_잰다():
    """`bdf` 는 다 솟은 글자라 키가 고르지 않다. **지어내지 않는다.**"""
    assert layout.ink_height(_줄("bdf", 50)) is None
    assert layout.ink_height(_줄("!?~", 50)) is None


def test_무엇으로_쟀는지_같이_낸다():
    """갈래마다 얼마나 믿을 만한지가 달라서, 점검이 이 값을 보고 알린다."""
    assert layout.잰것(_줄("가나", 60))[1] == "한글"
    assert layout.잰것(_줄("03", 50))[1] == "숫자"
    assert layout.잰것(_줄("MOT", 50))[1] == "대문자"
    assert layout.잰것(_줄("acorn", 40))[1] == "소문자"
    assert layout.잰것(_줄("bdf", 50)) == (None, "")


def test_라틴_비가_실측_범위_안이다():
    """글꼴 파일 22개에 재 보니 이랬다 — 가운뎃값을 쓴다."""
    assert 0.772 <= layout.대문자대한글 <= 0.987
    assert 0.508 <= layout.x높이대한글 <= 0.816
    # 대문자가 소문자보다 크다 — 뒤집히면 환산이 거꾸로 간다.
    assert layout.대문자대한글 > layout.x높이대한글
