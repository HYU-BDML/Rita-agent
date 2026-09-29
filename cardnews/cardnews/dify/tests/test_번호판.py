# -*- coding: utf-8 -*-
"""«번호판» — 틀 상단에 배지 도장 하나가 있으면 배치가 표지 뺀 모든 장에 찍는다.

사람 결정 2026-09-19: 장마다 숫자를 찾지 않는다. 사람이 배지에 「장번호」 라벨 하나를
그으면 분석이 숫자를 지운 배지 그림을 만들고(`analyze/번호판.py`), 배치는 그 그림을
«장식» 으로 얹고 장 차례를 «번호» 위계 글자로 찍는다.
"""
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import 카드뉴스_배치 as 배치  # noqa: E402

번호판 = {"box": [460, 0, 620, 74], "그림": "https://x/cutouts/P/02/plate-number.png",
       "배지색": "#5B8FF5",
       "숫자": {"font": "프리텐다드", "weight": "Bold", "pt": 40, "글자색": "#FFFFFF",
              "중심": [0.5, 0.45], "본보기": "01"}}


def _틀(장수=4, **상단):
    슬롯 = {"box": [50, 400, 950, 500], "pt": 40, "weight": "Regular", "align": "왼쪽",
          "font": "Pretendard", "글자색": "#000000", "최소": 1, "최대": 200, "위계": "본문"}
    골격 = ["훅"] + ["사례"] * (장수 - 2) + ["CTA"]
    return {"골격": 골격, "캔버스": {"w": 1080, "h": 1350}, "강조색": "#C9FC95",
            "슬라이드": [{"index": i, "역할": r, "배경": {"종류": "단색", "hex": "#FFFFFF"},
                       "장식영역": [], "글자슬롯": [dict(슬롯)]} for i, r in enumerate(골격, 1)],
            **상단}


def _대본(장수=4):
    return [{"role": r, "blocks": ["글"]} for r in (["훅"] + ["사례"] * (장수 - 2) + ["CTA"])]


def _카드들(틀):
    out = 배치.main(_대본(len(틀["골격"])), json.dumps(틀, ensure_ascii=False),
                   재기만들기=lambda 슬롯: (lambda 글: 20.0 * len(글)))
    return json.loads(out["cards_json"])


def _번호칸(카드):
    return [r for r in 카드["글자영역"] if r.get("번호판")]


def test_표지와_마지막_장_빼고_번호판과_번호가_붙는다():
    """**표지와 CTA 에는 안 찍는다**(사람 지시 2026-09-24). 원본을 읽어 「마지막 장에
    번호가 있었나」를 가리던 길은 없앴다 — 그 한 표를 얻으려고 장마다 그림 전체를
    구글에 보냈고(게시물당 $0.014), 잘못 읽으면 되돌릴 방법도 없었다."""
    카드들 = _카드들(_틀(5, 번호판=번호판))
    assert not [r for r in 카드들[0]["장식영역"] if r.get("번호판")] and not _번호칸(카드들[0])
    assert not [r for r in 카드들[-1]["장식영역"] if r.get("번호판")] and not _번호칸(카드들[-1])
    for 차례, 카드 in enumerate(카드들[1:-1], start=1):
        도장 = [r for r in 카드["장식영역"] if r.get("번호판")]
        assert len(도장) == 1 and 도장[0]["그림"] == 번호판["그림"] and 도장[0]["box"] == 번호판["box"]
        번호 = _번호칸(카드)
        assert len(번호) == 1
        assert 번호[0]["lines"] == [f"{차례:02d}"]           # 원본 표기 「01」 꼴을 따른다
        assert 번호[0]["위계"] == "번호" and 번호[0]["align"] == "가운데"
        assert 번호[0]["글자색"] == "#FFFFFF" and 번호[0]["pt"] == 40


def test_번호는_배지_안_잰_자리에_찍힌다():
    카드들 = _카드들(_틀(3, 번호판=번호판))
    x0, y0, x1, y1 = _번호칸(카드들[1])[0]["box"]
    bx0, by0, bx1, by1 = 번호판["box"]
    assert (x0 + x1) / 2 == pytest.approx(bx0 + (bx1 - bx0) * 0.5, abs=1)
    assert (y0 + y1) / 2 == pytest.approx(by0 + (by1 - by0) * 0.45, abs=1)
    assert (y1 - y0) == pytest.approx(40 * 1.32, abs=1)


def test_세_장이면_가운데_한_장에만_찍는다():
    """표지와 CTA 를 빼면 한 장이 남는다."""
    카드들 = _카드들(_틀(3, 번호판=번호판))
    assert _번호칸(카드들[1])[0]["lines"] == ["01"]
    assert not _번호칸(카드들[0]) and not _번호칸(카드들[2])


def test_두_장뿐이면_아무_데도_안_찍는다():
    """표지와 CTA 뿐이라 찍을 자리가 없다."""
    카드들 = _카드들(_틀(2, 번호판=번호판))
    assert all(not _번호칸(c) and not [r for r in c["장식영역"] if r.get("번호판")]
               for c in 카드들)


def test_원본이_한_자리면_한_자리로_찍는다():
    판 = {**번호판, "숫자": {**번호판["숫자"], "본보기": "5"}}
    카드들 = _카드들(_틀(3, 번호판=판))
    assert _번호칸(카드들[1])[0]["lines"] == ["1"]


def test_번호판이_없으면_아무것도_안_붙는다():
    카드들 = _카드들(_틀(3))
    assert all(not _번호칸(c) and not [r for r in c["장식영역"] if r.get("번호판")] for c in 카드들)


def test_숫자_크기를_못_쟀으면_배지_높이의_절반으로_찍는다():
    판 = {**번호판, "숫자": {"중심": [0.5, 0.5], "pt": None, "본보기": ""}}
    카드들 = _카드들(_틀(3, 번호판=판))
    번호 = _번호칸(카드들[1])[0]
    assert 번호["pt"] == 37 and 번호["lines"] == ["01"]      # 74px 배지 → 37pt, 표기는 두 자리 기본


def test_찍을네모는_숫자_수만큼_넓어진다():
    좁 = 배치.찍을네모(번호판, 1)
    넓 = 배치.찍을네모(번호판, 4)
    assert (넓[2] - 넓[0]) > (좁[2] - 좁[0])
