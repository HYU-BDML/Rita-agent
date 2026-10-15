"""숏츠 화면 구성(v5).

근거: 조회수가 높은 한국어·영어 정보형 쇼츠 18건 조사와 9건 계측
(~/code/shorts_data/research/shorts_research.md, 2026-10-16).
1. 첫 프레임부터 제목과 그림이 함께 보인다. 말은 0.15초 안에 시작한다.
2. 화면이 2~3초마다 바뀐다(계측 5건 평균 장면 1.25~2.72초).
3. 한국어 고조회 쇼츠 4건은 상단 제목 띠를 영상 끝까지 고정한다.
4. 자막은 한 구절(4~12자)씩 한 줄, 상자 없이 흰 글씨에 검은 테두리(9건 중 8건).

화면 형식 두 가지
- band(제목 띠형, 기본): 검은 바탕, 위쪽 제목 2줄 고정, 가운데 그림, 그림 아래쪽 한 줄 자막
- full(전체 화면형): 그림이 화면 전체, 위쪽 제목(어두운 그라데이션 위), 화면 61% 높이 자막
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional, Tuple

from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1080, 1920
YELLOW = (255, 221, 0)
WHITE = (255, 255, 255)

TEMPLATES = {
    # 자막은 그림 아래 검은 띠에 둔다(카드 글자를 덮지 않게). 릴스 하단 UI(약 1600px 아래)는 피한다.
    "band": {"title_box": (40, 120, 1040, 330), "media": (0, 350, 1080, 1390), "cap_y": 1478,
             "cap_size": 72, "bg": (0, 0, 0)},
    "full": {"title_box": (40, 120, 1040, 330), "media": (0, 0, 1080, 1920), "cap_y": 1180,
             "cap_size": 74, "bg": (0, 0, 0)},
}
CAP_CHARS = 13          # 자막 한 줄 최대 글자 수(한글 기준)

_FONT_DIRS = [Path(__file__).resolve().parent / "fonts", Path.home() / "Library" / "Fonts"]
_FALLBACK = Path("/usr/share/fonts/truetype/nanum/NanumGothicExtraBold.ttf")


def font(weight: str, size: int) -> ImageFont.FreeTypeFont:
    for d in _FONT_DIRS:
        p = d / f"Pretendard-{weight}.otf"
        if p.exists():
            return ImageFont.truetype(str(p), size)
    if _FALLBACK.exists():
        return ImageFont.truetype(str(_FALLBACK), size)
    raise RuntimeError("Pretendard 글꼴이 없습니다(app/fonts).")


# ── 핵심어 표시 ────────────────────────────────────────────
_NUM_TOKEN = re.compile(r"\d[\d,.]*\s*(%p|%|퍼센트|만|천|억|조|년|명|개|배|일|초|분|시간|위|번|원|달러|살|곳|가지)*")


# 강조 표시 *말* 은 별표 앞뒤가 글자·숫자가 아닐 때만 인정한다(G*Power 같은 이름 속 별표는 그대로 둔다)
_MARK = re.compile(r"(?<![A-Za-z0-9])\*([^*\n]+?)\*(?![A-Za-z0-9])")


def strip_marks(s: str) -> str:
    return _MARK.sub(r"\1", s)


def styled_runs(text: str) -> List[Tuple[str, bool]]:
    """자막 한 줄을 (글자, 노란색 여부) 조각으로. *별표*로 감싼 말과 숫자는 노란색."""
    runs: List[Tuple[str, bool]] = []
    pos = 0
    parts = []
    for m in _MARK.finditer(text):
        parts.append((text[pos:m.start()], False))
        parts.append((m.group(1), True))
        pos = m.end()
    parts.append((text[pos:], False))
    for p, marked in parts:
        if not p:
            continue
        if marked:
            runs.append((p, True))
            continue
        last = 0
        for m in _NUM_TOKEN.finditer(p):
            if m.start() > last:
                runs.append((p[last:m.start()], False))
            runs.append((m.group(0), True))
            last = m.end()
        if last < len(p):
            runs.append((p[last:], False))
    return [(t, y) for t, y in runs if t]


def _vlen(s: str) -> float:
    s = strip_marks(s)
    return sum(1.0 if ("가" <= c <= "힣" or c.isdigit()) else 0.55 for c in s)


# ── 자막 구절 나누기 ────────────────────────────────────────
def phrases(sent: str, good_break) -> List[str]:
    """문장을 한 줄 자막 구절로. 끊기 좋은 자리(쉼표·조사·어미)를 우선한다."""
    words = [w for w in sent.split(" ") if w]
    out, i = [], 0
    while i < len(words):
        j, length, best = i, 0.0, None
        while j < len(words):
            add = _vlen(words[j]) + (0.55 if j > i else 0)
            if length + add > CAP_CHARS and j > i:
                break
            length += add
            g = good_break(words[j])
            if g > 0 and length >= CAP_CHARS * 0.3:
                score = length / CAP_CHARS + {2: 0.6, 1.5: 0.3}.get(g, 0.0)
                if best is None or score >= best[1]:
                    best = (j, score)
            j += 1
        if j < len(words) and best is not None:
            j = best[0] + 1
        out.append(" ".join(words[i:j]))
        i = j
    # 너무 짧은 꼬리 구절은 앞 구절에 붙인다(넘치지 않을 때)
    if len(out) >= 2 and _vlen(out[-1]) <= 3 and _vlen(out[-2] + " " + out[-1]) <= CAP_CHARS + 2:
        out[-2] = out[-2] + " " + out.pop()
    return out


# ── 글자 그리기 ─────────────────────────────────────────────
def caption_image(text: str, size: int) -> Image.Image:
    """흰 굵은 글씨 + 검은 테두리 + 옅은 그림자. 노란 핵심어 지원. 폭이 넘치면 글자를 줄인다."""
    runs = styled_runs(text)
    while True:
        f = font("ExtraBold", size)
        widths = [f.getlength(t) for t, _ in runs]
        total = sum(widths)
        if total <= 1000 or size <= 48:
            break
        size -= 2
    stroke = max(5, size // 11)
    asc, desc = f.getmetrics()
    h = asc + desc + stroke * 2 + 16
    im = Image.new("RGBA", (W, h), (0, 0, 0, 0))
    # 그림자
    sh = Image.new("RGBA", (W, h), (0, 0, 0, 0))
    ds = ImageDraw.Draw(sh)
    x = (W - total) / 2
    for (t, _), w in zip(runs, widths):
        ds.text((x + 3, stroke + 8 + 4), t, font=f, fill=(0, 0, 0, 150), stroke_width=stroke, stroke_fill=(0, 0, 0, 150))
        x += w
    sh = sh.filter(ImageFilter.GaussianBlur(5))
    im.alpha_composite(sh)
    d = ImageDraw.Draw(im)
    x = (W - total) / 2
    for (t, yel), w in zip(runs, widths):
        d.text((x, stroke + 8), t, font=f, fill=YELLOW if yel else WHITE, stroke_width=stroke,
               stroke_fill=(0, 0, 0))
        x += w
    return im


def split_title(title: str) -> List[str]:
    """상단 제목을 2줄로. 학생이 줄바꿈(/ 또는 엔터)을 넣었으면 그대로 따른다."""
    t = (title or "").strip()
    if not t:
        return []
    for sep in ("\n", " / ", "/"):
        if sep in t:
            a, b = t.split(sep, 1)
            return [a.strip(), b.strip()][:2]
    words = t.split()
    if _vlen(t) <= 11 or len(words) == 1:
        return [t]
    best, bs = None, 1e9
    for k in range(1, len(words)):
        a, b = " ".join(words[:k]), " ".join(words[k:])
        s = abs(_vlen(a) - _vlen(b))
        if s < bs:
            best, bs = [a, b], s
    return best


def title_image(title: str) -> Optional[Image.Image]:
    lines = split_title(title)
    if not lines:
        return None
    x0, y0, x1, y1 = TEMPLATES["band"]["title_box"]
    bw, bh = x1 - x0, y1 - y0
    size = 92
    while True:
        f = font("ExtraBold", size)
        if max(f.getlength(l) for l in lines) <= bw and len(lines) * size * 1.12 <= bh or size <= 54:
            break
        size -= 2
    stroke = max(3, size // 22)
    im = Image.new("RGBA", (W, y1 + 10), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    lh = size * 1.12
    top = y0 + (bh - lh * len(lines)) / 2
    for i, l in enumerate(lines):
        w = f.getlength(l)
        d.text(((W - w) / 2, top + i * lh), l, font=f, fill=YELLOW if i == 0 else WHITE,
               stroke_width=stroke, stroke_fill=(0, 0, 0))
    return im


def top_shade() -> Image.Image:
    g = Image.new("L", (1, H), 0)
    for y in range(H):
        a = int(max(0, 1 - y / 520) ** 1.4 * 205)
        b = int(max(0, (y - 1000) / (H - 1000)) ** 1.6 * 170) if y > 1000 else 0
        g.putpixel((0, y), max(a, b))
    shade = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    shade.putalpha(g.resize((W, H)))
    return shade


# ── 컷(카메라) 계획 ─────────────────────────────────────────
@dataclass
class Shot:
    image: str          # 프로젝트 상대 경로
    start: float
    end: float
    z0: float
    z1: float
    f0: Tuple[float, float]   # 시작 초점(그림 안 비율 좌표)
    f1: Tuple[float, float]


def flat_share(img: Image.Image) -> float:
    """가장 많은 색 하나가 차지하는 비율. 카드뉴스(단색 배경) 0.77~0.89, 사진·AI 그림 0.07~0.10(시험 20장)."""
    small = img.convert("RGB").resize((64, 64)).quantize(colors=16)
    return max(c for c, _ in small.getcolors()) / 4096


def is_card(img: Image.Image) -> bool:
    """글자 카드면 잘리지 않게 전체를 보이고(fit), 사진이면 칸을 꽉 채운다(cover)."""
    if img.height / img.width >= 1.5:
        return False
    return flat_share(img) >= 0.3


CARD_MOVES = [  # 카드(글자 그림): 전체 → 위쪽(제목) 확대 → 다시 전체. 확대는 카드 가로 폭을 넘지 않는다.
    (1.00, 1.04, (0.5, 0.5), (0.5, 0.5)),
    (1.30, 1.36, (0.5, 0.0), (0.5, 0.0)),
    (1.08, 1.02, (0.5, 0.5), (0.5, 0.5)),
]
PHOTO_MOVES = [  # 사진: 확대 → 왼쪽에서 오른쪽 → 축소 → 위에서 아래
    (1.00, 1.10, (0.5, 0.45), (0.5, 0.45)),
    (1.18, 1.20, (0.38, 0.5), (0.62, 0.5)),
    (1.14, 1.02, (0.5, 0.5), (0.5, 0.5)),
    (1.20, 1.22, (0.5, 0.36), (0.5, 0.60)),
]


def plan_shots(images: List[str], is_card_map: dict, total: float, cut_points: List[float],
               target: float = 2.6) -> List[Shot]:
    """장면 길이를 약 2~3초 컷으로 나눈다. 컷은 자막 구절이 바뀌는 시각에 맞춘다."""
    k = max(1, min(6, round(total / target)))
    bounds = [0.0]
    for i in range(1, k):
        ideal = total * i / k
        cand = [c for c in cut_points if bounds[-1] + 1.2 <= c <= total - 1.2]
        bounds.append(min(cand, key=lambda c: abs(c - ideal)) if cand else ideal)
    bounds.append(total)
    bounds = sorted(set(round(b, 3) for b in bounds))
    shots = []
    for i in range(len(bounds) - 1):
        img = images[i % len(images)]
        # 같은 그림을 다시 쓸 때는 카메라 움직임을 바꾼다
        use = i // len(images) if len(images) > 1 else i
        moves = CARD_MOVES if is_card_map[img] else PHOTO_MOVES
        z0, z1, f0, f1 = moves[use % len(moves)]
        shots.append(Shot(img, bounds[i], bounds[i + 1], z0, z1, f0, f1))
    return shots


# ── 프레임 그리기 ───────────────────────────────────────────
class Frame:
    """한 장면의 그림 자원을 미리 준비해 두고, 시각 t 의 프레임을 그린다."""

    def __init__(self, pdir: Path, template: str, title: str, images: List[str], force_fit: bool = False):
        self.t = TEMPLATES.get(template, TEMPLATES["band"])
        self.template = template if template in TEMPLATES else "band"
        x0, y0, x1, y1 = self.t["media"]
        self.box = (x0, y0, x1, y1)
        self.bw, self.bh = x1 - x0, y1 - y0
        self.imgs = {}
        self.bgs = {}
        for rel in images:
            if rel in self.imgs:
                continue
            im = Image.open(pdir / rel).convert("RGB")
            # 너무 큰 원본은 화면의 2배 정도로 줄여 속도를 맞춘다(선명도는 유지)
            lim = 2.2 * max(self.bw, self.bh)
            if max(im.size) > lim:
                s = lim / max(im.size)
                im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
            self.imgs[rel] = im
            # AI가 만든 그림은 배경이 단색인 일러스트라도 사진처럼 칸을 꽉 채운다
            ai_made = Path(rel).name.startswith("ai_")
            self.bgs[rel] = self._bg(im) if (force_fit or (not ai_made and is_card(im))) else None
        self.title = title_image(title)
        self.shade = top_shade() if self.template == "full" else None
        self._full_bg = {}
        self._band_bg = {}
        bx0, by0, bx1, by1 = TEMPLATES["band"]["media"]
        self.band_wh = (bx1 - bx0, by1 - by0)

    def _bg(self, im: Image.Image) -> Image.Image:
        """카드 뒤를 채울 흐린 배경(카드와 같은 색감)."""
        s = max(self.bw / im.width, self.bh / im.height) * 1.15
        bg = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.BILINEAR)
        l, t = (bg.width - self.bw) // 2, (bg.height - self.bh) // 2
        bg = bg.crop((l, t, l + self.bw, t + self.bh)).filter(ImageFilter.GaussianBlur(40))
        return Image.blend(bg, Image.new("RGB", bg.size, (8, 8, 10)), 0.6)

    def media(self, rel: str, z: float, fx: float, fy: float, band: bool = False) -> Image.Image:
        im = self.imgs[rel]
        card = self.bgs[rel] is not None
        if band:          # 전체 화면형 안의 카드: 제목 띠형과 같은 칸 크기로 그린다
            saved = (self.bw, self.bh, self.bgs[rel])
            self.bw, self.bh = self.band_wh
            if rel not in self._band_bg:
                self._band_bg[rel] = self._bg(im)
            self.bgs[rel] = self._band_bg[rel]
            try:
                return self.media(rel, z, fx, fy)
            finally:
                self.bw, self.bh, self.bgs[rel] = saved
        # 기본 배율: 카드는 상자 안에 다 보이게(fit), 사진은 상자를 꽉 채우게(cover)
        base = (min if card else max)(self.bw / im.width, self.bh / im.height)
        if card:
            base *= 0.96
            # 카드는 좌우 글자가 잘리지 않도록 가로 폭까지만 키운다(위아래만 잘린다)
            z = min(z, self.bw / (im.width * base))
        S = base * z
        sw, sh = im.width * S, im.height * S
        # 초점(fx, fy)이 상자 가운데 오도록 놓되, 빈틈이 생기지 않게 가장자리를 맞춘다
        ox = self.bw / 2 - fx * sw
        oy = self.bh / 2 - fy * sh
        if sw >= self.bw:
            ox = min(0, max(self.bw - sw, ox))
        else:
            ox = (self.bw - sw) / 2
        if sh >= self.bh:
            oy = min(0, max(self.bh - sh, oy))
        else:
            oy = (self.bh - sh) / 2
        coeffs = (1 / S, 0, -ox / S, 0, 1 / S, -oy / S)
        tile = im.transform((self.bw, self.bh), Image.AFFINE, coeffs, resample=Image.BICUBIC)
        if card:
            mask = Image.new("L", im.size, 255).transform((self.bw, self.bh), Image.AFFINE, coeffs,
                                                         resample=Image.BILINEAR)
            out = self.bgs[rel].copy()
            out.paste(tile, (0, 0), mask)
            return out
        return tile

    def draw(self, shot: Shot, t: float, caption: Optional[Image.Image]) -> Image.Image:
        p = 0.0 if shot.end <= shot.start else min(1.0, max(0.0, (t - shot.start) / (shot.end - shot.start)))
        e = 0.5 - 0.5 * math.cos(math.pi * p)
        z = shot.z0 + (shot.z1 - shot.z0) * e
        fx = shot.f0[0] + (shot.f1[0] - shot.f0[0]) * e
        fy = shot.f0[1] + (shot.f1[1] - shot.f0[1]) * e
        card_in_full = self.template == "full" and self.bgs[shot.image] is not None
        if card_in_full:
            # 전체 화면형이라도 카드는 제목 아래·자막 위 칸에 둔다(제목·자막이 카드 글자를 덮지 않게)
            frame = self.full_bg(shot.image).copy()
            frame.paste(self.media(shot.image, z, fx, fy, band=True), TEMPLATES["band"]["media"][:2])
            cap_y = TEMPLATES["band"]["cap_y"]
        else:
            frame = Image.new("RGB", (W, H), self.t["bg"])
            frame.paste(self.media(shot.image, z, fx, fy), self.box[:2])
            cap_y = self.t["cap_y"]
        frame = frame.convert("RGBA")
        if self.shade is not None and not card_in_full:
            frame.alpha_composite(self.shade)
        if self.title is not None:
            frame.alpha_composite(self.title, (0, 0))
        if caption is not None:
            frame.alpha_composite(caption, (0, int(cap_y - caption.height / 2)))
        return frame.convert("RGB")

    def full_bg(self, rel: str) -> Image.Image:
        if rel not in self._full_bg:
            im = self.imgs[rel]
            s = max(W / im.width, H / im.height) * 1.15
            bg = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.BILINEAR)
            l, t = (bg.width - W) // 2, (bg.height - H) // 2
            bg = bg.crop((l, t, l + W, t + H)).filter(ImageFilter.GaussianBlur(50))
            self._full_bg[rel] = Image.blend(bg, Image.new("RGB", bg.size, (6, 6, 8)), 0.7)
        return self._full_bg[rel]
