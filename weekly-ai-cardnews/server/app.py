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
    POST /topic/fields {job, 남길줄?} → 201 {field, 표}  끝난 새 분야 판을 «분야» 로 저장 (표 = 그 브라우저만 간직하는 지우기 표,
                             남길줄 = 매주 볼 곳 후보 중 남길 번호 — 없으면 전부)
    POST /topic/fields/{field}/delete {표} → 200 {지움}  저장한 브라우저에서만 지운다(창고엔 표의 지문만)
    POST /topic/fields/{field}/list {표, job, 남길줄} → 200 {field, 목록}  저장한 브라우저에서만, 이 분야로 끝난 판의
                             매주 볼 곳 후보로 목록을 바꾼다(계획 4)
    POST /topic/make {chat} 또는 {field, 기간} → 202 {job}  주문서로 «모으기» 시작 (지갑이 바닥이면 503)
    POST /topic/jobs/{job}/cards → 202 {job}  카드가 실패했거나 빠진 장이 있는 «됨» 판의 카드만 대본부터 다시(누구나, 판마다 2번)
    GET  /wallet             → Apify·딥시크 남은 돈 (새 분야 판을 받을 수 있나)

뒤에서 부르는 달리기는 몸통이 {"_job", "_stage"} 다.
주제 판 단계(모으기·검증·정리)는 topic/flow.py, 대화 한 턴은 {"_chat"}.
수리공은 {"_repair": 요청} — topic/repair.py(계획 4).
"""
import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import time
import traceback
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import deepseek
import image
import memes
import oldserver
import runs
import store
import weeks
from nodes import check_body, check_hook, design_tpl, merge_script, pick_news
from topic import apify, cards, flow, memory, order, page, registry, repair, watchlist

BUCKET = os.environ.get("BUCKET") or "<S3 통 이름>"
REGION = "ap-northeast-2"
KST = timezone(timedelta(hours=9))
멈춤분 = 30
대화늦음분 = 5
딥시크남길돈 = 5.0  # 딥시크 잔액이 이 아래면 새 분야 판을 안 받는다 — AI 소식 몫(계획 머리 «세부 제안» 4)
동시상한 = 2   # 새 분야 판이 동시에 이만큼 «만드는 중» 이면 더 안 받는다 — 람다 칸·돈(최종 검토, 사용자 확인 대기)
하루상한 = 10  # 한국 날짜 하루에 새 분야 판 수
카드다시상한 = 2  # 카드만 다시 굽기 — 한 판에 이만큼, 누구나 누른다(사용자 2026-10-04, 계획 4 D-4)
저장기간 = {"지난주": "지난주", "이번주": "이번 주", "최근N일": "최근 {N}일", "이번달": "이번 달", "지난달": "지난달"}
분야본칸 = ("주제", "범위", "넣을것", "뺄것", "목표건수", "한장단위", "분야이름", "등급")
_번호모양 = re.compile(r"^\d{8}-\d{6}-[0-9a-f]{8}$")
_기간말 = re.compile(r"지난\s?주|이번\s?주|최근\s?\d*\s?일|이번\s?달|지난\s?달|오늘|어제")
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


def _수리부르기(요청: dict) -> None:
    """수리공 람다를 뒤에서 — 판이 기다리지 않게(계획 4 C-3)."""
    global _lam
    if _lam is None:
        import boto3
        _lam = boto3.client("lambda", region_name=REGION)
    _lam.invoke(FunctionName=os.environ["AWS_LAMBDA_FUNCTION_NAME"], InvocationType="Event",
                Payload=json.dumps({"_repair": 요청}, ensure_ascii=False).encode("utf-8"))


def 수리손만들기(context=None) -> SimpleNamespace:
    창 = _창고()
    return SimpleNamespace(s3=창.s3, 통=창.통, 앞=창.앞, 실행=apify.실행, 한번=deepseek.한번, 조회=apify,
                           기억=memory.기억창고(창.s3, 창.통, 창.앞), 지금글=store.지금시각,
                           오늘=lambda: datetime.now(KST).date(), 잠자기=time.sleep,
                           남은초=(lambda: context.get_remaining_time_in_millis() / 1000) if context else (lambda: 900.0))


def _노드들() -> SimpleNamespace:
    """검사·틀 노드 다섯 — 표지 검사기는 밈 이름을 씻어 부른다(주간 AI 소식·새 분야 판 같이, 계획 4 E)."""
    return SimpleNamespace(design_tpl=design_tpl, pick_news=pick_news, check_body=check_body,
                           check_hook=memes.씻은표지검사(check_hook), merge_script=merge_script)


def 주제손만들기(context=None) -> flow.손:
    창 = _창고()
    return flow.손(창고=창, 대화=deepseek.도구대화, 실행=apify.실행, 읽기=page.읽기, 받기=page.받기,
                  다음부르기=_다음부르기, 벽시계=lambda: datetime.now(timezone.utc),
                  남은초=(lambda: context.get_remaining_time_in_millis() / 1000) if context else (lambda: 900.0),
                  # 카드 굽는 기계 — AI 소식 단계와 같은 것(계획 3)
                  옛서버=oldserver, 딥시크한번=deepseek.한번, 그림=image.만들기, 잠자기=time.sleep, 노드=_노드들(),
                  장부=registry.장부(창.s3, 창.통, 창.앞), 수리부르기=_수리부르기)  # 창고 도구 장부·수리공(계획 4 C)


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


def _기간말빼기(주제: str) -> str:
    """저장한 분야 주제에서 기간 말을 뺀다 — «하츠투하츠 지난주 소식» 이 «최근 7일» 판에도 남았다(판 4). 다 지워지면 그대로."""
    남은 = re.sub(r"\s{2,}", " ", _기간말.sub(" ", str(주제 or ""))).strip()
    return 남은 or str(주제 or "")


def _주차들(날) -> list:
    """저장한 분야의 주차 넷 — [시작, 끝, «9월 3주차»], 이번 주부터(계획 4 설계 A-5). 이름표는 카드 표지와 같은 셈."""
    난것 = []
    for 앞 in range(order.최대주차앞 + 1):
        시작, 끝 = order.기간계산({"종류": "주차", "앞": 앞}, 날)
        난것.append([시작, 끝, cards.이름표(시작, 끝)])
    return 난것


def _출처명단(기록: dict) -> list:
    """공식·언론 출처(«2차» 딱지 없는 소식의 출처) — 저장한 분야로 돌릴 때 기억 꺼내기 맨 앞(계획 2-1 설계 2-4)."""
    명단 = []
    for d in (기록.get("result") or {}).get("bundle") or []:
        출 = d.get("출처") or {}
        곳 = memory.곳키(f"{출.get('플랫폼')}:{출.get('계정')}")
        if 출.get("플랫폼") and "2차" not in (d.get("딱지") or []) and 곳 not in 명단:
            명단.append(곳)
    return 명단


def _표맞나(f: dict, 표) -> bool:
    """저장한 브라우저만 간직한 지우기 표가 맞나 — 창고엔 지문만(계획 2-1 설계 4장). 지우기·매주 볼 곳 바꾸기가 같이 쓴다."""
    표 = str(표 or "")
    return bool(표) and bool(f.get("지우기지문")) and hmac.compare_digest(
        hashlib.sha256(표.encode("utf-8")).hexdigest(), f["지우기지문"])


def _남길목록(후보: list, 남길) -> tuple[list, str]:
    """사람이 저장 화면에서 남긴 매주 볼 곳 — 그 판의 목록후보에서 번호로만 고른다. 화면이 보낸 도구·인자는 받지 않는다
    (로그인이 없어 누구나 저장할 수 있으니 엉뚱한 호출을 못 넣게, 계획 4 설계 A-3). 남길줄이 없으면(옛 화면) 후보 전부."""
    if 남길 is None:
        return [watchlist.줄만(x) for x in 후보][:watchlist.최대줄], ""
    if not isinstance(남길, list) or any(isinstance(i, bool) or not isinstance(i, int) or not 0 <= i < len(후보) for i in 남길):
        return [], "남길 줄 번호가 맞지 않아요 — 화면을 새로 열어 다시 골라 주세요"
    고른 = list(dict.fromkeys(남길))
    if len(고른) > watchlist.최대줄:
        return [], f"매주 볼 곳은 {watchlist.최대줄}곳까지예요 — 줄을 더 빼 주세요"
    return [watchlist.줄만(후보[i]) for i in 고른], ""


def _오늘판수(목록: list, 지금: datetime) -> int:
    오늘 = 지금.astimezone(KST).date()
    return sum(1 for x in 목록 if x.get("kind") == "주제" and not x.get("평가") and x.get("started") and datetime.strptime(
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
        옛서버=oldserver, 딥시크=deepseek.한번, 그림=image.만들기, 창고=_창고(), 노드=_노드들(),
        잠자기=time.sleep, 지금=time.monotonic, 다음부르기=_다음부르기,
        남은초=(lambda: context.get_remaining_time_in_millis() / 1000) if context else (lambda: 900.0))


def _답(상태: int, 몸: dict) -> dict:
    return {"statusCode": 상태,
            "headers": {"Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store"},
            "body": json.dumps(몸, ensure_ascii=False)}


되부름분 = 16   # 람다는 15분이면 끝난다 — 16분 넘게 진행이 없으면 죽었거나 안 불린 것
되부름최대 = 2  # 판마다


def _되부르기(기록: dict, 창고, 다음부르기, 지금: datetime) -> bool:
    """만드는 중인 주제 판이 16분 넘게 그대로면 지금 단계를 한 번 더 부른다 — 카드그림 뒤 카드굽기를 부르는 신호가
    사라져(그때 계정의 람다 동시 한도 10에 한 번 막힘) 판이 40분 멈췄다(진짜 시험 1, 2026-10-05, 계획 4 과제 42).
    볼 때(GET /jobs/{job})만 살핀다. 주간 판은 그대로(이어서 다시 단추)."""
    if 기록.get("kind") != "주제" or 기록.get("state") != "만드는 중" or not 기록.get("updated"):
        return False
    바뀐때 = datetime.strptime(기록["updated"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    if 지금 - 바뀐때 <= timedelta(minutes=되부름분) or (기록.get("되부름") or 0) >= 되부름최대:
        return False
    기록["되부름"] = (기록.get("되부름") or 0) + 1
    창고.쓰기(기록)  # 고친 때가 지금으로 — 같은 판을 곧바로 또 부르지 않는다
    print(f"!! {기록['job']} [{기록.get('단계')}] {되부름분}분 넘게 진행이 없어 다시 부름({기록['되부름']}번째)")
    다음부르기(기록["job"], 기록["단계"])
    return True


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
        _되부르기(기록, 창고, 다음부르기, 지금)
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
        날 = 오늘 or datetime.now(KST).date()  # 기간마다 실제 날짜 — 판을 만들 때와 같은 셈(«최근 7일» 만 보고 눌렀다, 판 4)
        기간들 = {종류: list(order.기간계산({"종류": 종류, "N": 7}, 날)) for 종류 in 저장기간}
        기간들["주차"] = _주차들(날)
        return _답(200, {"fields": [{**{k: f.get(k) for k in ("field", "이름", "본", "job", "saved")},
                                     "목록": [watchlist.화면글(x) for x in f.get("목록") or []]}  # 매주 볼 곳(계획 4)
                                    for f in 창고.분야목록()], "기간들": 기간들})
    if 방법 == "POST" and 길 == "/topic/fields":
        몸 = _몸(event)
        job = str(몸.get("job") or "")
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
        목록, 탈 = _남길목록((기록.get("result") or {}).get("목록후보") or [], 몸.get("남길줄"))
        if 탈:
            return _답(400, {"error": 탈})
        번호 = store.새번호표()
        표 = secrets.token_urlsafe(24)  # 32자 — 그 브라우저만 간직한다. 창고(누구나 읽음)에는 지문만(계획 2-1 설계 4장)
        본 = {k: o.get(k) for k in 분야본칸}
        본["주제"] = _기간말빼기(본["주제"])
        창고.분야쓰기({"field": 번호, "이름": o["분야이름"], "본": 본, "job": job, "출처명단": _출처명단(기록), "목록": 목록,
                     "지우기지문": hashlib.sha256(표.encode("utf-8")).hexdigest(), "saved": store.지금시각()})
        return _답(201, {"field": 번호, "표": 표})
    if 방법 == "POST" and 길.startswith("/topic/fields/") and 길.endswith("/delete"):
        번호 = 길[len("/topic/fields/"):-len("/delete")]
        f = 창고.분야읽기(번호) if _번호모양.match(번호) else None
        if f is None:
            return _답(404, {"error": "없는 분야입니다"})
        if not _표맞나(f, _몸(event).get("표")):
            return _답(403, {"error": "저장한 브라우저에서만 지울 수 있어요"})
        창고.분야지우기(번호)
        return _답(200, {"지움": 번호})
    if 방법 == "POST" and 길.startswith("/topic/fields/") and 길.endswith("/list"):
        번호 = 길[len("/topic/fields/"):-len("/list")]
        f = 창고.분야읽기(번호) if _번호모양.match(번호) else None
        if f is None:
            return _답(404, {"error": "없는 분야입니다"})
        몸 = _몸(event)
        if not _표맞나(f, 몸.get("표")):
            return _답(403, {"error": "저장한 브라우저에서만 바꿀 수 있어요"})
        job = str(몸.get("job") or "")
        기록 = 창고.읽기(job) if _번호모양.match(job) else None
        if 기록 is None or 기록.get("field") != 번호 or 기록.get("state") != "됨":
            return _답(409, {"error": "이 분야로 모아 끝난 판에서만 매주 볼 곳을 바꿀 수 있어요"})
        후보 = (기록.get("result") or {}).get("목록후보") or []
        목록, 탈 = (_남길목록(후보, 몸["남길줄"]) if "남길줄" in 몸
                  else ([], "남길 줄 번호가 맞지 않아요 — 화면을 새로 열어 다시 골라 주세요"))
        if 탈:
            return _답(400, {"error": 탈})
        f.update(목록=목록, 출처명단=_출처명단(기록))
        창고.분야쓰기(f)
        return _답(200, {"field": 번호, "목록": [watchlist.화면글(x) for x in 목록]})
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
            날 = 오늘 or datetime.now(KST).date()
            if 종류 != "주차" and 종류 not in 저장기간:
                return _답(400, {"error": f"기간은 {', '.join(x.format(N=7) for x in 저장기간.values())}·몇 월 몇 주차 중에서 "
                                          "골라 주세요"})
            try:
                if 종류 == "주차":  # 카드 표지 이름표와 같은 «9월 2주차»(계획 4 설계 A-5)
                    말 = cards.이름표(*order.기간계산(기간, 날))
                else:
                    말 = 저장기간[종류].format(N=기간.get("N", 7))
                주문서 = order.다듬기({**f["본"], "기간": {**기간, "말": 말}}, 날)
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
        if sum(1 for x in 판들 if x.get("kind") == "주제" and not x.get("평가")  # 평가 판은 사람 셈에서 뺀다(계획 3)
               and _멈춤판정(x, 지금).get("state") == "만드는 중") >= 동시상한:
            return _답(409, {"error": f"지금 다른 새 분야를 {동시상한}개 모으는 중이에요 — 끝나면 다시 눌러 주세요. AI 소식은 그대로 돼요"})
        if _오늘판수(판들, 지금) >= 하루상한:
            return _답(409, {"error": f"오늘 새 분야는 {하루상한}판까지예요 — 내일 다시 해 주세요. AI 소식은 그대로 돼요"})
        job = store.새번호표()
        기록 = flow.새기록(job, 주문서, 대화번호)
        if 분야번호:
            기록["field"] = 분야번호
            if f.get("목록"):  # 매주 볼 곳 — 서버가 지휘자보다 먼저 그대로 본다(계획 4 설계 A-4)
                기록["목록"], 기록["단계"] = f["목록"], "목록보기"
        창고.쓰기(기록)
        if 대화번호:
            d["job"] = job
            창고.대화쓰기(d)
        다음부르기(job, 기록["단계"])
        return _답(202, {"job": job})
    if 방법 == "POST" and 길.startswith("/topic/jobs/") and 길.endswith("/cards"):
        job = 길[len("/topic/jobs/"):-len("/cards")]
        기록 = 창고.읽기(job) if _번호모양.match(job) else None
        if 기록 is None or 기록.get("kind") != "주제":
            return _답(404, {"error": "없는 결과입니다"})
        결과 = 기록.get("result") or {}
        카드 = 결과.get("카드") or {}
        if (_멈춤판정(store.요약(기록), 지금)["state"] != "됨" or not 결과.get("bundle")
                or not (카드.get("오류") or 카드.get("빠진장"))):
            return _답(409, {"error": "카드를 못 만들었거나 빠진 장이 있는 판만 카드를 다시 구울 수 있어요"})
        if (기록.get("카드다시") or 0) >= 카드다시상한:
            return _답(409, {"error": f"카드 다시 굽기는 한 판에 {카드다시상한}번까지예요"})
        w = 지갑()
        if w["deepseek"]["멈춤"]:
            return _답(503, {"error": "딥시크 잔액이 얼마 안 남아 카드를 다시 굽지 못해요 — AI 소식은 그대로 돼요", "wallet": w})
        # 대본부터 새로 — 같은 대본이면 같은 그림 지시가 같은 까닭(안전 거절 등)으로 또 막힌다
        기록["재료"].pop("카드", None)
        기록["재료"].pop("딥시크", None)
        결과.pop("카드", None)
        기록.update(state="만드는 중", 단계="카드대본", step="시작 기다리는 중", pct=50, error=None,
                  카드다시=(기록.get("카드다시") or 0) + 1, 다시시작=store.지금시각())  # 화면이 판 처음이 아니라 여기서부터 센다
        창고.쓰기(기록)
        다음부르기(job, "카드대본")
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
    if "_repair" in event:  # 수리공 — 판과 따로 돈다(계획 4 C-3)
        return repair.수리(event["_repair"], 수리손만들기(context))
    try:
        return 처리(event, _창고(), _다음부르기)
    except Exception as e:
        # **반드시 남긴다** — 스킬 dify-workflow 철칙 ①: 주소 · 예외 · 몸통 · traceback.
        # 몸통은 칸 이름과 길이만 — 사용자가 친 말·지우기 표가 서버 기록에 남았다(작은 것 5)
        원몸통 = event.get("body") or ""
        try:
            몸 = json.loads(원몸통) if 원몸통 else {}
            몸꼴 = (", ".join(f"{k} {len(v)}자" if isinstance(v, str) else f"{k} {len(v)}개" if isinstance(v, (list, dict))
                             else f"{k} {type(v).__name__}" for k, v in 몸.items()) or "빈 칸"
                   if isinstance(몸, dict) else f"JSON {type(몸).__name__}")
        except ValueError:
            몸꼴 = "JSON 아님"
        http = (event.get("requestContext") or {}).get("http") or {}
        print(runs._가리기(f"!! 500 {http.get('method')} {event.get('rawPath')}\n"
                          f"   {type(e).__name__}: {e}\n"
                          f"   몸통 {len(원몸통)}자 · 칸: {몸꼴}\n"
                          f"{traceback.format_exc()}"))
        return _답(500, {"error": runs._가리기(f"{type(e).__name__}: {e}")})
