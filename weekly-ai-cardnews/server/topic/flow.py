# -*- coding: utf-8 -*-
"""주제 판 달리기 — 모으기 → 검증 → 정리(설계 1장 흐름 4~6), 그리고 주제 다듬기 대화 한 턴.

판 기록은 주간 판과 같은 곳(`weekly/jobs/{job}.json`)에 `kind: "주제"` 로 쓴다. 단계 시작·끝·실패·이어 달리기는
주간 판 달리기(runs.py)의 도우미를 그대로 쓴다. 걸음마다 기록을 다시 써서 화면이 작업판 요약·판단 줄·남은 예산을 본다.
관문이 돌려보내면 «모으기» 로 되돌아간다 — 최대 3번, 같은 것을 두 번 내거나 강제로 낸 것이면 바로 마지막 검사."""
import hashlib
import json
import re
import time
import traceback
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Callable

import cost
import runs as 주간
import store
from topic import board, budget, conductor, evidence, gate, instructions, judge, order, tools, trace

단계순서 = ["모으기", "검증", "정리"]
최대되돌림 = 3
미디어최대바이트 = 80_000_000
다듬기한도 = 8000
다듬기최대 = 16000  # 넘치면 한 번 이 한도로 다시 (같은 한도로 다시 하면 또 넘친다)
_확장자 = {"video/mp4": "mp4", "video/quicktime": "mov", "image/jpeg": "jpg", "image/png": "png",
         "image/webp": "webp", "image/gif": "gif"}


@dataclass
class 손:
    창고: object
    대화: Callable
    실행: Callable
    읽기: Callable
    받기: Callable
    다음부르기: Callable
    남은초: Callable[[], float]
    벽시계: Callable[[], datetime]
    지금: Callable[[], float] = time.monotonic


def 새기록(job: str, 주문서: dict, 대화번호: str | None = None) -> dict:
    return {"job": job, "kind": "주제", "order": 주문서, "chat": 대화번호, "state": "만드는 중", "pct": 0,
            "step": "시작 기다리는 중", "단계": "모으기", "steps": [], "result": None, "error": None,
            "started": store.지금시각(), "updated": store.지금시각(), "cost": None, "board": None, "lines": [], "spend": [],
            "재료": {"작업판": board.새판(), "되돌림": 0}}


def _시각글(손) -> str:
    return 손.벽시계().astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _현장(기록, 손) -> tools.현장:
    재료 = 기록["재료"]
    시작 = datetime.strptime(기록["started"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    흔적 = trace.흔적(손.창고.s3, 손.창고.통, 손.창고.앞, 기록["job"])
    판정관 = judge.판정관(trace.감싼대화(손.대화, 흔적, "판정관", lambda: 재료.get("지금걸음")),
                        lambda 답, 열쇠: conductor.딥시크적기(재료, 답, 열쇠, _시각글(손)), 손.받기)
    return tools.현장(job=기록["job"], 주문서=기록["order"], 재료=재료, 흔적=흔적,
                    창고=evidence.증거창고(손.창고.s3, 손.창고.통, 기록["job"], 손.창고.앞),
                    예산=budget.예산(기록["order"]["예산"], 재료, 시작, 손.벽시계), 판정관=판정관,
                    실행=손.실행, 읽기=손.읽기, 지금글=lambda: _시각글(손))


def _저장(기록, 현, 손) -> None:
    판 = 현.판
    기록["board"] = board.화면요약(판, 현.주문서, 현.창고, 현.예산)
    기록["lines"] = board.판단줄(판)
    기록["cost"] = cost.합계(기록["재료"])
    기록["spend"] = cost.걸음별(기록["재료"])
    if 기록["단계"] == "모으기":
        채움 = sum(1 for x in 기록["board"]["칸"] if x["상태"] == "채움")
        기록["pct"] = max(기록.get("pct") or 0, min(55, 5 + round(50 * 채움 / 현.주문서["목표건수"])))
        for 단계 in 기록["steps"][-1:]:
            if 단계["state"] == "하는 중" and 단계["name"] == "모으기":
                단계["note"] = (f"{판['단계']} {board.단계이름[판['단계']]} · 도구 {현.예산.호출수()}번"
                              f" · 증거 {len(현.창고.것들)}건")
    현.창고.쓰기()
    손.창고.쓰기(기록)


def 모으기(기록, 손) -> str | None:
    단계, 시작 = 주간._시작(기록, "모으기", 손)
    현 = _현장(기록, 손)
    while True:
        끝 = conductor.구간(현, 손.대화, 손.남은초, lambda: _저장(기록, 현, 손))
        if 끝 == "냄":
            break
        if 끝 == "시간":
            _저장(기록, 현, 손)
            raise 주간.이어달리기()
    _저장(기록, 현, 손)
    주간._끝(기록, 단계, 시작, 손, f"도구 {현.예산.호출수()}번 · 증거 {len(현.창고.것들)}건"
                                 f" · 낸 소식 {len(기록['재료']['제출']['items'])}건", 60)
    return "검증"


def 검증(기록, 손) -> str | None:
    단계, 시작 = 주간._시작(기록, "검증", 손)
    현 = _현장(기록, 손)
    재 = 기록["재료"]
    제출 = 재.get("제출") or {"items": [], "unfilled": []}
    지문 = hashlib.sha1(json.dumps([제출.get("items"), 제출.get("unfilled")], sort_keys=True,
                                  ensure_ascii=False).encode("utf-8")).hexdigest()[:16]
    마지막 = 재["되돌림"] >= 최대되돌림 or 지문 == 재.get("지난제출") or bool(제출.get("강제"))
    결과 = gate.검사(현, 제출, 마지막)
    현.흔적.쓰기("관문", {"되돌림": 재["되돌림"], "마지막": 마지막, "제출": 제출, "결과": 결과})
    if 결과["돌려보낼말"]:
        재["되돌림"] += 1
        재["지난제출"] = 지문
        현.판["관문"] = 결과["돌려보낼말"]
        현.판["판단줄"].append({"시각": _시각글(손), "단계": "⑦",
                             "말": f"관문이 {len(결과['돌려보낼말'])}가지를 돌려보냄 ({재['되돌림']}번째)"})
        재.pop("제출", None)
        _저장(기록, 현, 손)
        주간._끝(기록, 단계, 시작, 손, f"돌려보냄 {재['되돌림']}번째 — {결과['돌려보낼말'][0][:80]}", 60)
        return "모으기"
    재["통과"], 재["뺀것"] = 결과["통과"], 결과["뺀것"]
    현.판["관문"] = []
    _저장(기록, 현, 손)
    주간._끝(기록, 단계, 시작, 손, f"통과 {len(결과['통과'])}건" + (f" · 뺀 소식 {len(결과['뺀것'])}건" if 결과["뺀것"] else ""),
            80)
    return "정리"


def _미디어고르기(s: dict, x: dict) -> dict | None:
    mm = re.fullmatch(r"(E\d+)(?:#(\d+))?", str(s.get("media") or "").strip())
    if not mm:
        return None
    if mm.group(2) is None:
        미 = x.get("미디어") or []
        y = next((y for y in 미 if y["갈래"] == "영상"), 미[0] if 미 else None)
        return {"갈래": y["갈래"], "주소": y["주소"], "대표화면": y.get("대표화면") or ""} if y else None
    i = int(mm.group(2)) - 1
    if x.get("사진후보"):
        return {"갈래": "사진", "주소": x["사진후보"][i]["주소"], "대표화면": ""}
    y = (x.get("미디어") or [])[i]
    return {"갈래": y["갈래"], "주소": y["주소"], "대표화면": y.get("대표화면") or ""}


def _옮기기(job: str, 순서: int, 미디어: dict, 손) -> dict:
    난것 = {"갈래": 미디어["갈래"], "원주소": 미디어["주소"]}
    try:
        몸, 꼴, _ = 손.받기(미디어["주소"], 미디어최대바이트)
        꼴 = (꼴 or "").split(";")[0].strip().lower()
        if len(몸) >= 미디어최대바이트:
            raise ValueError("80MB 넘음")
        if 꼴 not in _확장자:
            raise ValueError(f"미디어가 아님({꼴 or '꼴 모름'})")
        난것["키"] = 손.창고.미디어올리기(job, f"{순서:02d}.{_확장자[꼴]}", 몸, 꼴)
    except Exception as e:
        난것["못옮김"] = f"{type(e).__name__}: {e}"[:150]
    if 미디어.get("대표화면") and 미디어["대표화면"] != 미디어["주소"]:
        try:
            몸, 꼴, _ = 손.받기(미디어["대표화면"], 5_000_000)
            꼴 = (꼴 or "").split(";")[0].strip().lower()
            if 꼴.startswith("image/") and 꼴 in _확장자:
                난것["대표키"] = 손.창고.미디어올리기(job, f"{순서:02d}_t.{_확장자[꼴]}", 몸, 꼴)
        except Exception:
            pass
    return 난것


def 정리(기록, 손) -> str | None:
    단계, 시작 = 주간._시작(기록, "정리", 손)
    현 = _현장(기록, 손)
    재 = 기록["재료"]
    소식들 = []
    for s in 재.get("통과") or []:
        x = 현.창고.꺼내기(s["source"])
        소식들.append({"주인공": s["hero"], "사건": s["event"], "요약": s["summary"], "날짜": x["날짜"],
                     "출처": {"주소": x["주소"], "계정": x["계정"], "플랫폼": x["플랫폼"], "증거": x["번호"]},
                     "발췌": s["quote"], "미디어": _미디어고르기(s, x), "반응": x.get("반응") or {},
                     "배수": 현.창고.배수(x["번호"]), "딱지": s.get("tags") or []})
    소식들.sort(key=lambda d: -d["배수"])  # 평소 대비 인기 순(설계 2장 «순서»)
    for i, d in enumerate(소식들, 1):
        d["순서"] = i
        if d["미디어"]:
            d["미디어"] = _옮기기(기록["job"], i, d["미디어"], 손)
    기록["result"] = {"bundle": 소식들, "unfilled": (재.get("제출") or {}).get("unfilled") or [],
                     "dropped": 재.get("뺀것") or [],
                     # 도중에 끈 도구와 까닭 — 못 본 곳을 «소식이 적었다» 로 읽지 않게(최종 검토)
                     "blocked": [{"도구": 도구, "까닭": 까닭} for 도구, 까닭 in 현.판["꺼진도구"].items()]}
    _저장(기록, 현, 손)
    못옮김 = sum(1 for d in 소식들 if d["미디어"] and d["미디어"].get("못옮김"))
    주간._끝(기록, 단계, 시작, 손, f"소식 {len(소식들)}건" + (f" · 미디어 못 옮김 {못옮김}" if 못옮김 else ""), 99)
    return None


def 달리기(job: str, 단계: str, 손) -> dict:
    기록 = 손.창고.읽기(job)
    if 기록 is None or 기록.get("kind") != "주제":
        print(f"!! {job} 주제 판 기록이 없다 — [{단계}] 안 한다")
        return {"ok": False}
    try:
        다음 = {"모으기": 모으기, "검증": 검증, "정리": 정리}[단계](기록, 손)
        기록["cost"] = cost.합계(기록["재료"])
        기록["spend"] = cost.걸음별(기록["재료"])
        if 다음:
            기록["단계"] = 다음
            손.창고.쓰기(기록)
            손.다음부르기(job, 다음)
        else:
            기록.update(state="됨", pct=100, step="끝")
            손.창고.쓰기(기록)
    except 주간.이어달리기:
        주간._시간적기(기록, 손)
        기록["cost"] = cost.합계(기록["재료"])
        기록["spend"] = cost.걸음별(기록["재료"])
        손.창고.쓰기(기록)
        손.다음부르기(job, 단계)
    except 주간.멈춤 as e:
        주간._실패(기록, str(e), 손)
    except Exception as e:
        print(주간._가리기(f"!! {job} [{단계}] {type(e).__name__}: {e}\n{traceback.format_exc()}"))
        주간._실패(기록, f"{단계} 단계에서 오류 — {type(e).__name__}: {e}", 손)
    return {"ok": True}


def 대화한턴(번호: str, 손, 오늘: date) -> dict:
    """주제 다듬기 한 번. 주문서가 틀리면 한 번은 «고쳐 달라» 고 되묻고, 두 번째도 틀리면 말만 보이고 주문서는 안 만든다."""
    d = 손.창고.대화읽기(번호)
    if d is None:
        print(f"!! 대화 {번호} 기록이 없다")
        return {"ok": False}
    재 = d.setdefault("재료", {})
    흔적 = trace.흔적(손.창고.s3, 손.창고.통, 손.창고.앞, 번호)
    대화 = trace.감싼대화(손.대화, 흔적, "다듬기")
    메시지들 = [{"role": "system", "content": instructions.다듬기(오늘)}] + [
        {"role": "user" if m["who"] == "사람" else "assistant", "content": m["text"]} for m in d["messages"]]
    try:
        한도 = 다듬기한도
        for 번 in range(2):
            답 = 대화(메시지들, 한도, 읽기=conductor.읽기초(한도))
            conductor.딥시크적기(재, 답, "다듬기", _시각글(손))
            if 답["넘침"]:
                한도 = 다듬기최대
                continue
            j = judge._제이슨(답["글"])
            말, 주문, 주문서, 탈 = str(j.get("말") or "").strip(), j.get("주문서"), None, ""
            if not 말:
                탈 = 'JSON 한 줄로만 답하라 — {"말": "...", "주문서": null 또는 {...}}'
            elif 주문:
                try:
                    주문서 = order.다듬기(주문, 오늘)
                except order.주문서탈 as e:
                    탈 = f"주문서에 문제가 있다: {e}. 사용자에게 다시 묻거나, 고친 주문서를 같은 JSON 으로 내라."
            if 말 and (not 탈 or 번 == 1):
                d["messages"].append({"who": "지휘자", "text": 말})
                d.update(state="답함", order=주문서, error=None, job=None)  # 새 답이면 새 주문서 — 다시 모을 수 있다
                break
            메시지들 += [{"role": "assistant", "content": 답["글"] or "(빈 답)"}, {"role": "user", "content": 탈}]
        else:
            d.update(state="실패", error="주제 다듬기가 답을 못 냈어요 — 다시 보내 주세요")
    except Exception as e:
        print(주간._가리기(f"!! 대화 {번호} {type(e).__name__}: {e}"))
        d.update(state="실패", error=주간._가리기(f"{type(e).__name__}: {e}")[:200])
    흔적.쓰기("다듬기끝", {"상태": d["state"], "말": d["messages"][-1]["text"] if d["state"] == "답함" else "",
                       "주문서": d.get("order"), "오류": d.get("error")})
    d["cost"] = cost.합계(재)
    손.창고.대화쓰기(d)
    return {"ok": True}
