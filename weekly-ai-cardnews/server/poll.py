# -*- coding: utf-8 -*-
"""번호표 기다리기. Dify 에서는 «다 됐나» 단계를 펼쳐 놓고 서버가 25초씩 붙잡혀 기다렸다.
여기서는 지휘 서버가 쉬고(`잠자기`) 옛 서버에는 바로 답하는 물음(`wait=0`)만 던진다."""
import time


def 기다리기(보기, 번호, 최대초: float, 간격초: float = 10, 잠자기=time.sleep, 지금=time.monotonic) -> dict:
    끝 = 지금() + 최대초
    while True:
        d = 보기(번호)
        if d.get("done"):
            return d
        if 지금() >= 끝:
            return {**d, "timed_out": True}
        잠자기(간격초)
