# -*- coding: utf-8 -*-
"""«GPT 바닥판» — 게시물의 «그냥 종이» 한 장을 GPT Image 2.5 편집으로 만든다.

사람 결정 2026-09-19. 단색 조각을 모아 뜨던 옛 바닥판(`배경판.바닥뜨기`)은 찢어진
종이·공책 줄 같은 큰 무늬를 못 살렸고(실물 DYWiVHhlNwo), 중앙값 판은 얼룩이 남았다.
**이 일은 «만드는 것» 이 아니라 «지우고 메우는 것» 이다**(사람 지시 2026-09-22).
라벨한 것은 윗층이고, 들어내면 아랫층에 그 모양대로 구멍이 난다. 배경판은 그 구멍을
둘레가 이어지도록 메워 **라벨하기 «전» 의 아랫층으로 돌려놓은 것**이다 — 그 아랫층이
종이인지 색인지 질감인지는 상관없다.

GPT 에 **원본 한 장과 라벨 자리에 빨간 테두리만 두른 한 장**, 둘을 준다. 실측
(DSW 9번 장, 2026-09-19): 원본을 같이 주면 순서·문장을 바꿔도 세 번 다 빨간 자리를
원본대로 «복원» 해 돌려줬다. 라벨 목록·개수는 안 넣는다 — 무엇을 지울지는 테두리가 말한다.

후보 규칙: 표지(첫 장)·CTA(마지막 장)·「배경사진」 장을 빼고, 남은 장 가운데 **라벨이
덮는 넓이가 가장 작은 장** 하나. 종이가 많이 보일수록 지어낼 데가 적다.

열쇠는 환경변수 `FAL_KEY` 로만, 머리말에만. 값은 어디에도 안 찍는다.
"""
import base64
import io
import json
import os
import sys
import time
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gpt누끼  # noqa: E402

품질 = "high"           # 게시물에 한 장이라 high 로 둔다 (1080×1350 약 5센트)
# **덮개는 «그림에 없는 색» 한 가지다**(사람 지시 2026-09-24).
#
# 여태는 라벨 자리를 뭉개서(`cv2.inpaint`) 보냈다. 그런데 뭉갠 자국은 «네모난 얼룩»
# 이라 그 자체가 힌트였고, 무엇을 지우라는 것인지 GPT 가 스스로 찾아야 했다.
# 색을 정해 주면 찾을 것이 없다 — **지시문에 그 색을 그대로 적는다.**
#
# 덤으로 **곧은 검산**이 생긴다: 돌아온 그림에 그 색이 남았으면 덜 지운 것이다.
# 「라벨 밖이 원본과 몇 % 같나」보다 훨씬 곧다.
#
# 지시문이 막는 것 (줄마다 하나씩, 전부 실물에서 난 일이다):
#
# ① **이 색은 덮개지 그림이 아니다** — 무엇을 지울지 찾을 필요를 없앤다
# ② **조금 보이는 배경이 전체가 되어야 한다 · 덮개색을 배경으로 쓰지 마라**
#    금지한 적이 없으면 GPT 는 그 색을 써도 규칙을 안 어긴 것이다. 실물
#    DYzN0Uzgaq6(덮음 83.5%)가 **화면 전체를 덮개색으로** 돌려줬다. 이 두 줄을
#    넣자 같은 장이 0% 가 됐다.
# ③ **모양은 아무 뜻 없다** — 구멍 모양을 설계도로 읽어 카드를 지어냈다
#    (실물 DSW 9번 장: 알약 5개 자리 → 번호 항목 4개를 새로 씀)
# ④ **아무것도 더하지 마라** — 「종이」라고 부르면 종이를 지어낸다(DbX5fhOAdyC:
#    검은 카드에 없던 크림색 종이). 그래서 배경이 무엇인지 이름 붙이지 않는다.
# ⑤ **덮개 밖은 그대로** — 이 말이 없어 제목 밑 가로 줄이 통째로 지워졌다
#    (DNUFIa4NIkK 4번 장: 지켜야 할 결 2,766화소가 판에 0개)
#
# **예시를 늘어놓지 않는다.** 「줄·띠·찢긴 자국을 이어라」처럼 쓰면 목록에 없는
# 배경이 나왔을 때 어떻게 할지 모르고, **목록에 없는 것은 «마음대로 해도 되는 것»**
# 으로 읽힌다. 그래서 «둘레가 하고 있는 것을 그대로 이어가라» 한 줄로 쓴다.
지시문 = (
    "The flat {색} areas are covers, not part of the image. Remove them and let the background "
    "run through, continuing whatever it is doing at each cover's edge — same color, texture and "
    "pattern, lined up across. "
    "Even if only a small part of the background is still visible, that little piece is what the "
    "whole frame must become. Never use the cover colour as a background. No {색} may remain "
    "anywhere in the output. "
    "A cover's shape means nothing; it is not the outline of what it hides. Do not draw to it or "
    "fill it like a panel. "
    "Add nothing — no text, marks, shapes or objects. What the covers hide was removed on purpose. "
    "Leave everything outside the covers exactly as it is. Full frame, {w}x{h}."
)

덮개여유 = 10
"""라벨 네모보다 이만큼 넓게 덮는다(px, 1080 자). 라벨이 꼭 안 맞아 끝이 삐져나오면
그 조각이 GPT 에 그대로 가고, GPT 는 그걸 보고 마저 그린다."""

덮개색칸 = 32
"""덮개색을 고를 때 RGB 를 이 간격으로 훑는다 (8×8×8 = 512 가지 후보)."""

덮개색남음한도 = 0.005
"""돌아온 그림에 덮개색이 이 몫 넘게 남아 있으면 «덜 지웠다» 로 본다.
가장자리 흐림 때문에 몇 점은 남을 수 있어 0 으로 두지 않는다."""


def 없는색(img: np.ndarray) -> tuple:
    """그림에 쓰인 어떤 색과도 **가장 먼 색**. `((r,g,b), 그 거리)`.

    그림 안에 그 색이 한 점도 없어야 GPT 가 헷갈릴 데가 없고, 나중에 «이 색이
    남았나» 로 검산도 된다. 실측(2026-09-24, 게시물 열넷): 가장 빠듯한 것이 56,
    나머지는 88~120 만큼 떨어졌다 — 열넷 다 그림 안에 그 색이 0점이었다.
    """
    쓴색 = np.unique((img.reshape(-1, 3) // 16) * 16 + 8, axis=0).astype(np.int16)
    축 = np.arange(덮개색칸 // 2, 256, 덮개색칸, dtype=np.int16)
    후보 = np.stack(np.meshgrid(축, 축, 축, indexing="ij"), -1).reshape(-1, 3)
    최고, 고른 = -1, (255, 0, 255)
    for i in range(0, len(후보), 64):
        덩 = 후보[i:i + 64]
        d = np.abs(덩[:, None, :] - 쓴색[None, :, :]).max(axis=2).min(axis=1)
        k = int(d.argmax())
        if d[k] > 최고:
            최고, 고른 = int(d[k]), tuple(int(v) for v in 덩[k])
    return 고른, 최고


def 덮개씌우기(img: np.ndarray, 잰네모들):
    """라벨 자리를 **그림에 없는 색 한 가지**로 덮는다. `(덮은 그림, 색, 가림막)`.

    **닿은 네모끼리 한 덩어리로 본다.** 네모마다 색을 따로 정하면 겹친 데서 나중
    네모가 앞 것을 덮어써, 첫 네모의 삐져나온 테두리만 남는다(실물 DYon1QyCWqh).
    한 색으로 통일하면 그 문제가 없고 지시문도 짧아진다.
    """
    a = np.ascontiguousarray(np.asarray(img, np.uint8)).copy()
    h, w = a.shape[:2]
    가림 = np.zeros((h, w), bool)
    for x0, y0, x1, y1 in 잰네모들:
        X0, Y0 = max(0, int(x0 - 덮개여유)), max(0, int(y0 - 덮개여유))
        X1, Y1 = min(w, int(x1 + 덮개여유)), min(h, int(y1 + 덮개여유))
        if X1 > X0 and Y1 > Y0:
            가림[Y0:Y1, X0:X1] = True
    색, _ = 없는색(a)
    a[가림] = 색
    return Image.fromarray(a), 색, 가림


def 덮개색남음(난것: Image.Image, 색) -> float:
    """돌아온 그림에서 덮개색으로 남은 화소의 몫. 0 이면 다 지운 것이다."""
    a = np.asarray(난것.convert("RGB"), np.int16)
    return float((np.abs(a - np.array(색, np.int16)).max(axis=2) <= 40).mean())


# 요소보다 이만큼 넓게 테두리를 두른다 — 알약 둥근 끝이 새어 나오지 않게.
# **검산도 이 여유만큼 넓혀서 «라벨 안» 으로 친다** — 그 띠는 GPT 가 지우라고
# 들은 자리라 달라도 탈이 아니다.
테두리여유 = 8

# 두 화소를 «같다» 고 볼 차이(0~255, 빨강·초록·파랑 중 가장 큰 것).
# 사진 압축이 만드는 흔들림을 넘기려는 것이다.
같은화소 = 8

# 메운 자리 색이 둘레 종이와 이만큼(0~255, 빨강·초록·파랑 중 가장 크게 벌어진 값) 넘게
# 다르면 «지어낸 것» 으로 본다. **일부러 약하게 둔다**(사람 지시 2026-09-28: 「검증에서
# 픽셀 단위로 판단하는 건 인간은 어차피 비교 못 하는데 의미가 없어 — 대체적인 색
# 비교만, 엄청 약하게」).
#
# **배경판은 «만드는 것» 이 아니라 «지우고 메우는 것» 이다**(사람 지시 2026-09-22).
# 라벨한 것은 윗층이고, 들어내면 아랫층에 그 모양대로 구멍이 난다. 배경판은 그
# 구멍을 둘레가 이어지도록 메워 라벨하기 «전» 의 아랫층으로 돌려놓은 것이다.
#
# 막아야 할 사고는 하나 — 메운 자리에 없던 종이를 지어내는 것. 실물 DbX5fhOAdyC
# (2026-09-22): 검은 카드에 크림색 종이, 차이 200 넘게. 그 밖의 흔들림(GPT 가 다시
# 그리며 몇 단계 밝아지는 것)은 그림 전체가 한 붓이라 눈에 안 띈다.
#
# 옛 검산은 라벨 밖 화소를 하나하나 맞대서(±8) 절반 이상 같아야 통과였다. 그 잣대는
# 점무늬 종이를 늘 떨어뜨렸다 — GPT 는 점을 딴 자리에 찍으니 눈에는 같은 종이여도
# 30% 만 같았다(실물 DbmjT0Cj8-I, 두 번 다 탈락 → 검정 CTA 판이 대표 판으로 깔림).
# 가운뎃값 색끼리 견주면 무늬는 통과하고 지어낸 종이만 걸린다.
#
# **되돌리기(라벨 밖을 원본 화소로)는 안 한다.** 2026-09-28 에 해 봤다가 뺐다 — 라벨
# 안(GPT)과 밖(원본)의 밝기가 2~3단계 달라 라벨 자리가 네모로 비쳤다(그로스플래닛
# 안 #F4F4F4·밖 #F2F2F2). 경계를 섞어도 네모 «안» 의 차이는 못 없앤다. GPT 는 그림
# 전체를 한 붓으로 그리니 그대로 쓴다. 라벨 안 한 것을 살리려면 장식으로 라벨한다.
메운색문턱 = 64

# 볼 데가 이보다 적으면 «둘레 종이색» 을 잴 수가 없다. 그때는 **안 쓴다** —
# 모르면 안 쓰는 쪽으로 기운다(`종이색` 이 볼 화소가 적으면 None 을 내는 것과 같은 결).
볼화소하한 = 1000

# 메운 자리 «둘레» 에서 종이색을 재는 띠의 폭(px). 덮개 바로 바깥이라야 그 자리 종이다.
둘레띠 = 12


다시뜰횟수 = 1
"""걸렸을 때 **더** 떠 보는 횟수. GPT 는 부를 때마다 다르게 낸다 — 같은 그림을 두 번
보냈더니 79% 와 76.6% 가 나왔다(실물 DYWiVHhlNwo, 2026-09-24). 한 번 걸렸다고 바로
버리면 될 것도 버린다.

**값은 걸렸을 때만 곱절이 된다**(한 장 $0.05). 잘 나오면 한 번만 부른다."""


class 딴그림(RuntimeError):
    """GPT 가 지운 것이 아니라 다시 그렸다. **다시 떠 봐도 안 되면 이 판은 버린다.**

    부르는 쪽(`merge_labeled.GPT바닥판`)이 이것을 잡아 그 묶음만 건너뛰고,
    하나도 못 만들면 옛 바닥판(`배경판.바닥뜨기`)으로 간다 — 그쪽은 진짜 화소를
    떠서 깔므로 적어도 색은 안 틀린다.
    """


def 메운자리색차(난것: Image.Image, 원: Image.Image, 가림: np.ndarray) -> float | None:
    """덮개 덩어리마다 «GPT 가 메운 색» 과 «원본에서 그 둘레 종이색» 의 차이, 그중 가장
    큰 값. 둘 다 가운뎃값이라 무늬·점·글자 부스러기에 안 흔들린다. 잴 둘레가 없으면 None
    — 그때는 «모르면 안 쓴다».
    """
    a = np.asarray(난것.convert("RGB"), np.int16)
    b = np.asarray(원.convert("RGB"), np.int16)
    n, 표 = cv2.connectedComponents(가림.astype(np.uint8), connectivity=8)
    핵 = np.ones((2 * 덮개여유 + 1, 2 * 덮개여유 + 1), np.uint8)
    띠핵 = np.ones((2 * 둘레띠 + 1, 2 * 둘레띠 + 1), np.uint8)
    가장큼 = None
    for k in range(1, n):
        덩 = (표 == k).astype(np.uint8)
        둘레 = cv2.dilate(덩, 띠핵).astype(bool) & ~가림
        if int(둘레.sum()) < 볼화소하한:
            continue
        속 = cv2.erode(덩, 핵).astype(bool)       # 덮개여유를 벗긴 라벨 자리
        if int(속.sum()) < 100:
            속 = 덩.astype(bool)
        차 = float(np.abs(np.median(a[속], axis=0) - np.median(b[둘레], axis=0)).max())
        가장큼 = 차 if 가장큼 is None else max(가장큼, 차)
    return 가장큼


같은종이 = 10.0
"""장끼리 «가장 흔한 종이색» 이 이만큼도 안 다르면 같은 종이로 본다(0~255, 빨강·초록·
파랑 중 가장 크게 벌어진 값).

실측(2026-09-19, 게시물 여섯): 같은 종이끼리는 0~1, 다른 종이끼리는 25 이상이다
(마트 흰색 대 연두 25, 파스텔 파랑 대 흰색 235). 그 사이가 비어 있어 문턱을 어디 두든
결과가 같다. 사진 압축이 만드는 1~2 는 같은 것으로 본다.
"""


def 종이색(img, 네모들) -> tuple | None:
    """라벨 안 한 화소의 «가장 흔한 색». 16단계로 뭉뚱그려 세므로 라벨 안 된 사진
    조각이 섞여도 안 흔들린다. 볼 화소가 너무 적으면 `None`."""
    가림 = np.zeros(img.shape[:2], bool)
    for _, b in 네모들:
        x0, y0, x1, y1 = [int(round(v)) for v in b]
        가림[max(0, y0):y1, max(0, x0):x1] = True
    화소 = img[~가림]
    if len(화소) < 500:
        return None
    뭉 = (화소 // 16).astype(np.int32)
    키 = 뭉[:, 0] * 256 + 뭉[:, 1] * 16 + 뭉[:, 2]
    값, 셈 = np.unique(키, return_counts=True)
    고른 = 키 == 값[셈.argmax()]
    return tuple(화소[고른].mean(axis=0).round().astype(int).tolist())


def 묶기(장들: list) -> list:
    """종이가 같은 장끼리 묶는다. `[[장, …], …]` — 묶음마다 바닥판을 하나씩 만든다.

    사람 결정 2026-09-19: 「파란색 바닥판이면 그거 쓰고 회색 바닥판이면 그거 써야지」.
    실물 파스텔(DNUFIa4NIkK)은 2장이 파란 종이, 3~7장이 흰 종이라 한 장으로 뜨면
    일곱 중 다섯에 엉뚱한 판이 깔린다.
    """
    쓸것 = [s for s in 장들 if not s.get("배경사진")]
    묶음: list = []
    for s in 쓸것:
        색 = 종이색(s["img"], s["네모들"])
        if 색 is None:
            continue
        for 무리 in 묶음:
            if max(abs(a - b) for a, b in zip(색, 무리["색"])) < 같은종이:
                무리["장들"].append(s)
                break
        else:
            묶음.append({"색": 색, "장들": [s]})
    return [m["장들"] for m in sorted(묶음, key=lambda m: -len(m["장들"]))]


def 고르기(장들: list, 표지끝빼기: bool = True) -> int | None:
    """바닥판을 만들 장의 번호. `장들` 은 `{"index", "배경사진", "w", "h", "네모들"}` 목록.
    배경사진 장을 빼고 라벨이 덮는 넓이가 가장 작은 장. 없으면 None.

    `표지끝빼기` 가 참이면 표지와 마지막 장도 뺀다 — 그 둘은 디자인이 다를 때가 많다.
    **종이 묶음마다 뜰 때는 끈다**(2026-09-19): 묶음이 이미 «종이가 같은 장» 만 모은
    것이라 표지가 그 안에 있으면 그것도 같은 종이다. 마트 표지는 흰색, 본문은 연두라
    표지가 제 묶음을 이루고, 그 묶음에서는 표지 말고 고를 것이 없다.
    """
    if not 장들:
        return None
    후보 = [s for s in 장들 if not s.get("배경사진")]
    if 표지끝빼기:
        첫, 끝 = min(s["index"] for s in 장들), max(s["index"] for s in 장들)
        후보 = [s for s in 후보 if s["index"] not in (첫, 끝)]
    if not 후보:
        return None

    def 덮음(s):
        return sum(max(0, b[2] - b[0]) * max(0, b[3] - b[1]) for _, b in s["네모들"]) / max(1, s["w"] * s["h"])
    return min(후보, key=lambda s: (덮음(s), s["index"]))["index"]


def _주소(im: Image.Image) -> str:
    b = io.BytesIO()
    im.save(b, "PNG")
    return "data:image/png;base64," + base64.b64encode(b.getvalue()).decode("ascii")


def _읽기(주소: str) -> Image.Image:
    return Image.open(io.BytesIO(base64.b64decode(주소.split(",", 1)[1]))).convert("RGB")


def 부르기(몸: dict) -> bytes:
    """fal 에 보내 PNG 바이트를 돌려준다. 실패하면 예외."""
    키 = os.environ.get("FAL_KEY", "")
    머리 = {"Authorization": f"Key {키}", "Content-Type": "application/json"}
    import requests
    r = requests.post(gpt누끼.끝점, headers=머리, data=json.dumps(몸), timeout=60)
    if r.status_code >= 300:
        raise RuntimeError(f"fal 걸기 {r.status_code}")
    접수 = r.json()
    for _ in range(120):
        s = requests.get(접수["status_url"], headers={"Authorization": f"Key {키}"}, timeout=60).json()
        if s.get("status") == "COMPLETED":
            break
        if s.get("status") in ("FAILED", "ERROR"):
            raise RuntimeError("fal 실패")
        time.sleep(2)
    else:
        raise RuntimeError("fal 시간 초과")
    결과 = requests.get(접수["response_url"], headers={"Authorization": f"Key {키}"}, timeout=60).json()
    그림들 = 결과.get("images") or []
    if not 그림들:
        raise RuntimeError("fal 그림 없음")
    return requests.get(그림들[0]["url"], timeout=120).content


def 만들기(img: np.ndarray, 네모들: list, 크기: tuple, 부르기=부르기) -> bytes:
    """`img` 와 `네모들` 로 바닥판 PNG 를 만든다. 내는 크기는 `크기`(캔버스, (w, h)).

    **`img` 와 `네모들` 은 «같은 자» 라야 한다.** 네모는 `(종류, [x0,y0,x1,y1])` 이고
    그 좌표는 `img` 의 화소 좌표다. 부르는 쪽(`merge_labeled`)은 1080 으로 맞춘
    그림과 1080 으로 맞춘 네모를 준다.

    **여기서 또 배율을 재는 까닭**은 `크기` 가 `img` 와 다를 수 있어서다 — 그때는
    둘 다 `크기` 로 옮긴다. 같으면 배율이 1 이라 아무 일도 안 일어난다.

    2026-09-24 실물: 부르는 쪽이 네모를 안 맞춰 넘겨서, 원본이 1080 이 아닌 여섯
    벌이 엉뚱한 자리를 지우고 있었다. 그래서 «같은 자» 를 여기 못 박는다.
    """
    w, h = 크기
    원 = Image.fromarray(np.ascontiguousarray(img)).convert("RGB")
    sx, sy = w / 원.width, h / 원.height
    원 = 원.resize((w, h), Image.LANCZOS)
    # **한 번만 재 둔다** — 메우기·되돌리기·검산이 같은 네모를 봐야 한다.
    잰네모 = [(b[0] * sx, b[1] * sy, b[2] * sx, b[3] * sy) for _, b in 네모들]
    # **그림은 한 장, 라벨 자리는 «그림에 없는 색» 하나로 덮어서 준다**(2026-09-24).
    덮은것, 덮개색, 가림 = 덮개씌우기(np.asarray(원, np.uint8), 잰네모)
    hex색 = "#%02X%02X%02X" % 덮개색
    몸 = {"prompt": 지시문.format(색=hex색, w=w, h=h),
         "image_urls": [_주소(덮은것)],
         "image_size": {"width": w, "height": h}, "quality": 품질, "num_images": 1, "output_format": "png"}
    # **걸리면 한 번 더 떠 본다**(사람 지시 2026-09-24). GPT 는 부를 때마다 다르게
    # 낸다 — 한 번 걸렸다고 바로 버리면 될 것도 버린다.
    잰것들 = []
    for 차례 in range(다시뜰횟수 + 1):
        png = 부르기(몸)
        im = Image.open(io.BytesIO(png)).convert("RGB")
        if im.size != (w, h):
            im = im.resize((w, h), Image.LANCZOS)
        # **검산 둘.** ① 덮개색이 남았나(덜 지웠나) ② 메운 자리 색이 둘레 종이와
        # 대충 비슷한가(없던 종이를 지어냈나). ①이 더 곧다 — 우리가 칠한 색이라 틀릴
        # 수가 없다. 화소 단위 비교는 안 한다(`메운색문턱` 주석).
        남 = 덮개색남음(im, 덮개색)
        차 = 메운자리색차(im, 원, 가림)
        잰것들.append((남, 차))
        if 남 <= 덮개색남음한도 and 차 is not None and 차 <= 메운색문턱:
            # **GPT 가 준 그대로 쓴다**(사람 지시 2026-09-24, 2026-09-28 재확인).
            # 그림 전체가 한 붓이라 안팎이 이어진다 — 라벨 밖을 원본으로 되돌리면
            # 밝기가 몇 단계만 달라도 라벨 자리가 네모로 비친다(같은 날 실물에서 봄).
            b = io.BytesIO()
            im.save(b, "PNG")
            return b.getvalue()
        if 차례 < 다시뜰횟수:
            print(f"  바닥판 다시 뜬다 — 덮개색 {남:.1%} 남음 · 메운 자리 색차 {_차글(차)}")
    raise 딴그림(
        "덮개색 남음 · 메운 자리 색차 = "
        + " · ".join(f"{a:.1%}/{_차글(b)}" for a, b in 잰것들)
        + f" (문턱 {덮개색남음한도:.1%} 아래 · {메운색문턱} 아래)")


def _차글(차) -> str:
    return "둘레 없음" if 차 is None else f"{차:.0f}"
