# analyze/ruler/text.py
"""OCR 이 준 글자 박스에서 크기·굵기·행간·정렬·글꼴계열을 잰다.

핵심 한 줄: 글자 크기 pt = (한글 글자 잉크 높이 중앙값) / hangul_ink_ratio.
글자 하나하나는 받침 유무 때문에 0.69~0.94 로 흔들린다 — 반드시 중앙값.
"""
import re
import statistics
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import calibrate
import config

CAL = None

# "3가지", "80%", "TOP 5" 같은 수치 표현을 센다 (docx 4-2 ⑤ 축)
NUM_RE = re.compile(r"\d+(?:[.,]\d+)?\s*(?:%|퍼센트|가지|개|위|년|달|월|일|만|억|배|명|초|분|시간)?")
# 유니코드 코드포인트로 쓴다. 이모지를 리터럴로 넣으면 파일 인코딩에 휘둘린다.
EMOJI_RE = re.compile(
    "[\U0001F000-\U0001FAFF←-⇿☀-➿⬀-⯿️]"
)


def _cal() -> dict:
    global CAL
    if CAL is None:
        CAL = config.cal()
    return CAL


def _is_hangul(ch: str) -> bool:
    return "가" <= ch <= "힣"


def lines(ocr: dict, scale: float) -> list[dict]:
    """Vision 응답 → 줄 목록. 좌표를 1080 기준으로 배율 조정한다.

    한글이 없는 줄("TOP 5 AI TOOLS")은 **크기만** 못 잰다. 그런 줄도 목록에는 남기고
    `ink_h` 를 None 으로 둔다 — 빼버리면 그 글자 픽셀이 사진으로 세어지고
    정렬·여백·글자 수에서도 통째로 사라진다.
    """
    out = []
    for page in ocr.get("fullTextAnnotation", {}).get("pages", []):
        for blk in page.get("blocks", []):
            for par in blk.get("paragraphs", []):
                syms = [s for w in par.get("words", []) for s in w.get("symbols", [])]
                if not syms:
                    continue
                xs, ys, heights, txt = [], [], [], []
                for s in syms:
                    v = s["boundingBox"]["vertices"]
                    sx = [p.get("x", 0) * scale for p in v]
                    sy = [p.get("y", 0) * scale for p in v]
                    xs += sx
                    ys += sy
                    txt.append(s["text"])
                    if _is_hangul(s["text"]):
                        heights.append(max(sy) - min(sy))
                out.append({
                    "text": "".join(txt),
                    "box": [round(min(xs)), round(min(ys)), round(max(xs)), round(max(ys))],
                    # 한글이 없는 줄은 크기를 못 잰다 — None 이 "못 잰 줄" 표시다
                    "ink_h": float(statistics.median(heights)) if heights else None,
                })
    out.sort(key=lambda l: l["box"][1])
    return out


# 줄 끝이 이 안(px, 표준편차)에서 맞으면 «일자» 로 본다. OCR 상자는 두세 픽셀 흔들린다.
일자문턱 = 6

# 출처 줄로 볼 잣대. 마지막 줄이 (ㄱ) 눈에 띄게 작고 (ㄴ) 오른쪽 끝이 나머지와
# 맞으면 출처다.
#
# **왜 가르나.** 본문(왼쪽) + 출처(오른쪽)가 한 칸에 섞이면 왼쪽 끝이 흩어져
# 「가운데」가 뽑힌다(실물 2026-09-17, 파란 타임라인 4번 장: 같은 디자인인
# 상자 셋이 왼쪽·가운데·가운데로 갈렸다).
출처작음 = 0.85      # 대표 크기의 이만큼보다 작아야 한다
출처오른쪽 = 12      # 오른쪽 끝이 이 안(px)에서 맞아야 한다


def _출처줄인가(ls: list) -> bool:
    """마지막 줄이 출처처럼 보이나. 줄이 셋 미만이면 안 가른다 — 뺄 여유가 없다."""
    if len(ls) < 3:
        return False
    높이들 = [l["ink_h"] for l in ls if l.get("ink_h")]
    끝 = ls[-1]
    if len(높이들) < 2 or not 끝.get("ink_h"):
        return False
    대표 = statistics.median(높이들[:-1]) if len(높이들) > 1 else 높이들[0]
    if 끝["ink_h"] > 대표 * 출처작음:
        return False
    앞오른쪽 = [l["box"][2] for l in ls[:-1]]
    return abs(끝["box"][2] - max(앞오른쪽)) <= 출처오른쪽


def _align(ls: list[dict]) -> str:
    """왼쪽 끝 / 중심 / 오른쪽 끝 중 가장 덜 흩어진 쪽이 정렬 방향이다.

    **양쪽이 다 일자면 왼쪽이다**(2026-09-16). 신문 조판처럼 양쪽 끝을 맞춘 글은
    왼쪽·가운데·오른쪽이 다 0 에 가까워 몇 픽셀 차이로 «가운데» 가 뽑혔다(실물
    DSW-6lrk5rs 7번 장 본문). 새 글은 줄 길이가 제각각이라 가운데로 몰면
    삐뚤빼뚤해진다. 우리는 양쪽 맞춤을 못 그리니 왼쪽으로 적는다. 마지막 줄은
    양쪽 맞춤에서도 짧게 끝나므로 오른쪽 끝을 볼 때 뺀다.

    **출처 줄은 재기 전에 뺀다**(2026-09-17). 본문(왼쪽) + 출처(오른쪽)가 한
    칸에 섞이면 왼쪽 끝이 흩어져 「가운데」가 뽑힌다(실물 파란 타임라인 4번 장).
    """
    if _출처줄인가(ls):
        ls = ls[:-1]
    if len(ls) < 2:
        return "단일"
    left = [l["box"][0] for l in ls]
    right = [l["box"][2] for l in ls]
    center = [(l["box"][0] + l["box"][2]) / 2 for l in ls]
    오른쪽들 = right[:-1] if len(right) >= 3 else right
    if (statistics.pstdev(left) <= 일자문턱
            and statistics.pstdev(오른쪽들) <= 일자문턱):
        return "왼쪽"
    v = {"왼쪽": statistics.pvariance(left),
         "오른쪽": statistics.pvariance(right),
         "가운데": statistics.pvariance(center)}
    return min(v, key=v.get)


def _weight(img: np.ndarray, box) -> tuple[str, float]:
    """획 두께 ÷ 글자 높이. 캘리브레이션 임계값으로 Bold/Regular 를 가른다."""
    x0, y0, x1, y1 = [int(v) for v in box]
    x0, y0 = max(0, x0), max(0, y0)
    x1, y1 = min(img.shape[1], x1), min(img.shape[0], y1)
    if x1 - x0 < 8 or y1 - y0 < 8:
        return "Regular", 0.0
    g = cv2.cvtColor(img[y0:y1, x0:x1], cv2.COLOR_RGB2GRAY)
    _, bw = cv2.threshold(g, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    mask = bw > 0
    if mask.mean() > 0.5:                 # 글자가 밝은 쪽이면 뒤집는다
        mask = ~mask
    if mask.sum() < 50:
        return "Regular", 0.0
    r = calibrate.stroke_ratio(mask)
    return ("Bold" if r >= _cal()["bold_threshold"] else "Regular"), round(r, 4)


def _family(img: np.ndarray, box) -> str:
    """획 두께의 흩어짐. 고딕은 균일하고 명조는 가로세로 편차가 크다."""
    x0, y0, x1, y1 = [int(v) for v in box]
    x0, y0 = max(0, x0), max(0, y0)
    x1, y1 = min(img.shape[1], x1), min(img.shape[0], y1)
    if x1 - x0 < 8 or y1 - y0 < 8:
        return "고딕"
    g = cv2.cvtColor(img[y0:y1, x0:x1], cv2.COLOR_RGB2GRAY)
    _, bw = cv2.threshold(g, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    mask = bw > 0
    if mask.mean() > 0.5:
        mask = ~mask
    d = cv2.distanceTransform(mask.astype(np.uint8), cv2.DIST_L2, 5)
    ridge = d[d > 0.35 * d.max()] if d.max() > 0 else np.array([1.0])
    cv_ = float(np.std(ridge) / max(np.mean(ridge), 1e-6))
    return "명조" if cv_ > 0.45 else "고딕"


def _vpos(ls: list[dict], h: int) -> str:
    """글자 블록이 화면 어디에 얹혀 있나 (docx 4-2 ③ 축)."""
    if not ls:
        return "없음"
    c = statistics.median([(l["box"][1] + l["box"][3]) / 2 for l in ls]) / h
    return "상단" if c < 0.38 else ("하단" if c > 0.62 else "가운데")


def _margin(ls: list[dict], w: int, h: int) -> int:
    """글자가 화면 가장자리에서 가장 가깝게 붙은 거리 = 여백."""
    if not ls:
        return 0
    return int(min(
        min(l["box"][0] for l in ls),
        min(l["box"][1] for l in ls),
        w - max(l["box"][2] for l in ls),
        h - max(l["box"][3] for l in ls),
    ))


def _box_h(l: dict) -> float:
    return l["box"][3] - l["box"][1]


def empty() -> dict:
    """글자가 한 줄도 없는 장이 낼 값.

    일곱 칸을 다 채워야 한다 — measures/<코드>.json 의 계약이고
    recipe·export_dify·render 가 이 칸들을 그대로 꺼내 쓴다. 하나라도 빠지면
    사진만 있는 장 한 장에 뒤쪽이 통째로 KeyError 로 죽는다.
    """
    return {"levels": [], "align": "없음", "vpos": "없음", "margin": 0,
            "digits": 0, "emoji": 0, "text_area_pct": 0.0}


def measure(img: np.ndarray, ls: list[dict]) -> dict:
    """줄들을 크기별로 묶어 제목/본문/캡션 위계를 만든다."""
    h, w = img.shape[:2]
    k = _cal()["hangul_ink_ratio"]
    if not ls:
        return empty()

    sized = [l for l in ls if l["ink_h"]]      # 한글이 있어 크기를 잰 줄
    for l in sized:
        l["pt"] = l["ink_h"] / k

    levels = []
    if sized:
        # 가장 큰 글자 대비 비율로 위계를 나눈다. 절대값은 게시물마다 다르다.
        top = max(l["pt"] for l in sized)
        def bucket(pt: float) -> str:
            r = pt / top
            return "제목" if r >= 0.75 else ("본문" if r >= 0.45 else "캡션")

        groups = {}
        for role in ("제목", "본문", "캡션"):
            grp = [l for l in sized if bucket(l["pt"]) == role]
            if grp:
                groups[role] = grp

        # 크기를 못 잰 줄은 박스 높이가 가장 비슷한 위계에 얹는다.
        # 줄 수·글자 수에는 세고, pt·행간 계산에는 넣지 않는다 — 잉크 높이가 없어서다.
        extra = {role: [] for role in groups}
        ref = {role: statistics.median([_box_h(l) for l in grp]) for role, grp in groups.items()}
        for l in ls:
            if l["ink_h"]:
                continue
            extra[min(ref, key=lambda r: abs(ref[r] - _box_h(l)))].append(l)

        for role, grp in groups.items():
            pts = [l["pt"] for l in grp]
            weights = [_weight(img, l["box"]) for l in grp]
            bolds = sum(1 for wt, _ in weights if wt == "Bold")
            # 행간: 같은 위계에서 세로로 이웃한 줄의 박스 중심 간격 / 글자 크기
            tops = sorted((l["box"][1] + l["box"][3]) / 2 for l in grp)
            gaps = [b - a for a, b in zip(tops, tops[1:]) if 0 < b - a < top * 4]
            leading = round(statistics.median(gaps) / statistics.median(pts), 2) if gaps else 0.0
            levels.append({
                "role": role,
                "pt": round(statistics.median(pts)),
                "pct_h": round(statistics.median(pts) / h * 100, 2),
                "weight": "Bold" if bolds * 2 >= len(grp) else "Regular",
                "family": _family(img, max(grp, key=lambda l: l["pt"])["box"]),
                "lines": len(grp) + len(extra[role]),
                "chars": sum(len(l["text"]) for l in grp + extra[role]),
                "leading": leading,
            })

    area = np.zeros((h, w), bool)
    for l in ls:
        x0, y0, x1, y1 = l["box"]
        area[max(0, y0):min(h, y1), max(0, x0):min(w, x1)] = True

    full = "".join(l["text"] for l in ls)
    return {
        "levels": levels,
        "align": _align(ls),
        "vpos": _vpos(ls, h),
        "margin": _margin(ls, w, h),
        "digits": len(NUM_RE.findall(full)),
        "emoji": len(EMOJI_RE.findall(full)),
        "text_area_pct": round(float(area.mean()) * 100, 2),
    }
