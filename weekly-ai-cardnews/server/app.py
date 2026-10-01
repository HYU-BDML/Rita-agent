# -*- coding: utf-8 -*-
"""지휘 서버 입구 (람다 weekly-ai, 핸들러 app.handler).

    POST /make {week, year}  → 202 {job}      뒤에서 «소식» 달리기 시작
    GET  /jobs               → {jobs: [...]}  최근 50판 (모두 같은 목록)
    GET  /jobs/{job}         → 한 판 (재료 빼고). 30분 넘게 안 바뀌면 «멈춤»
    POST /jobs/{job}/retry   → 202 {job}      실패·멈춘 판을 실패한 단계부터 이어서 다시
    GET  /weeks              → {weeks: [...]} 고를 수 있는 최근 12주

뒤에서 부르는 달리기는 몸통이 {"_job", "_stage"} 다.
"""
import base64
import json
import os
import re
import time
import traceback
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import deepseek
import image
import oldserver
import runs
import store
import weeks
from nodes import check_body, check_hook, design_tpl, merge_script, pick_news

BUCKET = os.environ.get("BUCKET") or "<S3 통 이름>"
REGION = "ap-northeast-2"
KST = timezone(timedelta(hours=9))
멈춤분 = 30
_번호모양 = re.compile(r"^\d{8}-\d{6}-[0-9a-f]{8}$")
_s3 = None
_lam = None


def _창고():
    global _s3
    if _s3 is None:
        import boto3
        _s3 = boto3.client("s3", region_name=REGION)
    return store.창고(_s3, BUCKET)


def _다음부르기(job: str, 단계: str) -> None:
    global _lam
    if _lam is None:
        import boto3
        _lam = boto3.client("lambda", region_name=REGION)
    _lam.invoke(FunctionName=os.environ["AWS_LAMBDA_FUNCTION_NAME"], InvocationType="Event",
                Payload=json.dumps({"_job": job, "_stage": 단계}).encode("utf-8"))


def 손만들기(context=None) -> runs.손:
    return runs.손(
        옛서버=oldserver, 딥시크=deepseek.한번, 그림=image.만들기, 창고=_창고(),
        노드=SimpleNamespace(design_tpl=design_tpl, pick_news=pick_news, check_body=check_body,
                           check_hook=check_hook, merge_script=merge_script),
        잠자기=time.sleep, 지금=time.monotonic, 다음부르기=_다음부르기,
        남은초=(lambda: context.get_remaining_time_in_millis() / 1000) if context else (lambda: 900.0))


def _답(상태: int, 몸: dict) -> dict:
    return {"statusCode": 상태,
            "headers": {"Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store"},
            "body": json.dumps(몸, ensure_ascii=False)}


def _멈춤판정(요약: dict, 지금: datetime) -> dict:
    if 요약.get("state") == "만드는 중" and 요약.get("updated"):
        바뀐때 = datetime.strptime(요약["updated"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        if 지금 - 바뀐때 > timedelta(minutes=멈춤분):
            return {**요약, "state": "멈춤", "error": f"{멈춤분}분 넘게 진행이 없음 — 다시 만들어 주세요"}
    return 요약


def 처리(event: dict, 창고, 다음부르기, 오늘=None, 지금=None) -> dict:
    방법 = event["requestContext"]["http"]["method"]
    길 = event.get("rawPath") or "/"
    지금 = 지금 or datetime.now(timezone.utc)
    if 방법 == "POST" and 길 == "/make":
        글 = event.get("body") or "{}"
        if event.get("isBase64Encoded"):
            글 = base64.b64decode(글).decode("utf-8")
        몸 = json.loads(글)
        주, 해 = str(몸.get("week") or "").strip(), 몸.get("year") or datetime.now(KST).year
        try:
            weeks.주차(주, 해)
        except ValueError as e:
            return _답(400, {"error": str(e)})
        job = store.새번호표()
        창고.쓰기(runs.새기록(job, 주, int(해)))
        다음부르기(job, "소식")
        return _답(202, {"job": job})
    if 방법 == "GET" and 길 == "/jobs":
        return _답(200, {"jobs": [_멈춤판정(x, 지금) for x in 창고.목록(50)]})
    if 방법 == "POST" and 길.startswith("/jobs/") and 길.endswith("/retry"):
        job = 길[len("/jobs/"):-len("/retry")]
        기록 = 창고.읽기(job) if _번호모양.match(job) else None
        if 기록 is None:
            return _답(404, {"error": "없는 결과입니다"})
        상태 = _멈춤판정(store.요약(기록), 지금)["state"]
        if 상태 not in ("실패", "멈춤"):
            return _답(409, {"error": "이미 다 된 판입니다" if 상태 == "됨" else "지금 만드는 중입니다"})
        # 실패한 단계부터 — 앞 단계 결과와 써 둔 대본은 기록(재료)에 그대로 있다
        for 단계 in 기록["steps"][-1:]:
            if 단계["state"] in ("실패", "하는 중"):
                단계["state"] = "하는 중"
        기록.update(state="만드는 중", error=None)
        창고.쓰기(기록)
        다음부르기(job, 기록["단계"])
        return _답(202, {"job": job})
    if 방법 == "GET" and 길.startswith("/jobs/"):
        job = 길[len("/jobs/"):]
        기록 = 창고.읽기(job) if _번호모양.match(job) else None
        if 기록 is None:
            return _답(404, {"error": "없는 결과입니다"})
        return _답(200, _멈춤판정(store.요약(기록), 지금))
    if 방법 == "GET" and 길 == "/weeks":
        return _답(200, {"weeks": weeks.최근주차들(오늘 or datetime.now(KST).date())})
    return _답(404, {"error": f"모르는 길: {방법} {길}"})


def handler(event, context):
    if "_job" in event:  # 내가 뒤로 넘긴 달리기
        return runs.달리기(event["_job"], event["_stage"], 손만들기(context))
    try:
        return 처리(event, _창고(), _다음부르기)
    except Exception as e:
        # **반드시 남긴다** — 스킬 dify-workflow 철칙 ①: 주소 · 예외 · 몸통 앞머리 300자 · traceback
        원몸통 = event.get("body") or ""
        http = (event.get("requestContext") or {}).get("http") or {}
        print(runs._가리기(f"!! 500 {http.get('method')} {event.get('rawPath')}\n"
                          f"   {type(e).__name__}: {e}\n"
                          f"   몸통 {len(원몸통)}자 · 앞머리 300자: {원몸통[:300]}\n"
                          f"{traceback.format_exc()}"))
        return _답(500, {"error": runs._가리기(f"{type(e).__name__}: {e}")})
