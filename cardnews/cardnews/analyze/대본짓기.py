# -*- coding: utf-8 -*-
"""DeepSeek 을 부른다. **Dify 가 하던 그 일 하나만** 대신한다.

여태 대본은 Dify 가 썼다. 그런데 Dify 판의 노드 22개 중 Dify 가 실제로 해 주는
것은 **LLM 호출 넷**뿐이고, 나머지 열여덟은 이미 우리 파이썬 파일과 우리
Lambda 다. 채팅(RITA)에서 부를 때 Dify 를 한 겹 더 끼우면 열쇠가 하나 늘고,
자국이 두 군데로 갈리고, 시간 예산을 남이 쥔다.

**프롬프트는 Dify 판과 한 벌이다**(`dify/프롬프트.py`). 여기서 하는 일은 그 말을
모델에 실어 보내고 답을 글로 돌려주는 것뿐이다.

**규격이 시키는 것을 지킨다**(`rita-agent-api-spec.md` §10.3) — 마감을 보고,
고칠 수 있는 탈에만 다시 걸고, **상류 코드를 자기 코드로 덮지 않는다.**

## 2026-09-19: Bedrock 에서 DeepSeek 으로

사람 지시다 — 「베드락 안 쓸 거임」. 실측으로 정한 것 둘:

* **모델은 `deepseek-v4-pro`** (사람이 고름). 부를 수 있는 이름은 이것과
  `deepseek-flash` 둘뿐이다(2026-09-19 모델 목록 조회).
* **생각 모드를 켜 둔다**(사람이 고름). 끄려면 `thinking.type = "disabled"` 를
  실어야 하는데, 안 싣는 것이 곧 켜 두는 것이다.

**생각한 것도 출력 토큰으로 센다.** 그래서 부르는 쪽이 준 「답 길이」를 그대로
보내면 생각하다 토큰을 다 쓰고 **빈 답**이 온다 — 실물로 확인했다(2026-09-19:
`max_tokens=5` 로 부르니 생각에 5토큰을 다 쓰고 보이는 글이 0 이었다). 그래서
여기서 **생각할 여유를 더해서** 보낸다.

**바깥으로 나가는 얼굴은 안 바뀌었다** — `부르기(시스템, 사용자, 최대토큰, 마감)`
하나이고 탈은 `모델탈` 하나다. 부르는 쪽(`카드뉴스만들기`)은 몰라도 된다.
"""
import json
import os
import random
import time
import urllib.error
import urllib.request

# 사람이 고른 모델(2026-09-19). 바꾸려면 환경변수 하나면 된다 — 되돌리기 쉽게.
모델 = os.environ.get("DEEPSEEK_MODEL") or "deepseek-v4-pro"
끝 = (os.environ.get("DEEPSEEK_BASE") or "https://api.deepseek.com").rstrip("/")

# **한 번 호출의 상한.** RITA 동기 예산 180초의 80% 다(규격 §10.3). 우리는 번호표
# 방식이라 이 숫자에 목숨이 걸려 있진 않지만, 상한이 없으면 한 번 걸린 호출이
# Lambda 900초를 통째로 잡아먹는다.
#
# **생각 모드는 느리다.** Bedrock 때보다 넉넉히 잡는다.
읽기상한 = int(os.environ.get("DEEPSEEK_TIMEOUT") or 240)

# 생각할 여유. 부르는 쪽이 준 「답 길이」에 이만큼을 더해서 보낸다.
#
# **넉넉히 잡는다. 상한은 값이 아니라 뚜껑이다** — 쓴 만큼만 내므로 크게 잡아도
# 돈이 안 든다. 아낄 이유가 없는 자리다.
#
# 실측 2026-09-19: 한 번 부를 때 출력이 평균 **8,349토큰**이었다. 처음에 여유를
# 8,000 으로 뒀더니 말투 판정(상한 1,760 + 8,000 = 9,760)이 **어떤 판은 되고
# 어떤 판은 안 됐다** — 12:06 성공, 12:14 `thinking_overflow`. 아슬아슬한 값을
# 두고 운에 맡기느니 네 배로 벌린다.
생각여유 = int(os.environ.get("DEEPSEEK_THINK_BUDGET") or 32000)

# 다시 걸어도 되는 탈. **고칠 수 없는 것에는 안 건다** — 열쇠가 틀렸거나 잔액이
# 없는 것은 열 번 걸어도 열 번 같다.
다시걸것 = {"429", "500", "502", "503", "504", "timeout", "network"}
안걸것 = {"400", "401", "402", "403", "404", "422"}

최대시도 = 3


class 모델탈(Exception):
    """모델이 낸 탈. **어떤 탈이었는지 그대로 들고 다닌다.**

    규격 §9 가 빨간 글씨로 적은 것 — 상류가 `429` 를 줬는데 우리가 `503` 으로
    바꿔 내리면, 화면은 「잠시 뒤 다시 시도하세요」 대신 「서버가 터졌습니다」를
    말한다. 사람이 할 행동이 정반대로 안내된다.
    """

    def __init__(self, 코드: str, 말: str = "", 다시걸만한가: bool = False):
        super().__init__(f"{코드}: {말}" if 말 else 코드)
        self.코드 = 코드
        self.다시걸만한가 = 다시걸만한가


def _보내기(몸: dict, 시간상한: int) -> dict:
    """한 번 보내고 받은 것을 그대로. **시험이 여기를 갈아 끼운다.**

    열쇠는 **머리(Authorization)** 에만 싣는다 — 주소나 몸통에 넣으면 실패할 때
    자국에 그대로 찍힌다.
    """
    열쇠 = os.environ.get("DEEPSEEK_API_KEY") or ""
    요청 = urllib.request.Request(
        끝 + "/chat/completions",
        data=json.dumps(몸, ensure_ascii=False).encode("utf-8"),
        headers={"Authorization": "Bearer " + 열쇠,
                 "Content-Type": "application/json",
                 "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(요청, timeout=시간상한) as 답:
            return json.loads(답.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        코드 = str(e.code)
        # **몸통을 200자만 들고 온다.** 거기 우리 원고가 되비치는 일은 없지만,
        # 길게 들고 다녀 봐야 자국만 지저분해진다.
        말 = ""
        try:
            말 = e.read().decode("utf-8", "replace")[:200]
        except Exception:  # noqa: BLE001
            pass
        raise 모델탈(코드, 말, 코드 in 다시걸것) from e
    except urllib.error.URLError as e:
        까닭 = getattr(e, "reason", "")
        코드 = "timeout" if "timed out" in str(까닭).lower() else "network"
        raise 모델탈(코드, str(까닭)[:120], True) from e
    except TimeoutError as e:
        raise 모델탈("timeout", "", True) from e


def _쉴시간(몇번째: int) -> float:
    """1초·2초에 흔들림을 더한다. 여럿이 같은 순간에 몰려가지 않게."""
    return (2 ** 몇번째) * (0.75 + random.random() * 0.5)


def _꺼내기(답: dict) -> str:
    """받은 것에서 **보이는 글만** 꺼낸다.

    생각한 글(`reasoning_content`)은 안 돌려준다 — 뒷사람은 JSON 을 기다리는데
    거기 생각이 섞이면 못 읽는다.
    """
    고른것 = (답.get("choices") or [{}])[0]
    글 = ((고른것.get("message") or {}).get("content") or "").strip()
    if 글:
        return 글
    # **빈 답에도 갈래가 둘이다.** 토큰이 모자라 생각하다 끝난 것과, 모델이
    # 그냥 아무 말도 안 한 것. 사람이 할 일이 다르므로 따로 알린다.
    if 고른것.get("finish_reason") == "length":
        raise 모델탈("thinking_overflow",
                   "생각하다 토큰을 다 썼다 — DEEPSEEK_THINK_BUDGET 을 올려라", False)
    raise 모델탈("empty_response", "모델이 빈 답을 줬다")


def 부르기(시스템: str, 사용자: str, 최대토큰: int = 4000,
         마감: float | None = None) -> str:
    """말 한 번 걸고 답을 글로. 못 하면 `모델탈`.

    `마감` 은 `time.monotonic()` 눈금이다. **다시 걸기 전에 남은 시간을 본다** —
    넘길 것 같으면 다시 걸지 않고 바로 포기한다(규격 §10.3). 기다리게 해 놓고
    결국 못 준다면, 안 기다리게 하고 못 주는 편이 낫다.

    **사용자 원문도 열쇠도 자국에 안 남긴다.** 남길 이유가 없는 것을 남기면
    언젠가 새어 나간다.
    """
    if not (os.environ.get("DEEPSEEK_API_KEY") or ""):
        raise 모델탈("no_api_key", "DEEPSEEK_API_KEY 가 비어 있다")

    몸 = {
        "model": 모델,
        "messages": [{"role": "system", "content": 시스템},
                     {"role": "user", "content": 사용자}],
        # 생각한 것도 출력으로 세므로 여유를 더해 보낸다(맨 위 글월 참고).
        "max_tokens": 최대토큰 + 생각여유,
        "temperature": 0.7,
    }

    남은시도 = 최대시도
    마지막탈 = None
    for 몇번째 in range(최대시도):
        if 마감 is not None and time.monotonic() >= 마감:
            raise 모델탈("deadline_exceeded", "시간 예산을 다 썼다")
        try:
            return _꺼내기(_보내기(몸, 읽기상한))
        except 모델탈 as e:
            # **생각하다 넘친 것은 여유를 늘려 다시 건다.** 같은 여유로 또 걸면
            # 동전 던지기다 — 늘려서 걸어야 수렴한다. 늘려도 계속 넘치면 그때는
            # 진짜 못 고칠 탈이니 터뜨린다(조용히 물러서면 못 쓰는 틀이 나간다).
            if e.코드 == "thinking_overflow":
                마지막탈 = e
                남은시도 -= 1
                if 남은시도 <= 0:
                    raise
                몸["max_tokens"] *= 2
                print(f"!! 생각하다 넘쳤다 — 여유를 {몸['max_tokens']}로 올려 다시 건다")
                continue
            if e.코드 in ("empty_response", "no_api_key"):
                raise
            마지막탈 = e
            if not e.다시걸만한가 or e.코드 in 안걸것:
                raise
            남은시도 -= 1
            if 남은시도 <= 0:
                raise
            쉴것 = _쉴시간(몇번째)
            # **쉬고 나면 마감을 넘길 것 같으면 아예 안 쉰다.** 쉬는 동안
            # 사람을 기다리게 해 놓고 결국 못 주는 것이 제일 나쁘다.
            if 마감 is not None and time.monotonic() + 쉴것 >= 마감:
                raise 모델탈("deadline_exceeded", "쉬면 예산을 넘긴다") from e
            print(f"!! 모델이 {e.코드} — {몇번째 + 1}번째, {쉴것:.1f}초 쉬고 다시")
            time.sleep(쉴것)
    raise 마지막탈 or 모델탈("unknown", "이유를 모르겠다")
