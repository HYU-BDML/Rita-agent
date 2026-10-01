# -*- coding: utf-8 -*-
"""배포 뒤 문 두드리기 — 돈 안 든다(만들기는 없는 주차로만 두드린다).

    python weekly/tests/smoke.py https://xxxx.execute-api.ap-northeast-2.amazonaws.com
"""
import json
import sys
import urllib.error
import urllib.request

base = sys.argv[1].rstrip("/")


def 부르기(방법, 길, 몸=None):
    요청 = urllib.request.Request(base + 길, method=방법, headers={"Content-Type": "application/json"},
                                data=None if 몸 is None else json.dumps(몸, ensure_ascii=False).encode("utf-8"))
    try:
        with urllib.request.urlopen(요청, timeout=30) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


상, 몸 = 부르기("GET", "/weeks")
assert 상 == 200 and 몸["weeks"], (상, 몸)
print("주차 목록:", 몸["weeks"][0]["label"])
상, 몸 = 부르기("POST", "/make", {"week": "13월 1주차", "year": 2026})
assert 상 == 400, (상, 몸)
print("없는 주차 → 400:", 몸["error"])
상, 몸 = 부르기("GET", "/jobs")
assert 상 == 200, (상, 몸)
print("지난 결과:", len(몸["jobs"]), "개")
상, 몸 = 부르기("GET", "/jobs/20000101-000000-00000000")
assert 상 == 404, (상, 몸)
print("없는 번호표 → 404")
상, 몸 = 부르기("GET", "/wallet")
assert 상 == 200 and "apify" in 몸, (상, 몸)
print("지갑:", 몸["apify"]["쓸수있는합"], "/ 딥시크", 몸["deepseek"]["남은"])
상, 몸 = 부르기("POST", "/topic/chat", {"text": ""})
assert 상 == 400, (상, 몸)
print("빈 말 → 400")
상, 몸 = 부르기("GET", "/topic/chat/20000101-000000-00000000")
assert 상 == 404, (상, 몸)
상, 몸 = 부르기("POST", "/topic/make", {"chat": "20000101-000000-00000000"})
assert 상 == 404, (상, 몸)
print("없는 대화 → 404")
상, 몸 = 부르기("GET", "/topic/fields")
assert 상 == 200 and "fields" in 몸, (상, 몸)
print("저장된 분야:", len(몸["fields"]), "개")
print("문 두드리기 통과")
