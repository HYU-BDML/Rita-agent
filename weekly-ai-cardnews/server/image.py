# -*- coding: utf-8 -*-
"""사진·영상이 없는 소식 카드의 그림 — OpenAI GPT 이미지 2.5 (Gemini 대신, 사람 결정 2026-09-30).

크기는 소식 카드 사진 자리에 맞춘 1216×896(아래 «크기»), 품질 medium(사람 결정 2026-09-22 «미디움»).
**돈이 나간다** — 단가는 진짜 한 판을 돌리기 전에(계획 Task 15) 모델 페이지에서 다시 확인한다.
"""
import base64
import json
import os
import time
import urllib.error
import urllib.request

MODEL = os.environ.get("IMAGE_MODEL") or "gpt-image-2.5-flare"
# 소식 카드 사진 자리는 1080x796(가로로 넓다, design_tpl 의 뉴스 media_box). GPT 이미지 2.5 는 16의 배수면
# 아무 크기나 받는다(문서 2026-10-01 확인) — 늘리지 않고 잘림 0.3px 인 가장 작은 크기. 예전 1024x1536 세로는
# 세로 51% 가 잘려 나갔다(사용자 «우리 해상도에 맞게»).
크기, 품질 = "1216x896", "medium"


class 그림탈(Exception):
    pass


def _보내기(몸: dict, 시간: int = 180) -> tuple:
    """한 번 보내고 (상태, 받은 것). **시험이 여기를 갈아 끼운다.**"""
    요청 = urllib.request.Request(
        "https://api.openai.com/v1/images/generations", data=json.dumps(몸).encode("utf-8"),
        headers={"Authorization": "Bearer " + (os.environ.get("OPENAI_API_KEY") or ""),
                 "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(요청, timeout=시간) as r:
            return r.status, json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        글 = e.read().decode("utf-8", "replace")[:500]
        try:
            return e.code, json.loads(글)
        except ValueError:
            return e.code, 글
    except (urllib.error.URLError, TimeoutError) as e:
        return 0, str(getattr(e, "reason", e))[:200]


def _받기(주소: str) -> bytes:
    with urllib.request.urlopen(주소, timeout=60) as r:
        return r.read()


def 사용량(답: dict) -> dict:
    """OpenAI 가 알려 준 토큰 수 — 한 판에 쓴 돈을 세는 데 쓴다(cost.py)."""
    u = 답.get("usage") or {}
    자세히 = u.get("input_tokens_details") or {}
    return {"입력글토큰": 자세히.get("text_tokens", u.get("input_tokens", 0)),
            "입력그림토큰": 자세히.get("image_tokens", 0), "출력토큰": u.get("output_tokens", 0)}


def 만들기(지시문: str, 잠자기=time.sleep) -> tuple:
    """(그림 바이트, 사용량)."""
    if not (지시문 or "").strip():
        raise 그림탈("그림 지시문이 비어 있음")
    if not (os.environ.get("OPENAI_API_KEY") or ""):
        raise 그림탈("OPENAI_API_KEY 가 비어 있음")
    몸 = {"model": MODEL, "prompt": 지시문[:4000], "size": 크기, "quality": 품질, "n": 1}
    for 몇번째 in range(3):
        상태, 답 = _보내기(몸)
        if 상태 == 200 and isinstance(답, dict):
            첫 = (답.get("data") or [{}])[0]
            if 첫.get("b64_json"):
                return base64.b64decode(첫["b64_json"]), 사용량(답)
            if 첫.get("url"):
                return _받기(첫["url"]), 사용량(답)
            raise 그림탈("OpenAI 가 빈 그림을 줬다")
        글 = json.dumps(답, ensure_ascii=False) if isinstance(답, dict) else str(답)
        if "insufficient_quota" in 글 or "billing_hard_limit" in 글:
            raise 그림탈("OpenAI 잔액 부족")
        if 상태 == 401:
            raise 그림탈("OpenAI 열쇠가 틀림")  # 답 글은 안 싣는다 — 열쇠 끝자리가 섞여 온다
        if 상태 in (0, 429, 500, 502, 503, 504) and 몇번째 < 2:
            잠자기(10 * (몇번째 + 1))
            continue
        raise 그림탈(f"OpenAI {상태}: {글[:200]}")
    raise AssertionError("닿지 않는 자리")
