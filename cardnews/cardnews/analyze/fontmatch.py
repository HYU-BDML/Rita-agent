# analyze/fontmatch.py
"""**어느 글씨체인가** — 받아 둔 8종으로 실제로 그려 보고 글리프끼리 겹쳐 본다.

**왜 새로 쓰나.** 옛 자(`ruler/text.py::_family()`)는 고딕·명조 둘만 냈고, 그나마
**명조를 한 번도 명조라고 안 했다**(2026-08-19 실측: 48px 에서 고딕 0.126 ·
명조 0.295 로 문턱 0.45 아래에 둘 다, 100px 에서는 순서가 뒤집힘). 사실상 상수다.

**어떻게 재나.** 자간·줄바꿈에 안 흔들리게 **글자 한 자씩** 본다 —

1. OCR 이 준 글자 상자마다, 잰 글자색에서 LAB 로 가까운 화소를 글리프로 본다
   (`lineback.GLYPH_DE` 와 같은 자).
2. 같은 글자를 후보 글꼴로 크게 그려 글리프 마스크를 만든다.
3. 둘 다 **제 잉크 상자로 잘라** 높이 `NORM_H` 로 맞춘다(가로세로 비율은 그대로).
   그 뒤 겹치는 몫(IoU)을 잰다.
4. 글자마다의 IoU 를 **중앙값**으로 접어 그 글꼴의 점수로 삼는다.

가로세로 비율을 살리는 이유: 명조와 고딕은 두께 분포뿐 아니라 폭이 다르다.
크기를 맞춰 놓고 비율까지 죽이면 그 단서가 사라진다.

굵기는 **이미 잰 값**(`Bold`/`Regular`)으로 파일을 고른다. 글꼴마다 있는 굵기를
전부 열어 제일 잘 맞는 것을 고르게 하면 점수가 오히려 뭉개진다 — 실측
(DHqCBQnRAjW 17덩어리): 굵기를 고정하면 1·2등 차가 0.017~0.158 인데, 굵기를
풀면 0.000~0.095 로 좁아지고 1등이 덩어리마다 프리텐다드↔나눔스퀘어라운드로
뒤집힌다.

**얼마나 갈리나 — 정직하게.**

*합성 시험*(같은 한글 24자를 8종으로 그려 다시 맞혀 보기, px 21·36·41·46·106 ×
굵기 2 × 글자수 4·8·16·24 = **320가지**):

| 문턱(1등−2등) | 판정한 것 | 틀린 것 |
|---|---|---|
| 0.05 | 221/320 | **1** (21px 나눔스퀘어라운드 → 프리텐다드, 차 0.062) |
| 0.08 | 186/320 | 0 |
| **0.10** | **163/320** | **0** |
| 0.15 | 111/320 | 0 |

그래서 `MARGIN_MIN = 0.10` 이다 — 틀린 게 0 이 되는 첫 자리(0.08)에서 한 칸 더
여유를 뒀다. 글자 수 하한은 **안 뒀다**: 같은 320가지에서 문턱을 걸고 나면
글자 수를 4자로 낮춰도 틀린 것이 0이라, 관문이 하나 더 필요하지 않았다.

*실물*(같은 17덩어리): **1등이 늘 프리텐다드 아니면 나눔스퀘어라운드이고,
1·2등의 차가 0.017~0.158 이다.** 2등도 열다섯 번은 그 둘 중 나머지 하나이고,
나머지 둘(1번 장 106pt 제목 · 6번 장 「기획후기」)에서만 에스코어드림이 2등이다.
문턱 0.10 을 넘어 판정이 나오는 것은 셋뿐이고(1번 장 43pt 0.158 · 2번 장 45pt
0.127 · 5번 장 46pt 0.131) 셋 다 프리텐다드다. **나머지 열넷은 「못 가림」이다.**
사람이 유일하게 글씨체를 고른 덩어리(2번 장 본문, 「프리텐다드」)에서는
나눔스퀘어라운드가 0.017 앞선다 — 문턱이 없었다면 **사람이 고른 값을 기계가
뒤집었을 것이다.**

**8종을 다 못 가린다는 뜻은 아니다.** 못 가리는 것은 «고딕 계열 안에서» 프리텐다드와
나눔스퀘어라운드 둘이고, 명조(나눔명조)·검은고딕·잘난체·도현 같은 것은 실물 17덩어리
어디서도 1·2등에 못 든다. 옛 `_family()` 가 명조를 한 번도 명조라 못 한 것과는
다른 자리다.

**판정력을 가르는 것은 글자 수보다 글자 «생김새» 다.** 같은 검은고딕 46px 인데
「가나다라마바사아자차」처럼 받침 없는 쉬운 글자 열 자면 1등 IoU 가 0.430 으로
떨어지고 2등(지마켓산스)과 0.026 차라 못 가린다 — 같은 글꼴·같은 크기에서
실물스러운 24자면 0.883 / 차 0.153 이다. 글자 수 하한을 따로 안 둔 이유이기도
하다: 막아야 할 것은 「글자가 적다」가 아니라 「그 글자들로는 안 갈린다」이고,
그건 1·2등 차가 이미 말한다.

그래서 이 모듈의 답은 「제일 가까운 것」이 아니라 **「자신 있게 가릴 수 있을
때만 이름, 아니면 못 가림」** 이다. 못 가리면 사람이 고른 값(없으면 계열
기본값)이 그대로 선다.
"""
import functools
import statistics
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config
import lineback
import tint

_FONTS = config.ROOT / "fonts"
# 글꼴은 우리 렌더 폴더 것을 쓴다(`cardnews/render/fonts`).
_RS_FONTS = config.ROOT.parent / "render" / "fonts"

# 라벨이 고를 수 있는 글씨체 8종(`web/server/labels.js` 의 FONTS)과 (Bold, Regular)
# 파일. 무게가 여러 단계인 것은 **두 단계로만 접는다** — 계량표가 Bold/Regular
# 둘만 적는다. 프리텐다드만 `render-server/fonts/` 에 있다(`fonts/README.md`).
# **여기가 이 표의 유일한 자리다** — `verify_labeled` 가 이걸 그대로 쓴다.
# 프리텐다드에는 Regular 파일이 없어 Medium 으로 대신한다(레포에 없음). 그래서
# Regular 덩어리의 프리텐다드 점수는 실제보다 낮게 나올 수 있다 — 위 실물 표에서
# 나눔스퀘어라운드가 Regular 본문마다 근소하게 앞서는 것이 그 자리다.
FONT_FILES = {
    "프리텐다드": (_RS_FONTS / "Pretendard-Bold.otf", _RS_FONTS / "Pretendard-Medium.otf"),
    "원티드산스": (_FONTS / "WantedSans-Bold.otf", _FONTS / "WantedSans-Medium.otf"),
    "지마켓산스": (_FONTS / "GmarketSansTTFBold.ttf", _FONTS / "GmarketSansTTFMedium.ttf"),
    "에스코어드림": (_FONTS / "SCDream7.otf", _FONTS / "SCDream4.otf"),
    "여기어때잘난체": (_FONTS / "JalnanGothicTTF.ttf", _FONTS / "JalnanGothicTTF.ttf"),
    "검은고딕": (_FONTS / "BlackHanSans-Regular.ttf", _FONTS / "BlackHanSans-Regular.ttf"),
    "배민도현": (_FONTS / "DoHyeon-Regular.ttf", _FONTS / "DoHyeon-Regular.ttf"),
    "나눔스퀘어라운드": (_FONTS / "NanumSquareRoundB.ttf", _FONTS / "NanumSquareRoundR.ttf"),
    "나눔명조": (_FONTS / "NanumMyeongjo-Bold.ttf", _FONTS / "NanumMyeongjo-Regular.ttf"),
}

MARGIN_MIN = 0.10   # 1등과 2등의 차가 이보다 작으면 **못 가렸다**고 적는다
NORM_H = 64         # 글리프를 이 높이로 맞춰 놓고 겹쳐 본다
RENDER_PX = 128     # 후보 글꼴을 그릴 크기 — 실물 pt 와 무관하다(어차피 정규화한다)
MAX_GLYPHS = 24     # 한 덩어리에서 볼 글자 수 상한(합성 시험이 쓴 수와 같다)
MIN_SIDE = 3        # 잉크 상자가 이보다 작은 글리프는 버린다(정규화가 무의미)

NOT_SURE = "못 가림"


def is_hangul(ch: str) -> bool:
    """한글 완성형만 본다 — 8종의 차이가 가장 크게 나는 자리이고, 영문·숫자·
    기호는 글꼴 사이 차이가 작아 표를 흐린다."""
    return "가" <= ch <= "힣"


def _crop_ink(mask: np.ndarray) -> np.ndarray | None:
    ys, xs = np.nonzero(mask)
    if len(ys) == 0:
        return None
    return mask[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def normalize(mask: np.ndarray, h: int = NORM_H) -> np.ndarray | None:
    """잉크 상자로 자른 뒤 높이 `h` 로 맞춘다. 가로세로 비율은 그대로 둔다."""
    m = _crop_ink(mask)
    if m is None or m.shape[0] < MIN_SIDE or m.shape[1] < MIN_SIDE:
        return None
    w = max(1, round(h * m.shape[1] / m.shape[0]))
    resized = Image.fromarray(m.astype(np.uint8) * 255).resize((w, h), Image.BILINEAR)
    return np.asarray(resized) > 128


def glyph_mask(img: np.ndarray, box, ink_hex: str, pad: int = 2) -> np.ndarray | None:
    """그림에서 글자 한 자의 글리프 화소. 잰 글자색에서 LAB 로 가까운 쪽이 글자다."""
    x0, y0, x1, y1 = (int(round(v)) for v in box)
    sub = img[max(0, y0 - pad):y1 + pad, max(0, x0 - pad):x1 + pad]
    if sub.size == 0:
        return None
    lab = tint.to_lab(sub)
    ref = lineback._lab_of(ink_hex)
    return np.linalg.norm(lab - ref, axis=2) < lineback.GLYPH_DE


@functools.lru_cache(maxsize=4096)
def rendered(ch: str, path: str) -> np.ndarray | None:
    """후보 글꼴로 그린 글자 한 자의 정규화된 글리프. 같은 (글자, 파일)은 한 번만 그린다."""
    try:
        font = ImageFont.truetype(path, RENDER_PX)
    except OSError:
        return None
    im = Image.new("L", (RENDER_PX * 3, RENDER_PX * 3), 0)
    ImageDraw.Draw(im).text((RENDER_PX, RENDER_PX), ch, font=font, fill=255)
    return normalize(np.asarray(im) > 128)


def iou(a: np.ndarray, b: np.ndarray) -> float:
    """두 마스크를 왼쪽 위에 맞춰 놓고 겹치는 몫."""
    h, w = max(a.shape[0], b.shape[0]), max(a.shape[1], b.shape[1])
    A = np.zeros((h, w), bool)
    B = np.zeros((h, w), bool)
    A[:a.shape[0], :a.shape[1]] = a
    B[:b.shape[0], :b.shape[1]] = b
    union = int((A | B).sum())
    return float((A & B).sum() / union) if union else 0.0


def observed(img: np.ndarray, symbols: list[dict], ink_hex: str,
             cap: int = MAX_GLYPHS) -> list[tuple[str, np.ndarray]]:
    """볼 만한 글리프들 — (글자, 정규화 마스크)."""
    out = []
    for s in symbols:
        if len(out) >= cap:
            break
        ch = s.get("text", "")
        if not is_hangul(ch):
            continue
        m = glyph_mask(img, s["box"], ink_hex)
        if m is None:
            continue
        n = normalize(m)
        if n is not None:
            out.append((ch, n))
    return out


def _fail(why: str, glyphs: int = 0, ranked=()) -> dict:
    """실패도 성공과 같은 모양으로 남긴다 — `layout_labeled.block()` ·
    `merge_labeled._mark()` 와 같은 관례."""
    return {"pick": None, "verdict": NOT_SURE, "margin": None,
            "glyphs": glyphs, "ranked": list(ranked), "why": why}


def match(img: np.ndarray, symbols: list[dict], ink_hex: str | None,
          weight: str | None) -> dict:
    """이 덩어리의 글씨체를 8종 중에서 고른다.

    돌려주는 것: `{"pick", "verdict", "margin", "glyphs", "ranked", "why"?}`.
    `pick` 이 `None` 이면 **못 가린 것**이지 「글씨체가 없다」가 아니다 —
    `ranked` 에 점수가 그대로 남으니 나중에 사람이 볼 수 있다.
    """
    if not ink_hex:
        return _fail("글자색을 못 재서 글리프를 가릴 수 없다")
    obs = observed(img, symbols, ink_hex)
    if not obs:
        return _fail("한글 글리프를 하나도 못 떴다")
    bold = weight == "Bold"
    scores = {}
    for name, pair in FONT_FILES.items():
        path = pair[0] if bold else pair[1]
        if not path.exists():
            continue
        vals = []
        for ch, a in obs:
            b = rendered(ch, str(path))
            if b is not None:
                vals.append(iou(a, b))
        if vals:
            scores[name] = round(statistics.median(vals), 4)
    if len(scores) < 2:
        return _fail(f"견줄 글꼴 파일이 {len(scores)}개뿐이다 — analyze/fonts/ 를 확인하라",
                     len(obs), [{"font": k, "iou": v} for k, v in scores.items()])
    ranked = [{"font": k, "iou": v}
              for k, v in sorted(scores.items(), key=lambda kv: -kv[1])]
    margin = round(ranked[0]["iou"] - ranked[1]["iou"], 4)
    if margin < MARGIN_MIN:
        return {"pick": None, "verdict": NOT_SURE, "margin": margin,
                "glyphs": len(obs), "ranked": ranked,
                "why": (f"1등 {ranked[0]['font']} 과 2등 {ranked[1]['font']} 의 차가 "
                        f"{margin} 로 문턱 {MARGIN_MIN} 미만이다 — 한 끗 차로 고르면 "
                        f"사람이 고른 값을 틀린 값으로 뒤집는다")}
    return {"pick": ranked[0]["font"], "verdict": ranked[0]["font"], "margin": margin,
            "glyphs": len(obs), "ranked": ranked}
