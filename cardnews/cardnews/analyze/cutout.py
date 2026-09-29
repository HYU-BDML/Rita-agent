# analyze/cutout.py
"""사람이 「정확한 누끼」로 찍은 네모만 SAM 2 로 오려, 실제 크기·각도·투명 PNG 를 낸다.

**SAM 을 부르는 곳은 여기 하나다** — 그것도 `cut:true` 네모만이다. 네모에 꽉 차는
것(사각 사진·반듯한 글자그릇·버튼)은 네모가 곧 모양이라 마스크가 남는 게 없다.

**Worker 를 거친다, SAM 을 직접 부르지 않는다.** `analyze/regions.py` 의
`sam2_refine()` 은 `RF_BASE`(로컬 9001)로 바로 붙는데, 그 경로는 지금 죽어 있다
(포트가 닫혔고 로컬 Docker 도 없다). 대신 우리 Worker(`POST {BOARD_URL}/api/refine`)
가 R2 에서 그림을 꺼내 SAM 에 대신 물어봐 준다 — Access 출입증을 Worker 가 쥐고
있어서 파이썬은 SAM 열쇠를 몰라도 된다. 인증은 `analyze/fetch_board.py` 와 똑같이
`Authorization: Bearer <token_of(pw)>` + 브라우저 흉내 User-Agent 다(이게 없으면
Cloudflare 가 우리 코드에 닿기도 전에 403 으로 막는다 — 403 은 인증 실패가 아니라
"거기까지 못 갔다"는 뜻).

**장 단위로 몰아서 부른다.** 같은 `image_id`(`<코드>/NN.jpg`, R2 열쇠 그대로)의 **첫**
호출이 SAM 쪽 임베딩 비용을 낸다 — 리뷰 실측(2026-08-19, Worker 경유, 그 세션에서
처음 부르는 `image_id` 로만: `DYUDHNrjg0e/03`(1440폭) 16.84초 · `Db0XBZMD_JN/05`
(3240폭) 19.30초 — 뒤엣것은 직전 호출들이 SAM 서버를 이미 데워 놨는데도 그랬다)는
같은 `image_id` 로 이어지는 호출(1.02~1.16초)보다 14.5~18.9배 걸렸다. 슬라이드를
오가며 부르면 이 임베딩 비용을 매번 다시 낸다 — 그래서 장 단위로 몰아 부른다.
"155초"(`regions.py` 주석)는 죽은 로컬 Docker 경로에서 잰 값이라 이 경로 숫자와는
다르다.

**실패해도 죽지 않는다.** SAM 이 422 를 주거나 빈 마스크·깨진 응답을 주면 사람이
그은 네모를 그대로 쓰고 이유를 찍어 남긴다 — 마스크 하나 잃는 것이 게시물 전체를
잃는 것보다 훨씬 싸다. 그래서 네모 하나를 처리하는 동안 벌어질 수 있는 **모든**
실패(HTTP·인증·JSON 모양·RLE 디코드·빈 마스크·크기 불일치)를 한 번에 감싼다 —
일부만 감싸면 감싸지 못한 실패가 배치 전체를 끊어버린다(30건 중 14번째 게시물의
망가진 RLE 하나가 이미 오려둔 13건어치를 다 날리는 식).

**기록하는 숫자는 1080 캔버스 기준, 그림 배열은 원본 그대로.** 라벨 네모 좌표와
`config.CANVAS_W`·`calibration.json`(1px=1pt)·`recipe.py`(게시물 사이 평균)는 전부
"모든 게시물이 1080폭"이라고 가정한다 — 실제로는 30건 중 12건이 1080이 아니고
(1152~3278폭 섞임, 최대/최소 3.04배), 이걸 그냥 두면 다른 게시물과 평균 낼 때 3배
차이가 조용히 섞인다. 그렇다고 그림 배열을 1080으로 다시 맞추면(=리사이즈) SAM 이
원본 크기에 대고 낸 마스크와 배열 크기가 어긋나 인덱싱이 깨진다 — 그래서 **배열은
원본을 그대로 두고, 마지막에 기록하는 숫자(box·w·h)만 `config.CANVAS_W / 원본폭`
배율로 한 번 곱한다.** `angle` 은 등방(isotropic) 배율이라 그대로 둬도 값이 안 바뀐다
— 고칠 이유가 없다. PNG 자체는 **원본 해상도 그대로** 저장한다(Task 8이 이 PNG를
box 크기에 맞춰 붙여 넣는 쪽이 낫다 — PNG까지 축소하면 화질만 잃는다).
"""
import io
import sys
from pathlib import Path

import cv2
import numpy as np
import requests
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config  # noqa: F401  # cp949 콘솔에서 유니코드 대시가 안 죽게 만든다
import gpt누끼
import 창고캐시
import outline
from fetch_board import settings, token_of

# 위 모듈 docstring의 임베딩 비용(첫 호출)보다 넉넉하게 잡는다 — 옛 "155초" 상수
# (죽은 로컬 Docker 경로) 대신 지금 확인된 비용 구조에 맞춘 여유값이다.
REFINE_TIMEOUT = 200


def tight_box(mask: np.ndarray) -> list[int] | None:
    """마스크에 꼭 맞는 축정렬 상자. 빈 마스크는 None(호출하는 쪽이 사람 네모로
    되돌아가라는 신호)."""
    ys, xs = np.where(mask)
    if len(ys) == 0:
        return None
    return [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]


def _norm90(deg: float) -> float:
    """각도를 (-90, 90] 로 접는다. 직선의 방향은 180° 마다 같은 뜻이라, mod 180 로
    접으면 OpenCV 버전이 달라도(minAreaRect 원 각도가 [-90,0) 든 (0,90] 이든) 같은
    변에는 늘 같은 값이 나온다."""
    deg = deg % 180
    return deg - 180 if deg > 90 else deg


def tilted(mask: np.ndarray) -> dict:
    """`cv2.minAreaRect` 로 기운 최소 사각형을 잰다. 마스크 전체 화소를 잰다 —
    `tight_box(mask)` 와 같은 화소 집합이어야 한다(아래 참고).

    **연결요소가 아니라 마스크 전체를 넣는다.** 처음엔 `cv2.findContours` +
    `max(contours, key=area)` 로 "가장 큰 덩어리"만 썼는데, SAM 마스크가 여러
    조각으로 쪼개지는 실물 사례가 있어서(`DZhFe-iGv7s/01`) `tight_box`(전체 화소
    기준)와 `tilted`(가장 큰 조각 기준)가 서로 다른 걸 재게 된다. `cv2.findNonZero`
    로 마스크 전체 화소를 한 번에 넣으면 이 어긋남이 없다 — `tight_box` 와 같은
    화소 집합을 잰다.

    `minAreaRect` 가 돌려주는 (w, h, angle) 세 값의 **짝짓기 규칙**이 OpenCV 판마다
    다르다(같은 도형인데 4.5+ 는 각도가 (0,90], 그 전 판은 [-90,0)) — 세 값을 그대로
    믿으면 같은 도형이 컴퓨터마다 다른 숫자로 기록된다. 그래서 세 값 대신
    `cv2.boxPoints()` 가 주는 **실제 네 꼭짓점**(이건 어느 판이든 같은 사각형을
    가리킨다)에서 직접 두 변의 방향을 재고, "더 수평에 가까운 변"을 w 로 고정해
    다시 조립한다.

    **w·h 에 1을 더한다.** `minAreaRect` 는 화소 **중심** 사이 거리를 재는데,
    `tight_box` 는 화소 **개수**(반열림, `max+1`)로 잰다 — 같은 도형인데 잣대가
    다르면 늘 1px 작게 나온다. 늘 작은 쪽으로만 치우치는 오차(대칭 잡음이 아니다)라
    `recipe.py` 가 여러 게시물을 평균 내도 상쇄되지 않는다. `tight_box` 와 같은
    잣대로 맞춘다.
    """
    pts = cv2.findNonZero(mask.astype(np.uint8))
    rect = cv2.minAreaRect(pts)
    corners = cv2.boxPoints(rect)
    e0, e1 = corners[1] - corners[0], corners[2] - corners[1]
    len0, len1 = float(np.hypot(*e0)), float(np.hypot(*e1))
    ang0 = _norm90(float(np.degrees(np.arctan2(e0[1], e0[0]))))
    if -45 <= ang0 <= 45:
        w, h, angle = len0, len1, ang0
    else:
        w, h, angle = len1, len0, _norm90(ang0 + 90)
    return {"w": w + 1, "h": h + 1, "angle": angle}


def transparent(img: np.ndarray, mask: np.ndarray, box: list[int]) -> bytes:
    """`box` 안을 오려 마스크 밖을 투명하게 만든 PNG 바이트.

    `img`·`mask`·`box` 는 모두 **같은(원본) 해상도**여야 한다 — `cut_slide()` 가
    호출할 때 1080 환산 전의 `tight_box()` 원값을 넘긴다."""
    x0, y0, x1, y1 = box
    crop = img[y0:y1, x0:x1]
    alpha = np.where(mask[y0:y1, x0:x1], 255, 0).astype(np.uint8)
    buf = io.BytesIO()
    Image.fromarray(np.dstack([crop, alpha]), "RGBA").save(buf, format="PNG")
    return buf.getvalue()


def _refine(pid: str, index: int, box: list[int]) -> dict:
    """**분석에서는 더 이상 안 부른다(2026-08-26).** SAM 은 「물체가 어디 있나」를
    보는 모델이라 원형 크롭 같은 «자른 자국» 을 못 딴다(실측: 원의 9.9%). 분석의
    누끼는 `outline.테두리따기` 로 갔다. 이 함수는 나중에 작업대에서 «사진을 넣고
    배경을 지울» 때 쓰려고 남겨 둔다 — 거기서는 진짜로 물체를 찾는 일이다.

    Worker 의 `/api/refine` 을 부른다. 몸통은 `{id, idx, box}`,
    `image_id`(`<코드>/NN.jpg`) 는 Worker 가 자기 R2 열쇠 규칙으로 직접 만든다 —
    여기서 따로 넘길 게 없다."""
    base, pw = settings()
    r = requests.post(
        f"{base}/api/refine",
        json={"id": pid, "idx": index, "box": box},
        headers={"Authorization": f"Bearer {token_of(pw)}", "User-Agent": "Mozilla/5.0"},
        timeout=REFINE_TIMEOUT,
    )
    return r.json()


# ── 한 번 오린 장식은 두 번 안 오린다 (사람 지시 2026-09-24) ──────────────
#
# GPT 누끼는 장식 하나에 한 번씩 부른다($0.006). 게시물에 장식이 20~45개라 재분석
# 한 번에 **$0.12~0.27** 이 나갔다 — 라벨을 하나도 안 건드렸어도.
#
# 열쇠는 «무엇을 넣어 오렸나» 다: 게시물·장·**네모 좌표**·밑판색. 네모를 옮기면
# 좌표가 바뀌어 그것만 다시 오리고, 안 건드린 것은 창고에서 꺼낸다.
누끼캐시칸 = "cutcache"


def _누끼열쇠(pid: str, index: int, b: dict, 밑판색) -> str:
    return 창고캐시.열쇠(누끼캐시칸, pid, index, b["box"], 밑판색 or "",
                     b.get("angle") or 0)


def _꺼내쓰기(열: str) -> dict | None:
    """창고에 적어 둔 몫을 꺼내고, **누끼 PNG 를 제자리에 되살린다.**

    람다가 그 PNG 를 창고로 올린다(`lambda_분석._누끼올리기`) — 꺼내 쓰느라 안
    만들어 놓으면 「누끼가 없다」로 빠진다. 그림까지 갖춰져야 «꺼내 썼다» 가 된다.
    """
    몫 = 창고캐시.글꺼내기(열)
    if not 몫 or not 몫.get("png"):
        return None
    자리 = config.DATA / "cutouts" / 몫["png"]
    if not 자리.exists():
        그림 = 창고캐시.꺼내기(f"{누끼칸}/{몫['png']}")
        if 그림 is None:
            return None
        자리.parent.mkdir(parents=True, exist_ok=True)
        자리.write_bytes(그림)
    return 몫


누끼칸 = "cutouts"


def put_png(pid: str, index: int, bid: str, png: bytes) -> str:
    """누끼 PNG 를 저장한다.

    **R2 에 못 올린다 — 받는 통로가 없다.** Worker 는 지금 그림을 "꺼내는"
    통로(`slideJpg`)만 있고 "올리는" 통로가 없다. 그런 엔드포인트를 새로 만드는 건
    이 태스크의 파일 범위(`analyze/cutout.py` 하나)를 벗어난다 — 그래서 로컬
    저장소에 쓰고, 나중에 실제 R2 통로가 생기면 이 함수 안만 바꾸면 되게 인터페이스는
    브리프 그대로(`put_png(pid, index, bid, png)`) 둔다. 반환값은 상대 열쇠
    (`<코드>/NN/<네모id>.png`) — 나중에 R2 열쇠로 그대로 옮겨 쓸 수 있게.
    """
    key = f"{pid}/{index:02d}/{bid}.png"
    dst = config.DATA / "cutouts" / key
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_bytes(png)
    return key


# **자동 누끼를 걸 종류.** 도형·장식은 «그 자체가 디자인» 이라 모양을 따는 것이
# 맞다. 사진·로고·글자는 «새 내용이 들어갈 자리» 다 — 원본 내용의 실루엣을 따면
# 그 자리에 들어올 새 사진이 옛 사진 모양으로 잘린다.
#
# 실물에서 그렇게 나왔다(2026-08-27, DNUFIa4NIkK 2번 장): 파란 바탕에 얹힌 아기
# 얼굴 사진의 «얼굴 윤곽» 을 114점으로 땄다. 그 자리는 새 사진이 들어갈 곳인데
# 아기 머리 모양으로 잘리게 된다.
#
# **모양이 필요하면 사람이 고른다.** 라벨 화면에 원·알약·별… 스무 가지가 있고,
# 고르면 «정확한» 그 도형이 된다. 자동으로 딴 키키 표지 원은 아래가 글자에 막혀
# 납작하게 잘려 있었다 — 골라서 넣는 편이 더 낫다.
자동갈래 = ("도형", "장식")

자동창 = (0.5, 0.97)
"""사람이 안 켠 네모를 «자동으로» 오릴지 가르는 창 — 마스크넓이 ÷ 사람네모넓이.

**사람이 켜야만 딴다는 옛 규칙이 키키 표지의 원을 네모로 만든 원인이었다.**
사람이 안 켰을 뿐인데 아무도 몰랐다. 기계는 못 딸 때 스스로 아니까
(`못땄음`) 미리 사람에게 물을 이유가 없다 — 다 해 보고 도형으로 보이는 것만
쓴다.

문턱은 실측에서 나왔다(게시물 둘, 네모 64개):

| | 네모대비 |
|---|---|
| 사람이 켠 여덟 개 | 0.510 ~ 0.875 — **여덟 다 창 안** |
| 창이 더 잡는 셋 | 표지 «원» 0.655 · 장식 0.939 · 로고 0.593 — 셋 다 켰어야 할 것들 |
| 본문 글자 네모 | 0.016 (잡힌 건 형광펜 띠였다) — 안 걸린다 |
| 네모를 꽉 채운 사진 일곱 | 0.974 ~ 1.023 — **윗문턱이 뺀다** |

윗문턱(0.97)이 필요한 까닭: 네모에 꽉 찬 사각 사진은 테두리를 내 봐야 그
네모와 같다. 실속 없이 «도형» 으로 기록되어 굽는 쪽이 다각형 알파를 태운다.

`cut: true` 나 사람이 그린 `테두리` 는 이 창을 안 거친다 — 명시한 답이다.

**대비는 테두리 «안» 으로 센다**(2026-09-17) — 고리만 세면 선만 있는 도형이 떨어진다.
"""


def _찬몫(난것: dict, box) -> float:
    """딴 것이 사람 네모를 얼마나 채웠나 — **테두리 «안» 으로 센다.**

    마스크(`난것["마스크"]`)는 구멍을 이미 뺀 «고리» 라, 선만 있는 도형에서는
    턱없이 작게 나온다(실물 2026-09-17, ④ #키워드 알약: 고리 43.5% · 테두리 안
    81.1%). 아랫문턱 0.5 에 걸려 조용히 버려지던 까닭이다.
    """
    if not 난것.get("테두리"):
        return 0.0
    x0, y0, x1, y1 = [int(round(v)) for v in box]
    넓이 = max(1, (x1 - x0) * (y1 - y0))
    판 = np.zeros((max(1, y1 - y0), max(1, x1 - x0)), np.uint8)
    점들 = np.array([[int(px - x0), int(py - y0)] for px, py in 난것["테두리"]], np.int32)
    cv2.fillPoly(판, [점들], 1)
    return float(판.sum()) / 넓이


def 그린테두리(rgb: np.ndarray, 점들, box=None, 각도: float = 0.0) -> dict:
    """사람이 직접 그린 테두리를 `outline.테두리따기` 와 **같은 모양**으로 돌려준다.

    **여기서는 이웃 네모로 안 자른다.** 기계가 딸 때는 옆 네모를 배경색으로
    덮어야 한다 — 안 그러면 흰 바탕에 걸친 글자에 물감이 막혀 노란 섬이 남는다.
    그런데 그 덮은 자리가 «배경» 이 되어 버려서, 글자에 덮인 원의 아랫자락이
    자로 그은 듯 평평하게 끊겼다(실측 DG0AA6PJ8s4 1번 장: 사진 네모의 19.7%가
    옆 네모와 겹쳐 원이 밑에서 잘렸다).

    사람이 그릴 때는 그 문제가 아예 없다 — **가려진 데까지 이어 그리라고 만든
    기능**이기 때문이다. 그러니 그린 대로 채우고 끝이다.

    **기울기는 여기서 먹인다.** 라벨의 `angle` 은 파이썬이 여태 한 번도 안 읽던
    칸이었다(실측: `analyze/` 어디에도 읽는 곳이 없다). 사람이 그린 테두리는
    «안 기운» 좌표로 저장되고 화면만 캔버스를 돌려서 기울어 보여 준다 — 그대로
    두면 **사람이 본 것과 분석이 본 것이 달라진다**(실측 2026-08-26: 30° 로
    기울인 삼각형이 저장에는 0° 그대로였다). 네모 가운데를 축으로 돌린다 —
    화면(`label.js` 의 `spinCanvas`)이 도는 축과 방향이 같아야 한다.

    구멍은 안 낸다(바깥 테두리만 그린다). 가려짐도 0 이다 — 가려진 자리를
    사람이 이미 메웠으므로 「얼마나 가려졌나」가 뜻을 잃는다.
    """
    h, w = rgb.shape[:2]
    점 = np.array([[float(x), float(y)] for x, y in 점들], dtype=np.float32)
    if 각도 and box:
        cx = (box[0] + box[2]) / 2.0
        cy = (box[1] + box[3]) / 2.0
        t = np.radians(float(각도))
        k, sn = np.cos(t), np.sin(t)
        dx = 점[:, 0] - cx
        dy = 점[:, 1] - cy
        점 = np.stack([cx + dx * k - dy * sn, cy + dx * sn + dy * k], axis=1)
    마스크 = np.zeros((h, w), dtype=np.uint8)
    cv2.fillPoly(마스크, [np.round(점).astype(np.int32)], 1)
    if not 마스크.any():
        return {"마스크": None, "테두리": None, "구멍": [], "가려짐": 0.0,
                "못땄음": "그린 테두리가 화면 밖이거나 넓이가 0 이다"}
    # **돌린 점을 돌려준다.** 마스크만 돌리고 테두리는 원본을 그대로 내면 둘이
    # 갈린다 — 실측(2026-08-27): 30° 로 기울인 별에서 화면과 220px 어긋났다.
    # 마스크는 색을 재는 데 쓰이고 테두리는 틀에 실려 굽는 쪽이 그린다. 둘이
    # 다르면 «색은 맞는데 모양이 딴 데 있는» 카드가 나온다.
    return {"마스크": 마스크.astype(bool),
            "테두리": [[float(x), float(y)] for x, y in 점],
            "구멍": [], "가려짐": 0.0, "못땄음": None}


밑판갈래 = ("도형", "사진", "장식")
밑판문턱 = 0.8
"""장식이 이만큼 다른 네모 안에 들면 «그 위에 얹혔다» 고 본다."""


def _밑판색(img: np.ndarray, b: dict, boxes: list[dict]) -> str | None:
    """이 장식이 얹힌 도형·사진의 색(`#RRGGBB`). 종이 위에 바로 있으면 `None`.

    GPT 에게 «밑에 깔린 저 면은 아래 층이니 투명이다» 라고 말해 주려는 것이다. 안 알려
    주면 GPT 가 그 면을 요소로 보고 통째로 남긴다(실물 키키 하트: 검은 알약 위, 투명 0%).
    색은 «밑판 네모 안이면서 이 장식 밖» 인 화소의 가운데값 — 그 판이 실제로 가진 색이다.
    """
    x0, y0, x1, y1 = [int(round(v)) for v in b["box"]]
    넓이 = max(1, (x1 - x0) * (y1 - y0))
    품은것 = []
    for o in boxes:
        if o["id"] == b["id"] or o.get("kind") not in 밑판갈래:
            continue
        ox0, oy0, ox1, oy1 = [int(round(v)) for v in o["box"]]
        겹 = max(0, min(ox1, x1) - max(ox0, x0)) * max(0, min(oy1, y1) - max(oy0, y0))
        if 겹 / 넓이 >= 밑판문턱:
            품은것.append(((ox1 - ox0) * (oy1 - oy0), (ox0, oy0, ox1, oy1)))
    if not 품은것:
        return None
    _, (ox0, oy0, ox1, oy1) = min(품은것)          # 가장 작은 것 = 바로 밑에 깔린 것
    조각 = img[max(0, oy0):oy1, max(0, ox0):ox1]
    if 조각.size == 0:
        return None
    볼것 = np.ones(조각.shape[:2], bool)
    볼것[max(0, y0 - oy0):y1 - oy0, max(0, x0 - ox0):x1 - ox0] = False
    if not 볼것.any():
        return None
    r, g, bl = np.median(조각[볼것], axis=0).round().astype(int).tolist()
    return f"#{r:02X}{g:02X}{bl:02X}"


def _png바이트(rgba: np.ndarray) -> bytes:
    b = io.BytesIO()
    Image.fromarray(np.ascontiguousarray(rgba), "RGBA").save(b, "PNG")
    return b.getvalue()


def cut_slide(pid: str, index: int, boxes: list[dict]) -> dict[str, dict]:
    """이 장의 `cut:true` 네모만 오린다. 네모 id → 결과.

    **엔진이 SAM 2 에서 `outline.테두리따기`(배경 흘려채우기)로 바뀌면서
    돌려주는 모양도 바뀌었다** — 이 독스트링은 지금 실제로 내는 값에 맞춘
    것이다(예전엔 `conf`·`rle` 를 돌려준다고 적혀 있었는데 지금은 안 낸다).

    성공·실패 결과가 **같은 모양**이다 — 둘 다 `box`·`w`·`h`·`angle` 을 담는다
    (실패 쪽은 사람이 그은 네모 그대로, 각도는 0). 그 뒤가 갈린다:

    - **성공**: `png`(누끼 PNG 상대 열쇠) · `테두리`(마스크 외곽선 점들,
      1080 캔버스 기준) · `구멍`(속이 뚫린 도형의 구멍들) · `가려짐`(이웃
      네모와 겹친 비율).
    - **실패**: `fallback: True` · `why`(실패 사유 — 예외 이름과 메시지).

    이러면 이 값을 쓰는 쪽(Task 7·8, `make_dsl_cardnews._뒷도형칸` 등)이
    실패 여부와 상관없이 위치·크기부터는 그냥 읽고, 성공 여부는
    `fallback` 유무 하나로 가를 수 있다.
    """
    # **모든 네모에 해 본다.** 사람이 미리 고르지 않는다 — 위 `자동창` 참고.
    # 명시한 것(`cut`·그린 `테두리`)과 나머지를 갈라 둔다: 명시한 것은 실패해도
    # 「못 땄다」를 남겨야 하고, 자동으로 해 본 것은 실패해도 조용히 넘어가야
    # 한다(안 그러면 본문 글자 네모마다 못땄음이 쌓인다).
    if not boxes:
        return {}
    img = np.asarray(Image.open(config.IMAGES / pid / f"{index:02d}.jpg").convert("RGB"))
    s = config.CANVAS_W / img.shape[1]   # 원본폭 → 1080 배율. 등방이라 각도엔 안 곱한다.
    out = {}
    for b in boxes:
        box = b["box"]
        # **글자 네모의 모양 정보(`테두리`·`cut`)는 무시한다**(2026-09-19). 글자는 내용이지
        # 모양이 아니다. 라벨 화면도 종류를 「글자」로 고르는 순간 셋을 지운다
        # (`web/lib/label.js` 의 `if (k === '글자') … delete`) — 그런데 그 털기는 사람이
        # 종류를 «다시 고를 때만» 돌아서, 옛 라벨에는 그대로 남는다. 남으면 그 글자
        # 네모가 오려지고 `make_dsl_cardnews._뒷도형칸` 이 «글자 뒤 도형» 을 새로 만들어,
        # 같은 자리에 그은 진짜 도형과 겹쳐 두 겹으로 그려진다(실물 키키 3~8장).
        if b.get("kind") in ("글자", "장번호"):
            continue
        명시 = bool(b.get("cut") or b.get("테두리"))
        if not 명시 and b.get("kind") not in 자동갈래:
            continue      # 자리는 «새 내용이 들어갈 곳» 이다 — 위 `자동갈래` 참고
        이웃 = [o["box"] for o in boxes if o["id"] != b["id"]]
        # **오린 적이 있으면 꺼내 쓴다**(사람 지시 2026-09-24). 돈 드는 길
        # (GPT 누끼)만 해당한다 — 흘려채우기·그린테두리는 공짜라 그냥 다시 한다.
        누끼길 = (not b.get("테두리")) and b.get("kind") == "장식" and gpt누끼.있나()
        밑판색 = _밑판색(img, b, boxes) if 누끼길 else None
        캐열 = _누끼열쇠(pid, index, b, 밑판색) if 누끼길 else None
        if 캐열:
            꺼낸것 = _꺼내쓰기(캐열)
            if 꺼낸것 is not None:
                out[b["id"]] = 꺼낸것
                continue
        try:
            # **`테두리따기` 에는 배율을 곱하지 않은 원본 좌표를 그대로 준다.**
            # 실측(2026-08-26, 내려받은 30장 가로폭): 1080폭 18장·1152폭 2장·
            # 1440폭 4장·1638폭 3장·3240·3263·3277폭 각 1장 — 30장 중 열둘이
            # 1080 이 아니다. `img` 는 늘 «원본 해상도» 그대로인데 여기 좌표만
            # `s` 를 곱해 1080 으로 줄이면, `s != 1` 인 열두 장에서 그림과
            # 좌표계가 어긋나 엉뚱한 자리를 오린다 — 앞서 잰 두 게시물이 마침
            # 둘 다 1080 이라 이 어긋남이 시험을 하나도 안 밟고 넘어갔었다.
            그린것 = b.get("테두리")
            if 그린것:
                난것 = 그린테두리(img, 그린것, box, b.get("angle") or 0.0)
            elif 누끼길:
                # **GPT 누끼는 «장식» 만**(사람 결정 2026-09-19 ㄴ). 흘려채우기가 못 딴 것은
                # 얇은 선·배지·회색 글자·작은 라벨 — 다 장식이었다. 색 채운 도형은
                # 흘려채우기도 잘 따니(파란 상자 94%·흰 카드 89%) 돈·시간을 안 쓴다.
                # 열쇠(FAL_KEY)가 없으면 아래 흘려채우기로 간다(시험·로컬).
                난것 = gpt누끼.따기(np.ascontiguousarray(img), box, 이웃=이웃,
                                 밑판색=밑판색, 게시물=pid)
            else:
                난것 = outline.테두리따기(np.ascontiguousarray(img), box, 이웃=이웃)
            if 난것["못땄음"]:
                raise RuntimeError(난것["못땄음"])
            # 마스크는 이미 «원본 해상도» 다(위에서 `img` 를 그대로 줬으므로)
            # — PNG 오리기에 그대로 쓴다. 되돌릴 필요가 없다.
            mask = 난것["마스크"]
            tb = tight_box(mask)
            if tb is None:
                raise RuntimeError("빈 마스크")
            # **문지기(`자동창`)는 안 건다**(사람 결정 2026-09-19). 사진은 이제 «사진» 으로
            # 따로 라벨되니 «네모를 꽉 채우면 사진» 문턱이 지킬 것이 없고, 되레 딱 맞게
            # 그은 알약(97~99%)을 버렸다(실물 DSW 9번 장 4개). 라벨이 곧 답이다.
            tl = tilted(mask)
            # **GPT 가 그린 그림이 있으면 그것을 싣는다**(2026-09-19). 원본을 오리면 모양이
            # 몇 px 어긋난 만큼 밑판 색이 딸려 온다 — 그린 것은 둘레가 진짜로 비어 있다.
            그린것RGBA = 난것.get("그림")
            그림자리 = 난것.get("그림자리")
            if 그린것RGBA is not None and 그림자리:
                # **그림의 왼쪽 위 좌표로 자른다.** 그림은 «라벨 네모 + 여유» 크기다 —
                # 라벨 네모 기준으로 자르면 여유(8px)만큼 밀리고 크기도 어긋난다.
                gx0, gy0 = [int(v) for v in 그림자리]
                자른 = 그린것RGBA[tb[1] - gy0:tb[3] - gy0, tb[0] - gx0:tb[2] - gx0]
                png = (_png바이트(자른)
                       if 자른.shape[0] == tb[3] - tb[1] and 자른.shape[1] == tb[2] - tb[0]
                       else transparent(img, mask, tb))
            else:
                png = transparent(img, mask, tb)
            key = put_png(pid, index, b["id"], png)
            out[b["id"]] = {
                "box": [round(v * s) for v in tb], "w": tl["w"] * s, "h": tl["h"] * s,
                "angle": tl["angle"], "png": key,
                # 테두리·구멍은 «원본 해상도» 로 나왔으니 여기서 `s` 를 곱해 1080
                # 공간으로 옮겨 담는다 — 계량표의 다른 좌표와 같은 자로 맞춘다.
                "테두리": [[v * s for v in pt] for pt in 난것["테두리"]],
                "구멍": [[[v * s for v in pt] for pt in c] for c in 난것["구멍"]],
                # 가려짐은 네모 겹침 «비율» 이라 해상도와 무관하다 — 안 곱한다.
                "가려짐": 난것["가려짐"],
            }
            # **못 딴 것은 안 담는다** — 여기는 성공한 길이다. 실패는 아래
            # `except` 로 빠지므로 담기지 않는다(담아 두면 영영 못 딴 것이 된다).
            if 캐열:
                창고캐시.글담아두기(캐열, out[b["id"]])
        except Exception as e:  # noqa: BLE001 — 이 네모만 폴백으로 남기고 다음 네모로 넘어간다.
            if not 명시:
                continue      # 자동으로 해 본 것이다 — 못 땄다고 떠들지 않는다
            x0, y0, x1, y1 = [round(v * s) for v in box]
            out[b["id"]] = {
                "box": [x0, y0, x1, y1], "w": float(x1 - x0), "h": float(y1 - y0),
                "angle": 0.0, "fallback": True, "why": f"{type(e).__name__}: {e}",
            }
    return out
