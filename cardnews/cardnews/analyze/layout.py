# analyze/layout.py
"""되돌려 그릴 수 있는 정확한 배치를 뽑는다.

ruler/text.py 와 다른 점 — 저쪽은 **문단**으로 뭉쳐 통계를 낸다. 여기는 구글 비전이
준 **글자 상자 전부**를 그대로 쓴다. 1번 장 기준 문단 22개 vs 글자 183개다.
문단으로 뭉치면 제목 두 줄이 한 덩어리가 되고, 줄마다 색이 다른 것을 못 본다
(윗줄 흰색 · 아랫줄 초록 → 섞여서 회색으로 나왔다).

배경도 단색이 아니라 세로 프로파일로 잰다. 1번 장은 위 #FEFEFE 아래 #333333 이라
단색 하나로 저장하면 아래 절반이 통째로 틀린다.
"""
import json
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config
from ruler import normalize

# 같은 줄로 볼 세로 겹침 비율. 한글은 받침 때문에 위아래가 조금씩 어긋난다.
LINE_OVERLAP = 0.5
GRAD_STEP = 30          # 배경 프로파일을 이 간격으로 샘플
GRAD_FLAT = 12          # 위아래 채널차가 이보다 작으면 단색으로 본다
EDGE = 12               # 배경을 읽을 좌우 가장자리 띠 두께


def symbols(ocr: dict, scale: float) -> list[dict]:
    """구글 비전 응답 → 글자 하나하나. 좌표는 1080 기준으로 맞춘다."""
    out = []
    for page in ocr.get("fullTextAnnotation", {}).get("pages", []):
        for blk in page.get("blocks", []):
            for par in blk.get("paragraphs", []):
                for w in par.get("words", []):
                    for s in w.get("symbols", []):
                        v = s["boundingBox"]["vertices"]
                        xs = [p.get("x", 0) * scale for p in v]
                        ys = [p.get("y", 0) * scale for p in v]
                        out.append({
                            "text": s["text"],
                            "box": [min(xs), min(ys), max(xs), max(ys)],
                            "break": (s.get("property", {})
                                       .get("detectedBreak", {}).get("type", "")),
                        })
    return out


# 구글이 글자마다 붙여 주는 끊김 표시. 이걸 안 쓰면 "요즘은 이 브랜드가" 가
# "요즘은이브랜드가" 로 붙어 나온다 — 되돌려 그릴 때 글자 자리가 통째로 어긋난다.
SPACE_BREAKS = {"SPACE", "SURE_SPACE", "EOL_SURE_SPACE"}


def join_text(syms: list[dict]) -> str:
    out = []
    for s in syms:
        out.append(s["text"])
        if s.get("break") in SPACE_BREAKS:
            out.append(" ")
    return "".join(out).rstrip()


def group_lines(syms: list[dict]) -> list[dict]:
    """글자를 세로 겹침으로 줄로 묶는다. 문단이 아니라 **줄**이 단위다."""
    if not syms:
        return []
    rest = sorted(syms, key=lambda s: (s["box"][1], s["box"][0]))
    lines = []
    while rest:
        seed = rest[0]
        sy0, sy1 = seed["box"][1], seed["box"][3]
        sh = max(sy1 - sy0, 1)
        same, other = [], []
        for s in rest:
            y0, y1 = s["box"][1], s["box"][3]
            ov = min(sy1, y1) - max(sy0, y0)
            (same if ov > 0 and ov / min(sh, max(y1 - y0, 1)) >= LINE_OVERLAP
             else other).append(s)
        same.sort(key=lambda s: s["box"][0])
        xs0 = [s["box"][0] for s in same]
        ys0 = [s["box"][1] for s in same]
        xs1 = [s["box"][2] for s in same]
        ys1 = [s["box"][3] for s in same]
        lines.append({
            "text": join_text(same),
            "box": [round(min(xs0)), round(min(ys0)), round(max(xs1)), round(max(ys1))],
            "symbols": same,
        })
        rest = other
    lines.sort(key=lambda l: (l["box"][1], l["box"][0]))
    return lines


def _is_hangul(ch: str) -> bool:
    return "가" <= ch <= "힣"


# 숫자만 있는 줄의 잉크 높이를 «한글 잉크 높이» 로 환산하는 비.
#
# 실측: 우리가 싣고 다니는 글꼴 파일 15개에 「가나다한글」과 「0123456789」을
# 같은 크기로 그려 잉크 높이를 쟀다 — 0.787(나눔스퀘어라운드) ~ 0.978(잘난체),
# 가운뎃값 0.855. 글꼴에 따라 ±14% 흔들리지만, **버리는 것보다는 훨씬 낫다.**
숫자대한글 = 0.855

# 라틴 글자도 **키가 고른 것만 골라** 재면 잣대가 된다(사람 지시 2026-09-22).
#
# 여태 라틴을 통째로 뺐던 까닭은 「`dpf` 처럼 윗머리·아랫꼬리가 섞이면 높이가 글에
# 따라 달라진다」는 것이었다. 맞는 말이지만 **섞이는 것이 탈이지 라틴이 탈이
# 아니다** — 한글도 「한글만」 골라 재고 숫자도 「숫자만」 골라 잰다. 라틴도 키가
# 고른 것만 고르면 같은 잣대가 된다.
#
# 실측(싣고 다니는 글꼴 파일 22개, 「가나다한글」 대비 가운뎃값):
#   대문자  0.772~0.987, 가운뎃값 0.867   ← 숫자(0.787~0.978)와 흔들림이 같다
#   x높이   0.508~0.816, 가운뎃값 0.633   ← 두 배로 흔들린다. 그래도 버리는 것보단 낫다
#
# **이게 없어서 틀 두 벌에서 제목 자리 14개가 통째로 사라졌다**(실물 2026-09-22:
# Switzerland·Mongolia·Peru·Iceland·Egypt·Weekly AI…). 라벨엔 그어져 있는데 틀엔
# 없었고, 못그림에도 한 줄 안 적혀서 아무도 몰랐다.
대문자대한글 = 0.867
x높이대한글 = 0.633

# 밑으로 내려가는 `J` 와 꼬리 달린 `Q` 는 뺀다 — 위 비율을 이 집합으로 쟀다.
_고른대문자 = frozenset("ABCDEFGHIKLMNOPRSTUVWXYZ")
# 위로도 아래로도 안 나가는 소문자. `bdfhklt`(올라감)·`gjpqy`(내려감)는 뺀다.
_고른소문자 = frozenset("acemnorsuvwxz")

# 잰 갈래와 「한글 잉크 높이로 환산하는 비」. **믿을 만한 차례대로 본다** —
# 한글이 가장 고르고 소문자가 가장 흔들린다.
_잣대들 = (
    ("한글", _is_hangul, 1.0),
    ("숫자", str.isdigit, 숫자대한글),
    ("대문자", _고른대문자.__contains__, 대문자대한글),
    ("소문자", _고른소문자.__contains__, x높이대한글),
)

# 믿을 만한 차례. 덩어리가 여러 줄이면 **가장 덜 믿을 만한 잣대**로 부른다 —
# 「한 줄이라도 소문자로 쟀다」가 그 덩어리의 정확도이기 때문이다.
잣대차례 = tuple(이름 for 이름, _, _ in _잣대들)


def 잰것(line: dict) -> tuple[float | None, str]:
    """잉크 높이(한글 기준으로 환산한 값)와 **무엇으로 쟀는지**를 같이 낸다.

    갈래를 같이 내는 까닭은 «얼마나 믿을 만한가» 가 갈래마다 다르기 때문이다.
    점검이 이 값을 보고 「영문이라 크기를 덜 정확히 쟀다」를 알린다.
    """
    for 이름, 고르기, 비 in _잣대들:
        hs = [s["box"][3] - s["box"][1] for s in line["symbols"] if 고르기(s["text"])]
        if hs:
            return float(np.median(hs)) / 비, 이름
    return None, ""


def ink_height(line: dict) -> float | None:
    """한글 글자만으로 잉크 높이를 낸다. 받침 때문에 흔들리니 중앙값.

    **한글이 없으면 숫자·대문자·소문자 차례로 내려간다**(2026-09-01 숫자,
    2026-09-22 라틴). 한글이 잣대인 까닭은 높이가 고르기 때문인데, 골라 뽑은
    숫자·대문자·소문자도 그 점은 같다 — 다만 한글보다 작아서 환산한다.

    **이게 없어서 장 번호가 통째로 사라졌다.** 「03」에는 한글이 없어 잉크 높이가
    `None` 이 되고, 그러면 `pt` 가 없어 `recipe.슬롯이_되나` 가 그 칸을 버렸다.
    번호를 스스로 찾아내 놓고도 틀에 한 칸도 안 실렸다(실물 2026-09-01).
    라틴도 같은 이유로 제목 자리 14개를 잃었다(실물 2026-09-22).
    """
    return 잰것(line)[0]


def _mode_rgb(px: np.ndarray, bin_: int = 12) -> tuple[int, int, int]:
    q = (px.astype(np.int64) // bin_)
    keys = q[:, 0] * 65536 + q[:, 1] * 256 + q[:, 2]
    vals, counts = np.unique(keys, return_counts=True)
    sel = keys == vals[counts.argmax()]
    return tuple(int(v) for v in px[sel].mean(axis=0).round())


def line_color(img: np.ndarray, line: dict) -> str | None:
    """줄 하나의 글자색.

    글자 상자 **안쪽만** 본다(줄 상자 전체를 보면 글자 사이 배경이 섞인다).
    국소 배경에서 먼 픽셀을 오츠로 가른 뒤 **최빈색**을 쓴다 — 평균을 쓰면
    글자 테두리의 어두운 안티에일리어싱이 끌고 간다(실측으로 걸렸다).
    """
    h, w = img.shape[:2]
    lx0, ly0, lx1, ly1 = [int(v) for v in line["box"]]
    pad = 6
    rx0, ry0 = max(0, lx0 - pad), max(0, ly0 - pad)
    rx1, ry1 = min(w, lx1 + pad), min(h, ly1 + pad)
    if rx1 - rx0 < 3 or ry1 - ry0 < 3:
        return None
    ring = np.concatenate([
        img[ry0:ly0, rx0:rx1].reshape(-1, 3), img[ly1:ry1, rx0:rx1].reshape(-1, 3),
        img[ry0:ry1, rx0:lx0].reshape(-1, 3), img[ry0:ry1, lx1:rx1].reshape(-1, 3),
    ]) if (ry1 > ry0 and rx1 > rx0) else np.zeros((0, 3), np.uint8)
    if len(ring) < 10:
        return None
    bg = _mode_rgb(ring)

    px = []
    for s in line["symbols"]:
        x0, y0, x1, y1 = [int(v) for v in s["box"]]
        x0, y0 = max(0, x0), max(0, y0)
        x1, y1 = min(w, x1), min(h, y1)
        if x1 - x0 >= 2 and y1 - y0 >= 2:
            px.append(img[y0:y1, x0:x1].reshape(-1, 3))
    if not px:
        return None
    px = np.concatenate(px)
    d = np.abs(px.astype(float) - np.array(bg, float)).sum(axis=1)
    if d.max() < 12:
        return None
    t, _ = cv2.threshold(np.clip(d, 0, 255).astype(np.uint8), 0, 255,
                         cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    ink = px[d > t]
    if len(ink) < 8:
        return None
    return "#{:02X}{:02X}{:02X}".format(*_mode_rgb(ink))


def background(img: np.ndarray, text_boxes) -> dict:
    """좌우 가장자리 띠를 세로로 훑어 배경을 낸다. 단색인지 그라데이션인지도 판정."""
    h, w = img.shape[:2]
    strip = np.concatenate([img[:, :EDGE], img[:, -EDGE:]], axis=1)
    prof = strip.reshape(h, -1, 3).mean(axis=1)
    delta = float(np.abs(prof[0] - prof[-1]).max())
    stops = []
    for y in list(range(0, h, GRAD_STEP)) + [h - 1]:
        r, g, b = prof[y].round().astype(int)
        stops.append({"y": int(y), "hex": f"#{r:02X}{g:02X}{b:02X}"})
    return {
        "kind": "그라데이션" if delta > GRAD_FLAT else "단색",
        "delta": round(delta, 1),
        "top": stops[0]["hex"],
        "bottom": stops[-1]["hex"],
        "stops": stops,
    }


def slide_layout(pid: str, index: int) -> dict:
    img_path = config.IMAGES / pid / f"{index:02d}.jpg"
    img, scale = normalize.load(img_path)
    h, w = img.shape[:2]

    ocr_path = config.OCR_DIR / pid / f"{index:02d}.json"
    ocr = json.loads(ocr_path.read_text(encoding="utf-8")) if ocr_path.exists() else {}
    lines = group_lines(symbols(ocr, scale))

    cal = config.cal()
    k = cal["hangul_ink_ratio"]
    out_lines = []
    for l in lines:
        ih = ink_height(l)
        out_lines.append({
            "text": l["text"],
            "box": l["box"],
            "ink_h": round(ih, 1) if ih else None,
            "pt": round(ih / k) if ih else None,
            "color": line_color(img, l),
        })

    return {
        "index": index,
        "canvas": {"w": w, "h": h},
        "background": background(img, [l["box"] for l in out_lines]),
        "lines": out_lines,
    }


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("쓰는 법: python analyze/layout.py <게시물코드>")
    pid = sys.argv[1]
    sel = sorted((config.IMAGES / pid).glob("*.jpg"))
    if not sel:
        raise SystemExit(f"{config.IMAGES / pid} 에 그림이 없다.")

    doc = {"shortcode": pid, "slides": [slide_layout(pid, int(p.stem)) for p in sel]}
    dst = config.DATA / "layout"
    dst.mkdir(parents=True, exist_ok=True)
    path = dst / f"{pid}.json"
    path.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")

    for s in doc["slides"]:
        bg = s["background"]
        named = sum(1 for l in s["lines"] if l["color"])
        print(f"  {s['index']}번  줄 {len(s['lines']):2d}개 (색 잡힌 줄 {named})  "
              f"배경 {bg['kind']} {bg['top']}→{bg['bottom']}")
    print(f"\n{path}")


if __name__ == "__main__":
    main()
