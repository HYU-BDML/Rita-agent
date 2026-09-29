# -*- coding: utf-8 -*-
"""줄 간격이 «겹치는 값» 으로 나오던 것.

실측(2026-08-28, DSC61jCEusn 표지): 119pt 제목의 줄 간격이 0.57 로 나와 줄
사이가 68px 이었다. 글자 키(119px)보다 좁으니 세 줄이 서로 포개져 읽을 수
없었다. 잘못 잰 값을 그대로 싣느니 「못 쟀다」고 하고 기본값을 쓰는 게 낫다.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import layout_labeled as 배치잼  # noqa: E402


def _줄(y0, y1):
    return {"box": [0, y0, 100, y1]}


def test_보통_줄간격은_그대로_낸다():
    # 100pt 글자가 130px 간격 → 1.3
    줄들 = [_줄(0, 100), _줄(130, 230), _줄(260, 360)]
    assert 배치잼._leading(줄들, 100) == 1.3


def test_겹치는_값은_못_잰_것으로_둔다():
    # 100pt 글자가 57px 간격 → 0.57. 글자가 서로 겹친다.
    줄들 = [_줄(0, 100), _줄(57, 157), _줄(114, 214)]
    assert 배치잼._leading(줄들, 100) == 0.0


def test_딱_붙는_것까지는_받는다():
    """1.0 은 줄이 맞닿는 값이다 — 빡빡하지만 겹치지는 않는다."""
    줄들 = [_줄(0, 100), _줄(100, 200), _줄(200, 300)]
    assert 배치잼._leading(줄들, 100) == 1.0


def test_왜_그랬는지_자국에_남긴다(capsys):
    배치잼._leading([_줄(0, 100), _줄(57, 157)], 100)
    assert "겹치는 값" in capsys.readouterr().out


def test_줄이_하나면_잴_것이_없다():
    assert 배치잼._leading([_줄(0, 100)], 100) == 0.0


def test_글자_크기를_못_재면_0():
    assert 배치잼._leading([_줄(0, 100), _줄(130, 230)], None) == 0.0
