# analyze/verify_labeled.py
"""계량표(`data/measures/<코드>.json`)**만으로** 되돌려 그려 원본 옆에 놓는다.

**이건 제품이 아니다.** 제품은 Dify 가 만든다. 여기 그림은 **계량표가 틀렸는지
눈으로 보이게 하는 자**다. 그래서 규칙이 하나다 —

> **계량표에 없는 것은 그리지 않는다. 그럴듯하게 메우지 않는다.**

옛 갈래가 죽은 방식이 그것이었다: 배경 `#FEFEFE` · 글자 `#FEFEFE` 로 적힌
계량표가 **모양은 멀쩡한 JSON** 이었고, 되돌려 그리니 글자가 통째로 사라진 흰
종이가 나와서야 사람이 알았다. 값이 비어 있어서가 아니라 **틀린 값이 맞는 값과
똑같이 생겨서** 못 알아본 것이다.

그래서 이 파일이 지키는 세 가지:

- **`kind: "미측정"` 은 절대 색으로 칠하지 않는다.** 그 `hex` 는 `tint.judge` 가
  유효 격자 4칸 미만에서 포기하고 내놓은 참고값이다(`merge_labeled._mark`).
  마젠타 빗금으로 덮고 상자 밑에 이유를 적는다 — 카드뉴스에 마젠타 빗금이 나올
  일이 없으니 "운 좋게 맞아 보이는 색"으로 오해할 수가 없다.
- **사진 자리는 회색 네모다.** 원본을 오려 붙이면 네모가 틀려도 그 자리에 맞는
  그림이 보여서 틀린 줄 모른다.
- **그라데이션은 실제로 칠한다.** 정지점이 맞는지가 이 검사의 큰 몫이다.

**글꼴은 계열만 맞춘다.** Dify 가 어차피 자기 글꼴로 다시 그린다. 여기서는 계량표의
`font` 이름을 파일에 대응시키고, 없으면 캘리브레이션 글꼴(맑은 고딕)로 떨어뜨린 뒤
**무엇을 대신 썼는지 화면에 적는다**. 크기는 `pt` 를 그대로 픽셀 크기로 쓴다 —
글꼴마다 한글 잉크가 em 을 채우는 비율이 달라서(직접 잼, 100px 기준 한글 잉크 높이:
맑은고딕 94 · 프리텐다드 89 · 지마켓산스 87 · 나눔명조 96 · 검은고딕 78) 같은 pt
라도 잉크 높이가 몇 % 다르게 나온다. 그 어긋남을 글꼴별 보정으로 감추지 않는다 —
보정하면 `pt` 가 틀렸을 때도 그럴듯해 보인다.

**누끼는 PNG 를 그 자리에 붙이고, 잰 각도를 그 위에 겹쳐 그린다.** PNG 는 이미
기울어진 화소 그대로라(`cutout.transparent()` 는 축정렬로 오려 저장한다) 그것만
붙이면 **각도가 맞는지 알 수가 없다** — 어떤 각도로 적혀 있든 그림은 똑같다.
그래서 기록된 `w`·`h`·`angle` 로 만든 기운 사각형을 얇게 겹쳐 그린다. 그 테두리가
물체를 감싸면 각도가 맞은 것이고, 어긋나면 그 자리에서 어긋나 보인다.
(각도만큼 다시 돌려 붙이는 것은 틀린 방법이다 — 이미 기운 화소를 한 번 더 돌린다.)

**좌표.** 계량표의 모든 `box` 는 1080 캔버스 기준이다(`merge_labeled` 의 좌표계
표 참고). 그래서 원본 그림도 `ruler/normalize.load()` 와 같은 자로 1080 폭에
맞춰 놓고 나란히 세운다.

쓰는 법:

    python analyze/verify_labeled.py            # measures/ 에 있는 것 전부
    python analyze/verify_labeled.py DHqCBQnRAjW
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config
import fontmatch

PANEL_GAP = 16
LABEL_H = 40
NOTE_H = 30
SHEET_BG = (245, 245, 245)

PHOTO_FILL = (200, 200, 200)          # 사진 자리 — 되돌릴 수 없는 것
# 회색 네모가 **의도한 답**인 종류. 나머지 종류(도형·로고·장식…)가 「사진」으로
# 나왔다면 그건 답이 아니라 "평평한 색으로 못 줄였다"는 뜻이라 따로 알린다.
PHOTO_KINDS = ("사진", "인물")
NOT_MEASURED = (255, 0, 255)          # 마젠타. 카드뉴스에 안 나오는 색이라 오해가 없다
# **안 잰 것과 못 잰 것을 눈으로도 갈라 놓는다.** 장식·로고는 색을 아예 안 잰다
# (`merge_labeled.COLOR_SKIP`) — 그 자리를 빗금(=「재려다 못 쟀다」)으로 덮으면
# 두 말이 그림에서 하나가 된다. 자리는 아는 것이니 테두리만 남기고 안쪽은
# 밑에 깔린 배경 그대로 둔다.
POSITION_ONLY = (140, 0, 255)         # 보라 테두리 = 자리만 잰 것
POSITION_ONLY_W = 4
HATCH_GAP = 14
HATCH_W = 3
RECT_LINE = (0, 200, 255)             # 잰 기운 사각형 (하늘색)

# 글씨체 8종 → 파일 표는 **`fontmatch` 에만 있다.** 재는 쪽과 되돌려 그리는 쪽이
# 다른 표를 쓰면, 「프리텐다드로 쟀는데 다른 파일로 그렸다」가 조용히 성립한다.
_FONT_FILES = fontmatch.FONT_FILES

# 대신 쓴 글꼴을 모아 둔다 — 화면에 적어야 "글꼴이 달라서 그런 것"과
# "잰 값이 틀려서 그런 것"을 사람이 가를 수 있다.
_SUBSTITUTED: set[str] = set()


# ---------------------------------------------------------------- 색

def hex_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def gradient(stops: list[dict], direction: str, size) -> Image.Image:
    """정지점을 `at`(0~1) 자리에 놓고 그 사이를 sRGB 로 잇는다.

    sRGB 로 잇는 이유: 디자인 도구(피그마·포토샵)가 그렇게 섞는다. `tint.stops()`
    가 재는 대상이 그 결과물이므로 되돌릴 때도 같은 공간이어야 한다.
    """
    w, h = size
    n = h if direction == "세로" else w
    ats = [s["at"] for s in stops]
    cols = np.array([hex_rgb(s["hex"]) for s in stops], float)
    t = np.linspace(0.0, 1.0, max(n, 1))
    ramp = np.stack([np.interp(t, ats, cols[:, c]) for c in range(3)], axis=1)
    ramp = ramp.round().astype(np.uint8)
    if direction == "세로":
        arr = np.repeat(ramp[:, None, :], w, axis=1)
    else:
        arr = np.repeat(ramp[None, :, :], h, axis=0)
    return Image.fromarray(arr, "RGB")


def hatch(size, colour=NOT_MEASURED) -> Image.Image:
    """대각 빗금 RGBA 타일. **칠이 아니라 「여기엔 값이 없다」는 표시다.**"""
    w, h = int(size[0]), int(size[1])
    im = Image.new("RGBA", (max(w, 1), max(h, 1)), (255, 255, 255, 235))
    d = ImageDraw.Draw(im)
    for x in range(-h, w + h, HATCH_GAP):
        d.line([(x, 0), (x + h, h)], fill=colour + (255,), width=HATCH_W)
    d.rectangle([0, 0, im.width - 1, im.height - 1], outline=colour + (255,), width=3)
    return im


def _paste_hatch(canvas: Image.Image, box) -> None:
    x0, y0, x1, y1 = (int(round(v)) for v in box)
    if x1 <= x0 or y1 <= y0:
        return
    canvas.paste(hatch((x1 - x0, y1 - y0)), (x0, y0), hatch((x1 - x0, y1 - y0)))


# ---------------------------------------------------------------- 배경·네모

def paint_background(bg: dict, size) -> Image.Image:
    """배경 한 판. 못 잰 배경은 칠하지 않고 빗금으로 덮는다."""
    w, h = size
    kind = bg.get("kind")
    if kind == "그라데이션" and len(bg.get("stops", [])) >= 2:
        return gradient(bg["stops"], bg.get("dir", "세로"), size)
    if kind == "단색" and bg.get("hex"):
        return Image.new("RGB", (w, h), hex_rgb(bg["hex"]))
    if kind == "사진":
        return Image.new("RGB", (w, h), PHOTO_FILL)
    im = Image.new("RGB", (w, h), (255, 255, 255))
    _paste_hatch(im, (0, 0, w, h))
    return im


def draw_region(canvas: Image.Image, region: dict) -> None:
    """글자가 아닌 네모 하나. **못 잰 것은 칠하지 않는다.**"""
    box = [int(round(v)) for v in region["box"]]
    x0, y0, x1, y1 = box
    if x1 <= x0 or y1 <= y0:
        return
    col = region.get("color") or {}
    kind = col.get("kind")
    d = ImageDraw.Draw(canvas)
    if kind == "단색" and col.get("hex"):
        d.rectangle(box, fill=hex_rgb(col["hex"]))
    elif kind == "그라데이션" and len(col.get("stops", [])) >= 2:
        canvas.paste(gradient(col["stops"], col.get("dir", "세로"), (x1 - x0, y1 - y0)),
                     (x0, y0))
    elif col.get("by_design"):
        # 「안 잼」 — 색을 재지 않기로 한 종류(장식·로고). 칠하지도 빗금 치지도
        # 않는다. 둘 다 「값이 있다」거나 「못 쟀다」로 읽히는데 여기는 그 어느
        # 쪽도 아니다.
        d.rectangle(box, outline=POSITION_ONLY, width=POSITION_ONLY_W)
    elif kind == "사진":
        d.rectangle(box, fill=PHOTO_FILL)
        if region.get("kind") not in PHOTO_KINDS:
            # 사진 자리가 **아닌데** 색이 「사진」으로 나온 것 — 회색만 칠하면 제대로
            # 잰 사진 자리와 똑같이 생긴다. 「이 자리를 무엇으로도 못 줄였다」와
            # 「여긴 사진이라고 쟀다」는 사람이 반드시 갈라 봐야 한다.
            d.rectangle(box, outline=NOT_MEASURED, width=5)
    else:
        _paste_hatch(canvas, box)      # 「미측정」·색이 아예 없는 네모


# ---------------------------------------------------------------- 누끼

def measured_rect(cut: dict) -> list[tuple[float, float]]:
    """기록된 `w`·`h`·`angle` 로 만든 기운 사각형의 네 꼭짓점.

    중심은 `box` 의 중심이다 — `cutout.tilted()` 가 `minAreaRect` 중심을 안
    남기고 `tight_box()` 만 남기는데, 그 둘의 중심은 같은 화소 집합에서 나온다.
    각도는 화면 좌표(y 가 아래)에서 잰 값이라(`cutout._norm90`) 여기서도 같은
    부호 규칙으로 돌린다.
    """
    x0, y0, x1, y1 = cut["box"]
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    w, h = cut["w"] / 2, cut["h"] / 2
    a = np.radians(cut.get("angle") or 0.0)
    c, s = np.cos(a), np.sin(a)
    return [(cx + dx * c - dy * s, cy + dx * s + dy * c)
            for dx, dy in ((-w, -h), (w, -h), (w, h), (-w, h))]


def draw_cutout(canvas: Image.Image, region: dict, root: Path) -> bool:
    """누끼 PNG 를 제자리에 붙이고 잰 각도를 겹쳐 그린다. 붙였으면 True."""
    cut = region["cutout"]
    x0, y0, x1, y1 = (int(round(v)) for v in cut["box"])
    ok = False
    if cut.get("png") and (root / cut["png"]).exists() and x1 > x0 and y1 > y0:
        im = Image.open(root / cut["png"]).convert("RGBA")
        # PNG 는 원본 해상도, `box` 는 1080 기준이다(`cutout.py` 참고) — 상자에 맞춘다.
        if im.size != (x1 - x0, y1 - y0):
            im = im.resize((x1 - x0, y1 - y0), Image.LANCZOS)
        canvas.paste(im, (x0, y0), im)
        ok = True
    d = ImageDraw.Draw(canvas)
    d.polygon(measured_rect(cut), outline=RECT_LINE)
    return ok


# ---------------------------------------------------------------- 글자

def line_layout(box, block: dict) -> list[dict]:
    """줄마다 `{x, y, anchor}`. `y` 는 잉크 윗변, `x` 는 정렬 기준점.

    줄 간격은 `leading × pt` 다 — `layout_labeled._leading()` 이 줄 **중심** 사이
    간격을 `pt` 로 나눈 값이므로 되돌릴 때도 그대로 곱하면 된다.

    줄 수는 `lines` 가 아니라 **실제 `text` 의 줄 수**를 따른다. 둘이 어긋나면
    글자를 잃는 쪽보다 남는 쪽이 낫다 — 잃으면 화면에서 안 보이고, 남으면 보인다.
    """
    x0, y0, x1, y1 = box
    lines = (block.get("text") or "").split("\n")
    pt = block.get("pt") or 0
    step = (block.get("leading") or 0.0) * pt
    align = block.get("align")
    if align == "가운데":
        ax, anchor = (x0 + x1) / 2, "ma"
    elif align == "오른쪽":
        ax, anchor = x1, "ra"
    else:                              # 왼쪽 · 단일 · 없음
        ax, anchor = x0, "la"
    return [{"x": ax, "y": y0 + i * step, "anchor": anchor} for i in range(len(lines))]


def font_of(block: dict) -> ImageFont.FreeTypeFont:
    """계열만 맞춘 글꼴. 파일이 없으면 캘리브레이션 글꼴로 떨어뜨리고 기록한다."""
    pt = max(6, int(round(block.get("pt") or 0)))
    bold = block.get("weight") == "Bold"
    name = block.get("font")
    pair = _FONT_FILES.get(name)
    if pair is not None:
        path = pair[0] if bold else pair[1]
        if path.exists():
            return ImageFont.truetype(str(path), pt)
    cal = config.cal()
    _SUBSTITUTED.add(f"{name or '(글씨체 없음)'} → {Path(cal['font_bold']).stem}")
    return ImageFont.truetype(cal["font_bold"] if bold else cal["font_regular"], pt)


def draw_back(canvas: Image.Image, block: dict) -> None:
    """줄 뒤에 깔린 색(형광펜)을 글자보다 **먼저** 칠한다.

    구간(`run`)마다 제 가로 범위가 있다 — 형광펜이 줄 가운데서 끊기는 것이
    흔해서(`lineback.back_of` 참고) 줄 전체를 한 색으로 칠하면 그 끊김이
    사라진다. 세로 범위는 줄 상자 그대로다: OCR 이 준 **잉크 높이**라 원본
    형광펜보다 얇게 나오는데, 그 차이를 넉넉히 부풀리지 않는다 — 잰 것만 그린다.

    띠가 아니라고 판정된 줄(`fallback`)은 아무것도 안 칠한다. 그 자리는
    사진·무늬라 평평한 색으로 메우면 「제대로 잰 색」과 똑같이 생긴다.
    """
    d = ImageDraw.Draw(canvas)
    for line in block.get("line_detail") or []:
        back = line.get("back") or {}
        _, y0, _, y1 = (int(round(v)) for v in line["box"])
        for run in back.get("runs", []):
            x0, x1 = int(run["x0"]), int(run["x1"])
            if x1 > x0 and y1 > y0:
                d.rectangle([x0, y0, x1 - 1, y1 - 1], fill=hex_rgb(run["hex"]))


def 줄값짝(text_lines: list[str], n_detail: int) -> list:
    """글 줄마다 `line_detail` 의 몇 번째인지. 빈 줄은 None — 잰 것이 없다.

    빈 줄은 `text` 에만 있고 `line_detail` 에는 없다(`layout_labeled._문단줄`).
    글 줄 번호로 그대로 찾으면 빈 줄 뒤부터 한 칸씩 밀려 엉뚱한 줄의 색이 붙는다.
    줄별 값이 모자라도 죽지 않는다 — 없는 것으로 둔다.
    """
    난것, k = [], 0
    for 줄 in text_lines:
        if not 줄:
            난것.append(None)
            continue
        난것.append(k if k < n_detail else None)
        k += 1
    return 난것


def draw_text(canvas: Image.Image, region: dict) -> None:
    """글자 네모 하나. 색을 못 잰 네모는 마젠타로 찍는다 — 안 보이게 두지 않는다."""
    block = region["text"]
    if block.get("fallback") or not (block.get("text") or "").strip():
        _paste_hatch(canvas, region["box"])
        return
    draw_back(canvas, block)
    font = font_of(block)
    colour = hex_rgb(block["color"]) if block.get("color") else NOT_MEASURED
    d = ImageDraw.Draw(canvas)
    # 줄마다 색이 다를 수 있다 — 덩어리의 `color` 는 줄색들의 최빈값이라
    # 소수파 줄을 삼킨다(`layout_labeled._block_color`). 줄 값이 있으면 그것을 쓴다.
    detail = block.get("line_detail") or []
    글줄들 = block["text"].split("\n")
    짝 = 줄값짝(글줄들, len(detail))
    for i, (line, o) in enumerate(zip(글줄들, line_layout(region["box"], block))):
        if not line:
            continue
        col = colour
        j = 짝[i]
        if j is not None and detail[j].get("color"):
            col = hex_rgb(detail[j]["color"])
        bb = font.getbbox(line)        # 글리프 잉크가 원점에서 얼마나 떨어졌나
        ink_w = bb[2] - bb[0]
        ox = o["x"] - bb[0] - (ink_w / 2 if o["anchor"] == "ma" else
                               ink_w if o["anchor"] == "ra" else 0)
        d.text((ox, o["y"] - bb[1]), line, font=font, fill=col)


# ---------------------------------------------------------------- 못 잰 것 모으기

def warnings(slide: dict, root: Path | None = None) -> list[str]:
    """이 장에서 **계량표가 모르는 것**을 사람이 읽을 문장으로. 그림 밑에 찍는다.

    `root` 는 누끼 PNG 를 찾는 자리다(`render_slide` 와 같은 곳). 파일이 없으면
    `draw_cutout` 이 조용히 `draw_region` 으로 떨어져 **평평한 색**을 칠하는데,
    그 색이 제대로 잰 색과 똑같이 생긴다. `.gitignore` 가 `analyze/data/` 를
    통째로 빼므로 **새 체크아웃에서는 PNG 가 없는 것이 기본 상태**다.
    """
    out = []
    if root is None:
        root = config.DATA / "cutouts"
    bg = slide.get("background") or {}
    if bg.get("kind") == "미측정" or bg.get("fallback"):
        out.append(f"배경 미측정 — {bg.get('why', '까닭 없음')} (hex {bg.get('hex')})")
    elif bg.get("kind") == "사진":
        out.append(f"배경이 사진으로 판정됨 — 되돌릴 색이 없다 (유효 칸 {bg.get('cells')})")
    for r in slide.get("regions", []):
        col = r.get("color") or {}
        txt = r.get("text") or {}
        if not txt:
            if col.get("by_design"):
                # 안 쟀다고 정한 것은 못 잰 것이 아니다 — 경고에 섞으면 진짜
                # 못 잰 자리가 이 줄들 속에 묻힌다.
                pass
            elif col.get("kind") == "미측정" or col.get("fallback"):
                out.append(f"{r['id']} ({r.get('kind')}) 색 미측정 — {col.get('why', '')}"
                           f" · 참고 hex {col.get('hex')}")
            elif col.get("kind") == "사진" and r.get("kind") not in PHOTO_KINDS:
                out.append(f"{r['id']} ({r.get('kind')}) 는 사진이 아닌데 색이 「사진」으로"
                           f" 나왔다 — 평평한 색으로 못 줄였다는 뜻이라 회색 네모로 대신했다"
                           f" (유효 칸 {col.get('cells')})")
            elif not col:
                out.append(f"{r['id']} ({r.get('kind')}) 색 기록이 아예 없다 — 빗금으로 덮었다")
        if txt.get("fallback"):
            out.append(f"{r['id']} 글자 못 읽음 — {txt.get('why', '')}")
        elif txt and not txt.get("color"):
            out.append(f"{r['id']} 글자색 못 잼 — 마젠타로 찍었다")
        # 줄 뒤 색을 못 잰 줄 — 안 칠하고 넘어가므로 말해 주지 않으면 「뒤에 아무것도
        # 없었다」와 「띠인지 못 가렸다」가 그림에서 똑같이 생긴다.
        bad = [ln for ln in (txt.get("line_detail") or [])
               if (ln.get("back") or {}).get("fallback")]
        if bad:
            out.append(f"{r['id']} 줄 {len(bad)}개의 뒤 색을 못 쟀다 — "
                       f"{bad[0]['back'].get('why', '')} · 그 줄은 안 칠했다")
        cut = r.get("cutout") or {}
        if cut.get("fallback"):
            out.append(f"{r['id']} 누끼 실패 — {cut.get('why', '')} (사람 네모 그대로)")
        elif cut and not (cut.get("png") and (root / cut["png"]).exists()):
            out.append(f"{r['id']} 누끼 PNG 를 못 찾았다 — "
                       f"{cut.get('png') or '(파일 이름이 기록에 없다)'} · 그 자리는 잰 색"
                       f"(또는 빗금)으로 대신 칠했다. 각도는 검산되지 않았다")
        if r.get("effects"):
            # 효과는 그리지 않는다 — 말 안 하면 「효과가 없었다」와 「있는데 안
            # 그렸다」가 그림에서 똑같이 생긴다. 어디서 온 값인지도 같이 적는다:
            # 기계 쪽 문턱(`effects.RIM_COVER_MIN`·`UNDER_COVER_MIN`)은 아직 실물로
            # 검증 안 된 첫 추정치다.
            out.append(f"{r['id']} 글자 효과 「{' · '.join(r['effects'])}」"
                       f"({r.get('effects_by', '출처 없음')}) — 되돌려 그리기에 반영 안 함")
        if r.get("treat"):
            out.append(f"{r['id']} 사진 처리 「{r['treat']}」 — 되돌려 그리기에 반영 안 함")
    return out


# ---------------------------------------------------------------- 한 장

def render_slide(doc: dict, index: int, size=None) -> Image.Image:
    """계량표만으로 한 장을 되돌려 그린다. `size` 를 안 주면 `doc["canvas"]`."""
    slide = next(s for s in doc["slides"] if s["index"] == index)
    if size is None:
        size = (doc["canvas"]["w"], doc["canvas"]["h"])
    canvas = paint_background(slide.get("background") or {}, size).convert("RGB")
    root = config.DATA / "cutouts"

    regions = list(slide.get("regions", []))
    # 큰 것부터 깔아야 작은 로고·칩이 위에 남는다. 계량표에 z 순서는 없다.
    def area(r):
        x0, y0, x1, y1 = r["box"]
        return (x1 - x0) * (y1 - y0)

    for r in sorted((r for r in regions if not r.get("text")), key=area, reverse=True):
        if r.get("cutout"):
            if draw_cutout(canvas, r, root):
                continue               # PNG 를 붙였으면 색은 안 칠한다
        draw_region(canvas, r)
    # **글자 네모의 누끼(=글자 뒤 도형, DG0AA6PJ8s4 2번장의 검은 알약 같은 것)를
    # 글자보다 먼저 붙인다.** 예전엔 이 고리가 `not r.get("text")` 로 글자
    # 네모를 통째로 걸러 버려서, 검은 알약 위에 초록 글자를 얹은 디자인이
    # 되돌려 그리기에서 알약 없이 글자만 남았다(실측: 오른쪽 절반 x70~1021,
    # y88~208 의 어두운 화소가 10,138개뿐이었다 — 알약이 없다는 뜻).
    # `draw_region`(색 칠하기)은 여기서 쓰지 않는다 — 글자 네모를 색으로
    # 덮으면 글자 자리 자체가 지워진다. PNG 를 붙이는 것만 한다.
    for r in regions:
        if r.get("text") and r.get("cutout"):
            draw_cutout(canvas, r, root)
    for r in regions:
        if r.get("text"):
            draw_text(canvas, r)
    return canvas


# ---------------------------------------------------------------- 나란히 놓기

def _ui_font(px: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(config.cal()["font_bold"], px)


def label(text: str, w: int) -> Image.Image:
    strip = Image.new("RGB", (w, LABEL_H), (24, 24, 24))
    ImageDraw.Draw(strip).text((10, 8), text, font=_ui_font(20), fill=(255, 255, 255))
    return strip


def notes(lines: list[str], w: int) -> Image.Image:
    body = lines or ["못 잰 것 없음"]
    strip = Image.new("RGB", (w, NOTE_H * len(body) + 12), (30, 30, 30))
    d = ImageDraw.Draw(strip)
    f = _ui_font(18)
    for i, t in enumerate(body):
        colour = (255, 255, 255) if lines else (140, 200, 140)
        d.text((10, 8 + i * NOTE_H), "• " + t, font=f, fill=colour)
    return strip


def sheet(original: Image.Image, redraw: Image.Image, head: list[str],
          foot: list[str]) -> Image.Image:
    w, h = original.size
    note = notes(foot, w * 2 + PANEL_GAP)
    out = Image.new("RGB", (w * 2 + PANEL_GAP, LABEL_H + h + note.height), SHEET_BG)
    for i, (name, im) in enumerate(zip(head, (original, redraw))):
        x = i * (w + PANEL_GAP)
        out.paste(label(name, w), (x, 0))
        out.paste(im, (x, LABEL_H))
    out.paste(note, (0, LABEL_H + h))
    return out


def one_post(pid: str) -> int:
    mpath = config.MEASURES / f"{pid}.json"
    if not mpath.exists():
        raise SystemExit(f"{mpath} 이 없다. 먼저 merge_labeled.py 를 돌려라.")
    doc = json.loads(mpath.read_text(encoding="utf-8"))
    out_dir = config.DATA / "verify" / pid
    out_dir.mkdir(parents=True, exist_ok=True)
    n = 0
    for slide in doc["slides"]:
        i = slide["index"]
        src = config.IMAGES / pid / f"{i:02d}.jpg"
        if not src.exists():
            print(f"  ! {i}번 원본이 없다 — 건너뜀")
            continue
        im = Image.open(src).convert("RGB")
        if im.width != config.CANVAS_W:   # `ruler/normalize.load()` 와 같은 자
            im = im.resize((config.CANVAS_W,
                            round(im.height * config.CANVAS_W / im.width)), Image.LANCZOS)
        redraw = render_slide(doc, i, im.size)
        page = sheet(im, redraw,
                     [f"{pid} {i:02d} 원본",
                      # 한 판 폭(1080px)에 들어가야 한다 — 넘치면 오른쪽이 잘려
                      # 범례가 통째로 안 읽힌다.
                      "되돌려 그림 · 마젠타빗금=못 잼 · 보라테두리=안 잼 · "
                      "회색=사진 · 하늘색=잰 각도"],
                     warnings(slide))
        page.save(out_dir / f"{i:02d}.png")
        print(f"  {out_dir / f'{i:02d}.png'}")
        n += 1
    if _SUBSTITUTED:
        print("  글꼴 대체: " + " · ".join(sorted(_SUBSTITUTED)))
    return n


def main() -> None:
    pids = sys.argv[1:] or sorted(p.stem for p in config.MEASURES.glob("*.json")
                                  if not p.name.endswith(".old.json"))
    if not pids:
        raise SystemExit("data/measures/ 가 비었다.")
    for pid in pids:
        print(pid)
        one_post(pid)


if __name__ == "__main__":
    main()
