# -*- coding: utf-8 -*-
"""**구글 비전 없이 글자를 읽는다** (사람 지시 2026-09-24).

세 조각으로 나뉜다:

| 무엇 | 어디서 | 실측 |
|---|---|---|
| 줄이 몇 개, 어디 | **화소** — 잉크가 있는 행을 띠로 끊는다 | 공짜 |
| 글자 크기 | **화소** — 띠 높이 | 구글 대비 0.976 |
| 글자 내용 | **값싼 모델**(루나) | 구글 대비 1.00 · $0.0032/17개 |

**내는 모양은 예전 구글 갈래와 똑같다** — 글자별 네모 목록이다. 그래야
아랫단(`layout.group_lines`·`잰것`·`line_detail`)을 하나도 안 고친다. 네모는 줄
띠에 글자 수만큼 고르게 펴서 짓는다. **정확할 필요가 없다** — 글자별 네모를 진짜로
쓰던 곳은 글씨체 맞히기 하나였고 그건 껐다(2026-09-24, 19% 짜리였다).
"""
import sys
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import config  # noqa: E402
import 글자읽기  # noqa: E402


def _두줄(바탕=240, 잉크=20):
    """1080×400 바탕에 가로 줄 두 개. 위 줄은 y 40~80, 아래 줄은 y 140~200."""
    a = np.full((400, 1080, 3), 바탕, np.uint8)
    a[40:80, 100:600] = 잉크
    a[140:200, 100:800] = 잉크
    return a


def test_잉크가_있는_행을_줄로_끊는다():
    띠 = 글자읽기.줄띠들(_두줄()[..., 0], [0, 0, 1080, 400])
    assert len(띠) == 2
    assert 띠[0] == (40, 80) and 띠[1] == (140, 200)


def test_줄_네모는_가로도_잉크만큼만_잡는다():
    네 = 글자읽기.줄네모들(_두줄(), [0, 0, 1080, 400])
    assert len(네) == 2
    assert 네[0][0] >= 95 and 네[0][2] <= 605      # 위 줄은 100~600
    assert 네[1][2] > 네[0][2]                      # 아래 줄이 더 길다


def test_잡티는_줄로_안_센다():
    """한두 화소짜리 점이 줄이 되면 크기가 통째로 틀어진다."""
    a = _두줄()
    a[300:302, 500:503] = 20                        # 2px 짜리 점
    assert len(글자읽기.줄띠들(a[..., 0], [0, 0, 1080, 400])) == 2


def test_루나_글을_줄마다_나눠_글자_네모를_짓는다():
    img = _두줄()
    심 = 글자읽기.심볼짓기(img, [0, 0, 1080, 400], "가나다라마\n바사아자차카타")
    assert len(심) == 12                            # 5 + 7
    assert "".join(s["text"] for s in 심) == "가나다라마바사아자차카타"
    윗줄 = [s for s in 심 if s["box"][1] < 100]
    assert len(윗줄) == 5
    # 네모 높이는 그 줄 띠의 높이다 — 크기(pt)가 여기서 나온다
    assert all(round(s["box"][3] - s["box"][1]) == 40 for s in 윗줄)
    # 가로로 고르게 편다 — 왼쪽에서 오른쪽으로 겹치지 않게
    xs = [s["box"][0] for s in 윗줄]
    assert xs == sorted(xs)


def test_줄_수가_안_맞으면_글을_다시_이어_붙인다():
    """모델이 줄을 다르게 끊어 올 수 있다. **화소가 본 줄 수가 임자다** —
    줄 자리는 화소가 재고, 모델은 글자만 준다."""
    img = _두줄()
    심 = 글자읽기.심볼짓기(img, [0, 0, 1080, 400], "가나다라마바사아자차카타")  # 한 줄로 옴
    assert len(심) == 12
    윗 = [s for s in 심 if s["box"][1] < 100]
    아래 = [s for s in 심 if s["box"][1] >= 100]
    assert 윗 and 아래                                # 두 띠에 나눠 담긴다
    assert len(윗) + len(아래) == 12


def test_글이_비면_빈_목록():
    assert 글자읽기.심볼짓기(_두줄(), [0, 0, 1080, 400], "") == []
    assert 글자읽기.심볼짓기(_두줄(), [0, 0, 1080, 400], None) == []


def test_잉크가_없으면_빈_목록():
    민 = np.full((400, 1080, 3), 240, np.uint8)
    assert 글자읽기.줄띠들(민[..., 0], [0, 0, 1080, 400]) == []
    assert 글자읽기.심볼짓기(민, [0, 0, 1080, 400], "가나다") == []


def test_읽은_것은_창고에_담아_두_번_안_부른다(monkeypatch, tmp_path):
    """글자 읽기도 돈이 든다 — 누끼·바닥판과 같은 규칙이다."""
    import 창고캐시
    monkeypatch.setattr(창고캐시, "뿌리덮개", tmp_path / "캐시")
    monkeypatch.setattr(config, "IMAGES", tmp_path / "images")
    d = tmp_path / "images" / "ABC"
    d.mkdir(parents=True, exist_ok=True)
    Image.fromarray(_두줄()).save(d / "01.jpg")
    셈 = {"수": 0}

    def 가짜(조각):
        셈["수"] += 1
        return "가나다라마\n바사아자차카타"

    monkeypatch.setattr(글자읽기, "부르기", 가짜)
    네모 = [{"id": "t1", "kind": "글자", "box": [80, 20, 850, 220]}]
    첫 = 글자읽기.read_slide("ABC", 1, 네모)
    둘 = 글자읽기.read_slide("ABC", 1, 네모)
    assert 셈["수"] == 1, "두 번째는 창고에서 꺼내 써야 한다"
    assert 둘 == 첫
    assert 첫["t1"]["symbols"], "글자 네모가 나와야 한다"


def test_모양이_옛_구글_갈래와_같다(monkeypatch, tmp_path):
    """아랫단(`layout.group_lines`·`잰것`)이 그대로 돌아야 한다."""
    import layout
    import 창고캐시
    monkeypatch.setattr(창고캐시, "뿌리덮개", tmp_path / "캐시")
    monkeypatch.setattr(config, "IMAGES", tmp_path / "images")
    d = tmp_path / "images" / "ABC"
    d.mkdir(parents=True, exist_ok=True)
    Image.fromarray(_두줄()).save(d / "01.jpg")
    monkeypatch.setattr(글자읽기, "부르기", lambda 조각: "가나다라마\n바사아자차카타")
    난것 = 글자읽기.read_slide("ABC", 1, [{"id": "t1", "kind": "글자",
                                      "box": [80, 20, 850, 220]}])
    몫 = 난것["t1"]
    assert set(몫) >= {"box", "symbols"}
    줄 = layout.group_lines(몫["symbols"])
    assert len(줄) == 2
    assert layout.ink_height(줄[0]) == pytest.approx(40, abs=2)


def _붙은두줄(바탕=240, 잉크=20):
    """줄 사이에 **빈 띠가 없는** 그림 — 화소만으로는 한 덩어리로 보인다."""
    a = np.full((400, 1080, 3), 바탕, np.uint8)
    a[40:80, 100:600] = 잉크        # 1번째 줄
    a[80:120, 100:800] = 잉크       # 2번째 줄이 바로 붙음
    return a


def test_줄이_붙어_있으면_모델이_센_줄_수로_쪼갠다():
    """**모델이 화소보다 줄을 더 많이 세면 그쪽을 믿는다.**

    줄 사이에 잉크 없는 행이 없으면 화소는 한 덩어리로 본다 — 그러면 글자 높이가
    «두 줄 높이» 가 되어 크기가 곱절로 나온다(실물 DHqCBQnRAjW 1번 장: 구글 96.5,
    화소 221.0, **2.29배**). 모델은 글을 읽으면서 줄바꿈도 같이 주므로, 그 수만큼
    띠를 고르게 쪼개면 된다.
    """
    img = _붙은두줄()
    # 화소만 보면 한 덩어리다
    assert len(글자읽기.줄띠들(img[..., 0], [0, 0, 1080, 400])) == 1
    심 = 글자읽기.심볼짓기(img, [0, 0, 1080, 400], "가나다라마\n바사아자차카타")
    윗 = [s for s in 심 if s["box"][1] < 80]
    아래 = [s for s in 심 if s["box"][1] >= 80]
    assert len(윗) == 5 and len(아래) == 7, "모델이 센 두 줄로 쪼개야 한다"
    # 쪼갠 뒤 글자 높이는 «한 줄» 높이다 — 두 줄 높이(80)가 아니다
    assert all(round(s["box"][3] - s["box"][1]) == 40 for s in 심)


def test_모델이_줄을_덜_세면_화소를_믿는다():
    """반대쪽은 화소가 임자다 — 띠가 또렷이 갈려 있으면 그게 줄이다."""
    심 = 글자읽기.심볼짓기(_두줄(), [0, 0, 1080, 400], "가나다라마바사아자차카타")
    윗 = [s for s in 심 if s["box"][1] < 100]
    아래 = [s for s in 심 if s["box"][1] >= 100]
    assert 윗 and 아래 and len(윗) + len(아래) == 12


def test_열쇠가_비었으면_망을_타기_전에_멈춘다(monkeypatch):
    """**시험이 진짜 망을 타는 것을 막는 마지막 문**이다. 열쇠가 비어 있는데도
    보내면 빈 `Authorization` 으로 실제 요청이 나간다 — 2026-09-24 에 전체 시험이
    100초에서 310초가 되고 22개가 깨진 적이 있다."""
    monkeypatch.setattr(글자읽기, "열쇠", lambda: "")
    with pytest.raises(RuntimeError, match="OPENROUTER_API_KEY"):
        글자읽기.부르기(Image.new("RGB", (40, 20), "white"))
