# -*- coding: utf-8 -*-
"""딥시크에 대본을 시킨다 — Dify 판의 LLM 단계 대신.

설정은 Dify 판과 같다: `deepseek-v4-pro`, 생각 모드 켬(안 싣는 것이 켜는 것), 온도는 안 준다.
열쇠는 머리(Authorization)에만 싣는다.

**한 번만 부른다.** 생각하다 한도(`max_tokens`, 생각한 것도 여기에 센다)를 넘기면 «넘침» 이라고만
알린다 — 한도를 늘려 다시 거는 것은 runs 가 한다. 그래야 늘린 한도를 기록에 적어 두고, 람다 시간이
모자라면 새 달리기가 **그 부르기부터** 이어 갈 수 있다(2026-10-01 사용자 «그 부분만 다시»).
"""
import json
import os
import time
import urllib.error
import urllib.request

MODEL = os.environ.get("DEEPSEEK_MODEL") or "deepseek-v4-pro"
BASE = (os.environ.get("DEEPSEEK_BASE") or "https://api.deepseek.com").rstrip("/")
읽기상한 = 780  # 람다 한 번 900초 안에 부르기 하나가 들어가게. runs.부르기전필요초 와 짝
다시걸것 = {"429", "500", "502", "503", "504", "network"}  # 시간 초과는 안 건다 — 13분을 또 기다리게 된다


class 모델탈(Exception):
    def __init__(self, 코드: str, 말: str = ""):
        super().__init__(f"딥시크 {코드}: {말}" if 말 else f"딥시크 {코드}")
        self.코드 = 코드


def _보내기(몸: dict, 시간: int) -> dict:
    """한 번 보내고 받은 것을 그대로. **시험이 여기를 갈아 끼운다.**"""
    요청 = urllib.request.Request(
        BASE + "/chat/completions", data=json.dumps(몸, ensure_ascii=False).encode("utf-8"),
        headers={"Authorization": "Bearer " + (os.environ.get("DEEPSEEK_API_KEY") or ""),
                 "Content-Type": "application/json", "Accept": "application/json"})
    try:
        with urllib.request.urlopen(요청, timeout=시간) as 답:
            return json.loads(답.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        말 = e.read().decode("utf-8", "replace")[:200]
        if e.code == 402:
            raise 모델탈("402", "딥시크 잔액 부족") from e
        raise 모델탈(str(e.code), 말) from e
    except (urllib.error.URLError, TimeoutError) as e:
        까닭 = str(getattr(e, "reason", e))
        raise 모델탈("timeout" if "timed out" in 까닭.lower() else "network", 까닭[:120]) from e


def 한번(시스템: str, 사용자: str, 한도: int, 잠자기=time.sleep, 지금=time.monotonic) -> dict:
    """한도 `한도` 로 한 번. {글, 넘침, 입력토큰, 출력토큰, 생각토큰, 초}.

    넘침 = 생각하다 한도를 다 썼거나(빈 답) 답이 중간에 잘렸다(finish_reason «length»).
    429·5xx·끊김은 쉬고 두 번까지 다시 건다. 잔액 부족·시간 초과·빈 답은 모델탈."""
    if not (os.environ.get("DEEPSEEK_API_KEY") or ""):
        raise 모델탈("no_api_key", "DEEPSEEK_API_KEY 가 비어 있다")
    몸 = {"model": MODEL, "max_tokens": 한도,
          "messages": [{"role": "system", "content": 시스템}, {"role": "user", "content": 사용자}]}
    시작 = 지금()
    for 몇번째 in range(3):
        try:
            답 = _보내기(몸, 읽기상한)
            break
        except 모델탈 as e:
            if 몇번째 == 2 or e.코드 not in 다시걸것:
                raise
            잠자기(5 * (몇번째 + 1))
    고른것 = (답.get("choices") or [{}])[0]
    글 = ((고른것.get("message") or {}).get("content") or "").strip()
    넘침 = 고른것.get("finish_reason") == "length"
    if not 글 and not 넘침:
        raise 모델탈("empty_response", "빈 답")
    쓴것 = 답.get("usage") or {}
    return {"글": 글, "넘침": 넘침, "입력토큰": 쓴것.get("prompt_tokens", 0),
            "캐시토큰": 쓴것.get("prompt_cache_hit_tokens", 0),  # 입력 중 캐시로 싸게 친 몫(cost.py)
            "출력토큰": 쓴것.get("completion_tokens", 0),
            "생각토큰": (쓴것.get("completion_tokens_details") or {}).get("reasoning_tokens", 0),
            "초": round(지금() - 시작)}
