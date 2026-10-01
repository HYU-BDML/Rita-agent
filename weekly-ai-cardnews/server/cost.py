# -*- coding: utf-8 -*-
"""한 판에 쓴 돈 — 딥시크와 OpenAI 그림만. Apify 는 뺀다(2026-10-01 사용자 «apify 비용 빼고»).

단가는 가격 페이지에서 직접 읽었다(2026-09-30). 바뀌면 여기만 고친다.
- 딥시크 deepseek-v4-pro https://api-docs.deepseek.com/quick_start/pricing — 100만 토큰당,
  바쁜 시간(월~금 UTC 01~04시·06~10시)은 한가한 시간의 두 배. 중국 공휴일은 한가인데 여기선 안 센다
  (그날은 조금 비싸게 적힌다).
- GPT 이미지 2.5 https://developers.openai.com/api/docs/pricing — 글 입력 $5 · 그림 입력 $8 · 출력 $30.
"""
from datetime import datetime

딥시크_한가 = {"캐시": 0.022, "입력": 0.66, "출력": 1.98}  # 달러 / 100만 토큰
그림단가 = {"입력글": 5.0, "입력그림": 8.0, "출력": 30.0}


def _바쁜가(시각: str) -> bool:
    t = datetime.strptime(시각, "%Y-%m-%dT%H:%M:%SZ")
    return t.weekday() < 5 and (1 <= t.hour < 4 or 6 <= t.hour < 10)


def 딥시크값(x: dict) -> float:
    캐시 = x.get("캐시토큰") or 0
    배 = 2 if _바쁜가(x["시각"]) else 1
    return 배 * ((x["입력토큰"] - 캐시) * 딥시크_한가["입력"] + 캐시 * 딥시크_한가["캐시"]
                + x["출력토큰"] * 딥시크_한가["출력"]) / 1e6


def 그림값(u: dict) -> float:
    return (u.get("입력글토큰", 0) * 그림단가["입력글"] + u.get("입력그림토큰", 0) * 그림단가["입력그림"]
            + u.get("출력토큰", 0) * 그림단가["출력"]) / 1e6


def 합계(재료: dict) -> dict:
    딥 = sum(딥시크값(x) for x in 재료.get("딥시크기록") or [])
    그림들 = 재료.get("그림기록") or []
    그 = sum(그림값(u) for u in 그림들 if not u.get("모름"))
    return {"딥시크": round(딥, 4), "그림": round(그, 4), "그림장수": len(그림들), "합계": round(딥 + 그, 4),
            "표지값모름": any(u.get("모름") for u in 그림들)}
