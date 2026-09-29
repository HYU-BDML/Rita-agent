# analyze/effects.py
"""글자 **효과** 를 줄 하나에서 읽는다 — 외곽선과 밑줄만. **그림자는 안 잰다.**

사람 지시(2026-08-20): 「효과 자동판정 밑줄이나 그런것만 하고 그림자는 빼자」.
그림자는 흐리게 번져 배경과 구분이 애매하다 — 잴 수 있는 척하면 계량표가
자신 있게 틀린다. 라벨 화면의 사람 선택지(`외곽선·그림자·밑줄`)에서는 **안
뺀다**: 사람은 눈으로 보고 아는 것을 찍는다. 기계만 안 잰다.

기계는 `lineback.py` 가 이미 쓰는 연장을 그대로 쓴다 — 잰 글자색으로 글리프
화소를 가리고, **남은 것**을 본다.

## 외곽선 — 글리프를 감싸는 «세 번째 색»

글리프 마스크를 `RIM_IN`~`RIM_OUT` 만큼 부풀린 고리에서, 화소가 **글자색과
배경색을 잇는 선분 위에 있는지**를 본다. 안티에일리어싱은 그 선분 위에 놓인다
(글자와 배경을 섞은 색이니까). 진짜 외곽선은 그 선분에서 **벗어난다.**

배경색은 `lineback.back_of()` 가 그 줄에서 찾은 띠 색들을 **전부** 기준으로
쓴다. 하나만 쓰면 형광펜이 깔린 줄에서 나머지 배경이 통째로 「선분 밖」이 되어
외곽선으로 읽힌다(실측: 배경 하나만 쓰면 형광펜 줄의 고리 몫이 0.906 까지 뛴다).

실측 —

| | 고리 몫(`cover`) |
|---|---|
| 실물 37줄(외곽선 없음) | 0.000 ~ **0.117** (최댓값은 형광펜 줄의 JPEG 잡티) |
| 합성 외곽선 2px | 0.339 ~ 0.405 |
| 합성 외곽선 3px | 0.837 ~ 0.903 |
| 합성 외곽선 5px | 0.996 ~ 0.999 |

`RIM_COVER_MIN = 0.25` 는 그 빈 틈(0.117~0.339) 안이다. **1px 외곽선은 못
잡는다** — 고리 안쪽 한 칸이 통째로 안티에일리어싱이라 그렇다. 못 잡는 쪽으로
틀리는 게 낫다(사람이 찍은 값이 이긴다).

## 밑줄 — 잉크 상자 «아래» 의 가로 막대

줄 상자 밑에서 글자 높이의 절반만큼(다음 줄이 더 가까우면 거기까지) 훑어,
가로로 이어진 행 중 **배경들에서 먼** 화소가 가장 많은 행을 찾는다.

실측 —

| | 행 덮음(`cover`) |
|---|---|
| 실물 37줄(밑줄 없음) | 0.000 ~ **0.071** |
| 사진 위 두 줄까지 넣으면 | 0.286 (그 둘은 `line_detail` 의 사진 관문이 막는다) |
| 합성 밑줄 2px·4px, 먹색·연두·빨강 | 전부 **1.000** |

`UNDER_COVER_MIN = 0.5` 는 그 사이다. `UNDER_OFF_DE` 를 20 으로 둔 이유:
12 로 두면 형광펜 띠와 카드 배경 **사이의 경계 행**(둘을 섞은 1~2px)이 덮음
1.000 으로 잡혀 밑줄이 넷 생긴다. 두 배경의 LAB 거리가 40.9(#C9FC95↔#F1FFE5)
라 섞인 행은 양쪽에서 20 안쪽이고, 20 으로 올리면 그 넷이 전부 사라진다.

## 실물에 외곽선·밑줄이 하나도 없다

**그래서 「찾았다」쪽 갈래는 실물로 검증되지 않았다.** 위 두 문턱은
`merge_labeled.ACCENT_MIN_DE` 와 같은 자리의 값이다 — 합성으로만 밟아 본
**첫 추정치**다. 실물이 준 것은 **거짓 양성이 안 난다**는 쪽 근거뿐이다
(잰 37줄 전부 문턱 아래). 외곽선·밑줄이 있는 게시물이 라벨되면 다시 재라.
"""
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import lineback
import tint

OUTLINE = "외곽선"
UNDERLINE = "밑줄"
SHADOW = "그림자"

CHECKED = (OUTLINE, UNDERLINE)
NOT_CHECKED = (SHADOW,)
WHY_NOT = ("그림자는 흐리게 번져 배경과 구분이 애매하다 — 안 잰다(사람 지시 "
           "2026-08-20). 사람이 라벨에서 찍으면 그 값이 그대로 실린다")

RIM_IN = 1            # 글리프에서 이만큼 부풀린 안쪽은 고리에서 뺀다(순수 안티에일리어싱)
RIM_OUT = 4           # 여기까지가 고리
RIM_OFF_DE = 12.0     # 글자색–배경색 선분에서 이보다 멀면 「세 번째 색」이다
RIM_COVER_MIN = 0.25  # 고리의 이 몫 이상이 세 번째 색이면 외곽선
MIN_GLYPH_PX = 50     # 글리프 화소가 이보다 적으면 안 잰다
MIN_RING_PX = 50      # 고리 화소가 이보다 적으면 안 잰다

UNDER_OFF_DE = 20.0    # 배경들에서 이보다 멀면 「막대 화소」다
UNDER_COVER_MIN = 0.5  # 어느 행의 이 몫 이상이 막대 화소면 밑줄
UNDER_MIN_ROWS = 2     # 훑을 띠가 이보다 얇으면 안 잰다


def _seg_dist(points: np.ndarray, a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """LAB 점들에서 **선분** ab 까지의 거리. 안티에일리어싱은 이 선분 위에 놓인다."""
    ab = b - a
    denom = float(ab @ ab) or 1e-9
    t = np.clip(((points - a) @ ab) / denom, 0.0, 1.0)
    return np.linalg.norm(points - (a + t[:, None] * ab), axis=1)


def _hex(rgb) -> str:
    r, g, b = (int(v) for v in np.round(rgb))
    return f"#{r:02X}{g:02X}{b:02X}"


def _kernel(k: int):
    return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * k + 1, 2 * k + 1))


def outline_of(img: np.ndarray, box, ink_hex: str, bg_hexes: list[str],
               pad: int = 5) -> dict:
    """글리프를 감싸는 세 번째 색이 있나. `{"has", "cover", "hex"}`."""
    x0, y0, x1, y1 = (int(round(v)) for v in box)
    x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
    x1, y1 = min(img.shape[1], x1 + pad), min(img.shape[0], y1 + pad)
    sub = img[y0:y1, x0:x1]
    if sub.size == 0:
        return {"has": False, "cover": 0.0, "hex": None, "why": "줄 상자가 비었다"}
    lab = tint.to_lab(sub)
    ink = lineback._lab_of(ink_hex)
    glyph = np.linalg.norm(lab - ink, axis=2) < lineback.GLYPH_DE
    if int(glyph.sum()) < MIN_GLYPH_PX:
        return {"has": False, "cover": 0.0, "hex": None,
                "why": f"글리프 화소가 {int(glyph.sum())}개뿐이다"}
    g8 = glyph.astype(np.uint8)
    ring = cv2.dilate(g8, _kernel(RIM_OUT)).astype(bool) & ~cv2.dilate(g8, _kernel(RIM_IN)).astype(bool)
    if int(ring.sum()) < MIN_RING_PX:
        return {"has": False, "cover": 0.0, "hex": None,
                "why": f"고리 화소가 {int(ring.sum())}개뿐이다"}
    pts = lab[ring]
    dist = None
    for hx in bg_hexes:
        d = _seg_dist(pts, ink, lineback._lab_of(hx))
        dist = d if dist is None else np.minimum(dist, d)
    off = dist >= RIM_OFF_DE
    cover = round(float(off.mean()), 3)
    colour = _hex(sub[ring][off].reshape(-1, 3).mean(axis=0)) if off.any() else None
    return {"has": cover >= RIM_COVER_MIN, "cover": cover, "hex": colour}


def underline_of(img: np.ndarray, box, bg_hexes: list[str],
                 next_top: float | None = None) -> dict:
    """줄 상자 아래에 가로 막대가 있나. `{"has", "cover", "thick", "row", "hex"}`."""
    x0, y0, x1, y1 = (int(round(v)) for v in box)
    height = y1 - y0
    lo = y1
    hi = min(img.shape[0], y1 + max(4, int(round(height * 0.5))))
    if next_top is not None:
        hi = min(hi, int(next_top))
    if hi - lo < UNDER_MIN_ROWS:
        return {"has": False, "cover": 0.0, "thick": 0, "row": None, "hex": None,
                "why": "줄 아래에 볼 자리가 없다"}
    strip = img[lo:hi, max(0, x0):min(img.shape[1], x1)]
    if strip.size == 0:
        return {"has": False, "cover": 0.0, "thick": 0, "row": None, "hex": None,
                "why": "줄 아래 띠가 비었다"}
    lab = tint.to_lab(strip)
    # 띠 자체의 중앙값도 배경 기준에 넣는다 — 형광펜이 줄 상자 밑으로 흘러내린
    # 만큼은 `bg_hexes` 가 이미 알지만, 띠가 통째로 다른 색인 경우가 있다.
    refs = [lineback._lab_of(np.median(strip.reshape(-1, 3), axis=0))]
    refs += [lineback._lab_of(h) for h in bg_hexes]
    dist = None
    for ref in refs:
        d = np.linalg.norm(lab - ref, axis=2)
        dist = d if dist is None else np.minimum(dist, d)
    on = dist >= UNDER_OFF_DE
    rows = on.mean(axis=1)
    best = int(rows.argmax())
    cover = round(float(rows[best]), 3)
    thick = int((rows >= 0.5 * rows[best]).sum()) if rows[best] > 0 else 0
    has = cover >= UNDER_COVER_MIN
    colour = _hex(strip[best][on[best]].reshape(-1, 3).mean(axis=0)) if on[best].any() else None
    return {"has": has, "cover": cover, "thick": thick,
            "row": lo + best if has else None, "hex": colour if has else None}


def _fail(why: str) -> dict:
    """실패도 성공과 같은 모양으로 남긴다 — `lineback._fail()` 과 같은 관례."""
    return {"found": [], "checked": [], "not_checked": list(NOT_CHECKED),
            "why_not": WHY_NOT, "fallback": True, "why": why}


def of_line(img: np.ndarray, box, ink_hex: str | None, back: dict,
            next_top: float | None = None) -> dict:
    """줄 하나의 효과. `back` 은 그 줄의 `lineback.back_of()` 결과다.

    **`back` 이 띠를 못 가린 줄은 효과도 안 잰다.** 기준으로 삼을 배경색이
    없으면 「글자색도 배경색도 아닌 세 번째 색」이라는 말 자체가 성립하지
    않는다 — 사진 위 글자가 딱 그것이다(`layout_labeled.PHOTO_OVERLAP_MAX`).
    """
    if not ink_hex:
        return _fail("글자색을 못 재서 글리프를 가릴 수 없다")
    if back.get("fallback") or not back.get("runs"):
        return _fail("줄 뒤 색을 못 가렸다 — 견줄 배경색이 없다"
                     + (f" ({back.get('why')})" if back.get("why") else ""))
    bg_hexes = [r["hex"] for r in back["runs"]]
    out = outline_of(img, box, ink_hex, bg_hexes)
    und = underline_of(img, box, bg_hexes, next_top)
    found = [name for name, r in ((OUTLINE, out), (UNDERLINE, und)) if r["has"]]
    return {"found": found, "checked": list(CHECKED),
            "not_checked": list(NOT_CHECKED), "why_not": WHY_NOT,
            OUTLINE: out, UNDERLINE: und}


def of_block(line_effects: list[dict]) -> dict:
    """덩어리 한 벌로 접는다. **줄 하나에만 있어도 그 덩어리에 있는 것이다** —
    밑줄은 대개 한 줄에만 걸린다.

    `skipped` 는 못 잰 줄 수다. 0 이어도 적는다 — 없으면 「다 쟀는데 없더라」와
    「못 재서 비었다」가 계량표에서 똑같이 생긴다.
    """
    found, skipped, judged = [], 0, 0
    for e in line_effects:
        if e.get("fallback"):
            skipped += 1
            continue
        judged += 1
        for name in e["found"]:
            if name not in found:
                found.append(name)
    return {"found": found, "lines": judged, "skipped": skipped,
            "checked": list(CHECKED), "not_checked": list(NOT_CHECKED),
            "why_not": WHY_NOT}
