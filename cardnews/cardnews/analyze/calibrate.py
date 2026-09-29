# analyze/calibrate.py
"""정답을 아는 카드를 그려서 자 트랙 상수를 뽑는다.

여기 있는 네 측정 함수가 자 트랙의 원본이다. ruler/ 는 이 함수들을 import 해서 쓴다.
"""
import json
import statistics
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config

FONT_REGULAR = r"C:\Windows\Fonts\malgun.ttf"
FONT_BOLD = r"C:\Windows\Fonts\malgunbd.ttf"

# 받침 있는 글자와 없는 글자를 섞는다. 한쪽만 쓰면 잉크비가 치우친다.
SAMPLE = "카드뉴스를만드는가장쉬운방법세가지"


# ── 1) 한글 잉크비 ──────────────────────────────────────────
def hangul_ink_ratio(font_path: str, px: int) -> float:
    """폰트 크기 px 로 그린 한글 한 글자의 잉크 높이 ÷ px 의 중앙값.

    OCR 이 주는 글자 박스도 잉크 박스라 같은 통계를 쓴다.
    글자마다 0.69~0.94 로 흔들리므로 반드시 중앙값을 쓴다.
    """
    font = ImageFont.truetype(font_path, px)
    heights = []
    for ch in SAMPLE:
        im = Image.new("L", (px * 3, px * 3), 255)
        ImageDraw.Draw(im).text((px // 2, px // 2), ch, font=font, fill=0)
        ys, _ = np.where(np.array(im) < 128)
        if len(ys):
            heights.append(ys.max() - ys.min() + 1)
    return statistics.median(heights) / px


# ── 2) 획 두께비 ────────────────────────────────────────────
def render_mask(font_path: str, px: int) -> np.ndarray:
    font = ImageFont.truetype(font_path, px)
    im = Image.new("L", (px * 12, px * 3), 255)
    ImageDraw.Draw(im).text((px // 2, px // 2), "카드뉴스만드는법", font=font, fill=0)
    return np.array(im) < 128


def stroke_ratio(mask: np.ndarray) -> float:
    """획 두께 ÷ 글자 높이. 거리변환의 중앙값 × 2 가 획 두께다.

    최댓값이 아니라 중앙값을 쓴다. 최댓값은 획이 겹치는 자리 하나에 끌려간다.
    """
    d = cv2.distanceTransform(mask.astype(np.uint8), cv2.DIST_L2, 5)
    ridge = d[d > 0.7 * d.max() * 0.35]  # 획 안쪽만
    if ridge.size == 0:
        return 0.0
    thickness = float(np.median(ridge)) * 2.0
    ys, _ = np.where(mask)
    height = ys.max() - ys.min() + 1
    return thickness / height


# ── 3) 모서리 반지름 ────────────────────────────────────────
CORNER_WINDOW = 1.2   # 모서리 측정창을 반지름의 몇 배로 잡을지 (실측으로 고른 값)


def radius_from_mask(mask: np.ndarray) -> float:
    """좌상 꼭짓점 정사각형에서 '빠진 넓이'로 역산한다.

    반지름 R 인 둥근 모서리가 잘라내는 넓이 = R^2 - pi*R^2/4 = R^2*(1-pi/4).
    한 줄만 훑는 방법은 안티에일리어싱 때문에 12% 낮게 나온다 — 쓰지 않는다.

    측정창을 반지름에 맞춰 좁혀가며 두세 번 다시 잰다. 창을 크게 잡으면
    빠진 넓이(R=40 이면 343px)가 창 넓이(150x150=22500px)의 1.5% 밖에 안 돼서
    가장자리 잡음에 그대로 끌려간다 — 실측으로 반지름이 40 대신 64 로 나왔다.
    """
    ys, xs = np.where(mask)
    if len(ys) == 0:
        return 0.0
    y0, x0 = ys.min(), xs.min()
    cap = min(ys.max() - y0 + 1, xs.max() - x0 + 1) // 2
    if cap < 2:
        return 0.0
    lim, r = cap, 0.0
    for _ in range(8):
        lim = max(4, min(cap, int(lim)))
        quad = mask[y0:y0 + lim, x0:x0 + lim]
        missing = lim * lim - int(quad.sum())
        r = max(0.0, float((missing / (1 - np.pi / 4)) ** 0.5))
        nxt = int(min(cap, max(6, r * CORNER_WINDOW)))
        if abs(nxt - lim) <= 1:
            break
        lim = nxt
    return r


# ── 4) 반투명 검정 알파 ─────────────────────────────────────
def alpha_from_edges(img: np.ndarray, box, gap: int = 6, band: int = 4) -> float:
    """오버레이 위쪽 경계 안팎을 비교해 알파를 복원한다.

    검정 오버레이의 합성식은 관측 = (1-a) * 원본. 경계 안팎에서 사진이
    이어진다고 보면 a = 1 - (안쪽 / 바깥쪽).
    바깥쪽이 너무 어두우면(<30) 비율이 폭발하므로 그 채널은 뺀다.
    """
    x0, y0, x1, y1 = [int(v) for v in box]
    a = img.astype(float)
    inset = max(60, (x1 - x0) // 8)
    out = a[y0 - gap - band:y0 - gap, x0 + inset:x1 - inset, :].reshape(-1, 3)
    ins = a[y0 + gap:y0 + gap + band, x0 + inset:x1 - inset, :].reshape(-1, 3)
    if out.size == 0 or ins.size == 0:
        return float("nan")
    om, im_ = out.mean(axis=0), ins.mean(axis=0)
    usable = om > 30
    if not usable.any():
        return float("nan")
    return float(1 - (im_[usable] / om[usable]).mean())


def make_alpha_sample(alpha: float):
    """테스트용: 사진처럼 거친 배경 위에 반투명 검정 둥근 사각형."""
    rng = np.random.default_rng(7)
    base = np.clip(rng.normal(150, 45, (1080, 1080, 3)), 0, 255).astype(np.uint8)
    for i in range(0, 1080, 60):
        base[i:i + 30, :, 0] = np.clip(base[i:i + 30, :, 0].astype(int) + 40, 0, 255)
    photo = Image.fromarray(base)
    box = (140, 600, 940, 900)
    ov = Image.new("RGBA", photo.size, (0, 0, 0, 0))
    ImageDraw.Draw(ov).rounded_rectangle(box, radius=40, fill=(0, 0, 0, int(alpha * 255)))
    comp = Image.alpha_composite(photo.convert("RGBA"), ov).convert("RGB")
    return np.array(comp), box


# ── 정답 카드 ───────────────────────────────────────────────
TRUTH = {
    "title_px": 72,
    "body_px": 38,
    "radius": 24,
    "alpha": 0.55,
    "leading_ratio": 1.6,
}


def make_card(path: Path) -> dict:
    """값을 다 아는 1080x1350 카드를 그린다. 눈으로도 확인할 수 있게 파일로 남긴다."""
    W, H = config.CANVAS_W, 1350
    rng = np.random.default_rng(11)
    photo = np.clip(rng.normal(150, 40, (H, W, 3)), 0, 255).astype(np.uint8)
    card = Image.fromarray(photo).convert("RGBA")

    box = (100, 820, 980, 1180)
    ov = Image.new("RGBA", card.size, (0, 0, 0, 0))
    ImageDraw.Draw(ov).rounded_rectangle(
        box, radius=TRUTH["radius"], fill=(0, 0, 0, int(TRUTH["alpha"] * 255))
    )
    card = Image.alpha_composite(card, ov).convert("RGB")

    d = ImageDraw.Draw(card)
    title = ImageFont.truetype(FONT_BOLD, TRUTH["title_px"])
    body = ImageFont.truetype(FONT_REGULAR, TRUTH["body_px"])
    lead_t = int(TRUTH["title_px"] * TRUTH["leading_ratio"])
    lead_b = int(TRUTH["body_px"] * TRUTH["leading_ratio"])
    d.text((140, 860), "카드뉴스 만드는 법", font=title, fill=(255, 255, 255))
    d.text((140, 860 + lead_t), "세 가지만 지키면 된다", font=title, fill=(255, 255, 255))
    d.text((140, 1050), "본문은 이렇게 작게 넣는다", font=body, fill=(255, 255, 255))
    d.text((140, 1050 + lead_b), "두 줄이면 충분하다", font=body, fill=(255, 255, 255))

    card.save(path, quality=95)
    return dict(TRUTH, box=box, canvas=[W, H])


def main() -> None:
    out = config.DATA / "calibration_card.jpg"
    truth = make_card(out)

    ratio_reg = hangul_ink_ratio(FONT_REGULAR, 100)
    ratio_bold = hangul_ink_ratio(FONT_BOLD, 100)
    s_reg = stroke_ratio(render_mask(FONT_REGULAR, 120))
    s_bold = stroke_ratio(render_mask(FONT_BOLD, 120))

    # 모서리 편향: 아는 반지름 다섯 개로 잰 뒤 평균 오차를 뺀다
    biases = []
    for r in (8, 16, 24, 40, 64):
        im = Image.new("L", (900, 400), 0)
        ImageDraw.Draw(im).rounded_rectangle((50, 50, 850, 350), radius=r, fill=255)
        biases.append(radius_from_mask(np.array(im) > 127) - r)
    radius_bias = float(np.mean(biases))

    a_errs = []
    for a in (0.35, 0.6, 0.8):
        img, box = make_alpha_sample(a)
        a_errs.append(alpha_from_edges(img, box) - a)
    alpha_bias = float(np.mean(a_errs))

    cal = {
        "hangul_ink_ratio": round(float(ratio_reg), 4),
        "hangul_ink_ratio_bold": round(float(ratio_bold), 4),
        "stroke_ratio_regular": round(s_reg, 4),
        "stroke_ratio_bold": round(s_bold, 4),
        "bold_threshold": round((s_reg + s_bold) / 2, 4),
        "radius_bias_px": round(radius_bias, 3),
        "alpha_bias": round(alpha_bias, 4),
        "font_regular": FONT_REGULAR,
        "font_bold": FONT_BOLD,
        "card": str(out),
        "card_truth": truth,
    }
    config.CAL_PATH.write_text(json.dumps(cal, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps(cal, ensure_ascii=False, indent=2))
    ok = (0.85 <= ratio_reg <= 0.96
          and s_bold > s_reg * 1.25
          and abs(radius_bias) < 2
          and abs(alpha_bias) < 0.05)
    print(f"\n정답 카드: {out}")
    print("기대 — 잉크비 0.85~0.96 · Bold획비 > Regular획비 x1.25")
    print("       모서리 편향 |x|<2px · 알파 편향 |x|<0.05")
    print("판정:", "통과" if ok else "실패 — 측정 코드를 고치기 전에는 다음 태스크로 가지 마라")
    if not ok:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
