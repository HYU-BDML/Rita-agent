# analyze/ruler/photo.py
"""사진 영역을 국소 분산으로 가른다.

단색 배경과 도형은 평평하고 사진은 거칠다. 다만 글자도 거칠기 때문에
OCR 박스를 반드시 빼야 한다 — 안 빼면 글자 덩어리가 사진으로 잡힌다.
"""
import cv2
import numpy as np

WIN = 9
VAR_THRESHOLD = 120.0
CLOSE = 25


def area_pct(img: np.ndarray, text_boxes) -> float:
    g = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY).astype(np.float32)
    m = cv2.blur(g, (WIN, WIN))
    m2 = cv2.blur(g * g, (WIN, WIN))
    var = np.maximum(m2 - m * m, 0)

    mask = (var > VAR_THRESHOLD).astype(np.uint8)

    h, w = mask.shape
    for x0, y0, x1, y1 in text_boxes:                  # 글자는 사진이 아니다
        pad = 6
        mask[max(0, int(y0) - pad):min(h, int(y1) + pad),
             max(0, int(x0) - pad):min(w, int(x1) + pad)] = 0

    # 자잘한 구멍을 메워 한 덩어리로 만든다
    ker = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (CLOSE, CLOSE))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, ker)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN,
                            cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))

    return round(float(mask.mean()) * 100, 2)
