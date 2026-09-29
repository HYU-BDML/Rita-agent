# analyze/layout_labeled.py
"""사람이 그은 글자 네모 안만 잰다.

**왜 갈라 쓰나:** `layout.py` 는 줄 간격으로 "이 줄과 저 줄이 한 덩어리인가"를
스스로 추측한다. 제목과 본문이 붙어 있으면 자주 틀린다. 사람이 그어준 네모가
있으면 그 추측이 통째로 사라진다 — 네모 하나가 곧 한 덩어리다.

**덩어리 값과 줄 값을 둘 다 적는다.** `pt`·`weight`·`color` 는 줄들을
중앙값·다수결·최빈값으로 접은 값이라 덩어리 안에서 달라지는 것을 못 담는다.
접기 전의 줄 값은 `line_detail` 에 그대로 남긴다(`line_detail()` 참고) —
형광펜(`lineback.back_of`)은 거기에만 자리가 있다.

**라벨에 있는 것은 다시 판정하지 않는다.** `font`·`effects` 는 라벨에서 그대로
옮긴다. 계산으로 내는 것은 `family`(고딕/명조)·`pt`·`weight`·`align`·`leading`·
`color`·`level`(제목/본문/꼬리표, `levels_of()`) 이다.

**좌표계.** 라벨 네모(`box`)는 원본 이미지 픽셀이다. `글자읽기.read_slide()` 가
돌려주는 글자 상자(`resp["symbols"]`)는 이미 1080 공간으로 옮겨져 있다
(`글자읽기.py` 의 docstring 참고). 그래서 라벨 네모를 먼저 `scale` 로 1080
공간에 옮긴 뒤에야 글자 상자와 비교할 수 있다 — 이걸 빠뜨리면 원본이 1080이
아닌 게시물(30건 중 12건)에서 네모 안에 든 글자를 하나도 못 찾는다.
"""
import statistics
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config
import effects
import fontmatch
import layout
import lineback
from ruler import normalize
from ruler import text as rtext

_DEFAULT_FONT = {"고딕": "프리텐다드", "명조": "나눔명조"}

# **글씨체는 이것 하나로 못 박는다**(사람 지시 2026-09-24). 까닭은 `choose_font` 에.
_붙박이글꼴 = "프리텐다드"

# 줄 상자가 사진·인물 네모와 이 몫 넘게 겹치면 형광펜(`lineback.back_of`)을
# 아예 안 잰다. 실측(DHqCBQnRAjW 7장, 글자 줄 전부 쓸기): 사진과 겹치는 줄은
# 1번 장 제목 두 줄뿐이고 겹침이 각각 0.67·0.62 다. 나머지 모든 줄은 0.05 미만
# (대부분 0.0) — 겹치거나 안 겹치거나 뿐이고 그 사이가 비어 있다. 0.3 은 그 빈
# 틈 안이다. 겹치는 그 두 줄이 바로 실물에서 틀렸던 자리다: 정장·피부·배경이
# 우연히 두 색 무리로 갈려 `lineback` 이 형광펜 두 겹을 지어냈다(되돌려 그림에서
# 회색 판으로 드러남 — 형광펜은 디자이너가 깐 띠를 전제하는데 사진 위 글자는
# 그 전제가 없다).
PHOTO_OVERLAP_MAX = 0.3


# ---------------------------------------------------------------- 글자 위계

# **Bold 무리 안에서** 그 장 최대 pt 대비 이 비율 이상이면 제목, 아니면 꼬리표.
# 실측(DHqCBQnRAjW 글자 덩어리 17개, `levels_of` docstring 의 표):
# 꼬리표가 되어야 하는 Bold 넷의 비율은 0.406·0.457·0.467·0.489·0.783 이고
# 제목이 되어야 하는 것은 전부 1.000 이다 — 0.9 는 그 빈 틈(0.783~1.000) 안이다.
# 문턱을 argmax 대신 비율로 두는 이유: 크기가 거의 같은 제목 둘(46·45)을 억지로
# 하나만 제목이라 부르지 않기 위해서다.
TITLE_RATIO = 0.9

# **「번호」는 크기·굵기로 안 정한다.** 「01」과 짧은 꼬리표를 가릴 길이 없고,
# 잘못 붙으면 그 자리에 장 차례가 찍혀 글이 사라진다. 이 위계는 두 곳에서만
# 붙는다 — 사람이 「장번호」 배지를 그었을 때 번호판이 붙이거나,
# 「장번호」 라벨이 있으면 배지는 아예 `틀["번호판"]` 으로 따로 실린다.
# (사람이 화면에서 고르던 길은 2026-09-19 에 뺐다.)
LEVELS = ("제목", "본문", "꼬리표")
번호위계 = "번호"


def levels_of(blocks: list[dict]) -> list[str | None]:
    """한 장의 글자 덩어리들에 **제목 / 본문 / 꼬리표** 를 붙인다.

    **왜 크기만으로는 안 되나.** 옛 갈래(`ruler/text.py::measure()`)는
    `pt / 그 장 최대 pt` 로 위계를 냈다(≥0.75 제목 · ≥0.45 본문 · 그 아래 캡션).
    실물에서 그 비율은 이렇다 — 이 커밋에서 재현된다:

    | 장 | 비율들 | 사람이 보는 것 |
    |---|---|---|
    | 1 | 1.000 · 0.406 | 제목 · 꼬리표 |
    | 2 | 1.000 · 0.911 | 제목 · 본문 |
    | 3 | 1.000 · 0.911 · 0.467 | 제목 · 본문 · 꼬리표 |
    | 4 | 1.000 · 0.911 · 0.489 | 제목 · 본문 · 꼬리표 |
    | 5 | 1.000 · 0.891 · 0.457 | 제목 · 본문 · 꼬리표 |
    | 6 | 1.000 · 0.891 · 0.783 | 제목 · 본문 · **꼬리표**(「기획후기」) |
    | 7 | 1.000 | **본문** |

    옛 문턱이면 6번 장 셋이 **전부 제목**이다. 더 나쁜 것은 7번 장이다 —
    본문 하나뿐이라 비율이 1.000 이고, **어떤 크기 문턱으로도** 제목과 못
    가른다. 크기 하나로는 원리적으로 안 된다는 반례가 표본 안에 있다.

    **그래서 굵기를 먼저 본다.** 같은 표본에서 Bold 11개는 전부 제목·꼬리표,
    Regular 6개는 전부 본문이다(오분류 0). 굵기가 본문을 완전히 가르고, 남은
    Bold 무리 안에서만 크기 비율(`TITLE_RATIO`)로 제목과 꼬리표를 가른다.

    **아직 안 밟아 본 갈래 둘**(표본이 하나뿐이라 반증도 확증도 못 얻었다):
    ① 굵은 본문 — Bold 로 쓴 본문은 여기서 제목이나 꼬리표가 된다.
    ② 제목 없이 꼬리표만 있는 장 — 그 꼬리표가 Bold 최대라 제목이 된다.
    둘 다 이 게시물에는 없다. 라벨이 늘면 다시 재라.

    크기를 못 잰 덩어리(`pt` 가 None — 한글이 없거나 OCR 이 실패한 네모)는
    `None` 이다. **지어내지 않는다.**
    """
    bolds = [b.get("pt") for b in blocks
             if b.get("weight") == "Bold" and b.get("pt")]
    top = max(bolds) if bolds else None
    out: list[str | None] = []
    for b in blocks:
        pt, weight = b.get("pt"), b.get("weight")
        if not pt or not weight:
            out.append(None)
        elif weight != "Bold":
            out.append("본문")
        else:
            out.append("제목" if pt / top >= TITLE_RATIO else "꼬리표")
    return out


def _photo_overlap(box, photo_boxes: list[list[float]]) -> float:
    """`box`(1080 공간)가 `photo_boxes`(사진·인물 네모, 1080 공간)와 겹치는
    넓이 몫 중 가장 큰 것(0~1)."""
    bx0, by0, bx1, by1 = box
    area = max(0, bx1 - bx0) * max(0, by1 - by0)
    if area <= 0:
        return 0.0
    best = 0.0
    for ox0, oy0, ox1, oy1 in photo_boxes:
        ix0, iy0 = max(bx0, ox0), max(by0, oy0)
        ix1, iy1 = min(bx1, ox1), min(by1, oy1)
        if ix1 > ix0 and iy1 > iy0:
            best = max(best, ((ix1 - ix0) * (iy1 - iy0)) / area)
    return best


def inside(box, sym_box, pad: int = 4) -> bool:
    """`sym_box` 가 `box` 안에(허용오차 `pad` 만큼 벗어나도 봐줌) 드는지."""
    bx0, by0, bx1, by1 = box
    sx0, sy0, sx1, sy1 = sym_box
    return (sx0 >= bx0 - pad and sy0 >= by0 - pad and
            sx1 <= bx1 + pad and sy1 <= by1 + pad)


def choose_font(box: dict, family: str | None,
                match: dict | None = None) -> tuple[str | None, str]:
    """글씨체 이름과 **그게 어디서 왔는지**. `(이름, 출처)`.

    **늘 프리텐다드다**(사람 지시 2026-09-24: 「글꼴 그냥 프리텐다드로 걍 픽스해」).

    **맞히는 자가 고장 나 있었다.** 정답을 아는 합성 시험(글꼴 8종 × 굵기 2 × 크기 2
    = 32가지를 그 글꼴로 직접 그려 놓고 맞히기)에서 **6/32(19%)** 만 맞혔다 —
    찍기(12.5%)와 거의 같다. 프리텐다드로 그린 것을 네 번 다 「지마켓산스」라 했고,
    명조를 그려 줘도 고딕이라 했다. 거꾸로 실물에서는 게시물 여덟이 **죄다 프리텐다드
    1등**이었다(2026-09-24 실측, 글자 179~547개씩 모아서). 쏠리는 방향이 입력마다
    다르다 — 글꼴을 보는 것이 아니라는 뜻이다.

    **틀려도 눈에 크게 안 틀린다.** 못 가리던 둘(프리텐다드↔나눔스퀘어라운드)이
    서로 닮은 고딕이고, 창고 틀 202칸 중 200칸이 이미 프리텐다드였다. 그래서
    «비슷한 것을 고르기» 를 접고 하나로 못 박는다.

    **덤으로 글자 하나하나의 네모가 필요 없어진다** — `fontmatch` 가 그것을 쓰던
    마지막 자리였다. 줄 나누기·크기는 화소로 잴 수 있으니(실측 0.976), 글자만
    값싼 모델에서 받아 오면 된다.

    되살리려면 아래 두 줄을 풀고 `fontmatch` 부터 고쳐라 — **고치기 전에 풀면
    19% 짜리 답이 계량표에 들어간다.**
    """
    # **기계 값을 안 듣는다**(2026-09-24). `match` 를 그대로 받는 것은 부르는 쪽을
    # 안 건드리려는 것이다 — 고치면 여기 한 곳만 되돌리면 된다.
    return _붙박이글꼴, "붙박이"


def choose_effects(box: dict, auto: dict | None) -> tuple[list[str], str]:
    """글자 효과와 **그게 어디서 왔는지**. `(효과 목록, 출처)`.

    **사람이 하나라도 찍었으면 사람 것이 통째로 이긴다.** 라벨 화면에서
    체크상자를 켠 것은 명시적인 답이고, 기계는 그림자를 아예 안 재므로
    (`effects.NOT_CHECKED`) 둘을 합치면 「사람이 그림자만 찍은 덩어리」가
    기계 목록에 삼켜진다.

    사람이 하나도 안 찍은 것은 **답이 아니다** — 라벨 설계상 그게 기본값이라
    「효과 없음」과 「안 봤음」이 같은 빈 목록이다(설계 3-2). 그럴 때만 기계
    읽기를 쓴다.

    기계 읽기의 원본은 `effects_auto` 에 통째로 남는다 — 사람 값이 이겼을 때도
    그렇다. 나중에 둘이 어긋난 자리를 사람이 찾아볼 수 있어야 한다.
    """
    # **라벨의 `effects` 도 안 읽는다**(2026-09-19) — `font` 와 같은 까닭이다.
    if auto and not auto.get("fallback"):
        return list(auto.get("found") or []), "기계"
    return [], "모름"


# 줄 간격이 이보다 작으면 **못 잰 것으로 본다.**
#
# 줄 사이가 글자 키보다 좁으면 글자가 서로 겹친다 — 어떤 디자인도 그렇게 안
# 만든다. 그런 값이 나왔다는 건 「줄」이라고 묶은 것이 실은 나란히 놓인 딴
# 덩어리였다는 뜻이다(OCR 이 가끔 그런다).
#
# 실측(2026-08-28, DSC61jCEusn 표지): 119pt 제목의 줄 간격이 **0.57** 로 나와
# 줄 사이가 68px 이었다. 그대로 구우니 세 줄이 서로 포개져 읽을 수 없었다.
최소줄간격 = 1.0


def _leading(lines: list[dict], pt: float | None) -> float:
    """줄 간격 / 글자 크기. 줄이 둘 미만이거나 크기를 못 재면 0.0.

    **겹칠 값은 안 낸다.** 0.0 을 내면 뒤에서 기본값(1.32)을 쓴다 — 잘못 잰
    값을 그대로 싣는 것보다, 못 쟀다고 하고 무난한 값을 쓰는 편이 훨씬 낫다.
    """
    if not pt or len(lines) < 2:
        return 0.0
    tops = sorted((l["box"][1] + l["box"][3]) / 2 for l in lines)
    gaps = [b - a for a, b in zip(tops, tops[1:])]
    if not gaps:
        return 0.0
    잰것 = round(statistics.median(gaps) / pt, 2)
    if 잰것 < 최소줄간격:
        print(f"!! 줄 간격 {잰것} 은 글자가 겹치는 값이다 — 못 잰 것으로 둔다")
        return 0.0
    return 잰것


# 이웃 줄 사이 «빈 공간» 이 보통(중앙값)의 이 배수를 넘으면 그 사이에 빈 줄이
# 있던 것으로 본다.
#
# 실측 DG0AA6PJ8s4 2번 장(2026-09-18): 줄 틈이 18~25px 인 사이에 90px 이 둘 —
# 원본의 문단 나눔이다. 줄 글자만 이어 붙이면 그 나눔이 사라져 세 문단이 한
# 덩어리로 위에 몰렸다.
문단틈배수 = 2.0


def _문단줄(lines: list[dict]) -> list[str]:
    """줄 글자 목록. 문단이 갈리던 자리에 빈 줄("")을 하나 끼운다.

    틈은 «앞 줄 아래 끝 → 다음 줄 위 끝» 의 빈 공간이다. 줄이 둘이면 틈이 그
    하나뿐이라 «보통» 을 잴 수 없어 아무것도 안 끼운다. 빈 줄은 `text` 에만
    들어가고 `lines`(줄 수)·`line_detail` 에는 안 들어간다 — 잰 것이 없다.
    """
    글들 = [l["text"] for l in lines]
    if len(lines) < 3:
        return 글들
    틈들 = [nxt["box"][1] - prv["box"][3] for prv, nxt in zip(lines, lines[1:])]
    보통 = statistics.median(틈들)
    난것 = [글들[0]]
    for 틈, 글 in zip(틈들, 글들[1:]):
        if 보통 > 0 and 틈 > 보통 * 문단틈배수:
            난것.append("")
        난것.append(글)
    return 난것


def _block_color(line_colors: list[str | None]) -> str | None:
    """줄색(`layout.line_color()`, 최빈색)들의 최빈값. 평균은 어디에도 안 쓴다."""
    colors = [c for c in line_colors if c]
    if not colors:
        return None
    return Counter(colors).most_common(1)[0][0]


def line_detail(img, lines: list[dict], weights: list[str], colors: list[str | None],
                k: float, photo_boxes: list[list[float]] = ()) -> list[dict]:
    """줄마다의 값. **덩어리 한 벌로 접기 전의 것**이다.

    덩어리 값(`pt`·`weight`·`color`)은 이 목록을 중앙값·다수결·최빈값으로 접은
    것이라, 덩어리 **안에서** 달라지는 것은 접히는 순간 사라진다. 형광펜이
    그렇고(줄마다 다르다 → `back`), 두 줄 제목의 굵기가 그렇다. 접은 값은 그대로
    두고 접기 전 것을 **덧붙인다** — `verify_labeled` 와 규칙표가 덩어리 값을
    이미 읽고 있어서다.

    **사진·인물 위에 걸친 줄은 형광펜을 재지 않는다** — `PHOTO_OVERLAP_MAX` 참고.
    """
    out = []
    for i, (l, weight, color) in enumerate(zip(lines, weights, colors)):
        ih = layout.ink_height(l)
        overlap = _photo_overlap(l["box"], photo_boxes)
        if overlap > PHOTO_OVERLAP_MAX:
            back = {"runs": [], "fallback": True,
                    "why": f"사진·인물 네모와 {overlap:.2f} 겹친다 — "
                           "형광펜은 디자이너가 깐 띠를 전제하는데 이건 그게 아니다"}
        else:
            back = lineback.back_of(img, l["box"], color)
        # 효과(외곽선·밑줄)는 `back` 이 찾은 띠 색을 기준으로 잰다 — 그래서 띠를
        # 못 가린 줄은 효과도 안 잰다(`effects.of_line`). 사진 위 글자가 그 자리다.
        nxt = lines[i + 1]["box"][1] if i + 1 < len(lines) else None
        out.append({
            "text": l["text"],
            "box": list(l["box"]),
            "pt": round(ih / k) if ih else None,
            "weight": weight,
            "color": color,
            "back": back,
            "effects": effects.of_line(img, l["box"], color, back, nxt),
        })
    return out


# ---------------------------------------------------------------- 딴 줄 버리기
#
# **사진에서 온 줄 하나가 크기·굵기·색·정렬 넷을 다 흔든다**(실물 2026-09-15,
# DSW-6lrk5rs). 6번 장 제목 네모에 병 라벨의 잔글씨 「3」이 같이 읽혀 제목 pt 가
# 두 줄의 중간값(31)으로 내려앉고, 새 제목이 «1번째 줄» 의 가늘고 갈색인 값을
# 받았다. 7번 장 본문 네모에는 폰 캡처 속 「맛있는 밀키트」 가 끼어 정렬이
# «가운데» 로 갈렸고 2번째 줄이 굵어졌다. 아래 통계가 «줄들을 합쳐» 내는 값이라
# 잘못된 줄 하나가 전체를 끌고 간다.
#
# 한 네모는 한 글 덩어리다 — 크기가 같고 한 축으로 정렬돼 있다. 그 둘에서 크게
# 벗어난 줄은 통계에 넣기 전에 뺀다. 글자 수로 무게를 줘서 «긴 줄이 진짜» 다 —
# 두 줄뿐일 때 어느 쪽이 딴 줄인지 가르는 잣대다.

크기벗어남 = 0.35    # 대표 크기에서 이 비율 넘게 벗어나면 딴 줄. 같은 덩어리는 ±10% 안이다
자리벗어남배 = 2.0   # 정렬 축에서 대표 크기의 이 배수 넘게 벗어나면 딴 줄. 들여쓰기는 한 자쯤이다
자리벗어남최소 = 24  # 크기를 모를 때의 문턱(px)


def _무게중앙값(값들: list, 무게들: list) -> float:
    짝 = sorted(zip(값들, 무게들))
    총 = sum(무게들)
    누적 = 0
    for v, w in 짝:
        누적 += w
        if 누적 * 2 >= 총:
            return v
    return 짝[-1][0]


def _흩어짐(값들: list, 무게들: list) -> float:
    m = _무게중앙값(값들, 무게들)
    return sum(w * abs(v - m) for v, w in zip(값들, 무게들)) / sum(무게들)


def 딴줄버리기(lines: list, k: float) -> tuple[list, list]:
    """`(남은 줄들, 버린 줄들)`. 버린 줄에는 `why` 가 붙는다.

    ① 크기 — 잉크 높이÷k 가 글자 수로 무게 준 중앙값에서 `크기벗어남` 넘게
      벗어나면 뺀다. 못 잰 줄(라틴만 있는 줄)은 모르는 것이라 안 뺀다.
    ② 자리 — 남은 줄들로 정렬 축(왼쪽·가운데·오른쪽 중 덜 흩어진 쪽)을 잡고,
      그 축에서 대표 크기의 `자리벗어남배` 넘게 벗어난 줄을 뺀다.

    한 줄뿐이면 그대로다. 다 버리지는 않는다.
    """
    if len(lines) < 2:
        return list(lines), []
    무게 = [max(1, len((l.get("text") or "").strip())) for l in lines]
    pts = [(ih / k) if (ih := layout.ink_height(l)) else None for l in lines]
    버린 = []

    있는 = [(p, w) for p, w in zip(pts, 무게) if p]
    남은 = list(zip(lines, 무게, pts))
    if len(있는) >= 2:
        대표 = _무게중앙값([p for p, _ in 있는], [w for _, w in 있는])
        지킴 = []
        for l, w, p in 남은:
            if p and 대표 and abs(p - 대표) / 대표 > 크기벗어남:
                버린.append({**l, "why": f"크기 {p:.0f} 가 대표 {대표:.0f} 에서 벗어난다"})
            else:
                지킴.append((l, w, p))
        if 지킴:
            남은 = 지킴

    if len(남은) >= 2:
        줄들 = [l for l, _, _ in 남은]
        무게들 = [w for _, w, _ in 남은]
        left = [l["box"][0] for l in 줄들]
        right = [l["box"][2] for l in 줄들]
        center = [(a + b) / 2 for a, b in zip(left, right)]
        축들 = {"왼쪽": left, "가운데": center, "오른쪽": right}
        축 = min(축들, key=lambda a: _흩어짐(축들[a], 무게들))
        기준 = _무게중앙값(축들[축], 무게들)
        있는 = [(p, w) for _, w, p in 남은 if p]
        대표 = _무게중앙값([p for p, _ in 있는], [w for _, w in 있는]) if 있는 else None
        문턱 = max(자리벗어남최소, 자리벗어남배 * 대표) if 대표 else 자리벗어남최소
        지킴 = []
        for (l, w, p), v in zip(남은, 축들[축]):
            if abs(v - 기준) > 문턱:
                버린.append({**l, "why": f"{축} 끝이 {v:.0f} 로 나머지({기준:.0f})에서 벗어난다"})
            else:
                지킴.append((l, w, p))
        if 지킴:
            남은 = 지킴
    return [l for l, _, _ in 남은], 버린


def block(img, resp: dict, box, scale: float, cal: dict,
          photo_boxes: list[list[float]] = ()) -> dict:
    """글자 네모 하나를 잰다. `box` 는 원본 픽셀 좌표, `resp` 는 그 네모의
    `글자읽기.read_slide()` 가 낸 것(글자 상자는 이미 1080 공간). `photo_boxes`
    는 같은 장의 사진·인물 네모(1080 공간) — `line_detail()` 의 형광펜 관문에 쓴다.

    **OCR 자체가 실패한 네모(`resp["error"]`)는 배경 픽셀을 재지 않는다.**
    글자가 없는데 `_weight`·`_family` 를 그 자리 배경에 돌리면 굵기·글씨체가
    그럴듯하게 나오지만 근거가 없다(무엇을 쟀는지 답할 수 없다). `cutout.py`
    의 `cut_slide()` 가 SAM 실패를 남기는 것과 같은 모양(`fallback: True` +
    `why`)으로 남기고, `ruler/text.py::empty()` 의 "값을 못 잰 장" 관례를 그대로
    빌려 `align: "없음"` 을 쓴다.
    """
    if resp.get("error"):
        return {
            "text": "", "pt": None, "weight": None, "family": None, "color": None,
            "font_match": fontmatch._fail(f"OCR 이 실패한 네모다 — {resp['error']}"),
            "effects_auto": effects._fail(f"OCR 이 실패한 네모다 — {resp['error']}"),
            "align": "없음", "leading": 0.0, "lines": 0, "line_detail": [],
            "fallback": True, "why": resp["error"],
        }

    scaled_box = [round(v * scale) for v in box]
    syms = [s for s in resp.get("symbols", []) if inside(scaled_box, s["box"])]
    lines, 버린줄 = 딴줄버리기(layout.group_lines(syms), cal["hangul_ink_ratio"])
    for b in 버린줄:
        print(f"!! 딴 줄 버림: 「{b['text']}」 — {b['why']}")

    k = cal["hangul_ink_ratio"]
    잰것들 = [layout.잰것(l) for l in lines]
    pts = [ih / k for ih, _ in 잰것들 if ih]
    pt_raw = statistics.median(pts) if pts else None
    # **무엇으로 쟀는지 남긴다**(사람 지시 2026-09-22). 한글이 아닌 잣대는 덜
    # 정확해서, 점검이 이 값을 보고 「영문이라 크기를 덜 정확히 쟀다」를 알린다.
    갈래들 = [g for ih, g in 잰것들 if ih]
    잰갈래 = max(갈래들, key=layout.잣대차례.index) if 갈래들 else ""

    # 굵기는 네모 전체를 한 번에 재지 않는다 — stroke_ratio() 는 획두께÷잉크높이라
    # 줄이 여러 개면 분모가 (줄 수 × 행간)로 불어나 진짜 Bold 도 문턱값 밑으로
    # 갈린다(직접 재현: 말군고딕볼드 48px 로 합성한 네모, 문턱값 0.0704 —
    # 1줄 전체 0.0889(Bold) · 2줄 전체 0.0331(Regular, 줄별로는 [0.0889, 0.0889]
    # 둘 다 Bold) · 4줄 전체 0.0147(Regular, 줄별 넷 다 Bold)). `ruler/text.py::
    # measure()` 가 이미 하던 대로 줄마다 재서 다수결한다.
    wts = [rtext._weight(img, l["box"])[0] for l in lines]
    weight = (("Bold" if sum(w == "Bold" for w in wts) * 2 >= len(wts) else "Regular")
              if wts else rtext._weight(img, scaled_box)[0])
    # family 는 획두께를 잉크높이로 나누지 않아(가로세로 편차만 본다) 줄 수에
    # 안 흔들린다 — 네모 전체로 한 번만 재도 된다(직접 재현: 같은 합성으로 1줄·
    # 4줄 다 "고딕" 로 동일).
    family = rtext._family(img, scaled_box)
    colors = [layout.line_color(img, l) for l in lines]
    block_color = _block_color(colors)
    # 글씨체는 8종을 실제로 그려 글리프끼리 겹쳐 본다(`fontmatch`). **자신 있게
    # 가릴 때만 이름이 나온다** — 못 가리면 사람이 고른 값(없으면 계열 기본값)이
    # 그대로 선다(`choose_font`).
    fmatch = fontmatch.match(img, syms, block_color, weight)
    detail = line_detail(img, lines, wts, colors, k, photo_boxes)

    return {
        "text": "\n".join(_문단줄(lines)),
        "pt": round(pt_raw) if pt_raw else None,
        "잰갈래": 잰갈래,
        "weight": weight,
        "family": family,
        "color": block_color,
        "font_match": fmatch,
        "effects_auto": effects.of_block([d["effects"] for d in detail]),
        "align": rtext._align(lines),
        "leading": _leading(lines, pt_raw),
        "lines": len(lines),
        # 버린 줄 — 무엇을 왜 뺐는지 남긴다(`딴줄버리기`).
        "dropped_lines": [{"text": b["text"], "why": b["why"]} for b in 버린줄],
        # 접기 전의 줄 단위 값 — 형광펜(`back`)과 줄별 효과가 여기에만 남는다.
        "line_detail": detail,
    }


def slide_text(pid: str, index: int, boxes: list[dict], reads: dict) -> list[dict]:
    """한 장의 글자 네모를 전부 잰다. `reads` 는 `글자읽기.read_slide()` 의 결과."""
    img, scale = normalize.load(config.IMAGES / pid / f"{index:02d}.jpg")
    cal = config.cal()
    photo_boxes = [[round(v * scale) for v in b["box"]]
                   for b in boxes if b.get("kind") in ("사진", "인물")]
    out = []
    for b in boxes:
        if not config.글자를_재나(b):
            continue
        resp = reads.get(b["id"], {"symbols": []})
        blk = block(img, resp, b["box"], scale, cal, photo_boxes)
        name, by = choose_font(b, blk["family"], blk.get("font_match"))
        eff, eff_by = choose_effects(b, blk.get("effects_auto"))
        out.append({
            "id": b["id"],
            "font": name,
            "font_by": by,
            "effects": eff,
            "effects_by": eff_by,
            **blk,
        })
    # 위계는 **장 단위**라 덩어리를 다 잰 뒤에야 붙일 수 있다 — 「그 장 Bold 중
    # 최대」가 분모다(`levels_of`).
    # **사람이 못 박았으면 그것이 이긴다.** 규칙(「그 장 Bold 중 최대 pt 의 90%
    # 이상이면 제목」)은 실물 일곱 장에서 한 장도 안 틀렸지만, 한 장에 제목이
    # 둘이거나 꼬리표가 제목만 한 게시물이 오면 갈릴 수밖에 없다. 사람이 보면
    # 아는 것을 못 적게 할 이유가 없다(사람 결정 2026-08-27).
    #
    # 글씨체·효과를 뺀 것과 다른 점: 그 둘은 사람이 한 번도 안 쓴 칸이었고,
    # 이건 사람 눈이 기계보다 확실한 자리다.
    사람말 = {b["id"]: b.get("위계") for b in boxes if b.get("위계")}
    for blk, level in zip(out, levels_of(out)):
        blk["level"] = 사람말.get(blk["id"]) or level
        blk["level_by"] = "사람" if 사람말.get(blk["id"]) else "기계"
    return out
