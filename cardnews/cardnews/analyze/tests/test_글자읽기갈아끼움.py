# -*- coding: utf-8 -*-
"""**글자 읽기는 값싼 모델 하나뿐이다** (사람 지시 2026-09-24).

실측(게시물 `DHqCBQnRAjW`, 글자 네모 17개, 2026-09-24):

| | 글자 닮음 | 줄 수 일치 | 크기 0.9~1.1 | 17개 값 |
|---|---|---|---|---|
| **루나 + 화소** | **1.00** | **17/17** | 16/17 | **$0.0034** |
| 구글 비전 | 1.00 (정답지) | 17/17 | 17/17 | $0.0255 |

**물러설 곳이 없다.** 구글 비전은 통째로 뺐다(사람 지시 2026-09-24: 「구글은 이제
절대 안 쓸 거임」). 열쇠가 없거나 한 판이 통째로 실패하면 **크게 터뜨린다** —
조용히 물러서면 「왜 안 되는지」를 못 보기 때문이다. 글자가 빈 틀이 창고에 쌓이는
것보다 분석이 멈추고 까닭이 번호표에 찍히는 편이 낫다.
"""
import sys
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import config  # noqa: E402
import merge_labeled  # noqa: E402
import 글자읽기  # noqa: E402


def _장(tmp_path, pid="ABC"):
    d = tmp_path / "images" / pid
    d.mkdir(parents=True, exist_ok=True)
    a = np.full((400, 1080, 3), 240, np.uint8)
    a[40:80, 100:600] = 20
    Image.fromarray(a).save(d / "01.jpg")


_네모 = [{"id": "t1", "kind": "글자", "box": [80, 20, 650, 100]}]


def test_값싼_모델로_읽는다(monkeypatch, tmp_path):
    _장(tmp_path)
    monkeypatch.setattr(config, "IMAGES", tmp_path / "images")
    센것 = {"수": 0}
    monkeypatch.setattr(글자읽기, "있나", lambda: True)
    monkeypatch.setattr(글자읽기, "read_slide",
                        lambda *a: 센것.__setitem__("수", 센것["수"] + 1) or {"t1": {"box": [80, 20, 650, 100], "symbols": []}})
    난것 = merge_labeled.글자읽기한장("ABC", 1, _네모)
    assert 센것["수"] == 1
    assert 난것["t1"]["box"] == [80, 20, 650, 100]


def test_열쇠가_없으면_크게_터뜨린다(monkeypatch, tmp_path):
    """**조용히 안 넘어간다.** 물러설 곳이 없으니 여기서 멈추고 까닭을 남긴다 —
    글자가 빈 틀이 창고에 쌓이면 사람이 원인을 못 찾는다."""
    _장(tmp_path)
    monkeypatch.setattr(config, "IMAGES", tmp_path / "images")
    monkeypatch.setattr(글자읽기, "있나", lambda: False)
    with pytest.raises(RuntimeError) as 터짐:
        merge_labeled.글자읽기한장("ABC", 1, _네모)
    assert "OPENROUTER_API_KEY" in str(터짐.value)


def test_값싼_모델이_죽으면_그_탈을_그대로_올린다(monkeypatch, tmp_path):
    """열쇠 만료·망 끊김. 삼키면 분석은 끝나는데 틀이 비어 나온다."""
    _장(tmp_path)
    monkeypatch.setattr(config, "IMAGES", tmp_path / "images")
    monkeypatch.setattr(글자읽기, "있나", lambda: True)

    def 터짐(*a):
        raise RuntimeError("글자 모델 401")

    monkeypatch.setattr(글자읽기, "read_slide", 터짐)
    with pytest.raises(RuntimeError, match="401"):
        merge_labeled.글자읽기한장("ABC", 1, _네모)


def test_읽을_네모가_없으면_아무도_안_부른다(monkeypatch, tmp_path):
    """**열쇠가 없어도 여기서는 안 터진다** — 부를 일이 아예 없다."""
    _장(tmp_path)
    monkeypatch.setattr(config, "IMAGES", tmp_path / "images")
    센것 = {"수": 0}
    monkeypatch.setattr(글자읽기, "있나", lambda: False)
    monkeypatch.setattr(글자읽기, "read_slide",
                        lambda *a: 센것.__setitem__("수", 센것["수"] + 1) or {})
    assert merge_labeled.글자읽기한장("ABC", 1, [{"id": "d", "kind": "도형",
                                           "box": [0, 0, 10, 10]}]) == {}
    assert 센것["수"] == 0
