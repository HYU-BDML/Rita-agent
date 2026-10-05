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


카드열쇠 = ("본문대본", "본문다시쓰기", "본문다시쓰기2", "표지훅", "훅다시쓰기", "훅다시쓰기2")  # runs 의 대본 — 새 분야 판에선 카드 단계


def _카드줄인가(x: dict) -> bool:
    """카드 단계의 딥시크 — runs 대본 열쇠, 또는 카드 단계 판정관(«카드판정», cards._카드적기)."""
    return x.get("걸음") is None and (x.get("열쇠") in 카드열쇠 or str(x.get("열쇠") or "").startswith("카드"))


def 합계(재료: dict) -> dict:
    딥 = sum(딥시크값(x) for x in 재료.get("딥시크기록") or [])
    그림들 = 재료.get("그림기록") or []
    그 = sum(그림값(u) for u in 그림들 if not u.get("모름"))
    아 = sum(x.get("돈") or 0 for x in 재료.get("아피파이기록") or [])
    수 = sum(x.get("돈") or 0 for x in 재료.get("수리기록") or [])  # 수리공(계획 4) — 이 판이 부른 수리 몫
    합 = {"딥시크": round(딥, 4), "그림": round(그, 4), "그림장수": len(그림들), "아피파이": round(아, 4),
          "합계": round(딥 + 그 + 아 + 수, 4), "표지값모름": any(u.get("모름") for u in 그림들)}
    if 수:
        합["수리"] = round(수, 4)
    return 합


def 걸음별(재료: dict) -> list[dict]:
    """주제 판 걸음마다 쓴 돈. 걸음 번호는 지휘자가 걸음을 시작할 때 매기고(conductor), 그 걸음 동안 쓴
    딥시크(지휘·판정관)·Apify·도구 기록 줄에 붙는다. 번호 없는 줄은 맨 뒤에 «검증·정리» · «카드»(카드 대본 딥시크 +
    그림) 차례로 — 다 더하면 판 합계(합계)와 같다(계획 4 D-7)."""
    줄들: dict = {}

    def 칸(열쇠):
        return 줄들.setdefault(열쇠, {"걸음": 열쇠 if isinstance(열쇠, int) else None,
                                    "단계": "" if isinstance(열쇠, int) else 열쇠, "생각토큰": 0, "도구": [],
                                    "딥시크": 0.0, "아피파이": 0.0, "그림": 0.0})

    def 걸음(x):
        return x.get("걸음") if x.get("걸음") is not None else "검증·정리"

    for x in 재료.get("딥시크기록") or []:
        c = 칸("카드" if _카드줄인가(x) else 걸음(x))
        c["딥시크"] += 딥시크값(x)
        if x.get("열쇠") == "지휘":
            c["생각토큰"] += x.get("생각토큰") or 0
            c["단계"] = c["단계"] or x.get("단계") or ""
    for x in 재료.get("아피파이기록") or []:
        칸(걸음(x))["아피파이"] += x.get("돈") or 0
    for x in 재료.get("호출기록") or []:
        칸(걸음(x))["도구"].append(x["도구"])
    for u in 재료.get("그림기록") or []:
        if not u.get("모름"):
            칸("카드")["그림"] += 그림값(u)
    돈칸 = ("딥시크", "아피파이", "그림")
    차례 = sorted(n for n in 줄들 if isinstance(n, int)) + [n for n in ("검증·정리", "카드") if n in 줄들]
    난것 = [{**줄들[n], **{k: round(줄들[n][k], 4) for k in 돈칸}, "합계": round(sum(줄들[n][k] for k in 돈칸), 4)}
            for n in 차례]
    수리 = 재료.get("수리기록") or []
    if any(x.get("돈") for x in 수리):  # 수리공 몫은 따로 한 줄(계획 4 C) — 표 합계 = 판 합계
        난것.append({"걸음": None, "단계": "도구 고치기", "생각토큰": 0, "도구": [],
                    "딥시크": round(sum(x.get("딥시크") or 0 for x in 수리), 4),
                    "아피파이": round(sum(x.get("아피파이") or 0 for x in 수리), 4), "그림": 0.0,
                    "합계": round(sum(x.get("돈") or 0 for x in 수리), 4)})
    return 난것
