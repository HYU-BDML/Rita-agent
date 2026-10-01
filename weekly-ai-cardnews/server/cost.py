# -*- coding: utf-8 -*-
"""한 판에 쓴 돈 — 딥시크와 OpenAI 그림만. Apify 는 뺀다(2026-10-01 사용자 «apify 비용 빼고»).

단가는 가격 페이지에서 직접 읽었다(2026-09-30). 바뀌면 여기만 고친다.
- 딥시크 deepseek-v4-pro https://api-docs.deepseek.com/quick_start/pricing — 100만 토큰당,
  바쁜 시간(월~금 UTC 01~04시·06~10시)은 한가한 시간의 두 배. 중국 공휴일은 한가인데 여기선 안 센다
  (그날은 조금 비싸게 적힌다).
- GPT 이미지 2.5 https://developers.openai.com/api/docs/pricing — 글 입력 $5 · 그림 입력 $8 · 출력 $30.
- 딥시크 deepseek-flash 같은 페이지 — 캐시 $0.003 · 입력 $0.15 · 출력 $0.6 (2026-09-30 확인).
- Apify 는 주제 판만 — 부를 때 장부의 건당 값 × 청구 건수로 짐작해 «아피파이기록» 에 적는다(주간 판은 옛 서버가 긁어 기록이 없다).
"""
from datetime import datetime

딥시크_한가 = {  # 달러 / 100만 토큰, 한가한 시간
    "deepseek-v4-pro": {"캐시": 0.022, "입력": 0.66, "출력": 1.98},
    "deepseek-flash": {"캐시": 0.003, "입력": 0.15, "출력": 0.6},
}
기본모델 = "deepseek-v4-pro"  # 모델이 안 적힌 옛 줄(주간 판)
그림단가 = {"입력글": 5.0, "입력그림": 8.0, "출력": 30.0}


def _바쁜가(시각: str) -> bool:
    t = datetime.strptime(시각, "%Y-%m-%dT%H:%M:%SZ")
    return t.weekday() < 5 and (1 <= t.hour < 4 or 6 <= t.hour < 10)


def 딥시크값(x: dict) -> float:
    단가 = 딥시크_한가.get(x.get("모델") or 기본모델, 딥시크_한가[기본모델])
    캐시 = x.get("캐시토큰") or 0
    배 = 2 if _바쁜가(x["시각"]) else 1
    return 배 * ((x["입력토큰"] - 캐시) * 단가["입력"] + 캐시 * 단가["캐시"] + x["출력토큰"] * 단가["출력"]) / 1e6


def 그림값(u: dict) -> float:
    return (u.get("입력글토큰", 0) * 그림단가["입력글"] + u.get("입력그림토큰", 0) * 그림단가["입력그림"]
            + u.get("출력토큰", 0) * 그림단가["출력"]) / 1e6


def 합계(재료: dict) -> dict:
    딥 = sum(딥시크값(x) for x in 재료.get("딥시크기록") or [])
    그림들 = 재료.get("그림기록") or []
    그 = sum(그림값(u) for u in 그림들 if not u.get("모름"))
    아 = sum(x.get("돈") or 0 for x in 재료.get("아피파이기록") or [])
    return {"딥시크": round(딥, 4), "그림": round(그, 4), "그림장수": len(그림들), "아피파이": round(아, 4),
            "합계": round(딥 + 그 + 아, 4), "표지값모름": any(u.get("모름") for u in 그림들)}


def 걸음별(재료: dict) -> list[dict]:
    """주제 판 걸음마다 쓴 돈. 걸음 번호는 지휘자가 걸음을 시작할 때 매기고(conductor), 그 걸음 동안 쓴
    딥시크(지휘·판정관)·Apify·도구 기록 줄에 붙는다. 번호 없는 줄(검증·정리)은 맨 뒤 한 줄."""
    줄들: dict = {}

    def 칸(번):
        return 줄들.setdefault(번, {"걸음": 번, "단계": "" if 번 is not None else "검증·정리", "생각토큰": 0,
                                  "도구": [], "딥시크": 0.0, "아피파이": 0.0})

    for x in 재료.get("딥시크기록") or []:
        c = 칸(x.get("걸음"))
        c["딥시크"] += 딥시크값(x)
        if x.get("열쇠") == "지휘":
            c["생각토큰"] += x.get("생각토큰") or 0
            c["단계"] = c["단계"] or x.get("단계") or ""
    for x in 재료.get("아피파이기록") or []:
        칸(x.get("걸음"))["아피파이"] += x.get("돈") or 0
    for x in 재료.get("호출기록") or []:
        칸(x.get("걸음"))["도구"].append(x["도구"])
    차례 = sorted(n for n in 줄들 if n is not None) + ([None] if None in 줄들 else [])
    return [{**줄들[n], "딥시크": round(줄들[n]["딥시크"], 4), "아피파이": round(줄들[n]["아피파이"], 4),
             "합계": round(줄들[n]["딥시크"] + 줄들[n]["아피파이"], 4)} for n in 차례]
