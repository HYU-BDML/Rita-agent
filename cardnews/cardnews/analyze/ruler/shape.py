# analyze/ruler/shape.py
"""눈이 가리킨 자리에서 도형의 기하를 정밀하게 잰다.

들어오는 box 는 0~1000 정규화 좌표이고 대략이다. 여기서 픽셀로 되돌린 뒤
넉넉히 잘라 실제 경계를 다시 찾는다.
"""
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import calibrate
import config

PAD = 0.18          # 눈이 준 상자를 이만큼 넓혀 자른다
BLUR = 9            # 사진 거칠기를 눌러 없애는 흐림 창 크기
CAL = None


def _cal() -> dict:
    global CAL
    if CAL is None:
        CAL = config.cal()
    return CAL


def _to_px(box1000, w: int, h: int):
    x0, y0, x1, y1 = box1000
    return [x0 / 1000 * w, y0 / 1000 * h, x1 / 1000 * w, y1 / 1000 * h]


def _segment(crop: np.ndarray, inner) -> np.ndarray:
    """자른 조각 안에서 도형 마스크를 만든다.

    '바깥'은 눈이 준 상자 **밖의 여백**에서만 뽑는다. 조각 테두리를 그냥 쓰면,
    도형이 화면을 거의 채울 때 테두리가 도형 안쪽에 걸려 조각 전체가
    도형으로 잡힌다(실측으로 걸린 버그다).
    """
    h, w = crop.shape[:2]
    ix0, iy0, ix1, iy1 = [int(v) for v in inner]
    out_mask = np.ones((h, w), bool)
    out_mask[max(0, iy0):min(h, iy1), max(0, ix0):min(w, ix1)] = False
    if out_mask.sum() < 200:                 # 여백이 거의 없으면 얇은 테두리로 대신한다
        out_mask[:] = False
        b = max(2, min(h, w) // 20)
        out_mask[:b] = out_mask[-b:] = True
        out_mask[:, :b] = out_mask[:, -b:] = True
    # 사진은 그 자체로 거칠다. 먼저 흐리게 만들어 잡음을 상쇄시킨 뒤에 비교한다.
    # (차이를 먼저 구하고 흐리게 하면 |잡음| 의 평균이라 안 줄어든다 — 실측으로 확인)
    sm = cv2.blur(crop.astype(np.float32), (BLUR, BLUR))
    outside = sm[out_mask].mean(axis=0)
    d = np.abs(sm - outside).mean(axis=2)

    # 임계값을 숫자로 박지 않고 오츠로 잡는다. 고정값(18)을 쓰면 사진 거칠기가
    # 그 값을 넘는 순간 배경까지 도형으로 잡힌다 — 실측으로 걸린 버그다.
    t, _ = cv2.threshold(np.clip(d, 0, 255).astype(np.uint8), 0, 255,
                         cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    mask = (d > t).astype(np.uint8)
    ker = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, ker)
    # 가장 큰 덩어리만 남긴다
    n, lab, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    if n <= 1:
        return mask.astype(bool)
    big = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    return lab == big


def _shadow(crop: np.ndarray, mask: np.ndarray) -> dict:
    """도형 바깥 링이 국소 배경보다 어두우면 그림자다. 방향과 번짐을 잰다."""
    m = mask.astype(np.uint8)
    near = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))) - m
    far = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (41, 41))) \
        - cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (17, 17)))
    g = cv2.cvtColor(crop, cv2.COLOR_RGB2GRAY).astype(float)
    if near.sum() < 50 or far.sum() < 50:
        return {"has": False, "dir": None, "spread": 0}
    drop = g[far > 0].mean() - g[near > 0].mean()
    if drop < 6:
        return {"has": False, "dir": None, "spread": 0}
    ys, xs = np.where(near > 0)
    dark = g[near > 0] < g[near > 0].mean()
    if dark.sum() == 0:
        return {"has": True, "dir": None, "spread": 8}
    cy, cx = ys[dark].mean(), xs[dark].mean()
    my, mx = np.where(mask)
    dy, dx = cy - my.mean(), cx - mx.mean()
    vert = "아래" if dy > 0 else "위"
    horiz = "오른쪽" if dx > 0 else "왼쪽"
    direction = vert if abs(dy) >= abs(dx) else horiz
    return {"has": True, "dir": direction, "spread": int(round(min(drop * 2, 40)))}


def measure(img: np.ndarray, box1000) -> dict:
    h, w = img.shape[:2]
    x0, y0, x1, y1 = _to_px(box1000, w, h)
    bw, bh = x1 - x0, y1 - y0
    cx0 = int(max(0, x0 - bw * PAD)); cy0 = int(max(0, y0 - bh * PAD))
    cx1 = int(min(w, x1 + bw * PAD)); cy1 = int(min(h, y1 + bh * PAD))
    if cx1 - cx0 < 12 or cy1 - cy0 < 12:
        return {"box": [round(x0), round(y0), round(x1), round(y1)], "radius": 0.0,
                "fill": "#000000", "filled": False, "alpha": None,
                "shadow": {"has": False, "dir": None, "spread": 0}}

    crop = img[cy0:cy1, cx0:cx1]
    inner = (x0 - cx0, y0 - cy0, x1 - cx0, y1 - cy0)   # 눈이 준 상자를 조각 좌표로
    mask = _segment(crop, inner)
    if mask.sum() < 40:
        return {"box": [round(x0), round(y0), round(x1), round(y1)], "radius": 0.0,
                "fill": "#000000", "filled": False, "alpha": None,
                "shadow": {"has": False, "dir": None, "spread": 0}}

    ys, xs = np.where(mask)
    ax0, ay0, ax1, ay1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1

    radius = max(0.0, calibrate.radius_from_mask(mask) - _cal()["radius_bias_px"])

    # 채움인가 테두리인가: 바운딩박스 대비 마스크 채움률
    fill_ratio = mask.sum() / max((ax1 - ax0) * (ay1 - ay0), 1)
    filled = fill_ratio > 0.7

    inner = crop[ay0:ay1, ax0:ax1][mask[ay0:ay1, ax0:ax1]]
    fill_rgb = tuple(int(v) for v in inner.mean(axis=0).round()) if len(inner) else (0, 0, 0)

    # 알파: 어두운 오버레이일 때만 의미가 있다
    alpha = None
    if filled and float(np.mean(fill_rgb)) < 110:
        abs_box = (cx0 + ax0, cy0 + ay0, cx0 + ax1, cy0 + ay1)
        if abs_box[1] > 14:
            a = calibrate.alpha_from_edges(img, abs_box)
            if a == a and 0.05 < a < 0.98:   # NaN 아니고 범위 안
                alpha = round(float(a - _cal()["alpha_bias"]), 3)

    return {
        "box": [int(cx0 + ax0), int(cy0 + ay0), int(cx0 + ax1), int(cy0 + ay1)],
        "radius": round(radius, 1),
        "fill": "#{:02X}{:02X}{:02X}".format(*fill_rgb),
        "filled": bool(filled),
        "alpha": alpha,
        "shadow": _shadow(crop, mask),
    }
