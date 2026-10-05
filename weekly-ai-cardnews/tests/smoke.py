# -*- coding: utf-8 -*-
"""배포 뒤 문 두드리기 — 돈 안 든다(만들기는 없는 주차로만 두드린다).
계획 4 의 새 문 둘(매주 볼 곳 바꾸기·카드 다시 굽기)과 주차 넷도 두드린다.

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
기간들 = 몸.get("기간들") or {}
assert len(기간들.get("주차") or []) == 4, 기간들
print("주차 넷:", " · ".join(x[2] for x in 기간들["주차"]))


def 앱이_받았나(상, 몸, 상들=(404,)):
    """앞문에 길이 없으면 {"message": "Not Found"}, 앱이 모르는 길이면 «모르는 길» — 둘 다 아니어야 새 문이 닿은 것."""
    글 = json.dumps(몸, ensure_ascii=False)
    return 상 in 상들 and "Not Found" not in 글 and "모르는 길" not in 글


상, 몸 = 부르기("POST", "/topic/fields/20000101-000000-00000000/list",
             {"표": "x", "job": "20000101-000000-00000000", "남길줄": []})
assert 앱이_받았나(상, 몸, (403, 404)), (상, 몸)
print("없는 분야 목록 바꾸기 →", 상, 몸.get("error"))
상, 몸 = 부르기("POST", "/topic/jobs/20000101-000000-00000000/cards", {})
assert 앱이_받았나(상, 몸), (상, 몸)
print("없는 판 카드 다시 굽기 →", 상, 몸.get("error"))
print("문 두드리기 통과")
