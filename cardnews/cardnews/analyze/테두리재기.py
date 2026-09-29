# -*- coding: utf-8 -*-
"""칸 둘레에 «눈에 보이는 선» 이 있는지 재고, 있으면 색과 굵기를 낸다.

굽는 쪽·작업대가 쓰는 이름과 같다 — `선색`·`선굵기`. 도형 «모양» 인 `테두리`
와는 다른 것이다. 그건 점 목록이고 이것은 그 둘레에 두르는 선이다.

**모양 가장자리 «둘레 몇 px 안» 에서 찾는다**(2026-09-28). 옛 코드는 가장자리
0번 겹이 곧 선이라고 믿었는데, 사람이 그은 모양은 선보다 2~4px 안쪽이고(실물
DNUFIa4NIkK Point! 상자 — 위 +4 · 아래 −3 · 왼 +2 · 오른 0 으로 변마다 다르게)
기계가 흘려채우기로 딴 모양은 번짐까지 포함해 1~2px 바깥이라(실물 DYon1QyCWqh
꿀팁 상자) 8칸 중 7칸을 놓쳤다. 이제 둘레를 따라 자리마다 안팎 단면을 떠서,
바깥색도 속색도 아닌 띠를 선으로 잡는다 — 자리마다 따로 보니 변마다 어긋나도
상관없고, 번짐 화소는 선보다 덜 두드러져 선 색으로 안 뽑힌다.

**모양 안쪽에서 잰다.** 네모로 재면 동그란 사진의 네 귀퉁이 배경이 띠로 보여
「19px 하늘색 테두리」 같은 헛것이 나온다(실물 2026-09-19 DSW-6lrk5rs 4장).

**빡세게 안 가른다**(사람 결정 2026-09-19). 잘못 넣어도 작업대에서 굵기를 0 으로
내리면 빠진다 — 없는 것을 빠뜨리는 쪽이 더 나쁘다. 다만 «과한 테두리» 는 거의
잘못 잰 것이라 두께에 상한을 둔다.

**거리는 opencv 로 잰다 — scipy 를 안 쓴다.** 분석 람다가 지고 가는 짐
(`requirements-lambda.txt`)에 scipy 가 없다(실물 2026-09-19 `ModuleNotFoundError`).
"""
from __future__ import annotations

import math

import cv2
import numpy as np

# 자리마다 잰 선 색이 이만큼 넘게 흩어지면 선이 아니다 — 사진 가장자리가 그렇다.
# 1~2px 선은 압축과 번짐이 그대로 실려 자리마다 밝기가 크게 흔들린다 — 실물 마트
# DHqCBQnRAjW 5장의 검은 1px 선이 #000300 부터 #353831 까지(2026-09-28). 헛것은
# 이 문턱보다 앞의 「절반 넘는 자리에서 같은 띠」 표에서 먼저 걸러진다.
흩어짐문턱 = 50.0

# 3px 넘는 띠는 번짐 탓을 못 한다 — 진짜 액자는 평평하다(실물 dimo 흰 액자 0.0).
# 사진 가장자리의 내용(살구색 벽, 분홍 화면)이 띠로 잡힐 때 27~35 로 흔들렸다.
두꺼운띠흩어짐 = 25.0

# 굵기 1~2px 짜리 «선» 의 색이 바깥색과 속색 사이의 중간색이면 선이 아니라 번짐
# (안티에일리어싱)이다 — 검은 상자 둘레의 회색 1px, 민트 알약 둘레의 짙은 초록 1px
# 이 그렇다(실물 2026-09-28 DZAKCV7D91C·DYzN0Uzgaq6). 두 색을 잇는 선분에서 이만큼
# 안이면 중간색으로 본다.
섞임문턱 = 30.0

# 띠와 속이 이만큼은 달라야 «선» 이다. 흰 배경이 딸려 들어온 알약이 62 였다 —
# 그것을 넘기면 배경이 테두리로 들어온다(실물 DSW-6lrk5rs 4장 도형 셋).
색차이문턱 = 90.0

# 이보다 두꺼우면 선이 아니라 면이다. 짧은 변 대비 비율도 같이 본다.
두께상한 = 12
두께비율상한 = 0.06

# 이보다 작은 칸은 안 잰다 — 띠와 속을 가를 화소가 모자란다.
최소변 = 60

# 띠가 «칸 바깥» 과 이만큼은 달라야 선이다. 모양을 실제보다 크게 따면 바깥
# 배경이 모양 안으로 딸려 들어와 띠처럼 보인다 — 흰 바탕의 검은 알약에
# 「흰 테두리 5px」가 붙었다(실물 2026-09-19 DG0AA6PJ8s4, 30칸 중 13칸).
바깥차이문턱 = 40.0

# 모양이 칸을 이만큼 채우면 «네모» 로 본다. 그 아래면 오려낸 모양이다.
네모로볼채움 = 0.985

# 속이 이만큼 들쭉날쭉하면 «사진» 이다. 단색 도형은 이보다 훨씬 고르다.
사진으로볼흩어짐 = 60.0

# 가장자리 «밖» 으로 이만큼까지 선을 찾는다 — 라벨이 선보다 안쪽일 때(실측 최대 4px).
바깥깊이 = 8

# 가장자리 «안» 으로 이만큼까지 — 라벨이 선보다 바깥일 때의 어긋남에 선 굵기를 더한 것.
안깊이 = 두께상한 + 8

# 바깥색은 가장자리에서 이만큼 떨어진 띠에서 잰다 — 선이 밖에 있어도 안 섞이게.
바깥색띠 = (바깥깊이 + 2, 바깥깊이 + 6)

# 이만큼 안이면 «같은 색» 으로 본다(빨강·초록·파랑 차이의 합) — 한 띠로 묶는 잣대.
같은색 = 60.0

# 선의 바깥 가장자리는 «뚝» 끊긴다 — 바깥 3px 안 어딘가와 이만큼 넘게 달라야 한다.
# 그림자는 한 화소에 10 안팎씩 서서히 옅어져 3px 을 봐도 이만큼이 안 되고(실물 dimo
# 액자 바깥 E5→CA 가 4px), 선은 바로 옆 종이와 한 번에 그만큼 벌어진다.
도약문턱 = 80.0

# 둘레에서 이만큼 자리를 본다. 많으면 느리고, 적으면 모서리 하나에 휘둘린다.
표본수 = 160


def 도형안사진인가(색: np.ndarray, 속: np.ndarray) -> bool:
    """**모양이 네모가 아닌데 속이 사진이면 도형 안에 사진이 든 것이다.**

    그런 칸은 테두리를 아예 안 잰다(사람 결정 2026-09-19). 모양 가장자리에서
    사진 색이 배경과 섞이며 띠처럼 보여, 없는 테두리를 만들어 내기 때문이다
    — 동그란 인물 사진에 「19px 하늘색 테두리」가 그렇게 붙었다.
    """
    if float(속.mean()) > 네모로볼채움:
        return False                     # 네모다 — 사진이어도 그냥 잰다
    안 = 색[속]
    if len(안) < 50:
        return False
    흩어짐 = float(np.median(np.abs(안 - np.median(안, axis=0)).sum(axis=1)))
    return 흩어짐 > 사진으로볼흩어짐


def _속색(색: np.ndarray, 속: np.ndarray) -> np.ndarray:
    """모양 «깊은 속» 의 가운데 색. 선이 있을 법한 가장자리 띠는 뺀다."""
    거리 = cv2.distanceTransform(np.pad(속, 1).astype(np.uint8), cv2.DIST_L2,
                                cv2.DIST_MASK_PRECISE)[1:-1, 1:-1]
    깊이 = min(float(안깊이), max(1.0, float(거리.max()) * 0.5))
    깊은 = 속 & (거리 >= 깊이)
    if int(깊은.sum()) < 50:
        깊은 = 속
    return np.median(색[깊은], axis=0)


def _둘레표본(속: np.ndarray) -> list:
    """모양 둘레를 따라 고른 자리들 `(y, x, ny, nx)` — 법선은 «바깥» 을 향한다."""
    윤곽들, _ = cv2.findContours(속.astype(np.uint8), cv2.RETR_EXTERNAL,
                                cv2.CHAIN_APPROX_NONE)
    if not 윤곽들:
        return []
    c = max(윤곽들, key=cv2.contourArea).reshape(-1, 2)     # (x, y)
    n = len(c)
    if n < 8:
        return []
    간격 = max(1, n // 표본수)
    h, w = 속.shape

    def 안(y: int, x: int) -> bool:
        return 0 <= y < h and 0 <= x < w and bool(속[y, x])

    난것 = []
    for i in range(0, n, 간격):
        p, a, b = c[i], c[(i - 4) % n], c[(i + 4) % n]
        tx, ty = float(b[0] - a[0]), float(b[1] - a[1])
        길이 = math.hypot(tx, ty)
        if 길이 == 0:
            continue
        nx, ny = ty / 길이, -tx / 길이
        # 3px 나간 자리는 마스크 밖이고 3px 들어온 자리는 안이라야 «바깥» 이다.
        밖쪽 = 안(int(round(p[1] + 3 * ny)), int(round(p[0] + 3 * nx)))
        안쪽 = 안(int(round(p[1] - 3 * ny)), int(round(p[0] - 3 * nx)))
        if 밖쪽 == 안쪽:
            continue                     # 가는 목이거나 모서리 — 방향을 못 정한다
        if 밖쪽:
            nx, ny = -nx, -ny
        난것.append((int(p[1]), int(p[0]), ny, nx))
    return 난것


def _단면(색: np.ndarray, y: int, x: int, ny: float, nx: float) -> np.ndarray | None:
    """한 자리에서 법선을 따라 뜬 색 단면 — t = −안깊이(속) … +바깥색띠[1](밖).
    그림을 벗어나면 None, 그 자리는 못 잰다."""
    h, w = 색.shape[:2]
    ts = np.arange(-안깊이, 바깥색띠[1] + 1)
    ys = np.round(y + ts * ny).astype(int)
    xs = np.round(x + ts * nx).astype(int)
    if ys.min() < 0 or xs.min() < 0 or ys.max() >= h or xs.max() >= w:
        return None
    return 색[ys, xs]


def _섞인색인가(선색: np.ndarray, 바깥: np.ndarray, 속: np.ndarray) -> bool:
    """선 색이 바깥색과 속색을 잇는 선분(RGB 공간)에 `섞임문턱` 안으로 붙어 있나."""
    v = 속 - 바깥
    길이 = float(v @ v)
    t = 0.0 if 길이 == 0 else float(np.clip(((선색 - 바깥) @ v) / 길이, 0.0, 1.0))
    return float(np.abs(선색 - (바깥 + t * v)).sum()) < 섞임문턱


def _토막들(d: np.ndarray, s: int, e: int) -> list:
    """후보 구간 `d[s..e]`(속→밖 차례)을 같은 색 토막으로 나눠 **바깥 토막부터**
    `(색, 차례)` 로. 둘은 뺀다 — 양 이웃의 중간색인 1px 토막(번짐)과, 바깥으로 서서히
    옅어지는 토막(바깥 3px 안에 `도약문턱` 넘게 달라지는 자리가 없다 = 그림자)."""
    n = len(d)
    경계, a = [], s
    for k in range(s + 1, e + 2):
        if k == e + 1 or float(np.abs(d[k] - d[a]).sum()) > 같은색:
            경계.append((a, k - 1))
            a = k
    난것 = []
    for a, b in reversed(경계):
        if a == b and _섞인색인가(d[a], d[a - 1] if a > 0 else d[a], d[b + 1] if b + 1 < n else d[b]):
            continue
        바깥쪽 = d[b + 1:min(n, b + 4)]
        if len(바깥쪽) and float(np.abs(바깥쪽 - d[b]).sum(axis=1).max()) <= 도약문턱:
            continue                     # 뚝 끊기지 않고 옅어진다 — 그림자·번짐이지 선이 아니다
        난것.append((np.median(d[a:b + 1], axis=0), len(난것)))
    return 난것


def _자리토막들(d: np.ndarray, 후보: np.ndarray, 밖같음: np.ndarray, 속같음: np.ndarray) -> list:
    """한 자리(단면)에서 선일 수 있는 토막들 `(색, 바깥에서부터의 차례)`.

    바깥에서 안으로 들어오며 후보 구간을 차례로 본다. 안쪽 이웃이 «종이색이면서 속색은
    아닌» 구간은 종이 위에 뜬 혹이라 건너뛰고, 그다음 구간을 쓴다. 자리마다 구간 하나만."""
    n = len(d)
    i = n - 1
    while i >= 0:
        if not 후보[i]:
            i -= 1
            continue
        e = i
        while i - 1 >= 0 and 후보[i - 1]:
            i -= 1
        s = i
        if s - 1 >= 0 and 밖같음[s - 1] and not 속같음[s - 1]:
            i = s - 1                    # 안쪽이 다시 종이 — 혹이다, 다음 구간으로
            continue
        return _토막들(d, s, e)
    return []


def _가장긴띠(같: np.ndarray) -> tuple[int, int, int]:
    """참이 이어진 가장 긴 구간 `(길이, 시작, 끝)`. 없으면 `(0, 0, 0)`."""
    best, 시작 = (0, 0, 0), None
    for i, ok in enumerate(list(같) + [False]):
        if ok and 시작 is None:
            시작 = i
        elif not ok and 시작 is not None:
            if i - 시작 > best[0]:
                best = (i - 시작, 시작, i)
            시작 = None
    return best


def 재기(img: np.ndarray, 마스크: np.ndarray) -> dict | None:
    """`마스크` 가 참인 모양 둘레에서 선을 찾는다. 없으면 None.

    `img` 는 RGB, `마스크` 는 같은 크기의 bool. 돌려주는 것은
    `{"선색": "#RRGGBB", "선굵기": n, "흩어짐": f, "색차이": f}`.

    순서: ① 둘레 자리마다 안팎 단면을 뜬다 ② 바깥색·속색 어느 쪽도 아닌 화소를
    모아 «가장 두드러진 한 색» 을 고른다(개수가 아니라 «바깥·속과 얼마나 다른가»
    의 합으로 — 번짐 화소는 중간색이라 점수가 낮다) ③ 자리마다 그 색으로 이어진
    띠의 길이를 잰다 ④ 절반 넘는 자리에서 같은 띠가 나와야 선이다.
    """
    if 마스크 is None or int(마스크.sum()) < 400:
        return None
    자리 = np.argwhere(마스크)
    (y0, x0), (y1, x1) = 자리.min(axis=0), 자리.max(axis=0) + 1
    짧은변 = min(y1 - y0, x1 - x0)
    if 짧은변 < 최소변:
        return None
    if 도형안사진인가(img[y0:y1, x0:x1].astype(np.float32), 마스크[y0:y1, x0:x1]):
        return None
    # 둘레 밖으로 바깥색띠까지 볼 수 있게 여유를 두고 자른다.
    여 = 바깥색띠[1] + 2
    b0, a0 = max(0, y0 - 여), max(0, x0 - 여)
    b1, a1 = min(img.shape[0], y1 + 여), min(img.shape[1], x1 + 여)
    색 = img[b0:b1, a0:a1].astype(np.float32)
    속 = 마스크[b0:b1, a0:a1]
    속색 = _속색(색, 속)
    단면들 = [d for d in (_단면(색, *s) for s in _둘레표본(속)) if d is not None]
    if len(단면들) < 6:
        return None
    ts = np.arange(-안깊이, 바깥색띠[1] + 1)
    창 = ts <= 바깥깊이                              # 선을 찾는 자리
    바깥자리 = (ts >= 바깥색띠[0]) & (ts <= 바깥색띠[1])

    # ① 자리마다 «바깥색도 속색도 아닌» 화소를 고른다 — 선 후보. 바깥에서 안으로
    #    들어오며 후보 구간을 차례로 보되, **안쪽 이웃이 속색인 구간** 이 선 자리다.
    #    그림자는 안쪽 이웃이 다시 종이라 건너뛰고(실물 dimo — 흰 액자 바깥의 그림자),
    #    그 안쪽 후보는 사진 속 내용이지 선이 아니다(실물 그로스플래닛 6장 — 검은 1px
    #    선 안쪽의 연회색 사진 여백 9px). 구간 안에서 색이 같은 토막으로 나눠 가장
    #    바깥 토막을 쓰고, 양 이웃의 중간색인 1px 토막(번짐)은 뺀다.
    표색, 표차례, 표자리, 바깥색들 = [], [], [], []
    for 번호, d in enumerate(단면들):
        바깥 = np.median(d[바깥자리], axis=0)
        바깥색들.append(바깥)
        멀밖 = np.abs(d - 바깥).sum(axis=1)
        멀속 = np.abs(d - 속색).sum(axis=1)
        밖같음, 속같음 = 멀밖 <= 바깥차이문턱, 멀속 <= 같은색
        for 색깔, 차례 in _자리토막들(d, 창 & ~밖같음 & ~속같음, 밖같음, 속같음):
            표색.append(색깔); 표차례.append(차례); 표자리.append(번호)
    if not 표색:
        return None                      # 끝까지 바깥 아니면 속 = 그냥 면이다

    # ② 자리들의 표를 센다. 토막 색마다 «같은색 안에 드는 토막을 낸 자리가 몇인가»
    #    를 세고, 절반 넘는 자리가 미는 색 가운데 **가장 바깥 차례** 인 것이 선이다.
    #    사진 속 잡음은 자리마다 색이 달라 표가 안 모이고, 선 안쪽의 사진 여백은
    #    자리는 많아도 차례가 뒤라 선(차례 0)에 진다. (색을 칸으로 뭉뚱그려 세면
    #    칸 경계에 걸친 파랑이 두 칸으로 갈려 절반을 못 넘긴다 — 실물 스나이퍼팩토리.)
    표색 = np.array(표색); 표차례 = np.array(표차례); 표자리 = np.array(표자리)
    가까움 = np.abs(표색[:, None, :] - 표색[None, :, :]).sum(axis=2) <= 같은색
    최소지지 = max(6, len(단면들) * 0.5)
    고른, 고른값 = None, None
    for i in range(len(표색)):
        지지 = len(np.unique(표자리[가까움[i]]))
        if 지지 < 최소지지:
            continue
        값 = (float(np.median(표차례[가까움[i]])), -지지)
        if 고른값 is None or 값 < 고른값:
            고른, 고른값 = i, 값
    if 고른 is None:
        return None
    선색후보 = np.median(표색[가까움[고른]], axis=0)

    # ③ 자리마다 그 색으로 이어진 띠 — 굵기와 자리 색.
    두께들, 색들 = [], []
    for d in 단면들:
        같 = 창 & (np.abs(d - 선색후보).sum(axis=1) <= 같은색)
        길이, s, e = _가장긴띠(같)
        if 길이 == 0 or s == 0:
            continue                     # s == 0: 속 끝까지 이어졌다 — 선이 아니라 면
        두께들.append(길이)
        토막 = d[s:e] if 길이 < 3 else d[s + 1:e - 1]    # 양 끝 번짐은 빼고 색을 본다
        색들.append(np.median(토막, axis=0))

    # ④ 절반 넘는 자리에서 나와야 선이다.
    if len(두께들) < max(6, len(단면들) * 0.5):
        return None
    색들 = np.array(색들)
    선색 = np.median(색들, axis=0)
    흩어짐 = float(np.median(np.abs(색들 - 선색).sum(axis=1)))
    두께 = int(math.floor(float(np.median(두께들)) + 0.5))
    바깥색 = np.median(np.array(바깥색들), axis=0)
    색차이 = float(np.abs(선색 - 속색).sum())
    바깥차 = float(np.abs(선색 - 바깥색).sum())
    허용흩어짐 = 흩어짐문턱 if 두께 <= 2 else 두꺼운띠흩어짐
    if 두께 <= 0 or 흩어짐 >= 허용흩어짐 or 색차이 <= 색차이문턱 or 바깥차 < 바깥차이문턱:
        return None
    if 두께 > 두께상한 or 두께 > 짧은변 * 두께비율상한:
        return None                      # 과한 테두리는 거의 잘못 잰 것이다
    if 두께 <= 2 and _섞인색인가(선색, 바깥색, 속색):
        return None                      # 바깥과 속의 중간색 한두 px = 번짐이지 선이 아니다
    r, g, b = (int(round(float(v))) for v in 선색)
    return {"선색": "#%02X%02X%02X" % (r, g, b), "선굵기": 두께,
            "흩어짐": round(흩어짐, 1), "색차이": round(색차이, 1)}


def 사진끼리맞추기(잰것들: list[dict | None], 갈래들: list[str]) -> list[dict | None]:
    """**사진은 한 게시물 안에서 통일한다**(사람 결정 2026-09-19).

    디자인은 원래 통일돼 있다 — 열 장 중 두 장만 테두리가 다르면 그게 잘못 잰
    것이다. 사진 중 잡힌 것이 하나라도 있으면 **가장 흔한 색·굵기** 를 모든
    사진에 넣는다. 도형은 장마다 다른 것이 정상이라 안 맞춘다.
    """
    from collections import Counter     # noqa: PLC0415

    사진잰것 = [r for r, k in zip(잰것들, 갈래들) if k == "사진" and r]
    if not 사진잰것:
        return 잰것들

    # **색은 뭉뚱그려 센다**(16 단계). 자리마다 잰 검정이 #000000·#010101·#020202 로
    # 조금씩 달라 표가 1표씩 흩어지면 엉뚱한 것이 «가장 흔한 값» 이 된다(실물
    # 그로스플래닛 2026-09-28). 이긴 무리의 가운뎃값 색을 쓴다.
    def _rgb(r):
        c = r["선색"].lstrip("#")
        return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))

    def _표(r):
        return (tuple(v // 16 for v in _rgb(r)), r["선굵기"])

    흔한표 = Counter(_표(r) for r in 사진잰것).most_common(1)[0][0]
    무리 = np.array([_rgb(r) for r in 사진잰것 if _표(r) == 흔한표])
    색 = "#%02X%02X%02X" % tuple(int(round(float(v))) for v in np.median(무리, axis=0))
    굵기 = 흔한표[1]
    난것 = []
    for r, k in zip(잰것들, 갈래들):
        if k == "사진":
            # **어디서 온 값인지 남긴다.** 「직접 잰 것」과 「통일로 채운 것」을
            # 못 가르면 사람이 「이 테두리가 진짜 있었나」를 검산할 수 없다
            # (동료 세션 요청 2026-09-19).
            난것.append({"선색": 색, "선굵기": 굵기,
                       "선출처": "직접" if r else "통일"})
        else:
            난것.append({**r, "선출처": "직접"} if r else None)
    return 난것
