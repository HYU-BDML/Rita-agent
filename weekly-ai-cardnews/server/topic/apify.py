# -*- coding: utf-8 -*-
"""Apify 부르기 — 열쇠 고르기·지갑·실행·기다리기·받기, 실패를 종류로 나누기(설계 4장 표).

열쇠는 환경변수 `APIFY_TOKENS`(여럿, 줄바꿈·쉼표로 이음)에서 읽어 **머리글로만** 보낸다. `APIFY_SHARED` 는
옛 서버(AI 소식)와 같이 쓰는 열쇠의 순번(0부터) — 그 열쇠는 $1 를 남긴다(설계 7장 «AI 소식은 계속»).
한 번 부를 때 `maxTotalChargeUsd` 로 돈 상한을 건다 — 사건당 요금 도구는 그 넘게 청구하지 않는다.
**실패 한두 번으로 도구를 버리지 않는다** — 종류만 나눠 돌려주고, 끌지 말지는 부르는 쪽(도구 상자)이 정한다."""
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request

API = "https://api.apify.com/v2"
남길돈 = 1.0              # 같이 쓰는 열쇠에 남길 몫
띠기준, 멈춤기준 = 2.0, 1.0  # 쓸 수 있는 합이 이 아래면 화면 띠 / 새 분야 판 멈춤
지갑캐시초 = 300
실행초 = 150              # 액터 timeout — 도구 한 번이 이보다 오래 돌지 않는다
기다림초 = 200
_지갑 = {"때": 0.0, "값": None}


class 도구탈(Exception):
    """종류: 입력(형식이 바뀜) · 고장(실행 실패·없는 도구·너무 오래) · 막힘(너무 자주·끊김) · 돈(잔액·월 한도·열쇠)."""

    def __init__(self, 종류: str, 말: str):
        super().__init__(f"{종류}: {말}")
        self.종류, self.말 = 종류, 말
        self.실행 = None  # (열쇠 순번, 실행 번호) — 실패한 실행이 있으면 수리공이 그 기록을 읽는다(계획 4 C-3)


def 열쇠들() -> list[str]:
    return re.findall(r"apify_api_[A-Za-z0-9]+", os.environ.get("APIFY_TOKENS") or "")


def _보내기(방법: str, 길: str, 열쇠: str, 몸=None, 시간: int = 90):
    """한 번 보내고 (상태, 몸). 끊기면 (0, 오류). **시험이 여기를 갈아 끼운다.**"""
    머리 = {"Content-Type": "application/json"}
    if 열쇠:  # 공개 정보(가게·액터)는 열쇠 없이도 묻는다 — 빈 «Bearer » 를 보내지 않게
        머리["Authorization"] = "Bearer " + 열쇠
    요청 = urllib.request.Request(API + 길, method=방법, headers=머리,
                                data=None if 몸 is None else json.dumps(몸, ensure_ascii=False).encode("utf-8"))
    try:
        with urllib.request.urlopen(요청, timeout=시간) as r:
            글 = r.read().decode("utf-8", "replace")
            return r.status, (json.loads(글) if 글.strip() else {})
    except urllib.error.HTTPError as e:
        글 = e.read().decode("utf-8", "replace")[:2000]
        try:
            return e.code, json.loads(글)
        except ValueError:
            return e.code, {"error": {"message": 글[:200]}}
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        return 0, {"error": {"message": str(getattr(e, "reason", e))[:200]}}


def 지갑(새로: bool = False, 지금=time.time) -> dict:
    """열쇠마다 이번 달 남은 돈. 5분 동안은 다시 안 묻는다. 하나도 못 읽으면 «모름» — 막지 않는다."""
    if not 새로 and _지갑["값"] and 지금() - _지갑["때"] < 지갑캐시초:
        return _지갑["값"]
    같이 = int(os.environ.get("APIFY_SHARED") or -1)
    줄 = []
    for i, k in enumerate(열쇠들()):
        상태, d = _보내기("GET", "/users/me/limits", k, 시간=20)
        if 상태 != 200 or not isinstance(d, dict):
            줄.append({"순번": i, "남은": None, "쓸수있는": 0.0})
            continue
        d = d.get("data") or {}
        남은 = float((d.get("limits") or {}).get("maxMonthlyUsageUsd") or 0) - float(
            (d.get("current") or {}).get("monthlyUsageUsd") or 0)
        줄.append({"순번": i, "남은": round(남은, 4),
                  "쓸수있는": round(max(0.0, 남은 - (남길돈 if i == 같이 else 0.0)), 4)})
    모름 = not 줄 or all(x["남은"] is None for x in 줄)
    합 = round(sum(x["쓸수있는"] for x in 줄), 4)
    값 = {"열쇠": 줄, "쓸수있는합": 합, "모름": 모름,
          "낮음": (not 모름) and 합 < 띠기준, "멈춤": (not 모름) and 합 < 멈춤기준}
    _지갑.update(때=지금(), 값=값)
    return 값


# 계정마다 «동시 실행 5개»·메모리 한도 — 402 로 오지만 돈이 아니라 잠깐 막힘이다. «돈» 으로 읽어 그 판의 Apify 도구
# 여섯을 다 껐다(계획 3 평가 4판 — 두 판이 동시에 돌며 한 열쇠로 5개를 넘김)
_잠깐한도 = re.compile(r"concurrent-runs-limit-exceeded|memory-limit-exceeded", re.I)
동시재시도 = 4
동시쉼초 = 15


def _탈나누기(상태: int, d) -> 도구탈:
    오류 = (d.get("error") if isinstance(d, dict) else None) or {}
    말 = f"{오류.get('type', '')} {오류.get('message', '')}".strip() or str(d)[:150]
    if 상태 == 0 or 상태 == 429 or 상태 >= 500 or _잠깐한도.search(말):
        return 도구탈("막힘", f"HTTP {상태} — {말}"[:200])
    if 상태 in (401, 402, 403) or re.search(r"usage|credit|limit-exceeded|not-enough", 말, re.I):
        return 도구탈("돈", f"HTTP {상태} — {말}"[:200])
    if 상태 == 404:
        return 도구탈("고장", f"없는 도구 — {말}"[:200])
    if 상태 == 400:
        return 도구탈("입력", 말[:200])
    return 도구탈("고장", f"HTTP {상태} — {말}"[:200])


def _열쇠고르기(돈상한: float, 뺄: set = frozenset()) -> int:
    d = 지갑()
    줄 = [x for x in d["열쇠"] if d["모름"] or x["쓸수있는"] >= 돈상한]
    if not 줄:
        raise 도구탈("돈", f"Apify 이번 달 분량이 모자라요(쓸 수 있는 합 ${d['쓸수있는합']:.2f}) — 열쇠를 더 넣어야 해요")
    줄 = [x for x in 줄 if x["순번"] not in 뺄] or 줄  # 동시 한도에 걸린 열쇠는 뒤로
    return max(줄, key=lambda x: x["쓸수있는"])["순번"]


def 실행(도구: str, 입력: dict, 돈상한: float, 잠자기=time.sleep, 지금=time.monotonic,
         시간: int = 실행초, 기다림: int = 기다림초) -> dict:
    걸린 = set()
    for 번 in range(동시재시도):
        순번 = _열쇠고르기(돈상한, 걸린)
        k = 열쇠들()[순번]
        상태, d = _보내기("POST", f"/acts/{도구}/runs?timeout={시간}&maxTotalChargeUsd={돈상한:.4f}&waitForFinish=60", k,
                       입력)
        if 상태 in (200, 201):
            break
        탈 = _탈나누기(상태, d)
        if not _잠깐한도.search(탈.말) or 번 == 동시재시도 - 1:
            raise 탈
        걸린.add(순번)  # 다른 열쇠로 — 열쇠마다 다 걸렸으면 잠깐 쉬고 처음부터
        if len(걸린) >= len(열쇠들()):
            걸린.clear()
            잠자기(동시쉼초)
    try:
        return _끝까지(도구, k, d, 순번, 잠자기, 지금, 기다림)
    except 도구탈:
        raise
    except Exception as e:  # 돈은 이미 나갔다 — «인자가 틀림» 이 아니라 «고장» 으로 알리고 기록에 남긴다(최종 검토)
        raise 도구탈("고장", f"실행은 시작됐는데 결과를 못 받음 — {type(e).__name__}: {str(e)[:100]}") from None


def _실행달기(탈: 도구탈, 순번: int, run: dict) -> 도구탈:
    탈.실행 = (순번, str(run.get("id") or ""))
    return 탈


def _끝까지(도구: str, k: str, d: dict, 순번: int, 잠자기, 지금, 기다림: int = 기다림초) -> dict:
    run = d["data"]
    시작 = 지금()
    while run.get("status") in ("READY", "RUNNING"):
        if 지금() - 시작 > 기다림:
            _보내기("POST", f"/actor-runs/{run['id']}/abort", k)
            raise _실행달기(도구탈("고장", f"{기다림}초 안에 안 끝나서 멈춤"), 순번, run)
        상태, d = _보내기("GET", f"/actor-runs/{run['id']}?waitForFinish=60", k)
        if 상태 == 200:
            run = d["data"]
        else:
            잠자기(5)
    상태, 것들 = _보내기("GET", f"/datasets/{run['defaultDatasetId']}/items?clean=true&format=json", k)
    것들 = 것들 if 상태 == 200 and isinstance(것들, list) else []
    _지갑["때"] = 0.0  # 돈을 썼으니 다음엔 새로 묻는다
    if run.get("status") in ("FAILED", "ABORTED") and not 것들:
        raise _실행달기(도구탈("고장", f"실행 {run['status']} — {(run.get('statusMessage') or '')[:150]}"), 순번, run)
    return {"것들": 것들, "청구": run.get("chargedEventCounts") or {}, "상태": run.get("status"), "열쇠순번": 순번}


# ── 수리공 조사(계획 4 설계 C-3) — 모두 돈 0. 열쇠는 머리글로만 ────────────────────

def _물어보기(길: str, 시간: int = 30):
    ks = 열쇠들()
    return _보내기("GET", 길, ks[0] if ks else "", 시간=시간)


def 값매김(정보: dict | None) -> dict:
    """가격 한 덩어리 → {모델, 사건: {이름: 달러}, 주사건, 최소상한}. 단계별 값이면 FREE 칸(가장 비싼 값)."""
    정보 = 정보 or {}
    사건, 주 = {}, None
    for 이름, e in ((정보.get("pricingPerEvent") or {}).get("actorChargeEvents") or {}).items():
        값 = e.get("eventPriceUsd")
        if 값 is None:
            값 = ((e.get("eventTieredPricingUsd") or {}).get("FREE") or {}).get("tieredEventPriceUsd")
        if 값 is None:
            continue
        사건[이름] = float(값)
        if e.get("isPrimaryEvent") or 이름 == "apify-default-dataset-item":
            주 = 주 or 이름
    return {"모델": 정보.get("pricingModel") or "", "사건": 사건, "주사건": 주,
            "최소상한": 정보.get("minimalMaxTotalChargeUsd")}


def 실제값(값: dict, 청구: dict) -> float:
    return round(sum(값["사건"].get(이름, 0.0) * n for 이름, n in (청구 or {}).items()), 5)


def _성적(stats: dict | None) -> tuple[float, int]:
    r = (stats or {}).get("publicActorRunStats30Days") or {}
    return (round((r.get("SUCCEEDED") or 0) / max(1, r.get("TOTAL") or 0), 4),
            int((stats or {}).get("totalUsers30Days") or 0))


def 액터정보(액터: str) -> dict | None:
    상태, d = _물어보기(f"/acts/{액터}")
    a = (d.get("data") if isinstance(d, dict) else None) or {}
    if 상태 != 200 or not a:
        return None
    성공, 사용자 = _성적(a.get("stats"))
    return {"액터": 액터, "성공률": 성공, "사용자30": 사용자, "중단": bool(a.get("isDeprecated")),
            "값매김": 값매김((a.get("pricingInfos") or [{}])[-1])}


def 입력형식(액터: str) -> dict | None:
    상태, d = _물어보기(f"/acts/{액터}/builds/default")
    b = (d.get("data") if isinstance(d, dict) else None) or {}
    if 상태 != 200 or not b:
        return None
    s = b.get("inputSchema")
    if isinstance(s, str):
        try:
            s = json.loads(s)
        except ValueError:
            s = None
    s = s or (b.get("actorDefinition") or {}).get("input")
    return s if isinstance(s, dict) and s.get("properties") else None


def 가게찾기(검색어: str, 개수: int = 20) -> list[dict]:
    상태, d = _물어보기(f"/store?search={urllib.parse.quote(검색어)}&limit={int(개수)}")
    if 상태 != 200 or not isinstance(d, dict):
        return []
    난것 = []
    for it in (d.get("data") or {}).get("items") or []:
        if not it.get("username") or not it.get("name"):
            continue
        성공, 사용자 = _성적(it.get("stats"))
        난것.append({"액터": f"{it['username']}~{it['name']}", "성공률": 성공, "사용자30": 사용자,
                    "값매김": 값매김(it.get("currentPricingInfo"))})
    return 난것


def 실행기록(순번: int, 실행번호: str) -> str:
    """실패한 실행의 기록 끝 2,000자 — 글(text)로 와서 따로 받는다. 못 받으면 빈 글."""
    ks = 열쇠들()
    if not ks or not re.fullmatch(r"[A-Za-z0-9]+", str(실행번호 or "")):
        return ""
    요청 = urllib.request.Request(f"{API}/actor-runs/{실행번호}/log",
                                 headers={"Authorization": "Bearer " + ks[min(max(0, int(순번)), len(ks) - 1)]})
    try:
        with urllib.request.urlopen(요청, timeout=20) as r:
            return r.read().decode("utf-8", "replace")[-2000:]
    except Exception:
        return ""
