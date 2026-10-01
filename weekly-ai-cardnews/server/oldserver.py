# -*- coding: utf-8 -*-
"""옛 서버(람다 cardnews-render) 부르기. **보내는 몸통은 Dify 판과 똑같다.**

429·5xx·끊김은 5·15·30초 쉬고 다시 건다 — 계정의 람다 동시 한도(10)에 걸린 것일 수 있다.
그 밖(400·403·404)은 고칠 수 없으니 바로 `옛서버탈`.
"""
import json
import os
import time
import urllib.error
import urllib.request

BASE = (os.environ.get("OLD_SERVER") or "<옛 서버 주소>").rstrip("/")
다시할것 = {0, 429, 500, 502, 503, 504}
쉴시간 = (5, 15, 30)


class 옛서버탈(Exception):
    def __init__(self, 상태: int, 말: str):
        super().__init__(f"옛 서버 {상태}: {말}")
        self.상태 = 상태


def _보내기(방법: str, 길: str, 몸: bytes | None, 시간: int) -> tuple[int, str]:
    """한 번 보내고 (상태, 글). 끊기면 (0, 까닭). **시험이 여기를 갈아 끼운다.**"""
    요청 = urllib.request.Request(BASE + 길, data=몸, method=방법,
                                headers={"Content-Type": "application/json; charset=utf-8"})
    try:
        with urllib.request.urlopen(요청, timeout=시간) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")[:300]
    except (urllib.error.URLError, TimeoutError) as e:
        return 0, str(getattr(e, "reason", e))[:200]


def 부르기(방법: str, 길: str, 몸=None, 잠자기=time.sleep, 시간: int = 60) -> str:
    데이터 = None if 몸 is None else json.dumps(몸, ensure_ascii=False).encode("utf-8")
    for 몇번째 in range(len(쉴시간) + 1):
        상태, 글 = _보내기(방법, 길, 데이터, 시간)
        if 200 <= 상태 < 300:
            return 글
        if 상태 not in 다시할것 or 몇번째 == len(쉴시간):
            raise 옛서버탈(상태, 글[:300])
        print(f"!! 옛 서버 {방법} {길} → {상태}, {쉴시간[몇번째]}초 쉬고 다시")
        잠자기(쉴시간[몇번째])
    raise AssertionError("닿지 않는 자리")


def 소식긁기(주: str, 해) -> str:
    return 부르기("POST", "/procure/week", {"라벨": 주, "해": int(해)}).strip()


def 번호표(job: str) -> dict:
    return json.loads(부르기("GET", f"/render/compose/{job}?wait=0"))


def 폭검사(장들: list, 틀: str) -> dict:
    return json.loads(부르기("POST", "/render/check", {"slides": 장들, "template": json.loads(틀)}))


def 장굽기(장: dict, 틀: str) -> str:
    return 부르기("POST", "/render/slide", {"slide": 장, "url": 장.get("media_url") or "",
                                            "gen": 장.get("gen") or "", "template": json.loads(틀)}).strip()


def 표지굽기(표지: dict, 틀: str) -> str:
    return 부르기("POST", "/render/cover", {"slide": 표지, "template": json.loads(틀)}).strip()


def 넘겨보기(제목: str, 장들: list) -> str:
    return 부르기("POST", "/viewer", {"title": 제목, "slides": 장들}).strip()
