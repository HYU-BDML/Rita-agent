# -*- coding: utf-8 -*-
"""주제 소식 시험용 가짜들 — Apify 실행·페이지·판정관. 돈 드는 것은 하나도 안 부른다."""
import json
from datetime import datetime, timedelta, timezone

from fakes import 가짜S3
from topic import board, page
from topic.budget import 예산
from topic.evidence import 증거창고
from topic.tools import 현장

KAITO = "kaitoeasyapi~twitter-x-data-tweet-scraper-pay-per-result-cheapest"
주문서 = {"주제": "코르티스(CORTIS)", "범위": "그룹 + 멤버", "기간말": "9월 3주차", "시작": "2026-09-21", "끝": "2026-09-27",
        "넣을것": ["컴백", "음악방송"], "뺄것": ["팬 잡담"], "목표건수": 4, "한장단위": "소식 하나",
        "분야이름": "코르티스", "등급": "B", "예산": {"호출": 50, "돈": 2.0, "분": 40}}


class 가짜실행:
    """도구(액터) → 줄 목록·예외·함수(입력 → 줄 목록). 받은 것을 적어 둔다."""

    def __init__(self, 답들=None):
        self.답들, self.받은 = dict(답들 or {}), []

    def __call__(self, 도구, 입력, 돈상한, **kw):
        self.받은.append((도구, 입력, 돈상한))
        답 = self.답들.get(도구, [])
        답 = 답(입력) if callable(답) else 답
        if isinstance(답, Exception):
            raise 답
        return {"것들": 답, "청구": {"apify-default-dataset-item": len(답)} if 답 else {}, "상태": "SUCCEEDED",
                "열쇠순번": 0}


class 가짜판정관:
    def __init__(self, 사진=None, 문장=None, 같은=False):
        self.사진, self.문장답, self.같은답, self.받은 = dict(사진 or {}), dict(문장 or {}), 같은, []

    def 사진들(self, 후보):
        self.받은.append(("사진", [x["번호"] for x in 후보]))
        return {x["번호"]: self.사진.get(x["번호"], "장면") for x in 후보}

    def 문장(self, 문장, 발췌):
        self.받은.append(("문장", 문장, 발췌))
        return {"판정": self.문장답.get(문장, "받쳐줌"), "까닭": "시험"}

    def 같은사건(self, 가, 나):
        self.받은.append(("같은", 가, 나))
        return self.같은답


def 페이지없음(주소):
    raise page.페이지탈("시험엔 페이지 없음")


def 현장만들기(실행=None, 읽기=None, 판정관=None, 분=0, 주문서_=None, s3=None):
    o = 주문서_ or 주문서
    재료 = {"작업판": board.새판()}
    시작 = datetime(2026, 10, 1, 3, 0, tzinfo=timezone.utc)
    return 현장(job="20261001-030000-aaaaaaaa", 주문서=o, 재료=재료,
              창고=증거창고(s3 or 가짜S3(), "통", "20261001-030000-aaaaaaaa"),
              예산=예산(o["예산"], 재료, 시작, lambda: 시작 + timedelta(minutes=분)),
              판정관=판정관 or 가짜판정관(), 실행=실행 or 가짜실행(), 읽기=읽기 or 페이지없음,
              지금글=lambda: "2026-10-01T03:00:00Z")


def 트윗(번, 계정="CORTIS_official", 시각="2026-09-24T03:00:00Z", 좋아요=100, 영상=False, 글=None):
    t = {"text": 글 or f"CORTIS 소식 {번}", "url": f"https://x.com/{계정}/status/{번}", "createdAt": 시각,
         "likeCount": 좋아요, "retweetCount": 0,
         "author": {"userName": 계정, "name": "CORTIS", "isBlueVerified": True, "followers": 812000,
                    "description": "BIGHIT MUSIC"}}
    if 영상:
        t["extendedEntities"] = {"media": [{"media_url_https": f"https://pbs.twimg.com/{번}.jpg", "video_info": {
            "variants": [{"content_type": "video/mp4", "bitrate": 5000000,
                          "url": f"https://video.twimg.com/v/1920x1080/{번}.mp4"}]}}]}
    return t


class 가짜지휘자:
    """대본의 걸음을 차례로 답한다. 걸음: [("도구", {인자}), …] · "글:…" · "넘침"."""

    def __init__(self, 대본):
        self.대본, self.받은 = list(대본), []

    def __call__(self, 메시지들, 한도, 도구들=None, **kw):
        self.받은.append({"메시지들": json.loads(json.dumps(메시지들, ensure_ascii=False)), "한도": 한도,
                         "읽기": kw.get("읽기"), "도구": [d["function"]["name"] for d in 도구들 or []]})
        걸음 = self.대본.pop(0) if self.대본 else "글:할 말 없음"
        바탕 = {"모델": "deepseek-v4-pro", "입력토큰": 9000, "캐시토큰": 6000, "출력토큰": 800, "생각토큰": 600, "초": 20,
              "넘침": False, "글": ""}
        if 걸음 == "넘침":
            return {**바탕, "넘침": True, "메시지": {"role": "assistant", "content": ""}, "도구호출": []}
        if isinstance(걸음, str):
            return {**바탕, "글": 걸음[2:], "메시지": {"role": "assistant", "content": 걸음[2:]}, "도구호출": []}
        n = len(self.받은)
        호출 = [{"id": f"c{n}_{i}", "이름": 이름, "인자": 인자, "인자탈": ""} for i, (이름, 인자) in enumerate(걸음)]
        원 = [{"id": h["id"], "type": "function", "function": {"name": h["이름"], "arguments": json.dumps(h["인자"])}}
             for h in 호출]
        return {**바탕, "메시지": {"role": "assistant", "content": "", "reasoning_content": f"생각{n}", "tool_calls": 원},
                "도구호출": 호출}


class 가짜대화:
    """모델·지시문으로 나눈다 — flash 는 판정관(문장은 «받쳐줌», 사진은 «장면», 같은 사건은 아님),
    «주제 다듬기» 지시문은 다듬기 대본, 나머지는 지휘자 대본(가짜지휘자)."""

    def __init__(self, 지휘대본=(), 다듬기대본=(), 문장판정="받쳐줌"):
        self.지휘, self.다듬기, self.문장판정, self.다듬기받은 = 가짜지휘자(지휘대본), list(다듬기대본), 문장판정, []
        self.다듬기한도 = []  # (한도, 읽기) — 넘치면 한도를 올리는지 본다

    def __call__(self, 메시지들, 한도, 도구들=None, 모델=None, 생각=True, **kw):
        바탕 = {"모델": 모델 or "deepseek-v4-pro", "입력토큰": 500, "캐시토큰": 0, "출력토큰": 50, "생각토큰": 0,
              "초": 1, "넘침": False, "도구호출": []}
        if 모델 == "deepseek-flash":
            내용 = 메시지들[-1]["content"]
            if isinstance(내용, list):
                글 = json.dumps({p["text"][3:]: "장면" for p in 내용 if p.get("type") == "text"
                                and p["text"].startswith("번호 ")}, ensure_ascii=False)
            elif 내용.startswith("가: "):
                글 = '{"같다": false}'
            else:
                글 = json.dumps({"판정": self.문장판정, "까닭": "시험"}, ensure_ascii=False)
            return {**바탕, "글": 글, "메시지": {"role": "assistant", "content": 글}}
        if 메시지들[0]["content"].startswith("너는 «주제 소식» 의 주제 다듬기"):
            self.다듬기받은.append(json.loads(json.dumps(메시지들, ensure_ascii=False)))
            self.다듬기한도.append((한도, kw.get("읽기")))
            글 = self.다듬기.pop(0)
            if 글 == "넘침":
                return {**바탕, "넘침": True, "글": "", "메시지": {"role": "assistant", "content": ""}}
            글 = 글 if isinstance(글, str) else json.dumps(글, ensure_ascii=False)
            return {**바탕, "글": 글, "메시지": {"role": "assistant", "content": 글}}
        return self.지휘(메시지들, 한도, 도구들=도구들)


def 주제손(대화, 실행=None, 받기=None, 남은=900.0, 분=0):
    import store
    from fakes import 시계
    from topic import flow
    부른다음 = []
    시작 = datetime(2026, 10, 1, 3, 0, tzinfo=timezone.utc)
    손 = flow.손(창고=store.창고(가짜S3(), "통"), 대화=대화, 실행=실행 or 가짜실행(), 읽기=페이지없음,
               받기=받기 or (lambda 주소, 최대바이트=0: (b"MP4", "video/mp4", 주소)),
               다음부르기=lambda job, 단계: 부른다음.append((job, 단계)), 남은초=lambda: 남은,
               벽시계=lambda: 시작 + timedelta(minutes=분), 지금=시계().지금)
    return 손, 부른다음
