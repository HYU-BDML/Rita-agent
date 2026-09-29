"""틀 렌더러 — template.json + 슬라이드 내용을 받아 '글자판' PNG를 굽는다.

미디어를 모른다. 그래서 사진 장이든 영상 장이든 이 함수 하나로 다 그린다.
출력은 캔버스 전체 크기(1080x1350)의 투명 PNG다 — 아래쪽(뉴스: y>=796)은
불투명 흰 배경이고, 위쪽은 배지 원 하나만 있고 나머지는 투명이라 미디어가
그대로 비친다. 합성기(compose)가 이 위에 미디어를 깔거나 밑에 미디어를
넣고 얹으면 된다.
"""
import os
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent


def _rgba(spec) -> tuple[int, int, int, int]:
    """"#RRGGBB" 또는 "rgba(r,g,b,a)" 또는 [r,g,b,a] 를 튜플로."""
    if isinstance(spec, (list, tuple)):
        return tuple(spec) if len(spec) == 4 else (*spec, 255)
    s = str(spec).strip()
    if s.startswith("#"):
        h = s.lstrip("#")
        r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
        return (r, g, b, 255)
    m = re.match(r"rgba?\(([^)]+)\)", s)
    if m:
        parts = [p.strip() for p in m.group(1).split(",")]
        r, g, b = int(parts[0]), int(parts[1]), int(parts[2])
        a = int(float(parts[3]) * 255) if len(parts) > 3 else 255
        return (r, g, b, a)
    raise ValueError(f"모르는 색 표기: {spec}")


EMOJI_FONT = os.environ.get("EMOJI_FONT", str(HERE / "fonts" / "NotoColorEmoji.ttf"))
"""컬러 이모지 글꼴. 윈도우 기본값이라 리눅스(Lambda 컨테이너)에선 없다 —
그쪽은 EMOJI_FONT 환경변수로 담아둔 글꼴을 가리킨다."""


EMOJI_FALLBACK_SIZE = 109
"""NotoColorEmoji 는 Pillow 에서 이 크기로만 열린다. 다른 크기가 필요하면 이 크기로
그린 뒤 줄인다. 윈도우 Segoe 는 아무 크기나 열리므로 그쪽은 이 길을 안 탄다."""


def _is_emoji(ch: str) -> bool:
    cp = ord(ch)
    return (
        0x1F300 <= cp <= 0x1FAFF  # 그림 이모지 대부분
        or 0x2600 <= cp <= 0x27BF  # 기타 기호·딩뱃 (☀ ✂ 등)
        or cp in (0x2764, 0x2B50)  # ❤ ⭐ 처럼 흩어진 것들
    )


class FontBook:
    """template.json 의 fonts.candidates 를 (이름, 크기) 키로 캐싱해서 돌려준다."""

    def __init__(self, fonts_cfg: dict, base_dir: Path):
        self.paths = {name: str(base_dir / rel) for name, rel in fonts_cfg["candidates"].items()}
        self._cache: dict[tuple[str, int], ImageFont.FreeTypeFont | None] = {}

    def get(self, name: str, size: int) -> ImageFont.FreeTypeFont:
        key = (name, size)
        if key not in self._cache:
            self._cache[key] = ImageFont.truetype(self.paths[name], size)
        return self._cache[key]

    def emoji(self, size: int) -> ImageFont.FreeTypeFont | None:
        """이모지 글꼴이 없으면 None. 부르는 쪽(_draw_text_tracked)이 None 을 이미
        다룰 줄 알기에, 이모지가 없는 장은 글꼴 없이도 정상으로 그려진다."""
        key = ("__emoji__", size)
        if key not in self._cache:
            self._cache[key] = None
            for s in (size, EMOJI_FALLBACK_SIZE):
                try:
                    self._cache[key] = ImageFont.truetype(EMOJI_FONT, s)
                    break
                except OSError:
                    continue
        return self._cache[key]


def _채우기(틀: str, slide: dict) -> str:
    """`"AI NEWS  |  {brand}"` 같은 틀에 대본 값을 끼운다. 없는 칸은 빈 글자.

    **왜 틀을 자리표(template.json)에 두나.** 예전엔 `f"AI NEWS  |  {slide['brand']}"`
    처럼 코드에 박혀 있었다. 그러면 브랜드 칩 문구 하나 바꾸려고 렌더러를 고쳐야 하고,
    `brand` 칸이 없는 대본이 오면 `KeyError` 로 죽었다.
    """
    class _빈칸(dict):
        def __missing__(self, k):
            return ""
    return 틀.format_map(_빈칸(slide)).strip()


def _줄자리(cfg: dict, 줄들: list, 자리: str, no) -> list:
    """줄마다 y 를 준다. **자리보다 줄이 많으면 죽지 말고 무엇이 문제인지 말한다.**

    자리표는 실측값이라 «본문 3줄» 이 곧 물리적 자리 세 개다. 네 줄째는 놓을 데가
    없다. 예전엔 `lines_y[i]` 가 그냥 IndexError 를 냈는데, 그러면 대본이 잘못된
    건지 렌더러가 고장난 건지 알 수 없다.
    """
    자리들 = cfg["lines_y"]
    if len(줄들) > len(자리들):
        raise ValueError(
            f"{no}번 장의 {자리}이 {len(줄들)}줄인데 자리는 {len(자리들)}개뿐이다 — "
            f"놓을 데가 없는 줄: «{줄들[len(자리들)]}»")
    return 자리들[:len(줄들)]


def 넘치는_줄(slide: dict, tpl: dict, fonts: "FontBook",
             headline_font: str, body_font: str) -> list[dict]:
    """카드 밖으로 나갈 줄을 미리 찾아낸다. 넘치는 게 없으면 빈 목록.

    **왜 필요한가.** `_wrap_fit` 이 줄바꿈을 안 한다(바로 아래를 보라). 그래서 한 자만
    더 써도 조용히 잘린 그림이 나오고 아무도 모른다. 매주 자동으로 도는 물건에서
    이게 제일 무섭다.

    **한계는 어디인가.** 왼쪽 정렬 글(뉴스·표지)은 왼쪽 여백에서 캔버스 오른쪽 끝까지다.
    원본도 오른쪽 여백을 안 지킨다 — 본문 제일 긴 줄이 x1043 까지 간다(실측).
    가운데 정렬 글(마무리 장)은 캔버스 폭 그대로다. 양쪽으로 똑같이 잘리기 때문이다.

    돌려주는 것: [{자리, 글, 폭, 한계, 넘침}, ...]
    """
    W = tpl["canvas"]["w"]
    t = tpl["slide_types"].get(slide.get("type"))
    if not t:
        return []
    d = ImageDraw.Draw(Image.new("RGB", (1, 1)))
    가운데 = t.get("align") == "center"
    난것 = []

    def 재라(자리: str, 줄들, cfg: dict, 글꼴이름: str) -> None:
        if not 줄들:
            return
        크기 = cfg["font_size"]
        f = fonts.get(글꼴이름, 크기)
        e = fonts.emoji(크기)
        여백 = cfg.get("left_margin", t.get("left_margin", 0))
        한계 = W if 가운데 else W - 여백
        for i, 줄 in enumerate(줄들):
            폭 = _measure_tracked(d, 줄, f, cfg.get("tracking", 0.0), e)
            if 폭 > 한계:
                난것.append({"자리": f"{자리} {i + 1}행", "글": 줄,
                            "폭": round(폭, 1), "한계": 한계,
                            "넘침": round(폭 - 한계, 1)})

    if "headline" in t:
        재라("헤드라인", slide.get("headline") or [], t["headline"], headline_font)
    if "body" in t:
        재라("본문", slide.get("body") or [], t["body"], body_font)
    return 난것


def _wrap_fit(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont) -> None:
    """줄바꿈은 안 한다 — 원본 대본이 이미 줄 단위로 쪼개져 들어온다.

    카드뉴스는 줄바꿈 자리가 편집자의 선택이라(자동 줄바꿈으로는 안 나옴),
    content.json 의 headline/body 가 이미 배열이면 그 자체가 줄이다.
    """
    return None


def _emoji_advance(d: ImageDraw.ImageDraw, ch, emoji_font, target_size) -> float:
    """글꼴이 제 크기로 열렸을 때의 폭을 목표 크기로 환산한다."""
    return d.textlength(ch, font=emoji_font) * (target_size / emoji_font.size)


def _draw_emoji(img: Image.Image, d: ImageDraw.ImageDraw, x, y, ch, emoji_font, target_size) -> float:
    """컬러 이모지 한 글자를 찍고 그 폭을 돌려준다.

    요청한 크기로 열린 글꼴(윈도우 Segoe)이면 그대로 찍는다. 109px 로만 열리는
    글꼴(NotoColorEmoji)이면 크게 그린 뒤 줄여 붙인다 — Pillow 가 컬러 비트맵
    글꼴의 크기를 바꿔주지 않기 때문이다.
    """
    if emoji_font.size == target_size:
        d.text((x, y), ch, font=emoji_font, embedded_color=True)
        return d.textlength(ch, font=emoji_font)
    box = int(emoji_font.size * 1.5)
    tile = Image.new("RGBA", (box, box), (0, 0, 0, 0))
    ImageDraw.Draw(tile).text((0, 0), ch, font=emoji_font, embedded_color=True)
    side = max(1, int(box * target_size / emoji_font.size))
    img.alpha_composite(tile.resize((side, side), Image.LANCZOS), (int(x), int(y)))
    return _emoji_advance(d, ch, emoji_font, target_size)


def _draw_text_tracked(d: ImageDraw.ImageDraw, img: Image.Image, xy, text, font, fill, tracking=0.0, emoji_font=None):
    """글자를 하나씩 찍는다. 이모지를 만나면 그 글자만 컬러 이모지 글꼴로 바꿔 찍는다
    — Pretendard/Wanted Sans 에는 이모지 글리프가 없어서(빈 네모로 나온다), 여기서 갈아끼운다.
    """
    x, y = xy
    for ch in text:
        if emoji_font is not None and _is_emoji(ch):
            x += _draw_emoji(img, d, x, y, ch, emoji_font, font.size) + tracking
        else:
            d.text((x, y), ch, font=font, fill=fill)
            x += d.textlength(ch, font=font) + tracking
    return x


def _measure_tracked(d: ImageDraw.ImageDraw, text, font, tracking=0.0, emoji_font=None) -> float:
    total = 0.0
    for ch in text:
        if emoji_font is not None and _is_emoji(ch):
            total += _emoji_advance(d, ch, emoji_font, font.size) + tracking
        else:
            total += d.textlength(ch, font=font) + tracking
    return total - (tracking if text else 0)


def _토막내기(글: str, 폭: int) -> list:
    """긴 한 줄을 대충 폭에 맞춰 자른다. 자리표시 설명용이라 정밀할 필요가 없다."""
    말, 줄, 난것 = 글.split(), "", []
    for w in 말:
        if len(줄) + len(w) + 1 > 폭:
            난것.append(줄); 줄 = w
        else:
            줄 = (줄 + " " + w).strip()
    if 줄:
        난것.append(줄)
    return 난것


def draw_news_slide(slide: dict, tpl: dict, fonts: FontBook, headline_font: str, body_font: str) -> Image.Image:
    w, h = tpl["canvas"]["w"], tpl["canvas"]["h"]
    t = tpl["slide_types"]["뉴스"]
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # 1) 아래쪽 글자판 배경 (미디어 자리는 투명으로 남긴다)
    d.rectangle([0, t["media_box"]["y1"], w, h], fill=_rgba(t["background"]))

    # 미디어가 없으면 그 자리를 비워두지 않고 자리표시를 깐다. 안 그러면 투명한
    # 채로 저장돼 새까맣게 나온다 — «아직 안 넣음» 인지 «까만 그림» 인지 구별이
    # 안 된다. 표지·CTA 와 같은 규칙이다.
    if not slide.get("_has_media"):
        ph = t.get("photo_placeholder") or {}
        y1 = t["media_box"]["y1"]
        d.rectangle([0, 0, w, y1], fill=_rgba(ph.get("fill", "#D9D9D9")))
        f_q = fonts.get(headline_font, ph.get("mark_size", 140))
        표 = ph.get("mark", "?")
        qw = d.textlength(표, font=f_q)
        d.text(((w - qw) / 2, y1 * 0.24), 표, font=f_q,
               fill=_rgba(ph.get("mark_color", "#B4B4B4")))
        메모 = (slide.get("gen_prompt") or "").strip()
        if 메모:
            f_m = fonts.get(body_font, 26)
            for i, 줄 in enumerate(_토막내기(메모, 34)[:3]):
                mw = d.textlength(줄, font=f_m)
                d.text(((w - mw) / 2, y1 * 0.62 + i * 34), 줄, font=f_m,
                       fill=_rgba(ph.get("mark_color", "#B4B4B4")))

    # 2) 출처 딱지 (오른쪽 정렬)
    sl = t["source_label"]
    src = _채우기(sl.get("format", "{source_kind} / {source_name}"), slide)
    if src not in ("", "/"):          # 출처가 없는 장은 딱지를 안 붙인다
        f_src = fonts.get(body_font, sl["font_size"])
        src_w = _measure_tracked(d, src, f_src)
        _draw_text_tracked(d, img, (w - sl["right_margin"] - src_w, sl["y0"]), src, f_src, _rgba(sl["color"]))

    # 3) 번호 배지 — 반투명 원 + 그림자 + 번호. 미디어 위에도 걸치므로 이 레이어에서만 그린다.
    b = t["badge"]
    shadow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ds = ImageDraw.Draw(shadow)
    ds.ellipse([b["cx"] - b["r"] + 3, b["cy"] - b["r"] + 5, b["cx"] + b["r"] + 3, b["cy"] + b["r"] + 5],
               fill=(0, 0, 0, 60))
    img.alpha_composite(shadow)
    d = ImageDraw.Draw(img)
    d.ellipse([b["cx"] - b["r"], b["cy"] - b["r"], b["cx"] + b["r"], b["cy"] + b["r"]], fill=_rgba(b["fill"]))
    f_badge = fonts.get(headline_font, b["font_size"])
    num = str(slide["no"] - 1)  # 표지가 1번이라 뉴스 순번은 no-1
    nw = d.textlength(num, font=f_badge)
    d.text((b["cx"] - nw / 2, b["cy"] - b["font_size"] * 0.62), num, font=f_badge, fill=_rgba(b["text_color"]))

    # 4) 브랜드 칩 "AI NEWS | Brand"
    bc = t["brand_chip"]
    # **브랜드 유무를 포맷 «전»에 본다.** 예전엔 포맷한 뒤 `.rstrip("| ").strip()` 로
    # 판단했는데, "AI NEWS  |  {brand}" 에 brand 가 없으면 "AI NEWS  |" 가 되고
    # 그걸 깎아도 "AI NEWS" 가 남아 참으로 판정됐다 — 경제뉴스 장마다 빈 칩이 찍혔다.
    # source_label(위)과 같은 원칙: **끼울 값이 없으면 칸 자체를 안 그린다.**
    if (slide.get("brand") or "").strip():
        chip_text = _채우기(bc.get("format", "AI NEWS  |  {brand}"), slide)
        f_chip = fonts.get(body_font, bc["font_size"])
        d.text((bc["x"], bc["y0"]), chip_text, font=f_chip, fill=_rgba(bc["color"]))

    # 5) 헤드라인 (원본 줄바꿈 그대로 — 자동 개행 안 함)
    hl = t["headline"]
    줄들 = slide.get("headline") or []
    f_h = fonts.get(headline_font, hl["font_size"])
    e_h = fonts.emoji(hl["font_size"])
    for y, line in zip(_줄자리(hl, 줄들, "헤드라인", slide.get("no")), 줄들):
        _draw_text_tracked(d, img, (hl["left_margin"], y), line, f_h, _rgba(hl["color"]), hl["tracking"], e_h)

    # 6) 본문 (자리표가 준 줄 수만큼. 지금 값은 3줄이다)
    bd = t["body"]
    줄들 = slide.get("body") or []
    f_b = fonts.get(body_font, bd["font_size"])
    e_b = fonts.emoji(bd["font_size"])
    for y, line in zip(_줄자리(bd, 줄들, "본문", slide.get("no")), 줄들):
        _draw_text_tracked(d, img, (bd["left_margin"], y), line, f_b, _rgba(bd["color"]), bd["tracking"], e_b)

    return img


def draw_cover_slide(slide: dict, tpl: dict, fonts: FontBook, headline_font: str) -> Image.Image:
    """표지 — 01.jpg 를 픽셀로 실측한 값으로 그린다.

    뉴스 장과 다른 점이 셋이다. 글자가 미디어 «위에» 얹히고, 헤드라인이 더 크고
    (107px · 줄간격 126), 한 줄 안에서 색이 갈린다 — «7월 5주차» 만 청록이고
    «AI 소식» 은 흰색이다. 줄 전체를 물들이면 안 된다.

    맨 아래 'AI FREAKS' 그림을 그린다 — **18편 표지에 예외 없이 들어 있다.**
    이게 없으면 한눈에 남의 판으로 보인다(2026-08-20 실측).

    **배경 사진이 없으면 자리표시를 깐다.** 표지는 사진이 화면을 꽉 채우고 그
    위에 글자가 얹히는 구조라, 사진이 없으면 글자가 허공에 뜬 것처럼 보인다.
    CTA 와 같은 규칙으로 회색 바탕에 물음표를 그려 «여기에 넣으세요» 라고
    알린다. 합성기에 사진을 주면 이 자리표시는 아예 안 그려진다.
    """
    w, h = tpl["canvas"]["w"], tpl["canvas"]["h"]
    t = tpl["slide_types"]["표지"]
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    if not slide.get("_has_media"):
        자리 = t.get("photo_placeholder") or {}
        d.rectangle([0, 0, w, h], fill=_rgba(자리.get("fill", "#D9D9D9")))
        f_q = fonts.get(headline_font, 자리.get("mark_size", 220))
        표 = 자리.get("mark", "?")
        qw = d.textlength(표, font=f_q)
        d.text(((w - qw) / 2, h * 0.18), 표, font=f_q,
               fill=_rgba(자리.get("mark_color", "#B4B4B4")))

    # 어둡게 까는 쪽. 표지 글자가 흰색이라 밝은 사진 위에서는 안 읽힌다 —
    # 원본도 그렇게 해놨다(오른쪽 여백 세로 밝기: 위 400줄 평균 90, 아래 400줄 57).
    scrim = t.get("scrim")
    if scrim:
        진하기 = scrim.get("max_alpha", 150)
        # **`direction: "top"` 은 2026-08-23 추가.** 취업공고 표지가 밈 자체
        # 자막을 피해 헤드라인을 위로 올려야 할 때 쓴다 — 값이 없으면
        # (기존 AI소식 표지 전부가 그렇다) 예전 그대로 아래쪽만 어둡게 깐다.
        if scrim.get("direction") == "top":
            y1 = int(h * (1 - scrim.get("start", 0.55)))
            띠 = Image.new("RGBA", (w, y1), (0, 0, 0, 0))
            띠d = ImageDraw.Draw(띠)
            for i in range(y1):
                띠d.line([(0, i), (w, i)], fill=(0, 0, 0, int(진하기 * (y1 - i) / max(y1 - 1, 1))))
            img.alpha_composite(띠, (0, 0))
        else:
            y0 = int(h * scrim.get("start", 0.55))
            띠 = Image.new("RGBA", (w, h - y0), (0, 0, 0, 0))
            띠d = ImageDraw.Draw(띠)
            for i in range(h - y0):
                띠d.line([(0, i), (w, i)], fill=(0, 0, 0, int(진하기 * i / max(h - y0 - 1, 1))))
            img.alpha_composite(띠, (0, y0))
        d = ImageDraw.Draw(img)

    bar = t["accent_bar"]
    d.rectangle([bar["x0"], bar["y0"], bar["x1"], bar["y1"]], fill=_rgba(bar["color"]))

    # 윗글씨는 대본이 정하고, 없으면 자리표의 고정 문구를 쓴다 — 19편 전부 «Weekly AI» 였다.
    eb = t["eyebrow"]
    윗글 = (slide.get("eyebrow") or eb.get("text") or "").strip()
    if 윗글:
        d.text((eb["x"], eb["y"]), 윗글,
               font=fonts.get(headline_font, eb["font_size"]), fill=_rgba(eb["color"]))

    hl = t["headline"]
    줄들 = slide.get("headline") or []
    f_h = fonts.get(headline_font, hl["font_size"])
    강조 = slide.get("accent_text", "")
    for y, line in zip(_줄자리(hl, 줄들, "헤드라인", slide.get("no")), 줄들):
        x = hl["left_margin"] if "left_margin" in hl else t["left_margin"]
        for 조각, 색 in _색깔로_쪼갠다(line, 강조, hl):
            x = _draw_text_tracked(d, img, (x, y), 조각, f_h, _rgba(색), hl["tracking"])

    # 계정 로고. 자리표에 상자와 파일 이름이 있고, 파일이 없으면 조용히 건너뛴다 —
    # 로고 하나 없다고 판 전체를 못 굽게 할 이유가 없다.
    lg = t.get("logo") or {}
    if lg.get("asset"):
        p = HERE / lg["asset"]
        if p.exists():
            칸 = (lg["x1"] - lg["x0"], lg["y1"] - lg["y0"])
            그림 = Image.open(p).convert("RGBA")
            그림 = 그림.resize(칸, Image.LANCZOS)
            img.alpha_composite(그림, (lg["x0"], lg["y0"]))
    return img


def _색깔로_쪼갠다(line: str, 강조: str, hl: dict) -> list:
    """한 줄을 «강조 구간» 과 나머지로 자른다. 강조가 없으면 통째로 한 조각."""
    if not 강조 or 강조 not in line:
        return [(line, hl["color"])]
    앞, _, 뒤 = line.partition(강조)
    조각들 = []
    if 앞:
        조각들.append((앞, hl["color"]))
    조각들.append((강조, hl["accent_color"]))
    if 뒤:
        조각들.append((뒤, hl["color"]))
    return 조각들


def _vertical_gradient(w: int, h: int, stops: list) -> Image.Image:
    """`stops` = [(0~1 세로 위치, "#RRGGBB"), ...] 를 잇는 세로 그러데이션.

    stops 사이는 직선 보간한다. numpy 를 쓰지 않는다 — 렌더 서버 이미지에는
    Pillow 밖에 없다(실측: numpy 를 쓴 판을 올렸더니 17번 장이 통째로 죽었다).
    한 줄짜리 그림을 만들어 세로로 늘리면 Pillow 만으로 충분히 빠르다.
    """
    cols = [( s[0], _rgba(s[1])[:3] ) for s in stops]
    바 = Image.new("RGB", (1, h))
    px = 바.load()
    for y in range(h):
        t = y / max(h - 1, 1)
        i = 0
        while i < len(cols) - 2 and t > cols[i + 1][0]:
            i += 1
        (p0, c0), (p1, c1) = cols[i], cols[i + 1]
        f = 0.0 if p1 == p0 else (t - p0) / (p1 - p0)
        f = min(max(f, 0.0), 1.0)
        px[0, y] = tuple(round(c0[k] + (c1[k] - c0[k]) * f) for k in range(3))
    return 바.resize((w, h), Image.BILINEAR).convert("RGBA")


def draw_cta_slide(slide: dict, tpl: dict, fonts: FontBook, headline_font: str, body_font: str) -> Image.Image:
    """CTA — 배경(그러데이션) + 글자 + **사람이 채울 사진 자리**.

    배경은 단색이 아니라 **세로 그러데이션**이다 — 17.jpg 를 좌우 여백만 골라
    재보면 위쪽이 흰빛(#F5FBFF)에서 중간쯤 옅은 하늘색(#E8F9FE)으로 갔다가
    맨 아래서 다시 살짝 밝아진다(#F3F9FF). 처음엔 단색으로만 칠했었다.

    원본은 사진 자리에 인스타 프로필 화면을 담은 폰 목업이 들어간다. 그 그림은
    자산이 없어 우리가 만들 수 없다 — 그래서 회색 바탕에 물음표를 그려 «여기에
    넣으세요» 라고 표시해 둔다. 합성기에 사진을 주면 그 자리에 그대로 들어간다.
    """
    w, h = tpl["canvas"]["w"], tpl["canvas"]["h"]
    t = tpl["slide_types"]["CTA"]
    bg = t.get("background_gradient")
    img = (_vertical_gradient(w, h, [(s["at"], s["color"]) for s in bg]) if bg
           else Image.new("RGBA", (w, h), _rgba(t["background"])))
    d = ImageDraw.Draw(img)

    자리 = t.get("photo_box")
    if 자리:
        x0, y0, x1, y1 = 자리["x0"], 자리["y0"], 자리["x1"], 자리["y1"]
        칸W, 칸H = x1 - x0, y1 - y0
        # **사진이 있으면 그걸 넣는다.** 없으면 예전처럼 회색 네모에 물음표다.
        # 자산은 대본이 주거나(`photo`) 자리표가 가리킨다(`asset`) — 매주 바뀌는
        # 게 아니라 한 번 만들어 박아두는 고정 자산이라 자리표에 두는 게 맞다.
        사진 = slide.get("photo") or 자리.get("asset")
        박은것 = None
        if 사진:
            길 = Path(사진)
            if not 길.is_absolute():
                길 = HERE / 길
            if 길.exists():
                박은것 = Image.open(길).convert("RGBA")
        if 박은것:
            # 칸을 꽉 채우게 키운 뒤 **위를 남기고** 자른다 — 프로필이 위쪽에 있다.
            비 = max(칸W / 박은것.width, 칸H / 박은것.height)
            박은것 = 박은것.resize((max(1, round(박은것.width * 비)),
                                 max(1, round(박은것.height * 비))), Image.LANCZOS)
            박은것 = 박은것.crop(((박은것.width - 칸W) // 2, 0,
                               (박은것.width - 칸W) // 2 + 칸W, 칸H))
            마스크 = Image.new("L", (칸W, 칸H), 0)
            ImageDraw.Draw(마스크).rounded_rectangle(
                [0, 0, 칸W - 1, 칸H - 1], radius=자리.get("radius", 40), fill=255)
            img.paste(박은것, (x0, y0), 마스크)
        else:
            d.rounded_rectangle([x0, y0, x1, y1], radius=자리.get("radius", 40),
                                fill=_rgba(자리.get("fill", "#D9D9D9")))
            f_q = fonts.get(headline_font, 자리.get("mark_size", 150))
            표 = 자리.get("mark", "?")
            qw = d.textlength(표, font=f_q)
            d.text(((x0 + x1 - qw) / 2, y0 + (y1 - y0) * 0.22), 표, font=f_q,
                   fill=_rgba(자리.get("mark_color", "#9A9A9A")))

    wm = t["wordmark"]
    f_logo = fonts.get(headline_font, wm["font_size"])
    lw = d.textlength(slide["logo_text"], font=f_logo)
    d.text(((w - lw) / 2, wm["y"]), slide["logo_text"], font=f_logo, fill=_rgba(wm["color"]))

    hl = t["headline"]
    f_h = fonts.get(headline_font, hl["font_size"])
    y = hl["lines_y"][0]
    for line in slide["headline"]:
        lw = d.textlength(line, font=f_h)
        d.text(((w - lw) / 2, y), line, font=f_h, fill=_rgba(hl["color"]))
        y += hl["line_height"]

    hd = t["handle"]
    f_handle = fonts.get(body_font, hd["font_size"])
    hw = d.textlength(slide["handle"], font=f_handle)
    d.text(((w - hw) / 2, hd["y"]), slide["handle"], font=f_handle, fill=_rgba(hd["color"]))
    return img


def draw_job_slide(slide: dict, tpl: dict, fonts: FontBook, headline_font: str, body_font: str) -> Image.Image:
    """취업 공고 한 장 — 회사 이미지(위 40%) + 직무명·회사정보(아래 60%).

    2026-08-23 신설. "뉴스"(사진이 화면 대부분)와 달리 회사 이미지 비중을
    낮추고 글자 자리를 넓혔다 — 로고 한 장보다 마감일·경력조건 같은 정보가
    이 카드에서는 더 중요하다는 사용자 판단.
    """
    w, h = tpl["canvas"]["w"], tpl["canvas"]["h"]
    t = tpl["slide_types"]["채용공고"]
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    d.rectangle([0, t["media_box"]["y1"], w, h], fill=_rgba(t["background"]))

    if not slide.get("_has_media"):
        ph = t.get("photo_placeholder") or {}
        y1 = t["media_box"]["y1"]
        d.rectangle([0, 0, w, y1], fill=_rgba(ph.get("fill", "#D9D9D9")))
        f_q = fonts.get(headline_font, ph.get("mark_size", 140))
        표 = ph.get("mark", "?")
        qw = d.textlength(표, font=f_q)
        d.text(((w - qw) / 2, y1 * 0.3), 표, font=f_q,
               fill=_rgba(ph.get("mark_color", "#B4B4B4")))

    # 기업형태 배지 (대기업·스타트업 등) — 없는 장은 안 그린다
    chip = t.get("chip") or {}
    글 = (slide.get("chip") or "").strip()
    if 글:
        f_c = fonts.get(headline_font, chip.get("font_size", 28))
        cw = d.textlength(글, font=f_c)
        x0, y0 = chip.get("x", 89), chip.get("y", 570)
        pad_x, pad_y = chip.get("pad_x", 16), chip.get("pad_y", 8)
        d.rounded_rectangle([x0, y0, x0 + cw + pad_x * 2, y0 + chip.get("font_size", 28) + pad_y * 2],
                            radius=chip.get("radius", 8), fill=_rgba(chip.get("bg_color", "#00E1FF")))
        d.text((x0 + pad_x, y0 + pad_y), 글, font=f_c, fill=_rgba(chip.get("color", "#FFFFFF")))

    # 헤드라인 — 직무명
    hl = t["headline"]
    줄들 = slide.get("headline") or []
    f_h = fonts.get(headline_font, hl["font_size"])
    e_h = fonts.emoji(hl["font_size"])
    for y, line in zip(_줄자리(hl, 줄들, "헤드라인", slide.get("no")), 줄들):
        _draw_text_tracked(d, img, (hl["left_margin"], y), line, f_h, _rgba(hl["color"]), hl["tracking"], e_h)

    # 본문 — 회사명·마감일·경력조건·지역 (자리표가 준 줄 수만큼)
    bd = t["body"]
    줄들 = slide.get("body") or []
    f_b = fonts.get(body_font, bd["font_size"])
    e_b = fonts.emoji(bd["font_size"])
    for y, line in zip(_줄자리(bd, 줄들, "본문", slide.get("no")), 줄들):
        _draw_text_tracked(d, img, (bd["left_margin"], y), line, f_b, _rgba(bd["color"]), bd["tracking"], e_b)

    return img


def 깊이얹기(바탕: dict, 위: dict) -> dict:
    """자리표 «위에» 고친 값만 덮는다. 묶음은 끝까지 파고들고, 목록·값은 통째로 바꾼다.

    **갈아끼우지 않는 것이 요점이다.** 이 자리표는 이제 yml 안에 들어 있고 yml 은
    사람끼리 주고받는다. 반년 전 yml 이 오늘 서버에 와도, 그 사이 생긴 칸은 서버
    기본값으로 남아 그대로 굴러가야 한다. 통째로 갈면 그 빈 칸에서 죽는다.

    `_얹기` 는 한 겹만 파는 장별 수정용이고, 이건 자리표 전체용이라 끝까지 판다.
    """
    난것 = dict(바탕)
    for k, v in (위 or {}).items():
        겹치나 = isinstance(v, dict) and isinstance(바탕.get(k), dict)
        난것[k] = 깊이얹기(바탕[k], v) if 겹치나 else v
    return 난것


def 틀탈(위: dict, 바탕: dict, 길: str = "") -> list:
    """고친 자리표에서 «서버가 모르는 칸» 을 찾는다. **돈도 시간도 안 든다.**

    자리표가 yml 로 옮겨 가면서 «칸 이름이 맞나» 를 볼 눈이 없어졌다 —
    `dify/검사.py` 는 yml 안만 본다. 그 눈을 여기 둔다. `/render/check` 가 같이 준다.

    **막지는 않고 알린다.** 얹기라서 오타 하나로 판이 깨지지는 않는다. 다만
    «고쳤는데 아무 일도 안 일어나는» 것이 제일 나쁘므로 반드시 말해 준다.
    """
    탈 = []
    for k, v in (위 or {}).items():
        여기 = f"{길}{k}"
        if k.startswith("_"):
            continue                    # 주석 칸이다. 서버는 처음부터 안 본다
        if k in 바탕 and v == 바탕[k]:
            continue
            # **안 바꾼 것은 탈이 아니다.** 부르는 쪽은 자리표를 «통째로» 보낸다 —
            # 그중 대부분은 서버 기본값 그대로다. 값이 같은데 «못 바꾼다» 고 말하면
            # 매번 뜨는 경고가 되고, 매번 뜨는 경고는 아무도 안 읽는다(실측
            # 2026-08-19: 자리표를 그냥 통과시켰는데 fonts.candidates 가 걸렸다).
        if 여기 == "fonts.candidates":
            탈.append("fonts.candidates — 글꼴 «파일» 은 서버에 있다. 여기선 못 바꾼다. "
                      "고르는 것만 된다 (headline_default · body_default)")
            continue
        if k not in 바탕:
            탈.append(f"{여기} — 서버가 모르는 칸이다 (오타?)")
            continue
        묶음이어야 = isinstance(바탕[k], dict)
        if isinstance(v, dict) != 묶음이어야:
            탈.append(f"{여기} — 종류가 다르다 ({'묶음' if 묶음이어야 else '값'}이어야 한다)")
            continue
        if 묶음이어야:
            탈 += 틀탈(v, 바탕[k], f"{여기}.")
    return 탈


def _얹기(바탕: dict, 위: dict) -> dict:
    """자리표 위에 이 장만의 수정값을 얹는다. 한 겹만 파고든다.

    `{"headline": {"font_size": 76}}` 을 주면 헤드라인의 «나머지 값은 그대로 두고»
    글자 크기만 바꾼다. 통째로 갈아치우지 않는다.
    """
    난것 = dict(바탕)
    for k, v in 위.items():
        겹치나 = isinstance(v, dict) and isinstance(바탕.get(k), dict)
        난것[k] = {**바탕[k], **v} if 겹치나 else v
    return 난것


def draw_slide(slide: dict, tpl: dict, fonts: FontBook, headline_font: str, body_font: str) -> Image.Image:
    """`slide["조판"]` 이 있으면 **이 장에만** 그 값을 얹어 그린다.

    **왜 자리표가 아니라 대본에 두나.** `template.json` 은 원본을 픽셀로 잰 값이라
    더럽히면 안 된다 — 그게 «되돌려 그리기» 점수의 근거다. 사람이 고친 값은 그 장
    옆에 붙어 다녀야 «누가 무엇을 고쳤나» 가 남고, 안 건드린 장은 여전히 원본과 같다.

    나중에 편집 화면이 생기면 그 화면이 하는 일은 이 `조판` 칸을 쓰는 것뿐이다.
    """
    kind = slide["type"]
    조판 = slide.get("조판")
    if 조판:
        tpl = {**tpl, "slide_types": {**tpl["slide_types"],
                                      kind: _얹기(tpl["slide_types"][kind], 조판)}}
    if kind == "뉴스":
        return draw_news_slide(slide, tpl, fonts, headline_font, body_font)
    if kind == "표지":
        return draw_cover_slide(slide, tpl, fonts, headline_font)
    if kind == "CTA":
        return draw_cta_slide(slide, tpl, fonts, headline_font, body_font)
    if kind == "채용공고":
        return draw_job_slide(slide, tpl, fonts, headline_font, body_font)
    raise ValueError(f"모르는 슬라이드 종류: {kind}")
