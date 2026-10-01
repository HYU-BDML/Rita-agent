# -*- coding: utf-8 -*-
"""지휘 서버 입구 (람다 weekly-ai, 핸들러 app.handler).

    POST /make {week, year}  → 202 {job}      뒤에서 «소식» 달리기 시작
    GET  /jobs               → {jobs: [...]}  최근 50판 (모두 같은 목록)
    GET  /jobs/{job}         → 한 판 (재료 빼고). 30분 넘게 안 바뀌면 «멈춤»
    POST /jobs/{job}/retry   → 202 {job}      실패·멈춘 판을 실패한 단계부터 이어서 다시
    GET  /weeks              → {weeks: [...]} 고를 수 있는 최근 12주
    POST /topic/chat {chat?, text} → 202 {chat}  주제 다듬기 한 턴을 뒤에서
    GET  /topic/chat/{chat}  → 대화 (재료 빼고). 5분 넘게 «생각 중» 이면 «실패»
    GET  /topic/fields       → 저장된 분야 목록 (새것부터, 모두가 같이 본다)
    POST /topic/fields {job} → 201 {field}    끝난 새 분야 판을 «분야» 로 저장
    POST /topic/make {chat} 또는 {field, 기간} → 202 {job}  주문서로 «모으기» 시작 (지갑이 바닥이면 503)
    GET  /wallet             → Apify·딥시크 남은 돈 (새 분야 판을 받을 수 있나)

뒤에서 부르는 달리기는 몸통이 {"_job", "_stage"} 다.
주제 판 단계(모으기·검증·정리)는 topic/flow.py, 대화 한 턴은 {"_chat"}.
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
from topic import apify, flow, order, page

BUCKET = os.environ.get("BUCKET") or "<S3 통 이름>"
REGION = "ap-northeast-2"
KST = timezone(timedelta(hours=9))
멈춤분 = 30
대화늦음분 = 5
딥시크남길돈 = 5.0  # 딥시크 잔액이 이 아래면 새 분야 판을 안 받는다 — AI 소식 몫(계획 머리 «세부 제안» 4)
동시상한 = 2   # 새 분야 판이 동시에 이만큼 «만드는 중» 이면 더 안 받는다 — 람다 칸·돈(최종 검토, 사용자 확인 대기)
하루상한 = 10  # 한국 날짜 하루에 새 분야 판 수
저장기간 = {"지난주": "지난주", "이번주": "이번 주", "최근N일": "최근 {N}일", "이번달": "이번 달", "지난달": "지난달"}
분야본칸 = ("주제", "범위", "넣을것", "뺄것", "목표건수", "한장단위", "분야이름", "등급")
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


def _대화부르기(번호: str) -> None:
    global _lam
    if _lam is None:
        import boto3
        _lam = boto3.client("lambda", region_name=REGION)
    _lam.invoke(FunctionName=os.environ["AWS_LAMBDA_FUNCTION_NAME"], InvocationType="Event",
                Payload=json.dumps({"_chat": 번호}).encode("utf-8"))


def 주제손만들기(context=None) -> flow.손:
    return flow.손(창고=_창고(), 대화=deepseek.도구대화, 실행=apify.실행, 읽기=page.읽기, 받기=page.받기,
                  다음부르기=_다음부르기, 벽시계=lambda: datetime.now(timezone.utc),
                  남은초=(lambda: context.get_remaining_time_in_millis() / 1000) if context else (lambda: 900.0))


def _지갑() -> dict:
    a = apify.지갑()
    d = deepseek.잔액()
    return {"apify": {k: a[k] for k in ("쓸수있는합", "낮음", "멈춤", "모름")},
            "deepseek": {"남은": d, "멈춤": d is not None and d < 딥시크남길돈}}


def _몸(event: dict) -> dict:
    글 = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        글 = base64.b64decode(글).decode("utf-8")
    try:
        몸 = json.loads(글)
    except ValueError:
        return {}
    return 몸 if isinstance(몸, dict) else {}


def _오늘판수(목록: list, 지금: datetime) -> int:
    오늘 = 지금.astimezone(KST).date()
    return sum(1 for x in 목록 if x.get("kind") == "주제" and x.get("started") and datetime.strptime(
        x["started"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).astimezone(KST).date() == 오늘)


def _늦음(d: dict, 지금: datetime) -> bool:
    if d.get("state") != "생각 중" or not d.get("updated"):
        return False
    바뀐때 = datetime.strptime(d["updated"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    return 지금 - 바뀐때 > timedelta(minutes=대화늦음분)


def _서명붙이기(결과: dict, 창고) -> dict:
    결과 = json.loads(json.dumps(결과, ensure_ascii=False))  # 기록은 안 바꾼다
    for d in 결과.get("bundle") or []:
        m = d.get("미디어") or {}
        if m.get("키"):
            m["주소"] = 창고.서명주소(m["키"])
        if m.get("대표키"):
            m["대표주소"] = 창고.서명주소(m["대표키"])
    return 결과


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


def 처리(event: dict, 창고, 다음부르기, 오늘=None, 지금=None, 대화부르기=None, 지갑=None) -> dict:
    방법 = event["requestContext"]["http"]["method"]
    길 = event.get("rawPath") or "/"
    지금 = 지금 or datetime.now(timezone.utc)
    대화부르기, 지갑 = 대화부르기 or _대화부르기, 지갑 or _지갑
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
        요약 = _멈춤판정(store.요약(기록), 지금)
        if 기록.get("kind") == "주제" and 요약.get("result"):
            요약["result"] = _서명붙이기(요약["result"], 창고)
        return _답(200, 요약)
    if 방법 == "POST" and 길 == "/topic/chat":
        몸 = _몸(event)
        글 = str(몸.get("text") or "").strip()
        if not 1 <= len(글) <= 1000:
            return _답(400, {"error": "말을 1~1000자로 보내 주세요"})
        번호 = str(몸.get("chat") or "")
        if 번호:
            d = 창고.대화읽기(번호) if _번호모양.match(번호) else None
            if d is None:
                return _답(404, {"error": "없는 대화입니다"})
            if d.get("state") == "생각 중" and not _늦음(d, 지금):
                return _답(409, {"error": "아직 생각 중이에요 — 답이 오면 보내 주세요"})
        else:
            번호 = store.새번호표()
            d = {"chat": 번호, "messages": [], "order": None, "error": None}
        d["messages"].append({"who": "사람", "text": 글})
        d.update(state="생각 중", error=None)
        창고.대화쓰기(d)
        대화부르기(번호)
        return _답(202, {"chat": 번호})
    if 방법 == "GET" and 길.startswith("/topic/chat/"):
        번호 = 길[len("/topic/chat/"):]
        d = 창고.대화읽기(번호) if _번호모양.match(번호) else None
        if d is None:
            return _답(404, {"error": "없는 대화입니다"})
        if _늦음(d, 지금):
            d = {**d, "state": "실패", "error": "답이 너무 늦어요 — 다시 보내 주세요"}
        return _답(200, {k: d.get(k) for k in ("chat", "state", "messages", "order", "error", "updated", "cost", "job")})
    if 방법 == "GET" and 길 == "/topic/fields":
        return _답(200, {"fields": [{k: f.get(k) for k in ("field", "이름", "본", "job", "saved")}
                                    for f in 창고.분야목록()]})
    if 방법 == "POST" and 길 == "/topic/fields":
        job = str(_몸(event).get("job") or "")
        기록 = 창고.읽기(job) if _번호모양.match(job) else None
        if 기록 is None:
            return _답(404, {"error": "없는 판입니다"})
        있던 = 창고.분야목록()
        같은판 = next((f for f in 있던 if f.get("job") == job), None)
        if 같은판:
            return _답(200, {"field": 같은판["field"]})
        if 기록.get("kind") != "주제" or 기록.get("state") != "됨" or not (기록.get("result") or {}).get("bundle"):
            return _답(409, {"error": "소식을 모아 끝난 새 분야 판만 저장할 수 있어요"})
        o = 기록["order"]
        if any(f.get("이름") == o["분야이름"] for f in 있던):
            return _답(409, {"error": f"같은 이름의 분야 «{o['분야이름']}» 가 이미 있어요 — 왼쪽 목록에서 골라 주세요"})
        번호 = store.새번호표()
        창고.분야쓰기({"field": 번호, "이름": o["분야이름"], "본": {k: o.get(k) for k in 분야본칸}, "job": job,
                     "saved": store.지금시각()})
        return _답(201, {"field": 번호})
    if 방법 == "POST" and 길 == "/topic/make":
        몸 = _몸(event)
        대화번호, 분야번호 = None, None
        if 몸.get("field"):
            분야번호 = str(몸["field"])
            f = 창고.분야읽기(분야번호) if _번호모양.match(분야번호) else None
            if f is None:
                return _답(404, {"error": "없는 분야입니다"})
            기간 = 몸.get("기간") if isinstance(몸.get("기간"), dict) else {}
            종류 = str(기간.get("종류") or "")
            if 종류 not in 저장기간:
                return _답(400, {"error": f"기간은 {', '.join(x.format(N=7) for x in 저장기간.values())} 중에서 골라 주세요"})
            try:
                주문서 = order.다듬기({**f["본"], "기간": {**기간, "말": 저장기간[종류].format(N=기간.get("N", 7))}},
                                    오늘 or datetime.now(KST).date())
            except order.주문서탈 as e:
                return _답(400, {"error": str(e)})
        else:
            대화번호 = str(몸.get("chat") or "")
            d = 창고.대화읽기(대화번호) if _번호모양.match(대화번호) else None
            if d is None:
                return _답(404, {"error": "없는 대화입니다"})
            if not d.get("order"):
                return _답(409, {"error": "주문서가 아직 없어요 — 대화로 주제를 먼저 정해 주세요"})
            if d.get("job"):  # 이 주문서로 이미 만든 판 — 두 번 눌러도(새로고침 뒤에도) 판은 하나
                return _답(200, {"job": d["job"]})
            if d.get("state") == "생각 중" and not _늦음(d, 지금):  # 바뀔 주문서를 두고 옛것으로 모으지 않게(최종 검토)
                return _답(409, {"error": "지휘자의 답을 기다리는 중이에요 — 답이 오면 바뀐 주문서로 모아 주세요"})
            주문서 = d["order"]
        w = 지갑()
        if w["apify"]["멈춤"] or w["deepseek"]["멈춤"]:
            무엇 = "이번 달 자료 모으기 분량을 거의 다 써서" if w["apify"]["멈춤"] else "딥시크 잔액이 얼마 안 남아"
            return _답(503, {"error": f"{무엇} 새 분야는 잠시 쉬어요 — AI 소식은 그대로 돼요", "wallet": w})
        판들 = 창고.목록(50)
        if sum(1 for x in 판들 if x.get("kind") == "주제" and _멈춤판정(x, 지금).get("state") == "만드는 중") >= 동시상한:
            return _답(409, {"error": f"지금 다른 새 분야를 {동시상한}개 모으는 중이에요 — 끝나면 다시 눌러 주세요. AI 소식은 그대로 돼요"})
        if _오늘판수(판들, 지금) >= 하루상한:
            return _답(409, {"error": f"오늘 새 분야는 {하루상한}판까지예요 — 내일 다시 해 주세요. AI 소식은 그대로 돼요"})
        job = store.새번호표()
        기록 = flow.새기록(job, 주문서, 대화번호)
        if 분야번호:
            기록["field"] = 분야번호
        창고.쓰기(기록)
        if 대화번호:
            d["job"] = job
            창고.대화쓰기(d)
        다음부르기(job, "모으기")
        return _답(202, {"job": job})
    if 방법 == "GET" and 길 == "/wallet":
        w = 지갑()
        if w["apify"]["낮음"] or w["deepseek"]["멈춤"]:
            print(f"!! 지갑 낮음 — Apify 쓸 수 있는 합 ${w['apify']['쓸수있는합']} · 딥시크 ${w['deepseek']['남은']}")
        return _답(200, w)
    if 방법 == "GET" and 길 == "/weeks":
        return _답(200, {"weeks": weeks.최근주차들(오늘 or datetime.now(KST).date())})
    return _답(404, {"error": f"모르는 길: {방법} {길}"})


def handler(event, context):
    if "_job" in event:  # 내가 뒤로 넘긴 달리기 — 단계 이름으로 주제 판·주간 판이 갈린다
        if event["_stage"] in flow.단계순서:
            return flow.달리기(event["_job"], event["_stage"], 주제손만들기(context))
        return runs.달리기(event["_job"], event["_stage"], 손만들기(context))
    if "_chat" in event:
        return flow.대화한턴(event["_chat"], 주제손만들기(context), datetime.now(KST).date())
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
