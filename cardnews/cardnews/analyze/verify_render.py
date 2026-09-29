# analyze/verify_render.py
"""잰 값이 맞는지 눈으로 확인한다. 원본 | 검출 오버레이 | 재구성 을 나란히 굽는다.

render.py 와 다른 점: 저쪽은 레시피(클러스터 중앙값)로 **새 카드**를 굽고,
여기는 measures/<코드>.json 의 **그 장 실측값 그대로** 되돌려 굽는다.
좌표를 평균 내지 않으므로 자가 틀리면 그 자리에서 어긋나 보인다.

사진은 실물이라 되돌릴 수 없다 — 검출된 영역을 회색으로만 채운다.
"""
import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config
from ruler import normalize, photo
from ruler import text as T

PANEL_GAP = 16
LABEL_H = 40
PHOTO_FILL = (200, 200, 200)
C_SHAPE = (255, 40, 40)
C_SHAPE_BAD = (255, 160, 0)
C_TEXT = (30, 120, 255)
C_PHOTO = (0, 200, 120)


def photo_mask(img: np.ndarray, text_boxes) -> np.ndarray:
    """photo.area_pct 와 같은 절차. 비율 대신 마스크를 돌려준다."""
    g = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY).astype(np.float32)
    m = cv2.blur(g, (photo.WIN, photo.WIN))
    m2 = cv2.blur(g * g, (photo.WIN, photo.WIN))
    var = np.maximum(m2 - m * m, 0)
    mask = (var > photo.VAR_THRESHOLD).astype(np.uint8)

    h, w = mask.shape
    for x0, y0, x1, y1 in text_boxes:
        pad = 6
        mask[max(0, int(y0) - pad):min(h, int(y1) + pad),
             max(0, int(x0) - pad):min(w, int(x1) + pad)] = 0

    ker = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (photo.CLOSE, photo.CLOSE))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, ker)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN,
                            cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    return mask.astype(bool)


def is_failed(sh: dict) -> bool:
    """shape.measure 가 못 재고 되돌린 값의 지문."""
    return sh["radius"] == 0.0 and sh["fill"] == "#000000" and not sh["filled"]


def draw_shape(d: ImageDraw.ImageDraw, sh: dict, size) -> None:
    x0, y0, x1, y1 = sh["box"]
    if x1 <= x0 or y1 <= y0:
        return
    r = int(sh["radius"])
    box = [x0, y0, x1, y1]
    if sh["filled"]:
        d.rounded_rectangle(box, radius=r, fill=sh["fill"])
    else:
        d.rounded_rectangle(box, radius=r, outline=sh["fill"], width=3)


def paint_bg(bg: dict, size) -> Image.Image:
    """배경. 그라데이션이면 세로 스톱을 이어 칠한다."""
    w, h = size
    if bg["kind"] == "단색" or len(bg["stops"]) < 2:
        return Image.new("RGB", (w, h), bg["top"])
    ys = [s["y"] for s in bg["stops"]]
    cols = np.array([[int(s["hex"][i:i + 2], 16) for i in (1, 3, 5)] for s in bg["stops"]],
                    float)
    col = np.stack([np.interp(np.arange(h), ys, cols[:, c]) for c in range(3)], axis=1)
    return Image.fromarray(np.repeat(col.round().astype(np.uint8)[:, None, :], w, axis=1))


def draw_lines(img: Image.Image, lay_lines: list, cal: dict, bold: bool) -> Image.Image:
    """줄마다 실측 상자·크기·색으로 찍는다. 잉크 왼위 모서리를 상자에 맞춘다."""
    d = ImageDraw.Draw(img)
    path = cal["font_bold"] if bold else cal["font_regular"]
    for l in lay_lines:
        if not l["text"].strip() or not l["color"]:
            continue
        x0, y0, x1, y1 = l["box"]
        pt = l["pt"] or max(8, int(round((y1 - y0) * 0.9)))
        f = ImageFont.truetype(path, max(6, int(pt)))
        bb = f.getbbox(l["text"])          # 글리프 잉크가 원점에서 얼마나 떨어졌나
        d.text((x0 - bb[0], y0 - bb[1]), l["text"], font=f, fill=l["color"])
    return img


def rebuild(slide: dict, lines: list, size, cal: dict) -> Image.Image:
    """측정값만으로 다시 짓는다. 좌표는 전부 실측 절대좌표."""
    w, h = size
    img = Image.new("RGB", (w, h), slide["colors"]["bg"])

    pm = slide.get("_photo_mask")
    if pm is not None and pm.any():
        arr = np.asarray(img).copy()
        arr[pm] = PHOTO_FILL
        img = Image.fromarray(arr)

    # 도형: 알파가 있으면 따로 겹쳐 올린다
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    solid = ImageDraw.Draw(img)
    for sh in slide["shapes"]:
        if is_failed(sh):
            continue
        if sh["alpha"] is not None and sh["filled"]:
            x0, y0, x1, y1 = sh["box"]
            if x1 > x0 and y1 > y0:
                rgb = tuple(int(sh["fill"][i:i + 2], 16) for i in (1, 3, 5))
                ld.rounded_rectangle([x0, y0, x1, y1], radius=int(sh["radius"]),
                                     fill=rgb + (int(round(sh["alpha"] * 255)),))
        else:
            draw_shape(solid, sh, size)
    img = Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")

    # 글자: OCR 이 준 실제 줄 상자에, 실측 pt 로 찍는다
    d = ImageDraw.Draw(img)
    k = cal["hangul_ink_ratio"]
    bold = {lv["role"]: lv["weight"] == "Bold" for lv in slide["text"]["levels"]}
    default_bold = any(bold.values())
    for l in lines:
        if not l["text"].strip():
            continue
        x0, y0, x1, y1 = l["box"]
        pt = int(round(l["ink_h"] / k)) if l["ink_h"] else max(8, int(y1 - y0))
        pt = max(6, pt)
        path = cal["font_bold"] if default_bold else cal["font_regular"]
        f = ImageFont.truetype(path, pt)
        d.text((x0, y0), l["text"], font=f, fill=slide["colors"]["text"], anchor="lt")
    return img


def overlay(img: np.ndarray, slide: dict, lines: list) -> Image.Image:
    out = Image.fromarray(img.copy())

    pm = slide.get("_photo_mask")
    if pm is not None and pm.any():
        arr = np.asarray(out).copy()
        arr[pm] = (arr[pm] * 0.55 + np.array(C_PHOTO) * 0.45).astype(np.uint8)
        out = Image.fromarray(arr)

    d = ImageDraw.Draw(out)
    for l in lines:
        d.rectangle(l["box"], outline=C_TEXT, width=2)
    for sh in slide["shapes"]:
        col = C_SHAPE_BAD if is_failed(sh) else C_SHAPE
        x0, y0, x1, y1 = sh["box"]
        d.rectangle([x0, y0, x1, y1], outline=col, width=4)
    return out


def label(text: str, w: int) -> Image.Image:
    strip = Image.new("RGB", (w, LABEL_H), (24, 24, 24))
    f = ImageFont.truetype(config.cal()["font_bold"], 22)
    ImageDraw.Draw(strip).text((10, 8), text, font=f, fill=(255, 255, 255))
    return strip


C_GRAPHIC = (120, 60, 220)

# 마스크 안에서 대표색과 '비슷한' 색이 이 비율 이상을 차지하면 '평평한 그래픽'으로 본다.
# 국소 분산으로 판정했을 때는 실패했다 — 검정 바탕에 흰 글자(Follow 버튼)처럼
# **한 색이 절반 이상인데 부분적으로 대비가 센** 경우를 전부 '사진'으로 오판해서,
# 카드와 버튼이 똑같은 회색이 되어 버튼이 카드 속에 파묻혀 사라졌다(실측: 7번 장).
# 좁은 양자화 구간 하나로 세면(맨해튼 거리 대신 정수 나눗셈) 그림자·하이라이트로 색이
# 살짝 퍼진 로고가 문턱을 못 넘는다 — MarT 로고가 43%로 나와 사진으로 잘못 갈렸다.
# 대표색 기준 **거리**로 셌더니 57%로 정확히 갈렸다(실측).
DOMINANT_SHARE = 0.45
QUANT_BIN = 14
COLOR_DIST = 40


def region_mask(rle: dict | None, size) -> np.ndarray:
    """RLE → 마스크. JPEG 압축 잡음으로 생기는 자잘한 구멍·티끌을 정리한다."""
    w, h = size
    if not rle:
        return np.zeros((h, w), bool)
    from pycocotools import mask as mask_utils
    m = mask_utils.decode(rle).astype(np.uint8)
    ker = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, ker)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(m, 8)
    if n > 1:
        big = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        m = (lab == big).astype(np.uint8)
    return m.astype(bool)


def region_appearance(img: np.ndarray, mask: np.ndarray, cal: dict):
    """마스크 안 최빈색의 점유율로 사진/그래픽을 가르고, 그래픽이면 색·반지름을 잰다.

    Claude 의 kind 이름표는 안 믿는다 — '도형'이라 적어놓고 실제로는 스크린샷·
    사진 카드인 경우가 섞여 있었다. 내용을 지워야 하는지는 실제 픽셀이 결정한다.
    """
    import calibrate
    ys, xs = np.where(mask)
    if len(ys) < 100:
        return None
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    local = mask[y0:y1, x0:x1]
    px = img[y0:y1, x0:x1][local]

    # 1) 양자화 최빈색으로 대표색 후보를 잡는다 (테두리 잡음에 안 흔들리려고)
    q = (px.astype(np.int64) // QUANT_BIN)
    keys = q[:, 0] * 10000 + q[:, 1] * 100 + q[:, 2]
    vals, counts = np.unique(keys, return_counts=True)
    center = px[keys == vals[counts.argmax()]].mean(axis=0)
    # 2) 대표색과 가까운 픽셀을 전부 묶어 점유율을 낸다 — 그림자·하이라이트로
    #    색이 살짝 퍼진 로고도 같은 무리로 잡힌다(구간 하나로만 세면 43%, 이걸로는 57%)
    close = np.abs(px.astype(float) - center).sum(axis=1) < COLOR_DIST
    share = float(close.mean())
    if share < DOMINANT_SHARE:
        return None            # 사진 — 어떤 색도 이만큼 못 채운다
    fill = tuple(int(v) for v in px[close].mean(axis=0).round())
    radius = max(0.0, calibrate.radius_from_mask(local) - cal["radius_bias_px"])
    return {"fill": "#{:02X}{:02X}{:02X}".format(*fill), "radius": round(radius, 1)}


def draw_regions(canvas: Image.Image, img: np.ndarray, regions: list, cal: dict) -> Image.Image:
    """SAM2 정밀 영역을 그린다. 사진·인물은 회색(인물은 아예 생략), 그래픽 도형은 실측 색으로.

    도형은 항상 마스크 모양 그대로 칠한다 — 둥근 사각형으로 그리면 원형 로고
    같은 건 박스 채움률이 78%밖에 안 돼서 확 어긋난다(실측: MarT 로고). '이게 원인지
    세모인지' 따로 판정할 필요가 없다. 마스크가 이미 실제 윤곽이다.
    """
    d = ImageDraw.Draw(canvas)
    ordered = sorted(regions, key=lambda r: -(r["box"][2] - r["box"][0]) * (r["box"][3] - r["box"][1]))
    for r in ordered:
        if r["kind"] == "인물":
            continue          # 사람은 자리도 안 그린다 — 프롬프트 설명으로 대체
        box = r["box"]
        mask = region_mask(r.get("rle"), (canvas.width, canvas.height))
        if not mask.any():
            d.rectangle(box, fill=PHOTO_FILL)
            continue
        ap = region_appearance(img, mask, cal)
        arr = np.asarray(canvas).copy()
        arr[mask] = tuple(int(ap["fill"][i:i + 2], 16) for i in (1, 3, 5)) if ap else PHOTO_FILL
        canvas = Image.fromarray(arr)
        d = ImageDraw.Draw(canvas)
    return canvas


def overlay_regions(base: Image.Image, regions: list) -> Image.Image:
    out = base.copy()
    d = ImageDraw.Draw(out)
    for r in regions:
        col = C_PHOTO if r["kind"] in ("사진", "인물") else C_GRAPHIC
        d.rectangle(r["box"], outline=col, width=4)
    return out


def stack(panels: list, size) -> Image.Image:
    w, h = size
    total_w = w * len(panels) + PANEL_GAP * (len(panels) - 1)
    sheet = Image.new("RGB", (total_w, h + LABEL_H), (245, 245, 245))
    for i, (name, im) in enumerate(panels):
        x = i * (w + PANEL_GAP)
        sheet.paste(label(name, w), (x, 0))
        sheet.paste(im, (x, LABEL_H))
    return sheet


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("쓰는 법: python analyze/verify_render.py <게시물코드>")
    pid = sys.argv[1]
    mpath = config.MEASURES / f"{pid}.json"
    if not mpath.exists():
        raise SystemExit(f"{mpath} 이 없다. 먼저 merge.py 까지 돌려라.")
    doc = json.loads(mpath.read_text(encoding="utf-8"))
    cal = config.cal()
    lpath = config.DATA / "layout" / f"{pid}.json"
    lay = json.loads(lpath.read_text(encoding="utf-8")) if lpath.exists() else None
    if lay is None:
        print("  (layout.json 이 없다 — `python analyze/layout.py <코드>` 를 먼저 돌리면 4번째 칸이 생긴다)")
    rpath = config.DATA / "regions" / f"{pid}.json"
    regs_doc = json.loads(rpath.read_text(encoding="utf-8")) if rpath.exists() else None
    if regs_doc is None:
        print("  (regions.json 이 없다 — `python analyze/regions.py <코드>` 를 먼저 돌리면 5번째 칸이 생긴다)")

    out_dir = config.DATA / "verify" / pid
    out_dir.mkdir(parents=True, exist_ok=True)

    n_fail = n_oob = n_shape = 0
    for slide in doc["slides"]:
        i = slide["index"]
        img_path = config.IMAGES / pid / f"{i:02d}.jpg"
        if not img_path.exists():
            print(f"  ! {i}번 그림이 없다 — 건너뜀")
            continue
        img, scale = normalize.load(img_path)
        h, w = img.shape[:2]

        ocr_path = config.OCR_DIR / pid / f"{i:02d}.json"
        ocr = json.loads(ocr_path.read_text(encoding="utf-8")) if ocr_path.exists() else {}
        lines = T.lines(ocr, scale)
        slide["_photo_mask"] = photo_mask(img, [l["box"] for l in lines])

        for sh in slide["shapes"]:
            n_shape += 1
            if is_failed(sh):
                n_fail += 1
            b = sh["box"]
            if b[0] < 0 or b[1] < 0 or b[2] > w or b[3] > h:
                n_oob += 1

        panels = [
            ("원본", Image.fromarray(img)),
            ("검출 (파랑=글자줄 · 빨강=도형 · 주황=측정실패 · 초록=사진)", overlay(img, slide, lines)),
            ("재구성 A · 기존 measures", rebuild(slide, lines, (w, h), cal)),
        ]
        if lay is not None:
            ls = next((s for s in lay["slides"] if s["index"] == i), None)
            if ls is not None:
                bold = any(lv["weight"] == "Bold" for lv in slide["text"]["levels"])
                canvas = paint_bg(ls["background"], (w, h))
                sd = ImageDraw.Draw(canvas)
                for sh in slide["shapes"]:
                    if not is_failed(sh):
                        draw_shape(sd, sh, (w, h))
                panels.append(("재구성 B · layout.py (글자별 상자 + 그라데이션)",
                               draw_lines(canvas, ls["lines"], cal, bold)))

                rs = None
                if regs_doc is not None:
                    rs = next((s for s in regs_doc["slides"] if s["index"] == i), None)
                if rs is not None:
                    panels.append(("검출 · regions.py (보라=그래픽 도형 · 초록=사진/인물)",
                                   overlay_regions(Image.fromarray(img), rs["regions"])))
                    canvas2 = paint_bg(ls["background"], (w, h))
                    canvas2 = draw_regions(canvas2, img, rs["regions"], cal)
                    canvas2 = draw_lines(canvas2, ls["lines"], cal, bold)
                    panels.append(("재구성 C · regions.py (SAM2 정밀 영역)", canvas2))
        sheet = stack(panels, (w, h))
        p = out_dir / f"{i:02d}.png"
        sheet.save(p)
        print(f"  {p}")

    print(f"\n도형 {n_shape}개 · 측정실패 {n_fail}개 · 화면밖 {n_oob}개")
    print(f"결과: {out_dir}")


if __name__ == "__main__":
    main()
