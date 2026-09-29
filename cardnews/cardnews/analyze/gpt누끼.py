# -*- coding: utf-8 -*-
"""«GPT 누끼» — 장식 조각의 «모양» 을 GPT Image 2.5 에 묻고, 색은 원본 화소를 쓴다.

사람 결정 2026-09-19. 흘려채우기(`outline.테두리따기`)·BEN·Qwen·나노바나나는 흰
카드·파란 상자처럼 배경을 닮은 것을 «배경» 으로 보고 버렸다(실측 조각 9개, `%TEMP%/
cn/누끼2/`). GPT 만 «빨간 네모 안의 요소» 라는 뜻을 알아듣는다. 다만 GPT 는 다시
그려서 화소가 4~60/255 달라지고 작은 글자를 뭉갠다 — 그래서 **투명도만 받고 색은
원본** 이다.

돌려주는 모양은 `outline.테두리따기` 와 같다(마스크·테두리·구멍·가려짐·못땄음) —
`cutout.cut_slide` 가 둘을 같은 자리에 꽂아 쓴다.

열쇠는 환경변수 `FAL_KEY` 로만, 머리말에만 싣는다. 값은 어디에도 안 찍는다.
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
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
import outline  # noqa: E402

끝점 = "https://queue.fal.run/openai/gpt-image-2.5/flare/edit"
오픈AI모델 = "gpt-image-2.5-flare"
품질 = "low"            # 1024² 한 장 $0.00588 (모델 페이지 표, 2026-09-19)
# **«이 물체를 그대로, 배경 없이»** (사람 결정 2026-09-19). 여태는 «빨간 네모를 그어
# 줄 테니 그 안에서 요소를 골라내라» 고 물었는데, 그러면 GPT 가 «네모 안 전부» 를 답으로
# 낼 수 있어 밑판째 잘려 나왔다(실물 키키 하트: 투명 0%, 카드에 검은 네모). 물음을 바꾸니
# 한 번에 됐다(투명 62%) — 「이 물체를 만들어라」 는 답이 하나뿐이다.
지시문 = (
    "Reproduce the object at the center of this image exactly as it is — same shape, same colors, "
    "same shading, same size and position — on a fully transparent background. Everything behind "
    "and around the object is not part of it; it must be transparent. Output only the object."
)

# 장식이 도형·사진 «위에» 얹혀 있을 때 지시문 끝에 붙인다.
밑판말 = (" The object sits on a {색} panel; that panel is behind the object, so it is transparent too.")


def 있나() -> bool:
    """열쇠가 있어야 켠다(OpenAI 나 fal 어느 쪽이든). 없으면 `cutout` 이 흘려채우기로 간다."""
    return bool(os.environ.get("OPENAI_API_KEY", "").strip()
                or os.environ.get("FAL_KEY", "").strip())


def _주소(im: Image.Image) -> str:
    b = io.BytesIO()
    im.save(b, "PNG")
    return "data:image/png;base64," + base64.b64encode(b.getvalue()).decode("ascii")


def 부르기(판: Image.Image, 말: str | None = None) -> np.ndarray:
    """조각 한 장을 보내 GPT 가 그린 **RGBA** 를 돌려준다. 실패하면 예외.

    **`OPENAI_API_KEY` 가 있으면 OpenAI 를 직접 부른다**(사람 결정 2026-09-19, 로컬용).
    없으면 fal 로 간다 — Lambda 에는 그 열쇠를 안 넣으므로 서버는 늘 fal 이다. 단가는
    양쪽이 같다(내보내기 $30/100만 토큰) — 옮기는 까닭은 값이 아니라 어느 계정으로
    찍히느냐다.
    """
    import requests  # 시험은 이 함수를 안 부른다 — 망 의존은 여기에만
    말 = 말 or 지시문
    열쇠 = os.environ.get("OPENAI_API_KEY", "").strip()
    if 열쇠:
        b = io.BytesIO()
        판.save(b, "PNG")
        r = requests.post(
            "https://api.openai.com/v1/images/edits",
            headers={"Authorization": f"Bearer {열쇠}"},
            files={"image": ("조각.png", b.getvalue(), "image/png")},
            data={"model": 오픈AI모델, "prompt": 말, "background": "transparent",
                  "quality": 품질, "size": "auto", "n": "1"},
            timeout=180)
        if r.status_code >= 300:
            raise RuntimeError(f"OpenAI {r.status_code}")
        몫 = (r.json().get("data") or [{}])[0]
        png = (base64.b64decode(몫["b64_json"]) if 몫.get("b64_json")
               else requests.get(몫["url"], timeout=120).content)
    else:
        키 = os.environ.get("FAL_KEY", "")
        머리 = {"Authorization": f"Key {키}", "Content-Type": "application/json"}
        몸 = {"prompt": 말, "image_urls": [_주소(판)], "background": "transparent",
             "quality": 품질, "output_format": "png", "image_size": "auto"}
        r = requests.post(끝점, headers=머리, data=json.dumps(몸), timeout=60)
        if r.status_code >= 300:
            raise RuntimeError(f"fal 걸기 {r.status_code}")
        접수 = r.json()
        for _ in range(90):
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
        png = requests.get(그림들[0]["url"], timeout=120).content
    return np.asarray(Image.open(io.BytesIO(png)).convert("RGBA")).copy()


최소투명 = 0.05
"""돌아온 그림이 이만큼도 안 비었으면 «못 땄다» 로 본다.

GPT 가 «네모 안이 통째로 요소다» 라고 답하는 일이 있다(실물 키키 하트: 투명 0%). 그걸
그대로 쓰면 장식 둘레의 밑판 색까지 오려져 카드에 검은 네모가 붙는다. 장식은 둘레가
비어야 장식이다.
"""


같은문턱 = 5.0
"""장식 조각끼리 화소가 이만큼도 안 다르면 «같은 장식» 으로 본다(0~255).

실측(2026-09-19): 키키 하트 일곱 개는 서로 0.0~3.9 인데, 다른 게시물의 장식끼리는
25~217 이다. 그 사이가 넓어 섞일 위험이 없다. 3.9 는 사진 압축이 만든 차이다.
"""
_기억: dict = {}
"""게시물마다 «이미 그린 장식» 을 모아 둔다 — `{코드: [(견줄판, 그림), …]}`.

원본이 같은 장식은 결과도 같아야 한다. 장마다 따로 그리면 GPT 가 매번 새로 그려 일곱
장의 하트가 조금씩 달라진다(실물 키키). 값·시간도 장식 수만큼 든다.
"""


def _견줄판(조각: np.ndarray) -> np.ndarray:
    """크기를 지워 놓고 견주려고 64×64 회색으로 줄인 것."""
    작 = Image.fromarray(조각).convert("L").resize((64, 64), Image.LANCZOS)
    return np.asarray(작, dtype=np.int16)


def 잊기(게시물: str | None = None) -> None:
    """기억을 비운다. 게시물을 대면 그것만."""
    _기억.pop(게시물, None) if 게시물 else _기억.clear()


def 따기(rgb: np.ndarray, box, 이웃=(), 여유: int = outline.여유, 부르기=부르기,
       밑판색=None, 게시물: str | None = None) -> dict:
    """장식 자리를 잘라 GPT 에 주고, GPT 가 그린 그림을 그대로 돌려준다.

    **네 단계뿐이다**(사람 결정 2026-09-19: 「장식 라벨링을 하면 뭐 할 생각 하지 말고
    GPT 한테 줘야지, 거기서 그 장식만 뽑아 달라고」).

        ① 라벨 네모를 여유만큼 넓혀 자른다
        ② 손대지 않고 그대로 GPT 에 준다 — 「이 물체를 그대로, 배경 없이」
        ③ 밑판이 단색이면 그 색을 한 줄 알려 준다
        ④ 받은 그림을 그대로 쓴다. 빈 데가 너무 없으면 버린다

    **여기서 이웃을 덮거나 배경색을 정하거나 판에 앉히지 않는다.** 그것들은 흘려채우기
    (`outline.테두리따기`)가 색만 보고 번지기 때문에 필요한 준비다. 갈아 끼우기 쉽게
    만들려고 그 준비를 통째로 물려받았는데, 실물 키키 하트에서 제목 글자칸과 알약이
    하트를 91% 덮어 «흰 종이 한 장» 이 GPT 에 갔고 GPT 는 빈 그림을 받아 확성기를
    지어냈다. GPT 는 그림을 보고 판단하니 원본을 그대로 주는 것이 맞다.

    돌려주는 모양은 `outline.테두리따기` 와 같다(+ `그림`).
    `이웃` 은 가려짐을 세는 데만 쓴다.
    """
    가려짐 = round(min(1.0, max(0.0, outline._겹침비율(box, 이웃))), 3)
    x0, y0, x1, y1 = outline._펼친네모(rgb, box, 여유)
    조각 = np.ascontiguousarray(rgb[y0:y1, x0:x1])

    말 = 지시문
    if 밑판색:
        말 = 지시문 + 밑판말.format(색=밑판색)

    # **같은 장식은 한 번만 그린다**(사람 결정 2026-09-19). 원본이 같으면 결과도 같아야
    # 한다 — 장마다 따로 그리면 GPT 가 매번 새로 그려 일곱 장의 하트가 조금씩 달라진다.
    견줄것 = _견줄판(조각)
    쌓인것 = _기억.setdefault(게시물, []) if 게시물 else None
    그림 = None
    if 쌓인것 is not None:
        for 옛판, 옛그림 in 쌓인것:
            if float(np.abs(견줄것 - 옛판).mean()) < 같은문턱:
                그림 = 옛그림
                break
    if 그림 is None:
        받은 = 부르기(Image.fromarray(조각), 말)
        그림 = np.asarray(Image.fromarray(np.asarray(받은, np.uint8), "RGBA"))
        if 쌓인것 is not None:
            쌓인것.append((견줄것, 그림))
    # 조각 크기로 되돌린다 — GPT 는 제 크기로 내고, 돌려쓴 그림은 크기가 조금 다를 수 있다.
    그림 = np.asarray(Image.fromarray(np.ascontiguousarray(그림), "RGBA")
                    .resize((조각.shape[1], 조각.shape[0]), Image.LANCZOS))
    m = (그림[..., 3] >= 128).astype(np.uint8)
    # 덩어리를 다 남긴다 — 잡티만 버린다. 글자 한 줄 장식은 글자마다 덩어리가 따로라
    # «가장 큰 것 하나» 를 남기면 첫 낱말만 남는다(실물 DSC61jCEusn «<국내 유통 구조>»).
    덩이 = outline._제일큰덩이들(m.astype(bool), 최소=max(4, m.size * 0.002))
    if 덩이 is None or not 덩이.any():
        return {"마스크": None, "그림": None, "테두리": None, "구멍": [], "가려짐": 가려짐,
                "못땄음": "GPT 가 전부 투명으로 냈다 — 요소를 못 찾았다"}
    빈몫 = 1.0 - float(덩이.mean())
    if 빈몫 < 최소투명:
        return {"마스크": None, "그림": None, "테두리": None, "구멍": [], "가려짐": 가려짐,
                "못땄음": f"GPT 가 네모를 통째로 요소라 했다(빈 데가 {빈몫:.0%}뿐)"}

    점들 = cv2.findNonZero(덩이.astype(np.uint8))
    바깥 = outline._줄인것(cv2.convexHull(점들))
    찬판 = np.zeros(덩이.shape, np.uint8)
    cv2.fillPoly(찬판, [바깥.astype(np.int32)], 1)
    구멍마스크 = outline._제일큰덩이들((찬판 > 0) & ~덩이, 최소=덩이.size * 0.005)
    큰마스크 = np.zeros(rgb.shape[:2], bool)
    큰마스크[y0:y1, x0:x1] = 덩이
    옮김 = np.array([x0, y0])
    return {
        "마스크": 큰마스크,
        "그림": 그림,                     # GPT 가 그린 RGBA — `cutout` 이 이걸 그대로 싣는다
        # **그림의 왼쪽 위가 원본 어디인가.** 그림은 «라벨 네모 + 여유» 크기라 라벨 네모
        # 기준으로 자르면 여유만큼 밀린다. 자르는 쪽이 이 자리를 써야 한다.
        "그림자리": [x0, y0],
        "테두리": (바깥 + 옮김).tolist(),
        "구멍": [(c + 옮김).tolist() for c in outline._구멍윤곽들(구멍마스크)],
        "가려짐": 가려짐,
        "못땄음": None,
    }
