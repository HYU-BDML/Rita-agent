# -*- coding: utf-8 -*-
"""**한 번 오린 장식은 두 번 안 오린다** (사람 지시 2026-09-24).

장식 오리기는 장식 하나에 GPT Image 를 한 번씩 부른다($0.006). 게시물 하나에 장식이
20~45개라 재분석 한 번에 **$0.12~0.27** 이 나갔다 — 라벨을 하나도 안 건드렸어도.

열쇠는 **«무엇을 넣어 오렸나»** 다: 게시물·장·**네모 좌표**·밑판색. 네모를 옮기면
좌표가 바뀌어 그것만 다시 오리고, 안 건드린 것은 창고에서 꺼낸다.
"""
import sys
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import config  # noqa: E402
import cutout  # noqa: E402
import gpt누끼  # noqa: E402
import 창고캐시  # noqa: E402


def _준비(monkeypatch, tmp_path, pid="ABC", index=1):
    monkeypatch.delenv("BUCKET", raising=False)
    monkeypatch.setattr(config, "DATA", tmp_path)
    monkeypatch.setattr(config, "IMAGES", tmp_path / "images")
    monkeypatch.setattr(gpt누끼, "있나", lambda: True)
    d = tmp_path / "images" / pid
    d.mkdir(parents=True, exist_ok=True)
    img = np.full((1350, 1080, 3), 240, np.uint8)
    img[300:500, 300:700] = (200, 40, 40)          # 오릴 장식 한 덩이
    Image.fromarray(img).save(d / f"{index:02d}.jpg")


def _센다(monkeypatch):
    """GPT 누끼를 몇 번 불렀나. 돌려주는 모양은 `gpt누끼.따기` 와 같다."""
    셈 = {"수": 0}

    def 가짜따기(rgb, box, 이웃=(), 여유=8, 부르기=None, 밑판색=None, 게시물=None):
        셈["수"] += 1
        x0, y0, x1, y1 = [int(v) for v in box]
        마스크 = np.zeros(rgb.shape[:2], bool)
        마스크[y0:y1, x0:x1] = True
        그림 = np.zeros((y1 - y0 + 16, x1 - x0 + 16, 4), np.uint8)
        그림[..., :3] = (200, 40, 40)
        그림[..., 3] = 255
        return {"마스크": 마스크, "그림": 그림, "그림자리": [x0 - 8, y0 - 8],
                "테두리": [[x0, y0], [x1, y0], [x1, y1], [x0, y1]],
                "구멍": [], "가려짐": 0.0, "못땄음": None}

    monkeypatch.setattr(gpt누끼, "따기", 가짜따기)
    return 셈


_장식 = [{"id": "d1", "kind": "장식", "box": [300, 300, 700, 500], "cut": True}]


def test_같은_장식을_두_번_오리면_GPT를_한_번만_부른다(monkeypatch, tmp_path):
    _준비(monkeypatch, tmp_path)
    셈 = _센다(monkeypatch)
    첫 = cutout.cut_slide("ABC", 1, _장식)
    둘 = cutout.cut_slide("ABC", 1, _장식)
    assert 셈["수"] == 1, "두 번째는 창고에서 꺼내 써야 한다"
    assert 둘 == 첫


def test_네모를_옮기면_다시_오린다(monkeypatch, tmp_path):
    _준비(monkeypatch, tmp_path)
    셈 = _센다(monkeypatch)
    cutout.cut_slide("ABC", 1, _장식)
    옮긴것 = [{"id": "d1", "kind": "장식", "box": [300, 700, 700, 900], "cut": True}]
    cutout.cut_slide("ABC", 1, 옮긴것)
    assert 셈["수"] == 2


def test_꺼내_쓸_때도_누끼_PNG_가_제자리에_있다(monkeypatch, tmp_path):
    """람다가 그 PNG 를 창고로 올린다(`lambda_분석._누끼올리기`) — 꺼내 쓰느라
    안 만들어 놓으면 «누끼가 없다» 로 빠진다."""
    _준비(monkeypatch, tmp_path)
    _센다(monkeypatch)
    첫 = cutout.cut_slide("ABC", 1, _장식)
    자리 = Path(config.DATA) / "cutouts" / 첫["d1"]["png"]
    자리.unlink()                                   # 로컬 파일을 지워 본다
    둘 = cutout.cut_slide("ABC", 1, _장식)
    assert 자리.exists(), "꺼내 쓸 때 PNG 를 제자리에 되살려야 한다"
    assert 둘["d1"]["png"] == 첫["d1"]["png"]


def test_창고에_PNG_가_없으면_다시_오린다(monkeypatch, tmp_path):
    """적어 둔 것만 있고 그림이 없으면 «꺼내 쓸 수 있다» 고 하면 안 된다."""
    _준비(monkeypatch, tmp_path)
    셈 = _센다(monkeypatch)
    cutout.cut_slide("ABC", 1, _장식)
    for p in (Path(config.DATA) / "cutouts").rglob("*.png"):
        p.unlink()
    for p in (Path(config.DATA) / cutout.누끼캐시칸).rglob("*"):
        if p.is_file() and p.suffix != ".json":
            p.unlink()
    cutout.cut_slide("ABC", 1, _장식)
    assert 셈["수"] == 2


def test_못_딴_것은_창고에_안_담는다(monkeypatch, tmp_path):
    """못 딴 것을 담아 두면 다음 판에도 영영 못 딴 것으로 나온다."""
    _준비(monkeypatch, tmp_path)
    셈 = {"수": 0}

    def 못딴다(rgb, box, 이웃=(), 여유=8, 부르기=None, 밑판색=None, 게시물=None):
        셈["수"] += 1
        return {"마스크": None, "그림": None, "테두리": None, "구멍": [],
                "가려짐": 0.0, "못땄음": "GPT 가 전부 투명으로 냈다"}

    monkeypatch.setattr(gpt누끼, "따기", 못딴다)
    cutout.cut_slide("ABC", 1, _장식)
    cutout.cut_slide("ABC", 1, _장식)
    assert 셈["수"] == 2, "못 딴 것은 다시 해 봐야 한다"
