# analyze/ruler/normalize.py
"""모든 측정은 가로 1080 으로 맞춘 뒤에 한다.

인스타는 1080·1404·1440 을 섞어서 준다(실측). 정규화하지 않으면
'제목 72pt' 같은 값이 게시물마다 다른 잣대로 나온다.
72dpi 기준 1px = 1pt 이므로, 1080 으로 맞춘 픽셀값이 곧 pt 다.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import config


def load(path) -> tuple[np.ndarray, float]:
    """(RGB 배열, 원본→1080 배율) 을 준다. OCR 좌표는 이 배율을 곱해야 한다."""
    im = Image.open(path).convert("RGB")
    w0 = im.width
    if w0 != config.CANVAS_W:
        h = round(im.height * config.CANVAS_W / w0)
        im = im.resize((config.CANVAS_W, h), Image.LANCZOS)
    return np.asarray(im), config.CANVAS_W / w0
