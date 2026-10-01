# -*- coding: utf-8 -*-
"""나만 보는 전체 기록(사용자 2026-10-01 «가» — 창고에만, 지우지 않는다).

판·대화마다 무엇을 보내고 무엇을 생각하고 무엇을 정했는지 빼지 않고 쌓는다. 사건 하나가 파일 하나
(`weekly/trace/{판·대화 번호}/{나노초}-{차례}-{4자}-{종류}.json`)라 람다가 바뀌어도 이어 쌓이고, 나란히 도는
판정관끼리 부딪히지 않는다. **앞문(app.py)은 이 칸을 읽지 않는다** — 사람이 이 컴퓨터에서
`python weekly/tests/trace_view.py` 로 본다. 열쇠처럼 생긴 글자는 가리고, 그림 base64 는 길이만 남긴다.
기록을 못 남겨도 판은 멈추지 않는다."""
import itertools
import json
import time
import uuid

import store
from runs import _가리기

_차례 = itertools.count()  # 같은 나노초에 두 번 써도 쓴 차례가 남게


def _그림빼기(x):
    if isinstance(x, dict):
        if x.get("type") == "image_url" and isinstance(x.get("image_url"), dict):
            주소 = str(x["image_url"].get("url") or "")
            if 주소.startswith("data:"):
                return {**x, "image_url": {**x["image_url"], "url": f"(그림 base64 {len(주소):,}자 — 생략)"}}
        return {k: _그림빼기(v) for k, v in x.items()}
    if isinstance(x, list):
        return [_그림빼기(v) for v in x]
    return x


class 흔적:
    def __init__(self, s3=None, 통: str = "", 앞: str = "weekly/", 번호: str = ""):
        self.s3, self.통, self.앞, self.번호 = s3, 통, 앞, 번호

    def 쓰기(self, 종류: str, 내용: dict) -> None:
        if self.s3 is None or not self.번호:
            return
        몸 = _가리기(json.dumps(_그림빼기({"종류": 종류, "시각": store.지금시각(), **내용}), ensure_ascii=False,
                               default=str))
        키 = f"{self.앞}trace/{self.번호}/{time.time_ns()}-{next(_차례):06d}-{uuid.uuid4().hex[:4]}-{종류}.json"
        try:
            self.s3.put_object(Bucket=self.통, Key=키, Body=몸.encode("utf-8"), ContentType="application/json")
        except Exception as e:
            print(f"!! 기록 못 남김 {self.번호} {종류}: {type(e).__name__}")


def 답칸(답: dict) -> dict:
    """딥시크 답에서 남길 것 — 생각 글·답 글·도구 호출·토큰."""
    return {"모델": 답.get("모델"), "넘침": 답.get("넘침", False),
            "생각": (답.get("메시지") or {}).get("reasoning_content", ""), "답글": 답.get("글", ""),
            "도구호출": [{"id": h["id"], "이름": h["이름"], "인자": h["인자"], "인자탈": h.get("인자탈", "")}
                     for h in 답.get("도구호출") or []],
            "토큰": {k: 답.get(k, 0) for k in ("입력토큰", "캐시토큰", "출력토큰", "생각토큰")}, "초": 답.get("초", 0)}


def 감싼대화(대화, 흔적_: 흔적, 종류: str, 걸음=lambda: None):
    """대화(딥시크 부르기)를 감싼다 — 부를 때마다 «보낸 것 전체 + 답» 을 남긴다(판정관·주제 다듬기처럼 짧은 대화용)."""
    def 부르기(메시지들, 한도, **kw):
        답 = 대화(메시지들, 한도, **kw)
        흔적_.쓰기(종류, {"걸음": 걸음(), "한도": 한도, "보낸것": 메시지들, **답칸(답)})
        return 답
    return 부르기
