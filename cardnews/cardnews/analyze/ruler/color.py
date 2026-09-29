# analyze/ruler/color.py
"""색 3개를 '위치'로 정한다. 군집(k-means)으로는 역할을 알 수 없다.

배경 = 네 변 테두리 띠의 최빈색
글자 = OCR 박스 안에서 배경과 대비되는 최빈색
강조 = 채도 높고 면적 작고 배경에서 색상환으로 먼 색
"""
import numpy as np
from scipy import ndimage

BIN = 16          # 색을 16단계로 뭉쳐 최빈색을 센다 (JPEG 노이즈 흡수)
BORDER = 24       # 테두리 띠 두께
ACCENT_MAX_PCT = 8.0
BLOB_MIN_PX = 120


def _quant(a: np.ndarray) -> np.ndarray:
    # int64 로 올린다. uint16 으로 두면 아래 키 계산의 *65536 에서
    # numpy 2.x 가 OverflowError 를 낸다(예전 numpy 는 조용히 넘겼다).
    return a.astype(np.int64) // BIN


def _mode_color(px: np.ndarray) -> tuple[int, int, int]:
    """가장 흔한 색 칸을 찾고, 그 칸 안 실제 픽셀의 평균을 돌려준다."""
    if px.size == 0:
        return (0, 0, 0)
    q = _quant(px)
    keys = q[:, 0] * 65536 + q[:, 1] * 256 + q[:, 2]
    vals, counts = np.unique(keys, return_counts=True)
    win = vals[counts.argmax()]
    sel = keys == win
    return tuple(int(v) for v in px[sel].mean(axis=0).round())


def bg_color(img: np.ndarray) -> tuple[int, int, int]:
    b = BORDER
    strips = np.concatenate([
        img[:b, :, :].reshape(-1, 3),
        img[-b:, :, :].reshape(-1, 3),
        img[:, :b, :].reshape(-1, 3),
        img[:, -b:, :].reshape(-1, 3),
    ])
    return _mode_color(strips)


def text_color(img: np.ndarray, boxes) -> tuple[int, int, int]:
    """글자 박스 안에서 그 박스의 국소 배경과 가장 다른 쪽 색을 모은다."""
    picks = []
    for x0, y0, x1, y1 in boxes:
        x0, y0 = max(0, int(x0)), max(0, int(y0))
        x1, y1 = min(img.shape[1], int(x1)), min(img.shape[0], int(y1))
        if x1 - x0 < 4 or y1 - y0 < 4:
            continue
        crop = img[y0:y1, x0:x1].reshape(-1, 3)
        lum = crop.mean(axis=1)
        # 박스 안은 글자와 국소 배경 둘뿐이다. 중앙값으로 갈라 소수 쪽이 글자다.
        mid = np.median(lum)
        dark, light = crop[lum <= mid], crop[lum > mid]
        picks.append(dark if len(dark) <= len(light) else light)
    if not picks:
        return (0, 0, 0)
    return _mode_color(np.concatenate(picks))


def _hsv(rgb) -> tuple[float, float, float]:
    import colorsys
    r, g, b = [v / 255 for v in rgb]
    return colorsys.rgb_to_hsv(r, g, b)


def _hue_dist(a, b) -> float:
    d = abs(_hsv(a)[0] - _hsv(b)[0])
    return min(d, 1 - d)


def accent(img: np.ndarray, bg, boxes) -> tuple[tuple[int, int, int], int]:
    """강조색과 그 색 덩어리 개수. 덩어리 수가 '한 장에 한 곳만' 규칙을 잰다."""
    h, w = img.shape[:2]
    total = h * w
    q = _quant(img.reshape(-1, 3))
    keys = q[:, 0] * 65536 + q[:, 1] * 256 + q[:, 2]
    vals, counts = np.unique(keys, return_counts=True)

    best, best_score = None, -1.0
    for v, c in zip(vals, counts):
        pct = c / total * 100
        if pct > ACCENT_MAX_PCT or c < BLOB_MIN_PX:
            continue
        rgb = tuple(int(x) for x in img.reshape(-1, 3)[keys == v].mean(axis=0).round())
        _, s, val = _hsv(rgb)
        if s < 0.35 or val < 0.25:      # 무채색·너무 어두운 색 제외
            continue
        score = s * (0.5 + _hue_dist(rgb, bg))
        if score > best_score:
            best, best_score = (rgb, v), score

    if best is None:
        return bg, 0
    rgb, key = best
    mask = (keys == key).reshape(h, w)
    lab, n = ndimage.label(mask)
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    return rgb, int((sizes >= BLOB_MIN_PX).sum())


def _rel_lum(rgb) -> float:
    c = []
    for v in rgb:
        x = v / 255
        c.append(x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4)
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def contrast(a, b) -> float:
    """WCAG 상대휘도 대비. 최대 21:1."""
    la, lb = _rel_lum(a), _rel_lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def dominance(bg, text, accent) -> str:
    """색 지배: 따뜻 / 차가움 / 중립 / 고대비 (docx 4-2 ① 축).

    배경과 글자가 둘 다 무채색이고 대비가 12:1 이상이면 '고대비'로 본다.
    그 밖에는 배경과 강조색의 색상환 위치로 따뜻/차가움을 가른다.
    채도 0.15 미만인 색은 색상 판단에서 뺀다 — 무채색에 가까우면 hue 가 의미 없다.
    """
    if contrast(bg, text) >= 12 and _hsv(bg)[1] < 0.15 and _hsv(accent)[1] < 0.2:
        return "고대비"
    hs = [_hsv(c) for c in (bg, accent)]
    warm = sum(1 for h, s, _ in hs if s > 0.15 and (h < 0.13 or h > 0.86))
    cool = sum(1 for h, s, _ in hs if s > 0.15 and 0.40 <= h <= 0.72)
    if warm > cool:
        return "따뜻"
    if cool > warm:
        return "차가움"
    return "중립"


def hexs(rgb) -> str:
    return "#{:02X}{:02X}{:02X}".format(*[int(v) for v in rgb])
