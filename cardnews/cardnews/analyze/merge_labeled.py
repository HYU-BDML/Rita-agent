# analyze/merge_labeled.py
"""라벨에서 나온 계량을 게시물 하나치로 합치고, 배경은 **잔여**로 정한다.

**왜 잔여인가.** 배경은 사람이 긋지 않는다 — 다 긋고 남는 자리가 배경이다.
옛 갈래는 "가장자리 12px 띠"를 배경으로 봤는데, 도형이 가장자리에 닿거나
배경이 그라데이션이면 그대로 오판한다. 여기서는 모든 라벨 네모(누끼가 있으면
그 마스크)를 지우고 남은 픽셀만 `tint.judge()` 에 넣는다.

**좌표계.** 이 모듈이 다루는 픽셀 작업은 전부 `normalize.load()` 가 준 1080폭
배열 위에서 한다(`config.CANVAS_W`). 그런데 들어오는 것들의 자는 서로 다르다:

| 출처 | 자 |
|---|---|
| `data/labels/<코드>.json` 의 `box` | **원본 해상도** (브라우저가 준 값) |
| `글자읽기.read_slide()` · `layout_labeled.slide_text()` | 이미 1080 |
| `cutout.cut_slide()` 의 `box`·`w`·`h`·`테두리`·`구멍` | 이미 1080 |

그래서 여기서 배율(`scale`)을 곱하는 곳은 라벨 네모(`merge_one` 의 `scale`
인자) 한 군데뿐이다 — `cutout.cut_slide()` 가 내는 값은 죄다 자기 안에서 이미
1080 으로 옮겨 담아 준다(원본 해상도 배열에 대고 딴 테두리를 `s` 를 곱해
1080 으로 되돌리는 일은 그쪽이 한다). 이미 1080 인 값에 또 곱하면 조용히
어긋난다(직접 셈, `data/images/` 250장: 30건 중 **12건**의 1번 장이 1080폭이
아니고, 장 단위로 세면 폭이 **11가지**다 — 1080·1152·1158·1440·1638·1639·
3240·3263·3273·3277·3278. 최대/최소 3.04배(3278/1080). 한 게시물 안에서 장마다
폭이 다른 건도 4건 있다: DbXr2IbGtk0·DTNWxi-AQxR·DZAKCV7D91C·DZhFe-iGv7s).

**장 번호는 문자열로 저장돼 있다.** `fetch_labels.by_index()` 는 `dict[int, dict]`
를 만들지만 JSON 으로 쓰는 순간 키가 문자열이 된다(실측: `sorted(json.load(...))`
가 `['1','2',...,'7']`). 정수로 되돌리지 않으면 장마다 조회가 조용히 빗나간다.

**망을 타는 곳은 셋이다** — 글자 읽기(`글자읽기`) · 누끼(`cutout`) · 딥시크
(`tone_labeled`). 여기에 게시판 쪽이 둘 더 붙는다: 라벨 새로 받기
(`build(pull=True)` → `claim`+`fetch_labels.pull`)와 상태 바꾸기
(`build(publish=True)` → `fetch_labels.finish`). 둘 다 기본값이 꺼짐이다 —
시험이 게시물 상태를 건드리면 안 되기 때문이다. 명령줄(`main()`)은 둘 다 켠다.
"""
import datetime
import hashlib
import io
import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config
import cutout
import fetch_labels
import layout_labeled
import 글자읽기
import 배경판
import 번호판
import gpt누끼
import gpt바닥판
import 창고캐시
import tint
import 테두리재기
import tone_labeled
from ruler import normalize

# `tint.judge` 는 유효 격자가 이보다 적으면 **재지 않고** 최빈색으로 떨어진다
# (tint.py 의 `if int(valid.sum()) < 4`). 그 갈래로 나온 값은 "잰 것"이 아니므로
# 여기서 「단색」이라 적지 않는다(`_mark`).
MIN_CELLS = 4
# 강조색 후보의 조건(설계 5-5: 채도 높고 · 면적 작고 · 배경에서 멀다).
ACCENT_MAX_AREA = 0.25    # 카드 면적의 이보다 크면 강조가 아니라 판이다
# **첫 추정치다 — 실물이 아직 이 관문을 밟은 적이 없다.** 라벨이 붙은 게시물
# DHqCBQnRAjW 7장에 0.05·0.25·1.0 을 넣어 다시 돌려 봤는데 장별 hex 일곱 개도
# 게시물 값도 셋이 완전히 같다(0.01 로 조여야 비로소 바뀐다). 아래 채도 자와 달리
# 이 값은 측정으로 고른 게 아니라 골라 놓고 아직 반증도 확증도 못 얻은 값이다.
# 채도는 `(최대채널-최소채널)/255` 다(`_chroma`). HSV 의 S(=(max-min)/max)가 아니다 —
# 실측(DHqCBQnRAjW 7장, 배경 ΔE 10.0 관문 통과 화소의 최빈 구간):
# S 로 재면 2·3번 장은 형광펜을 집지만 **4·5·6번 장은 본문 검정 `#010401` 을
# 강조색으로 집는다**(거의 검정은 V 가 1~8이라 채널이 1만 달라도 S 가 0.5 로 튄다).
# `(max-min)/255` 로 바꾸면 검정 구간이 통째로 사라지고 7장이 전부 브랜드 연두를
# 집는다(#AEFD58 · #C9FC95 · #C9FC94 ×3 · #C9FC95 · #AEFF5A).
ACCENT_MIN_SAT = 0.35
# 위 자에서 잰 값: 형광펜 #C9FC95 는 0.404, 표지 연두 #AEFD58 은 0.647,
# 크림 배경 #F1FFE5 는 0.102, 1번 장 사진의 살색 #A78867 은 0.251 —
# 0.35 는 "사진 살색"과 "형광펜" 사이에 있다.
ACCENT_MIN_DE = 10.0      # 배경색과의 LAB 거리
# 이것도 **첫 추정치이고, 실물이 아직 이 관문을 밟은 적이 없다.** 같은 7장에
# 0·5·10·20 을 넣어도 장별 hex 도 게시물 값도 한 글자가 안 바뀐다(40 에서야
# 바뀐다). 즉 이 게시물에서 실제로 일하는 관문은 `ACCENT_MIN_SAT` 하나뿐이다.
# 라벨된 게시물이 30건 중 1건뿐이라 지금은 이 둘을 제대로 잴 방법이 없다 —
# 라벨이 늘면 다시 재라. 안 잰 값을 잰 값처럼 적지 않으려고 여기 적어 둔다.
# 강조색을 못 낼 종류 — 사진·인물의 색은 "디자이너가 고른 색"이 아니다.
ACCENT_SKIP = ("사진", "인물")

# **색을 아예 안 재는 종류.** 사람 결정(2026-08-20): 「장식이나 로고는 디자인
# 분석할 필요없어」. 범위를 줄인 것만이 아니다 — 라벨이 붙은 실물 게시물
# `DHqCBQnRAjW` 의 **로고 6개가 전부 「미측정」이었다**(유효 격자 2·3·0·0·0·0칸.
# `tint.judge` 의 격자는 네모가 아니라 그림 전체를 나누므로 작은 네모는 칸을
# 못 채운다 — `_color_of` 의 주석 참고). 필요도 없는 것을 재려다 실패하고 있었다.
#
# **「도형」은 여기 없다 — 뺀 게 아니라 원래부터 없었다(확인 2026-08-26,
# task A9).** 카드뉴스의 「검은 알약」·초록 하트 같은 글자그릇은 색이 곧
# 디자인이다. 로고로 그으면 색이 통째로 버려져 회색 네모가 됐던 게 실제
# 사고였다 — 그래서 「도형」은 로고와 갈래를 같이 쓰지 않는다. 다음에 누가
# 이 목록에 「도형」을 넣으면 A9 이 되돌린 그 사고가 재발한다.
COLOR_SKIP = ("장식", "로고")
# 「안 잼」과 「미측정」은 **다른 말이다.** 미측정 = 재려다 못 쟀다(`_mark`),
# 안 잼 = 애초에 안 잰다. 둘이 같아 보이면 이 저장소가 여섯 번 고쳐 온 그 병
# (틀린 값이 맞는 값과 똑같이 생김)이 그대로 돌아온다. 그래서 실패가 지는
# `fallback` 을 안 지고 `by_design` 을 지며, **잰 근거(`cells`·`cover`)를 아예
# 안 싣는다** — 0칸이라고 적으면 「0칸이라 포기했다」로 읽힌다.
NO_COLOR = "안 잼"


# 둘레 선을 재는 갈래. 글자칸은 안 잰다 — 그 네모는 글을 감싸려고 그은 것이다.
선잴갈래 = ("사진", "도형", "장식")


def no_color(kind: str) -> dict:
    """`COLOR_SKIP` 종류가 낼 색 자리. 값이 아니라 **안 쟀다는 기록**이다."""
    return {"kind": NO_COLOR, "by_design": True, "hex": None,
            "why": f"{kind}는 색을 재지 않는다 — 자리만 쓴다(사람 결정 2026-08-20)"}


def labels_of(pid: str) -> Path:
    return config.DATA / "labels" / f"{pid}.json"


def load_labels(pid: str) -> dict[int, dict]:
    """`data/labels/<코드>.json` 을 읽어 **정수** 장번호로 돌려준다."""
    doc = json.loads(labels_of(pid).read_text(encoding="utf-8"))
    return {int(k): v for k, v in doc.items()}


# ---------------------------------------------------------------- 라벨 신선도

LOCAL = "로컬 사본"
SERVER = "서버에서 새로 받음"


def digest(pid: str) -> str | None:
    """로컬 라벨 파일의 지문. 파일이 없으면 None."""
    p = labels_of(pid)
    if not p.exists():
        return None
    return hashlib.sha256(p.read_bytes()).hexdigest()[:12]


def freshness(pid: str, source: str = LOCAL, changed: bool | None = None) -> dict:
    """계량표에 **라벨이 어디서 언제 온 것인지** 를 적는다.

    **왜 적나.** `merge_labeled` 는 여태 로컬 사본만 읽고 서버를 안 봤다. 사람이
    게시판에서 라벨을 고치고 다시 돌려도 옛 라벨로 재고, 그 결과물은 갓 잰
    것과 **글자 하나 다르지 않게 생겼다** — 이 저장소가 여섯 번 고쳐 온 병이
    바로 그 모양이다(틀린 값이 맞는 값과 똑같이 생김). 그러니 값이 아니라
    **출처와 시각**을 계량표가 지고 있어야 한다.

    `changed` 는 서버에서 받았을 때만 참·거짓이다. 안 받았으면 「비교한 적 없음」
    이라 `None` 이고, 그것이 곧 「이 계량표는 묵은 라벨일 수 있다」는 뜻이다.
    """
    p = labels_of(pid)
    at = (datetime.datetime.fromtimestamp(p.stat().st_mtime)
          .replace(microsecond=0).isoformat() if p.exists() else None)
    boxes = sum(len(s.get("boxes", [])) for s in load_labels(pid).values()) if p.exists() else 0
    return {"source": source, "at": at, "digest": digest(pid),
            "boxes": boxes, "changed": changed}


# ---------------------------------------------------------------- 잔여

def _mask_of(region: dict, shape: tuple[int, int]) -> np.ndarray | None:
    """이 네모가 마스크를 갖고 있으면 그 마스크, 없으면 None(네모 그대로 쓴다).

    크기가 그림과 다르면 죽는다 — numpy 는 어긋난 마스크로 인덱싱해도 아무 말
    없이 자르기만 해서, 빼야 할 자리가 안 빠진 채로 배경 판정이 나온다.
    """
    # **`rle` 갈래는 없앴다.** 누끼 엔진이 SAM 에서 배경 흘려채우기로 바뀌면서
    # 아무도 `rle` 을 안 만든다(실측: `analyze/` 에 쓰는 곳이 0). 죽은 줄 하나를
    # 살려 두느라 `pycocotools` 를 통째로 지고 다닐 이유가 없다 — 분석을 서버
    # 상자에 담을 때 그것이 제일 무거운 짐이었다.
    m = region.get("mask")
    if m is None:
        return None
    if m.shape != shape:
        raise ValueError(f"마스크 크기 {m.shape} 가 그림 크기 {shape} 와 다르다")
    return m


def residual(img: np.ndarray, regions: list[dict], rgb: np.ndarray | None = None) -> np.ndarray:
    """모든 네모(누끼가 있으면 마스크)를 뺀 잔여 마스크.

    `regions` 의 `box`·`mask`·`rle` 는 **`img` 와 같은 자**여야 한다. 여기서는
    배율을 안 곱한다 — 부르는 쪽(`build`)이 이미 1080 으로 맞춰서 넘긴다.

    **글자 네모도 통째로 뺀다**(사람 결정 2026-09-18: 「야 획 말고 그냥 내가
    글자 라벨링 칠한 그 공간 있잖아, 그걸 지워」). 한동안 «획만» 빼 봤는데,
    그건 지워진 자리를 지어내야 하니 되도록 적게 버리자는 셈이었다. 바닥판이
    제대로 생긴 뒤로는 지어낼 일이 없어(그 자리에 바닥판이 깔린다) 얻는 것 없이
    탈만 남았다 — 칸 안에 형광펜·사진이 깔리면 바탕색이 뒤집혔고(실물
    DG0AA6PJ8s4 1번 장), 부드러운 경계가 문턱을 못 넘어 얼룩이 남았다.

    `rgb` 는 그 시절 자취다. 부르는 쪽을 한꺼번에 고치지 않으려고 받기만 하고
    안 쓴다.
    """
    h, w = img.shape[:2]
    out = np.ones((h, w), bool)
    for r in regions:
        m = _mask_of(r, (h, w))
        if m is not None:
            out &= ~m
            continue
        x0, y0, x1, y1 = (int(round(v)) for v in r["box"])
        out[max(0, y0):max(0, y1), max(0, x0):max(0, x1)] = False
    return out


def 배경판저장(pid: str, index: int, png: bytes) -> str:
    """배경판 PNG 를 저장하고 «상대 열쇠» 를 돌려준다.

    누끼 PNG(`cutout.put_png`)와 같은 결이다 — 계량표에는 열쇠만 담고, 창고에
    올리는 일은 부르는 쪽(분석 Lambda)이 한다.
    """
    키 = f"{pid}/{index:02d}.png"
    자리 = config.DATA / "배경판" / 키
    자리.parent.mkdir(parents=True, exist_ok=True)
    자리.write_bytes(png)
    return 키


def 바닥판저장(pid: str, png: bytes, 번호: int = 0) -> str:
    """게시물의 «그냥 배경» PNG 를 저장하고 «상대 열쇠» 를 돌려준다. 배경판과 같은 결.

    `번호` 는 종이 묶음의 차례다 — 종이가 두 종류면 판도 둘이다(사람 결정 2026-09-19:
    「파란색 바닥판이면 그거 쓰고 회색 바닥판이면 그거 써야지」). 0 번은 `base.png` 로
    두어 옛 계량표·틀과 이름이 안 갈린다.
    """
    # **이름은 영문이다** — 배경판 주소는 아스키여야 한다(`틀점검` ③).
    키 = f"{pid}/base.png" if 번호 == 0 else f"{pid}/base-{번호}.png"
    자리 = config.DATA / "배경판" / 키
    자리.parent.mkdir(parents=True, exist_ok=True)
    자리.write_bytes(png)
    return 키


# 바닥판 감이 되는 배경 갈래.
#
# **단색만 받으면 안 된다**(사람 결정 2026-09-17: 「그냥 바닥판은 고정하라니까?」).
# 실물 DYWiVHhlNwo 는 열 장이 모두 그라데이션이라 후보가 0개였고, 바닥판 없이
# 여섯 장이 각자 제 바닥을 떠서 질감이 갈렸다(점 445·455·447·415·446·458개).
#
# 사진 배경은 안 받는다 — 남의 사진이라 못 가져온다. 그런 장은 새 사진이 덮는다.
바닥감갈래 = ("단색", "그라데이션")


def 바닥감인가(bg: dict) -> bool:
    """이 장의 배경을 게시물 바닥판 감으로 쓸 수 있나 — 위 `바닥감갈래` 참고."""
    return bg.get("kind") in 바닥감갈래


def 바닥판(pid: str, 후보: list) -> tuple[dict | None, np.ndarray | None]:
    """게시물의 «그냥 배경» 한 장 — `({"hex", "판"}, 깐 그림)`. 못 뜨면 `(None, None)`.

    **바닥은 게시물에 하나고 장마다 안 달라진다**(사람 결정 2026-09-15·2026-09-17:
    「그냥 바닥판은 고정하라니까? 왜 바닥판이 슬라이드마다 달라지냐고」). 배경판은
    그 장의 선·동그라미까지 든 «나머지 전부» 라 바닥으로 못 쓴다.

    **네모가 적은 장부터 처음 되는 것을 쓰지 않는다.** 실물 DSW-6lrk5rs 는 네모가
    가장 적은 장이 10번인데 그 장만 질감 없는 순백이라, 그 규칙이 밋밋한 바닥판을
    골랐다. 지금은 `배경판.바닥고르기` 가 질감을 재서 가장 잘 나온 장을 고른다.

    `후보` 는 단색 장마다 `(네모수, hex, rgb, 남음)`.
    """
    고른것 = 배경판.바닥고르기(후보)
    if 고른것 is None:
        return None, None
    hex글, rgb, 남음 = 고른것
    png = 배경판.바닥뜨기(rgb, 남음)
    if not png:
        return None, None
    깐것 = np.asarray(Image.open(io.BytesIO(png)).convert("RGB"))
    return {"hex": hex글, "판": 바닥판저장(pid, png)}, 깐것


def 글자읽기한장(pid: str, index: int, boxes: list) -> dict:
    """그 장의 글자 네모를 읽는다 — **값싼 모델 하나뿐이다.**

    사람이 네모를 그어 주므로 **자리는 이미 안다.** 거기서 실제로 얻어 쓰는 것은
    「줄이 몇 개·어디」·「글자 크기」·「글자 내용」 셋인데, 앞의 둘은 화소로 공짜로
    잰다(`글자읽기`). 남는 것은 글자 내용 하나다.

    **실측**(게시물 `DHqCBQnRAjW`, 글자 네모 17개, 2026-09-24):

    | | 글자 닮음 | 줄 수 일치 | 크기 0.9~1.1 | 17개 값 |
    |---|---|---|---|---|
    | 루나 + 화소 | **1.00** | **17/17** | 16/17 | **$0.0034** |
    | 구글 비전 | 1.00(정답지) | 17/17 | 17/17 | $0.0255 |

    **물러설 곳이 없다** — 구글 비전은 통째로 뺐다(사람 지시 2026-09-24).
    열쇠가 없거나 한 판이 통째로 실패하면 **여기서 터뜨린다.** 조용히 넘어가면
    글자가 빈 틀이 창고에 쌓이고, 사람은 「왜 안 되는지」를 못 본다.
    네모 «하나» 가 실패하는 것은 다르다 — `글자읽기` 가 그 네모에만 `error` 를
    담아 낸다.
    """
    if not any(config.글자를_재나(b) for b in (boxes or [])):
        return {}
    if not 글자읽기.있나():
        raise RuntimeError(
            "글자를 읽을 수 없다 — OPENROUTER_API_KEY 가 비어 있다. "
            "분석 람다(cardnews-analyze)의 환경변수를 보라")
    return 글자읽기.read_slide(pid, index, boxes)


바닥판캐시칸 = "platecache"

# **만드는 법의 세대.** 캐시에 담기는 것은 «완성된 판» 이라, 만드는 법이 바뀌어도 열쇠가
# 같으면 옛 판이 꺼내져 새 코드가 영영 안 돈다. 법이 바뀔 때 이 표시를 올린다.
# 「색검산」: 2026-09-28 — 검산을 화소 비교에서 대략의 색 비교로 바꾼 판. (같은 날
# 「되돌리기」 세대를 한 번 떴다가 라벨 자리가 네모로 비쳐 뺐다 — GPT 그림 그대로.)
바닥판세대 = "색검산"


def 바닥판열쇠(pid: str, 고른: int, 네모들: list, w: int, h: int) -> str:
    """바닥판 캐시 열쇠 — 고른 장·그 장의 라벨 네모·캔버스 크기·만드는 법의 세대."""
    return 창고캐시.열쇠(바닥판캐시칸, pid, 고른, 네모들, w, h, 바닥판세대)


def GPT바닥판(pid: str, 장들: list) -> list:
    """«GPT 바닥판»(사람 결정 2026-09-19) — **종이 묶음마다 하나씩** 만든다.

    「파란색 바닥판이면 그거 쓰고 회색 바닥판이면 그거 써야지」(2026-09-19). 실물
    파스텔(DNUFIa4NIkK)은 2장이 파란 종이·7장이 하늘색·3~6장이 회색이라, 한 장으로
    뜨면 일곱 중 다섯에 엉뚱한 판이 깔린다.

    돌려주는 것: `[{"hex", "판", "깐것", "장들"}, …]` — 큰 묶음부터. 하나도 못 만들면
    빈 목록이고, 부르는 쪽이 옛 바닥판(`바닥판`)으로 간다.
    """
    if not gpt누끼.있나():
        return []
    묶음들 = gpt바닥막기(장들)
    난것 = []
    GPT성공 = 0
    for 차례, 무리 in enumerate(묶음들):
        고른 = gpt바닥판.고르기(무리, 표지끝빼기=len(묶음들) == 1)
        if 고른 is None:
            continue
        장 = next(s for s in 무리 if s["index"] == 고른)
        w = config.CANVAS_W
        h = round(장["h"] * w / 장["w"])
        # **한 번 뜬 판은 두 번 안 뜬다**(사람 지시 2026-09-24). 한 장에 $0.05 라
        # 라벨을 하나도 안 건드린 재분석에도 게시물마다 $0.05~0.15 가 나갔다.
        #
        # 열쇠는 «무엇을 넣어 떴나» 다 — 고른 장과 **그 장의 라벨 네모들**, 캔버스
        # 크기. 라벨을 하나라도 옮기면 열쇠가 바뀌어 다시 뜬다.
        캐열 = 바닥판열쇠(pid, 고른, 장["네모들"], w, h)
        png = 창고캐시.꺼내기(캐열)
        hex색 = 장["bg"].get("hex")
        if png is None:
            try:
                png = gpt바닥판.만들기(장["img"], 장["네모들"], (w, h))
                창고캐시.담아두기(캐열, png, "image/png")
                GPT성공 += 1
            except Exception as e:  # noqa: BLE001 — 망 실패는 이 묶음만 물러선다
                # **실패는 안 담는다** — 담아 두면 다음 판에도 영영 실패로 나온다.
                # **남의 판도 안 빌린다**(사람 결정 2026-09-28). 실물 DbmjT0Cj8-I 에서
                # 연회색 본문 묶음이 검산에 떨어지자, 판 없는 장은 대표 판을 빌리는
                # 규칙(`make_dsl_cardnews._배경출력`) 탓에 하나뿐인 검정 CTA 판이
                # 모든 장에 깔렸다. 떨어진 묶음은 제 종이색 단색 판을 받는다 —
                # 무늬는 못 살려도 색은 안 틀린다.
                print(f"  GPT 바닥판 실패({고른}번 장): {type(e).__name__}: {e}")
                png, hex색 = _종이색판(장, (w, h))
                if png is None:
                    continue
                print(f"  → 이 묶음은 제 종이색 {hex색} 단색 판으로 간다")
        else:
            GPT성공 += 1
        난것.append({"hex": hex색,
                   "판": 바닥판저장(pid, png, len(난것)),
                   "깐것": np.asarray(Image.open(io.BytesIO(png)).convert("RGB")),
                   "장들": [s["index"] for s in 무리]})
        print(f"  GPT 바닥판 {len(난것)}: {고른}번 장에서 "
              f"(라벨 {len(장['네모들'])}개 지움 · 이 판을 쓰는 장 {난것[-1]['장들']})")
    # **GPT 가 하나도 안 됐으면 단색 판도 안 쓴다** — 옛 바닥판(원본 화소를 떠서 만든
    # 판)이 색도 결도 더 낫다. 단색 판은 «성공한 남의 판을 빌리는 것» 을 막는 자리다.
    if not GPT성공:
        print("  GPT 바닥판: 못 만들었다 — 옛 바닥판으로")
        return []
    return 난것


def gpt바닥막기(장들: list) -> list:
    """종이가 같은 장끼리 묶는다(`gpt바닥판.묶기`). 시험이 갈아 끼우기 쉽게 한 겹 둔다."""
    return gpt바닥판.묶기(장들)


def _종이색판(장: dict, 크기: tuple) -> tuple:
    """그 묶음의 종이색으로만 채운 판 PNG 와 그 hex. 종이색을 못 재면 `(None, None)`.

    묶을 때 쓴 잣대(`gpt바닥판.종이색` — 라벨 안 한 화소의 가장 흔한 색)를 그대로
    쓴다. 다른 셈으로 재면 「이 묶음의 종이」 와 판 색이 갈릴 수 있다.
    """
    색 = gpt바닥판.종이색(장["img"], 장["네모들"])
    if 색 is None:
        return None, None
    rgb = tuple(int(v) for v in 색)
    b = io.BytesIO()
    Image.new("RGB", 크기, rgb).save(b, "PNG")
    return b.getvalue(), "#%02X%02X%02X" % rgb


def background(img: np.ndarray, regions: list[dict], 사람말: bool = False) -> dict:
    """잔여 픽셀로 배경을 판정한다 — 단색·그라데이션·사진.

    `img` 는 1080폭이어야 한다. 라벨 네모는 원본 해상도라, 원본 배열을 그대로
    넘기면 판정은 멀쩡히 나오면서 값만 틀린다(가장 찾기 어려운 종류다).

    **`사람말` 이 참이면 사진으로 못 박는다.** 기계는 실물 15장을 15장 다 맞혔지만
    조용히 틀릴 자리가 있다 — 흐릿한 하늘처럼 «거의 한 색인 사진 배경» 은 단색으로
    본다. 그러면 카드가 평평한 색으로 나오는데 계량표는 멀쩡해 보인다. 사람이
    그것을 보면 못 박을 수 있어야 한다(사람 결정 2026-08-27).

    **기계가 잰 것을 지우지는 않는다** — `기계판정` 에 그대로 남긴다. 나중에 둘이
    어긋난 자리를 찾아볼 수 있어야 판정 규칙을 고칠 수 있다.
    """
    if img.shape[1] != config.CANVAS_W:
        raise ValueError(f"1080폭 그림이어야 한다 — 받은 폭 {img.shape[1]}")
    남은것 = residual(img, regions)
    난것 = _mark(tint.judge(img, 남은것))
    if 사람말:
        난것 = {**난것, "kind": "사진", "by": "사람", "기계판정": 난것.get("kind")}
    # **사진 배경은 «비었을 때 깔 색» 을 같이 잰다.**
    #
    # 사진 배경은 hex 하나로 못 그린다. 그래서 새 카드뉴스에서는 그 자리가 비고,
    # 비면 흰 바탕이 된다 — 그 위에 원본이 정해 준 흰 글자가 얹히면 아무것도 안
    # 읽힌다(실물 2026-08-31, DSW-6lrk5rs 1번 장).
    #
    # 원본 사진을 그대로 쓸 수는 없다(남의 사진이다). 대신 **색 하나만** 가져온다
    # — 사진의 평균색이다. 그러면 원본이 의도한 글자 대비가 그대로 산다.
    # 최빈색이 아니라 평균색인 까닭은 `tint.mean` 에 적어 뒀다.
    if 난것.get("kind") == "사진":
        난것 = {**난것, "빈자리색": tint.mean(img, 남은것)}
    return 난것


# ---------------------------------------------------------------- 잰 것 · 못 잰 것

def _mark(color: dict) -> dict:
    """색 기록에 **근거(유효 격자 칸 수)** 를 붙이고, 못 잰 것은 「단색」이라 안 적는다.

    `tint.judge` 는 유효 칸이 `MIN_CELLS` 미만이면 판정을 포기하고
    `{"kind":"단색","hex":최빈색}` 을 돌려준다 — 그 docstring 이 스스로 그것을
    "함정"이라 부르고 `cover` 를 같이 보라고 적어 놨다. 그대로 실으면 **자신 있게
    잰 단색**과 **잴 게 없어서 나온 단색**이 계량표에서 똑같이 생긴다. 옛 갈래가
    쓸모없었던 것도 값이 비어서가 아니라 틀린 값이 맞는 값과 똑같이 생겨서였다.

    근거는 `tint.judge` 가 같이 준 `cells`(유효 칸 수)를 그대로 쓴다. `cover`
    에서 되돌리지 않는다 — `cover` 는 격자 크기로 나눈 값이라 어느 격자로 쟀는지를
    알아야 되돌릴 수 있고, 그건 부르는 쪽이 `small` 을 바꾸는 순간 조용히 어긋난다.

    값은 지우지 않는다 — `hex` 는 참고값으로 남기고 `fallback`·`why` 로 어느
    쪽인지만 가른다(`layout_labeled.block()` · `cutout.cut_slide()` 와 같은 관례).
    """
    if not color:
        return color
    cells = color["cells"]
    out = dict(color)
    if cells < MIN_CELLS:
        out["kind"] = "미측정"
        out["fallback"] = True
        out["why"] = (f"유효 격자 {cells}칸(<{MIN_CELLS}) — tint 가 판정을 포기하고 "
                      f"최빈색으로 떨어졌다. hex 는 참고값이다")
    return out


# ---------------------------------------------------------------- 강조색

def _chroma(img: np.ndarray) -> np.ndarray:
    """화소별 채도 — `(최대채널 - 최소채널) / 255`. 위 `ACCENT_MIN_SAT` 주석 참고."""
    px = img.astype(np.int16)
    return (px.max(axis=2) - px.min(axis=2)) / 255.0


def _bg_hexes(bg: dict) -> list[str]:
    if bg.get("hex"):
        return [bg["hex"]]
    return [s["hex"] for s in bg.get("stops", [])]


def _bg_distance(img: np.ndarray, bg: dict) -> np.ndarray | None:
    """화소마다 배경색(단색이면 하나, 그라데이션이면 정지점 전부)까지의 최단 LAB 거리."""
    hexes = _bg_hexes(bg)
    if not hexes:
        return None
    lab = tint.to_lab(img)
    out = None
    for hx in hexes:
        ref = tint.to_lab(np.array([[tint._hex_to_rgb(hx)]], np.uint8))[0, 0]
        d = np.linalg.norm(lab - ref, axis=2)
        out = d if out is None else np.minimum(out, d)
    return out


def _bins(img: np.ndarray, mask: np.ndarray):
    """마스크 안 화소를 `tint.BINS` 단계로 뭉쳐 (색, 화소수, 구간키)를 많은 순으로 낸다.

    `tint.dominant()` 가 최빈색을 낼 때 쓰는 것과 **같은 뭉치기**다 — 다른 자로
    뭉치면 계량표의 다른 색 칸과 비교가 안 된다.
    """
    px = img[mask].reshape(-1, 3)
    step = max(256 // tint.BINS, 1)
    q = px.astype(np.int64) // step
    keys = q[:, 0] * 65536 + q[:, 1] * 256 + q[:, 2]
    vals, counts = np.unique(keys, return_counts=True)
    for i in counts.argsort()[::-1]:
        sel = keys == vals[i]
        r, g, b = px[sel].mean(axis=0).round().astype(int)
        yield f"#{r:02X}{g:02X}{b:02X}", int(counts[i]), int(vals[i])


def accent(img: np.ndarray, regions: list[dict], bg: dict) -> dict:
    """이 **장**의 강조색 후보 — `{"hex", "pixels", "key"}`. 못 고르면 `hex: None`.

    **네모의 대표색이 아니라 화소에서 찾는다.** 예전 판은 네모마다
    `tint.dominant` 로 색 하나를 뽑아 그것만 후보에 올렸는데, 형광펜 밑칠처럼
    네모의 소수파인 색은 그 dominant 가 **배경**이라 후보 목록에 오르지도 못했다
    (실측: DHqCBQnRAjW 2번 장 형광펜 `#C9FC95` 는 채도·배경거리 관문을 둘 다
    통과하는데 그 색이 사는 글자 네모의 dominant 는 배경 `#F2FFE6` 였다).
    그래서 일곱 장 중 여섯 장이 `None` 이었다 — 강조색이 없어서가 아니라 **방법이
    그 색을 볼 수 없어서**다.

    `None` 은 「강조색이 없다」가 아니라 「못 골랐다」다. 그래서 통과 화소 수를
    같이 남긴다 — 0개라 못 고른 것과 후보가 다 판(면적 관문)이라 못 고른 것을
    계량표에서 가를 수 있어야 한다.

    사진·인물 네모의 화소는 아예 후보에서 뺀다(`ACCENT_SKIP`) — 거기 있는 색은
    디자이너가 고른 색이 아니라 찍힌 색이다.

    **`bg_de` 는 배경거리 관문이 실제로 돌았는지다.** 배경이 「사진」으로
    판정되면 `bg` 에 `hex` 도 `stops` 도 없어 `_bg_hexes` 가 빈 목록을 내고,
    `_bg_distance` 가 `None` 을 돌려주며, 아래 관문 줄이 통째로 건너뛰어진다.
    비교할 배경색이 없으니 그 동작 자체는 옳다 — 문제는 **관문 셋을 통과한 색과
    둘만 통과한 색이 계량표에서 똑같이 생긴다**는 것이었다. 잰 것과 안 잰 것은
    갈려 있어야 한다(`_mark` 의 `fallback`·`why` 와 같은 관례).
    """
    h, w = img.shape[:2]
    pool = np.ones((h, w), bool)
    for r in regions:
        if r.get("kind") not in ACCENT_SKIP:
            continue
        m = _mask_of(r, (h, w))
        if m is None:
            m = np.zeros((h, w), bool)
            x0, y0, x1, y1 = (int(round(v)) for v in r["box"])
            m[max(0, y0):max(0, y1), max(0, x0):max(0, x1)] = True
        pool &= ~m

    ok = pool & (_chroma(img) >= ACCENT_MIN_SAT)
    de = _bg_distance(img, bg)
    if de is not None:
        ok &= de >= ACCENT_MIN_DE
    passed = int(ok.sum())
    bg_de = de is not None
    if not passed:
        return {"hex": None, "pixels": 0, "key": None, "bg_de": bg_de}
    for hexed, count, key in _bins(img, ok):
        if count <= h * w * ACCENT_MAX_AREA:
            return {"hex": hexed, "pixels": count, "key": key, "bg_de": bg_de}
    return {"hex": None, "pixels": passed, "key": None, "bg_de": bg_de}


def post_accent(cands: list[dict]) -> dict:
    """장마다 낸 후보에서 **게시물 하나의** 강조색을 고른다.

    강조색은 브랜드의 성질이지 장의 성질이 아니다(설계 5-5 는 게시물당 3색을
    말한다). 되돌려 그리는 데도 장별 값은 필요 없다 — 네모마다 제 색이 이미 있다.
    필요한 쪽은 규칙표·Dify 이고 그쪽은 게시물 단위로 읽는다.

    표를 세는 자는 `_bins` 와 같은 `tint.BINS` 구간이다 — 실물에서 장마다 나온
    hex 가 `#C9FC95`·`#C9FC94` 처럼 한 끗 다른데, 문자열로 세면 같은 색이
    갈라진다(직접 셈: DHqCBQnRAjW 7장의 후보는 구간으로 묶으면 2가지, 문자열로
    세면 4가지다).
    """
    votes: dict[int, dict] = {}
    for c in cands:
        if not c.get("hex"):
            continue
        v = votes.setdefault(c["key"], {"slides": 0, "pixels": 0, "hex": None, "top": -1})
        v["slides"] += 1
        v["pixels"] += c["pixels"]
        if c["pixels"] > v["top"]:
            v["top"], v["hex"] = c["pixels"], c["hex"]
    # 배경거리 관문이 안 돈 장 수 — `accent` 의 `bg_de` 참고. 0 이어도 적는다.
    # 없으면 「관문이 다 돌았다」와 「옛 판이라 안 적었다」가 안 갈린다.
    skipped = sum(1 for c in cands if not c.get("bg_de", True))
    if not votes:
        return {"hex": None, "slides": 0, "pixels": 0, "fallback": True,
                "bg_de_skipped": skipped,
                "why": (f"관문(채도 {ACCENT_MIN_SAT} · 배경 ΔE {ACCENT_MIN_DE} · "
                        f"면적 {ACCENT_MAX_AREA})을 통과한 색이 어느 장에도 없다")}
    k = max(votes, key=lambda k: (votes[k]["slides"], votes[k]["pixels"]))
    v = votes[k]
    return {"hex": v["hex"], "slides": v["slides"], "pixels": v["pixels"],
            "bg_de_skipped": skipped}


# ---------------------------------------------------------------- 합치기

def merge_one(box: dict, cut: dict, text: dict, color: dict, scale: float = 1.0) -> dict:
    """네모 하나치를 합친다. 값을 못 낸 갈래는 자리를 비우고 네모는 남긴다.

    `box` 는 라벨 원본(원본 해상도), `cut`·`text`·`color` 는 각각
    `cutout.cut_slide()` · `layout_labeled.slide_text()` · `tint.judge()` 의
    결과다(없으면 빈 dict). `scale` 은 원본→1080 배율 — `cut`·`text` 는 이미
    1080 이라 곱하지 않는다.

    `rle` 는 싣지 않는다 — 한 네모가 수십 KB라 계량표가 사람이 못 읽는 크기가
    된다. 마스크가 필요한 쪽은 `data/cutouts/` 의 PNG 알파를 쓴다(`png` 열쇠).
    """
    out = {
        "id": box["id"],
        "kind": box.get("kind", ""),
        "box": [round(v * scale) for v in box["box"]],
        "note": box.get("note", ""),
        # 사람이 못 박은 «배경 빼기»(2026-09-19). 없으면 안 싣는다 —
        # 「안 골랐다」와 「안 하기로 골랐다」는 다른 뜻이다.
        **({"누끼": bool(box["누끼"])} if "누끼" in box else {}),
    }
    # 겹침 순서. **사람이 라벨링에서 정한 값**이라 그대로 옮긴다.
    # 없으면 칸을 안 만든다 — 읽는 쪽이 「한 칸이라도 비면 통째로 무시」로
    # 짜여 있어서, 0 으로 채우면 「안 정한 것」이 「맨 뒤로 정한 것」이 된다.
    if isinstance(box.get("층"), int) and not isinstance(box.get("층"), bool):
        out["층"] = box["층"]
    # `treat`(사진 처리)는 안 싣는다 — 굽는 쪽에 소비자가 없어 «반영 안 함» 만 찍혔다
    # (2026-09-19 정리). 라벨 화면에도 그 칸이 없다.
    # **기계가 스스로 찾은 네모임을 남긴다.** 사람이 그은 것과
    # 섞이면 「이 글자칸은 어디서 왔지」를 아무도 못 푼다 — 점검이 이 값을 보고
    # 알린다.
    if box.get("스스로찾음"):
        out["스스로찾음"] = True
    # 장 번호를 배경판에서 뚫으면 배지 한가운데 구멍이 남는다 — 둘레에서 잰
    # 이 색으로 그 구멍만 메운다(`make_dsl_cardnews`).
    # 배지 구멍을 색으로 메우던 값(`배지색`·`배지네모`)은 안 싣는다 — 장별 배경판을
    # 없애고(2026-09-19) 배지는 「번호판」 한 벌로 다루면서 읽는 곳이 사라졌다.
    # 번호판이 쓰는 배지색은 `_번호판만들기` 가 따로 싣는다.
    if cut:
        out["cutout"] = {k: v for k, v in cut.items() if k != "rle"}
    if text:
        out["text"] = {k: v for k, v in text.items() if k != "id"}
    if color:
        out["color"] = color
    return out


def _장식기록(r: dict) -> dict:
    """네모 기록에 «장식일 때만» 누끼 열쇠를 더해 돌려준다.

    장식은 원본 그대로 복사한다(사람 결정 2026-09-17). 도형은 잰 색으로 다시
    그리는 것이고, 로고·사진은 새 내용이 들어갈 빈 자리다 — 로고를 복사하면
    남의 계정 로고가 우리 카드뉴스에 박혀 나간다.
    """
    열쇠 = (r.get("cutout") or {}).get("png")
    if r.get("kind") != "장식" or not 열쇠:
        return r
    return {**r, "누끼열쇠": 열쇠}


def _mask_from_outline(테두리: list[list[float]], 구멍: list[list[list[float]]],
                        shape: tuple[int, int]) -> np.ndarray:
    """테두리 폴리곤을 채우고 구멍을 파내 마스크를 만든다.

    `cutout.cut_slide()` 가 주는 `테두리`·`구멍` 은 이미 1080 공간이다(그쪽이
    원본 해상도 좌표에 `s` 를 곱해 옮겨 담아 준다) — `shape`(=`img.shape[:2]`,
    `normalize.load()` 가 준 1080폭 배열)와 자가 같아서 되돌릴 배율이 없다.
    누끼가 SAM 이 아니라 배경 흘려채우기(`outline.테두리따기`)로 바뀌면서
    `rle`(비트마스크)가 폴리곤으로 바뀐 것뿐, 좌표계는 그대로다.
    """
    h, w = shape
    m = np.zeros((h, w), np.uint8)
    cv2.fillPoly(m, [np.round(np.array(테두리, dtype=np.float64)).astype(np.int32)], 1)
    for 구멍_한개 in 구멍:
        cv2.fillPoly(m, [np.round(np.array(구멍_한개, dtype=np.float64)).astype(np.int32)], 0)
    return m.astype(bool)


def _regions(boxes: list[dict], cuts: dict, scale: float, shape: tuple[int, int]) -> list[dict]:
    """잔여·색 계산이 쓸 모양으로 네모를 1080 공간에 옮긴다."""
    out = []
    for b in boxes:
        r = {"id": b["id"], "kind": b.get("kind", ""),
             "box": [v * scale for v in b["box"]]}
        cut = cuts.get(b["id"], {})
        if cut.get("테두리"):
            r["mask"] = _mask_from_outline(cut["테두리"], cut.get("구멍", []), shape)
            # 테두리에서 조인 상자(이미 1080). **죽은 줄이 아니다** — `_build` 는
            # 글자 네모를 다른 네모에서 뺄 때 마스크가 아니라 이 `box` 를 **직접**
            # 읽는다(`text_boxes`). 사람이 «테두리» 를 직접 그은 글자 네모가 그렇다.
            # 이 줄을 지우면 사람이 헐겁게 그은 상자가 통째로 빠져서 밑에 깔린
            # 도형이 「단색」에서 「미측정」으로 뒤집힌다.
            # (누끼 체크상자를 «모든 종류에 띄운다» 던 옛 주석은 틀렸다 — 그 칸은
            #  화면에서 뺐고 분석도 2026-09-19 부터 `cut` 을 안 읽는다.)
            # (`test_글자_네모는_사람_상자가_아니라_테두리가_조인_상자로_빠진다`).
            r["box"] = list(cut["box"])
        out.append(r)
    return out


# 글자 네모를 빼고 이만큼도 안 남으면 «제 글자가 얹힌 도형» 으로 본다.
#
# 0 으로 두면 한 화소만 삐져나와도 그 한 화소로 색을 재게 된다. 실측(1080×1350
# 에서 도형과 글자 네모가 2~4px 어긋난 경우): 남는 화소가 수백 개다. 격자 한
# 칸(84×90 = 7,560)의 절반쯤을 문턱으로 두면 그런 자투리는 걸러진다.
남을화소 = 4000


def _color_of(img: np.ndarray, region: dict, text_boxes: list[list[float]]) -> dict:
    """도형·로고 따위 네모 안의 색. 위에 얹힌 글자 네모는 빼고 센다 —
    글자그릇이면 글자색이 섞여 대표색이 뒤집힌다(설계 5-3).

    **작은 네모에 `tint.judge(small=True)`(4×4 격자)를 쓰지 않는다.** 예전 판은
    `min(폭,높이) < 120` 이면 그렇게 했는데, 그 격자는 네모가 아니라 **그림 전체**를
    나눈다(`tint.cells` 가 `np.linspace(0, h, rows+1)`). 1080×1350 에서 칸은
    16×12 면 84×90px, 4×4 면 337×270px 이라 **칸이 작아지는 게 아니라 커진다** —
    작은 네모일수록 한 칸을 `NEED`(30%)만큼 채우기가 더 어려워진다.
    직접 셈(1080×1350 에서 짧은 변이 120 미만인 네모를 크기·위치로 훑었다 —
    변 길이 {20,40,60,80,100,119,200,400,800,1080,1350} 의 조합 중 짧은 변이
    120 미만인 것, 위치는 10px 간격, 모두 **800,964 자리**):
    `small=True` 가 `small=False` 보다 유효 칸을 많이 낸 경우 **0건**,
    최대 유효 칸은 `small=False` **32칸**(80×1350) 대 `small=True` **4칸**(100×1350).

    120px 정사각은 **자리에 따라 달라진다** — 1px 간격으로 가능한 1,182,991
    자리를 다 훑으면 `small=False` 는 1칸 8.8% · **2칸 63.0%** · 3칸 20.9% ·
    4칸 7.3% 이고, `small=True` 는 **어느 자리에서도 0칸**이다. 지난 판 주석의
    「3칸」은 그중 한 자리의 값이지 대푯값이 아니었다.

    **그래서 `tint.judge(small=…)` 를 부르는 곳은 파이프라인에 하나도 없다.**
    `tint.SMALL_ROWS`·`SMALL_COLS` 와 `judge` 의 `small` 갈래는 이제 시험에서만
    닿는다 — 살려 둔 스위치가 아니라 위 셈이 폐기한 스위치다.
    """
    h, w = img.shape[:2]
    m = _mask_of(region, (h, w))
    if m is None:
        m = np.zeros((h, w), bool)
        x0, y0, x1, y1 = (int(round(v)) for v in region["box"])
        m[max(0, y0):max(0, y1), max(0, x0):max(0, x1)] = True
    else:
        m = m.copy()
    for tb in text_boxes:
        x0, y0, x1, y1 = (int(round(v)) for v in tb)
        m[max(0, y0):max(0, y1), max(0, x0):max(0, x1)] = False
    잰것 = _mark(tint.judge(img, m)) if m.sum() >= 남을화소 else None
    # **`fallback` 도 「못 쟀다」로 친다**(사람 지적 2026-09-19). `tint.judge` 는
    # 유효 격자가 4칸 미만이면 판정을 포기하고 최빈색을 «참고값» 으로만 남긴다
    # (`kind: 미측정`, `hex` 는 있음). 여태 `hex` 가 있다는 이유로 이 갈림길을
    # 그냥 지나쳐서, 색을 제대로 재 놓고도 「미측정」 도장이 찍혀 틀에 안 실렸다
    # — 실물 DSW-6lrk5rs 9장의 연파랑 알약 넷이 구운 그림에서 통째로 사라졌다.
    # 도형은 아래에서 «모양 안쪽 가장 넓은 색» 으로 다시 재면 또렷하게 나온다.
    if 잰것 is None or (region.get("kind") == "도형"
                       and (not 잰것.get("hex") or 잰것.get("fallback"))):
        # **글자가 얹힌 도형이다.** 두 가지 길로 여기 온다.
        #
        # 하나 — 사람이 네모 하나를 긋고 「안에 글자 있다」를 켜면 도형과 글자가
        # 같은 자리가 되어, 글자 네모를 빼는 순간 잴 화소가 0 이 된다.
        #
        # 둘 — 그 네모 «자체» 에 글자가 박혀 있으면 뺄 것이 없어 도형이 통째로
        # 들어간다. 그러면 격자로 「평평한가」를 묻는 `judge` 가 민트+검정을 보고
        # 「사진」이라 답하고, 사진에는 hex 가 없다.
        #
        # 둘 다 채움색이 비고, 색을 못 잰 도형은 굽는 쪽이 통째로 건너뛴다 —
        # 실물 2026-08-30(DYzN0Uzgaq6): 민트색 제목 띠 다섯 개가 그렇게
        # 사라졌고, 사람이 「제목 부분에 도형이 있었던 것 같은데」라고 짚을
        # 때까지 아무도 몰랐다.
        #
        # **채움색은 «가장 넓은 면을 차지한 색» 이다.** 글자 획이 아무리 굵어도
        # 바탕보다 넓지는 않다 — 실측 그 띠: 민트 #40F0C0 가 44%, 나머지는
        # 글자와 가장자리다. 격자로 「평평한가」를 묻는 `judge` 는 글자가 얹힌
        # 순간 「사진」이라 답하므로 여기서는 안 쓴다.
        칠 = _도형마스크(region, img.shape[:2])
        if 칠 is not None and 칠.any():
            return {"kind": "으뜸색", "hex": tint.dominant(img, 칠),
                    "cover": float(칠.mean()), "cells": 0,
                    "why": "제 글자가 얹힌 도형이라 «가장 넓은 색» 으로 쟀다"}
        # 실패도 성공과 같은 모양으로 남긴다 — 소비자가 갈래를 안 타게
        # (`layout_labeled.block()` · `cutout.cut_slide()` 와 같은 관례).
        if 잰것 is not None:
            return 잰것          # 도형이 아니거나 이미 잰 값이 있다
        return {"kind": "미측정", "hex": None, "cover": 0.0, "cells": 0,
                "fallback": True, "why": "글자 네모를 빼고 나니 잴 화소가 없다"}
    return 잰것


def _도형마스크(region: dict, 크기) -> "np.ndarray | None":
    """글자 네모를 빼기 «전» 의 도형 자리. 테두리가 있으면 그 모양대로."""
    m = _mask_of(region, 크기)
    if m is not None:
        return m
    x0, y0, x1, y1 = (int(round(v)) for v in region["box"])
    빈판 = np.zeros(크기, bool)
    빈판[max(0, y0):max(0, y1), max(0, x0):max(0, x1)] = True
    return 빈판


def _pull(pid: str) -> bool:
    """서버에서 라벨을 새로 받는다. 받은 것이 로컬 사본과 **다르면** True.

    `fetch_labels.pull()` 이 그림까지 채워 받고, 실패하면 스스로 상태를
    `분석 실패`로 되돌린 뒤 예외를 올린다 — 여기서 다시 감싸지 않는다.
    """
    before = digest(pid)
    fetch_labels.pull(pid)
    return digest(pid) != before


def build(pid: str, publish: bool = False, pull: bool = False) -> dict:
    """게시물 하나를 통째로 재서 `data/measures/<코드>.json` 에 쓴다.

    `pull=True` 면 **재기 전에 서버에서 라벨을 새로 받는다.** 그러려면 먼저
    `분석중`으로 잡아야 하고(그래야 사람이 편집하는 중간에 읽어가지 않는다),
    한 번 잡으면 반드시 풀어야 한다 — `분석중`에 갇히면 웹이 편집을 409 로
    막아 사람이 손쓸 방법이 없다. 그래서 **`pull` 은 `publish` 를 머금는다**:
    잡았으면 성공이든 실패든(Ctrl+C 포함) 끝에 상태를 바꾼다.

    `publish=True` 면 끝에 `fetch_labels.finish()` 로 게시물 상태를 바꾼다
    (성공 `분석 끝` · 실패 `분석 실패`). **둘 다 기본값이 꺼짐인 이유:** 이건
    망을 타는 호출이고, 시험이 실제 게시판 상태를 건드리면 안 된다. 명령줄
    (`main()`)로 돌릴 때만 켠다.
    """
    claimed = False
    changed = None
    try:
        if pull:
            fetch_labels.claim(pid)
            claimed = True
            changed = _pull(pid)
        doc = _build(pid)
    except BaseException:
        if publish or claimed:
            try:
                fetch_labels.finish(pid, False)
            except Exception:
                pass   # 원래 예외를 가리지 않는다
        raise
    doc["labels"].update(source=SERVER if pull else LOCAL, changed=changed)
    _write(pid, doc)
    print(_freshness_line(doc["labels"]))
    if publish or claimed:
        fetch_labels.finish(pid, True)
    return doc


def _freshness_line(meta: dict) -> str:
    """사람이 읽을 한 줄. **묵은 라벨은 묵었다고 말한다.**"""
    head = f"라벨 — {meta['source']} · {meta['at']} · 네모 {meta['boxes']}개 · {meta['digest']}"
    if meta["changed"] is None:
        return head + "\n  ! 서버에서 받지 않았다 — 사람이 그새 고친 라벨은 안 보인다"
    return head + ("\n  서버 라벨이 로컬 사본과 달랐다 — 새 라벨로 쟀다" if meta["changed"]
                   else "\n  서버 라벨이 로컬 사본과 같았다")


def _build(pid: str) -> dict:
    labels = load_labels(pid)
    slides, texts, cands, canvas = [], [], [], None
    바닥후보 = []      # 단색 장들 — 게시물 바닥판을 여기서 뜬다(`바닥판`)
    GPT장들 = []      # 장마다 원본·라벨 자리 — GPT 바닥판 후보(`gpt바닥판.고르기`)
    # **장 번호 배지는 «번호판» 하나로 다룬다**(사람 결정 2026-09-19). 사람이 어느
    # 장이든 배지 둘레에 「장번호」 네모 하나를 그으면, 그 배지를 떼어 숫자를 지운
    # 도장을 만들고(`번호판.만들기`) 표지 뺀 모든 장 같은 자리에 찍는다(배치).
    # 장마다 번호를 찾던 길은 2026-09-24 에 통째로 뺐다(구글 비전을 안 쓴다).
    번호라벨 = next(((i, b) for i in sorted(labels) for b in labels[i]["boxes"]
                  if b.get("kind") == "장번호"), None)
    표지 = min(labels) if labels else None
    번호판기록 = None
    for index in sorted(labels):
        boxes = labels[index]["boxes"]
        img, scale = normalize.load(config.IMAGES / pid / f"{index:02d}.jpg")
        if canvas is None:
            canvas = {"w": int(img.shape[1]), "h": int(img.shape[0])}
        번호판네모 = [v * scale for v in 번호라벨[1]["box"]] if 번호라벨 else None
        reads = 글자읽기한장(pid, index, boxes)
        cuts = cutout.cut_slide(pid, index, boxes)
        blocks = {b["id"]: b for b in layout_labeled.slide_text(pid, index, boxes, reads)}

        regs = _regions(boxes, cuts, scale, img.shape[:2])
        # 번호판 자리는 «표지 아닌 모든 장» 에서 배경판에 안 남긴다 — 원본 배지와
        # 숫자가 판에 박혀 우리가 찍는 번호와 겹치면 안 된다.
        번호구멍 = ([{"id": "번호판", "kind": "장번호", "box": 번호판네모}]
                if 번호판네모 is not None and index != 표지
                and not any(b.get("kind") == "장번호" for b in boxes) else [])
        bg = background(img, regs + 번호구멍, bool(labels[index].get("배경사진")))
        # 사람이 적은 «어떤 배경 사진인지»(2026-09-19). 배경은 네모를 안 그으니
        # 설명도 장에 붙어 온다 — 여기서 배경에 얹어 틀까지 나른다.
        _배경설명 = str(labels[index].get("배경설명") or "").strip()
        if _배경설명:
            bg["설명"] = _배경설명
        # **배경판 — 그은 네모를 뺀 나머지 전부를 그림 한 장으로.**
        # 색 이름 하나로는 못 담는 것(구분선·무늬·모서리 장식)이 여기 담긴다.
        # 뜰 값이 없으면 `None` 이다 — 흰 배경에 흰 그림을 쌓지 않는다.
        남음 = residual(img, regs + 번호구멍, rgb=img)
        # **배경판은 바닥판을 고른 뒤에 뜬다**(아래 두 번째 고리). 바닥판을 깔고
        # 그 위에 라벨 안 된 것만 얹는 셈이라, 바닥판이 먼저 있어야 한다.
        if 바닥감인가(bg):
            바닥후보.append((len(boxes), bg.get("hex"), img, 남음))
        # 라벨 표시가 빠져도 분석이 «사진» 이라 잰 장은 바닥판 후보가 아니다(실물 여행
        # DYijYfij3Sn: 4번 장 표시가 빠져 마추픽추 사진이 바닥판이 됐다).
        GPT장들.append({"index": index, "배경사진": bool(labels[index].get("배경사진")) or bg.get("kind") == "사진",
                      "w": img.shape[1], "h": img.shape[0], "img": img, "bg": bg,
                      # **네모도 그림과 같은 자로 넘긴다**(2026-09-24). `img` 는
                      # `normalize.load` 가 1080 으로 맞춘 것인데 라벨 네모는 «원본
                      # 파일» 좌표다 — 안 곱하면 바닥판이 엉뚱한 자리를 지운다.
                      # 실물: 창고 열세 벌 중 여섯이 어긋나 있었다(`DYon1QyCWqh` 는
                      # 원본 3277 폭이라 네모가 3배). `고르기` 의 «덮는 넓이» 도
                      # 같은 목록을 보므로 같이 틀어져 있었다.
                      "네모들": [(b.get("kind", ""), [v * scale for v in b["box"]]) for b in boxes]
                              + [("장번호", list(번호판네모)) for _ in 번호구멍]})
        text_boxes = [r["box"] for r, b in zip(regs, boxes) if config.글자를_재나(b)]
        merged = []
        for r, b in zip(regs, boxes):
            kind = b.get("kind", "")
            if kind == "빼기":
                # 「빼기」(사람 결정 2026-09-19) — 라벨은 하되 그리지도 재지도 않는
                # 칸. 원본에만 있던 타임라인·구분선·워터마크가 바닥판에 박히지
                # 않게 자리만 파낸다(위 `regs` 로 배경·남음에서는 이미 뺐다).
                continue
            if kind == "장번호":
                # 계량표의 네모 목록에는 안 싣는다 — 장식도 글자도 아니고 «번호판»
                # 으로 따로 기록한다(아래). 배경판 구멍으로는 위에서 이미 뺐다.
                if 번호라벨 and index == 번호라벨[0] and 번호판기록 is None:
                    번호판기록 = _번호판만들기(pid, index, img, r, b, reads, blocks, regs)
                continue
            if kind == "글자":
                color = {}                       # 글자색은 `text.color` 가 진다
            elif kind in COLOR_SKIP:
                color = no_color(kind)           # 안 잰다 — 자리만
            else:
                color = _color_of(img, r, text_boxes)
            기록 = _장식기록(merge_one(b, cuts.get(b["id"], {}), blocks.get(b["id"], {}),
                                     color, scale))
            # 둘레에 «눈에 보이는 선» 이 있나. 글자칸은 안 잰다 — 글자 둘레 네모는
            # 라벨이 글을 감싸려고 그은 것이지 디자인이 아니다.
            if kind in 선잴갈래:
                선 = 테두리재기.재기(img, _도형마스크(r, img.shape[:2]))
                if 선:
                    기록["선"] = 선
            merged.append(기록)
        text = "\n".join(m["text"]["text"] for m in merged
                         if m.get("text", {}).get("text"))
        texts.append(text)
        cands.append(accent(img, regs, bg))
        slides.append({
            "index": index,
            "background": bg,
            "ending": tone_labeled.ending_of(text),
            "person": tone_labeled.person_of(text),
            "is_question": tone_labeled.question_title(text),
            "formality": tone_labeled.formality_of(text),
            "regions": merged,
        })
        print(f"  {index}번 장 — 네모 {len(merged)}개, 배경 {bg['kind']}")

    if 번호판기록 is not None:
        print(f"  번호판: {번호판기록['그림열쇠']}")

    # **사진 테두리는 게시물 안에서 통일한다**(사람 결정 2026-09-19). 디자인은
    # 원래 통일돼 있다 — 열 장 중 두 장만 다르면 그게 잘못 잰 것이다.
    칸들 = [r for s in slides for r in s["regions"] if r.get("kind") in 선잴갈래]
    맞춘것 = 테두리재기.사진끼리맞추기([r.get("선") for r in 칸들],
                                [r.get("kind") for r in 칸들])
    선있는칸 = 0
    for r, 선 in zip(칸들, 맞춘것):
        r.pop("선", None)
        if 선:
            r["선색"], r["선굵기"] = 선["선색"], 선["선굵기"]
            r["선출처"] = 선.get("선출처", "직접")
            선있는칸 += 1
    print(f"  테두리: {선있는칸}칸 (잰 칸 {len(칸들)}개 중)")

    판들 = GPT바닥판(pid, GPT장들)
    if 판들:
        # **장마다 제 묶음의 판을 적는다**(사람 결정 2026-09-19). 종이가 두 종류면 판도
        # 둘이고, 파란 장에는 파란 판이 깔려야 한다. 대표 바닥판은 가장 큰 묶음 것이다 —
        # 사진 장이 빌려 쓰고(`make_dsl_cardnews._배경출력`) 옛 길과도 이름이 안 갈린다.
        자리 = {i: p for p in 판들 for i in p["장들"]}
        for 장 in slides:
            내판 = 자리.get(장["index"])
            if 내판:
                장["background"] = {**장["background"], "판": 내판["판"], "바닥판": True}
        바닥 = {"hex": 판들[0]["hex"], "판": 판들[0]["판"]}
        깐바닥 = 판들[0]["깐것"]
    else:
        바닥, 깐바닥 = 바닥판(pid, 바닥후보)
        print(f"  바닥판: {바닥['판'] if 바닥 else '못 뜸'} (단색 장 {len(바닥후보)}개 중)")

    # **장마다 뜨던 배경판은 없앴다**(사람 결정 2026-09-19 「라벨한 것만 나온다」).
    # 라벨 안 한 선·워터마크·얼룩이 판에 박혀 나오던 것이 전부 거기서 났다. 이제
    # 층은 바닥판 + 장식 + 글자 셋뿐이고, 틀은 사진 아닌 모든 장에 바닥판을 깐다
    # (`make_dsl_cardnews._배경출력`). 원본에만 있던 것은 「빼기」 로 긋는다.

    tone = tone_labeled.ask(pid, texts)
    # **자리로 맞춘다 — 장 번호로 찾지 않는다.**
    #
    # 프롬프트는 장을 «1번부터 차례로» 매겨 보낸다(`tone_labeled.ask` 의
    # `f"{i + 1}번 장"`). 그러니 돌아온 `index` 도 1..N 이고, 그건 «몇 번째로
    # 보낸 것인가» 이지 «게시물의 몇 번째 장인가» 가 아니다.
    #
    # 여태 진짜 장 번호로 찾고 있었다. 라벨한 장이 1번부터 빈틈없이 이어지면
    # 우연히 맞지만, 사람이 몇 장만 골라 라벨하면 어긋난다 — 실물 2026-08-29
    # (ai소식): 장 번호가 1·6·12·15·16·17 인데 모델은 1~6 으로 답했다. 1번만
    # 옳게 맞고, 6번은 «여섯 번째로 보낸 장»(진짜 17번 CTA)의 판정을 훔쳐 왔고,
    # 12·15·16·17 번은 짝이 없어 통째로 「미정」이 됐다.
    #
    # `ask` 가 답을 장 수에 맞춰 잘라 주거나 채워 주므로 자리끼리 곧장 맞물린다.
    판정들 = tone.get("slides") or []
    for 자리, s in enumerate(slides):
        t = 판정들[자리] if 자리 < len(판정들) else {}
        온번호 = t.get("index")
        if 온번호 is not None and 온번호 != 자리 + 1:
            print(f"!! 말투 판정의 index 가 자리와 다르다 — {자리 + 1}번째인데 "
                  f"{온번호} 라고 왔다. 자리를 따른다")
        s["role"] = t.get("role", "미정")
        s["tone"] = {"formality": s.pop("formality"),
                     "humor": t.get("humor", "미정"),
                     "respect": t.get("respect", "미정"),
                     "enthusiasm": t.get("enthusiasm", "미정")}

    doc = {
        "shortcode": pid,
        "canvas": canvas or {"w": config.CANVAS_W, "h": 0},
        "slide_count": len(slides),
        # 라벨이 어디서 언제 온 것인가. `build()` 가 서버에서 받았으면 거기서
        # `source`·`changed` 를 덮어쓴다.
        "labels": freshness(pid),
        # 강조색은 장이 아니라 **게시물**의 성질이다(`post_accent` 참고).
        "accent": post_accent(cands),
        "post_type": tone.get("post_type", "미정"),
        "hook_strategy": tone.get("hook_strategy", "미정"),
        "skeleton": [s["role"] for s in slides],
        # 게시물의 «그냥 배경» — 사진 장에도 이것을 깐다(`make_dsl_cardnews._바닥`).
        "바닥판": 바닥,
        "slides": slides,
    }
    if 번호판기록 is not None:
        doc["번호판"] = 번호판기록
    return doc   # 파일에 쓰는 것은 `build()` 다 — 신선도를 채운 뒤라야 한다


def _번호판만들기(pid: str, index: int, img, r: dict, b: dict, reads: dict, blocks: dict,
             regs: list) -> dict | None:
    """「장번호」 네모 하나로 번호판을 만들어 기록한다. 못 떼면 `None`(한 줄 찍는다).

    `img`·`r["box"]`·`reads` 의 글자 상자는 모두 1080 공간이다 — 번호판의 `box` 도
    1080 이라 틀이 그대로 쓴다.
    """
    심볼 = (reads.get(b["id"]) or {}).get("symbols") or []
    글자네모들 = [s["box"] for s in 심볼 if str(s.get("text") or "").strip()]
    글 = "".join(str(s.get("text") or "") for s in 심볼).strip()
    blk = blocks.get(b["id"]) or {}
    색 = blk.get("color")
    글자색 = 색.get("hex") if isinstance(색, dict) else (색 or None)
    이웃 = [rr["box"] for rr in regs if rr["id"] != b["id"]]
    난 = 번호판.만들기(img, r["box"], 글자네모들, 글, blk.get("font"), blk.get("weight"), 글자색, 이웃)
    if 난 is None:
        print(f"!! {index}번 장 번호판을 못 뗐다 — 배지가 종이와 색이 비슷하거나 네모가 빗나갔다")
        return None
    키 = cutout.put_png(pid, index, "plate-number", 난["png"])
    return {"box": 난["네모"], "그림열쇠": 키, "배지색": 난["배지색"], "숫자": 난["숫자"],
            "숫자있음": 난["숫자있음"], "장": index}


def _write(pid: str, doc: dict) -> None:
    """옛 갈래(`merge.py`)도 같은 파일에 쓴다 — 덮어쓰기 전에 비켜 둔다.

    **이미 `.old.json` 이 있으면 안 건드린다.** 두 번째 판까지 옮기면 비교
    대상이던 옛 갈래 결과가 새 갈래 결과로 바뀌어 사라진다.
    """
    dst = config.MEASURES / f"{pid}.json"
    old = config.MEASURES / f"{pid}.old.json"
    if dst.exists() and not old.exists():
        dst.replace(old)
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("사용: python analyze/merge_labeled.py <코드>")
    pid = sys.argv[1]
    # 서버에서 라벨을 받아 온 뒤에 잰다 — 로컬 사본만 읽으면 사람이 그새 고친
    # 라벨을 못 보고, 그렇게 나온 계량표가 갓 잰 것과 똑같이 생긴다.
    doc = build(pid, publish=True, pull=True)
    print(f"{pid} {doc['slide_count']}장 -> {config.MEASURES / (pid + '.json')}")
    print("  " + " → ".join(doc["skeleton"]))


if __name__ == "__main__":
    main()
