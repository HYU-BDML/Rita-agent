# -*- coding: utf-8 -*-
"""화면 확인용 가짜 지휘 서버 — 돈 안 든다.

    python weekly/tests/fake_api.py 47301
"""
import json
import sys
from datetime import date, datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
import weeks  # noqa: E402
from topic import order  # noqa: E402

지금 = datetime.now(timezone.utc)


def 전(분):
    return (지금 - timedelta(minutes=분)).strftime("%Y-%m-%dT%H:%M:%SZ")


단계 = [{"name": "소식 긁기", "state": "됨", "sec": 118, "note": "X 185건 · 블로그 28건"},
       {"name": "소식 고르기", "state": "됨", "sec": 0, "note": "7건 (Grok 없음)"},
       {"name": "본문 대본", "state": "됨", "sec": 214, "note": "꼭지 7개 · 고쳐 쓰기 1번"},
       {"name": "표지 문구", "state": "됨", "sec": 61, "note": "고쳐 쓰기 1번"},
       {"name": "대본 합치기", "state": "됨", "sec": 2, "note": "9장 (표지 포함)"},
       {"name": "그림 만들기", "state": "됨", "sec": 41, "note": "1장 중 1장 만듦"},
       {"name": "카드 굽기", "state": "됨", "sec": 246, "note": "8 / 9장 · 빠진 장 1"},
       {"name": "넘겨보기 만들기", "state": "됨", "sec": 1, "note": "8장"}]
판들 = {
    "20260930-023936-aaaaaaaa": {
        "job": "20260930-023936-aaaaaaaa", "week": "9월 3주차", "year": 2026, "state": "됨", "pct": 100,
        "step": "끝", "steps": 단계, "error": None, "started": 전(40), "updated": 전(28),
        "cost": {"딥시크": 0.0972, "그림": 0.0561, "그림장수": 1, "합계": 0.1533, "표지값모름": False},
        "result": {"viewer": "https://<S3 통 이름>.s3.ap-northeast-2.amazonaws.com/viewer/<넘겨보기 번호>.html",
                   "slides": 8, "missing_slides": [{"no": 7, "why": "영상, 시간 초과(6분)"}],
                   "missing_brands": [{"brand": "Grok", "why": "X 계정을 못 읽음"}]}},
    "20260930-030000-bbbbbbbb": {
        "job": "20260930-030000-bbbbbbbb", "week": "9월 2주차", "year": 2026, "state": "만드는 중", "pct": 62,
        "step": "카드 굽기", "steps": 단계[:6] + [{"name": "카드 굽기", "state": "하는 중", "sec": 0, "note": "4 / 9장"}],
        "error": None, "result": None, "started": 전(6), "updated": 전(0)},
    "20260929-140000-cccccccc": {
        "job": "20260929-140000-cccccccc", "week": "8월 4주차", "year": 2026, "state": "실패", "pct": 0,
        "step": "소식 긁기", "steps": [{"name": "소식 긁기", "state": "실패", "sec": 0, "note": ""}],
        "error": "소식 긁기 실패 — X 12곳 중 11곳 못 읽음 (Apify 가 흔들린 것일 수 있음)", "result": None,
        "started": 전(900), "updated": 전(890)},
    "20260929-120000-dddddddd": {
        "job": "20260929-120000-dddddddd", "week": "8월 3주차", "year": 2026, "state": "멈춤", "pct": 40,
        "step": "본문 대본", "steps": 단계[:2], "error": "30분 넘게 진행이 없음 — 다시 만들어 주세요", "result": None,
        "started": 전(1000), "updated": 전(960)},
}


from urllib.parse import unquote  # noqa: E402  (맨 위 import 들 옆으로 옮겨도 된다)

그림주소 = "http://127.0.0.1:47301/media/{}.svg"
주제주문서 = {"주제": "코르티스(CORTIS)", "범위": "그룹 + 멤버 개인", "기간말": "9월 3주차", "시작": "2026-09-21",
           "끝": "2026-09-27", "넣을것": ["컴백", "음악방송"], "뺄것": ["팬 잡담"], "목표건수": 4, "한장단위": "소식 하나",
           "분야이름": "코르티스", "등급": "B", "예산": {"호출": 50, "돈": 2.0, "분": 40}}
판단 = ["① 9월 3주차, 컴백·음악방송 위주 4칸", "② 짐작: x:cortis_official > instagram:cortis_official > web:연예 기사",
       "③ X·인스타·웹 나란히 훑음 — 공식 후보 둘", "④ x:cortis_official 공식 — 소속사 사이트가 링크, 최근 글 5개 모두 공지"]
걸음돈 = [{"걸음": 1, "단계": "①", "생각토큰": 751, "도구": ["web_search", "web_search", "x_search"], "딥시크": 0.0056,
          "아피파이": 0.0115, "합계": 0.0171},
         {"걸음": 2, "단계": "③", "생각토큰": 1012, "도구": ["x_account", "instagram_account", "read_page"],
          "딥시크": 0.0063, "아피파이": 0.0081, "합계": 0.0144},
         {"걸음": 3, "단계": "④", "생각토큰": 6020, "도구": [], "딥시크": 0.0139, "아피파이": 0, "합계": 0.0139}]
판들.update({
    "20261001-121500-eeeeeeee": {
        "job": "20261001-121500-eeeeeeee", "kind": "주제", "order": 주제주문서, "chat": "20261001-120000-cc000001",
        "state": "만드는 중", "pct": 30, "step": "모으기", "error": None, "result": None, "started": 전(7), "updated": 전(0),
        "steps": [{"name": "모으기", "state": "하는 중", "sec": 0, "note": "④ 들어가 보기 · 도구 12번 · 증거 86건"}],
        "board": {"단계": "④", "단계이름": "들어가 보기", "칸": [
            {"사건": "뮤직비디오 공개", "상태": "채움", "미디어": "영상"}, {"사건": "음악방송 첫 1위", "상태": "후보", "미디어": "사진"},
            {"사건": "", "상태": "빈칸", "미디어": ""}, {"사건": "", "상태": "빈칸", "미디어": ""}],
            "예산": {"호출": 12, "호출한도": 50, "돈": 0.42, "돈한도": 2.0, "남은분": 33.0}},
        "lines": 판단, "spend": 걸음돈, "cost": None},
    "20261001-110000-ffffffff": {
        "job": "20261001-110000-ffffffff", "kind": "주제", "order": 주제주문서, "chat": "20261001-120000-cc000001",
        "state": "됨", "pct": 100, "step": "끝", "error": None, "started": 전(80), "updated": 전(52),
        "steps": [{"name": "모으기", "state": "됨", "sec": 1240, "note": "도구 31번 · 증거 214건 · 낸 소식 4건"},
                  {"name": "검증", "state": "됨", "sec": 40, "note": "통과 3건 · 뺀 소식 1건"},
                  {"name": "정리", "state": "됨", "sec": 12, "note": "소식 3건"}],
        "board": None, "lines": 판단 + ["⑦ 관문 통과 3건"],
        "spend": 걸음돈 + [{"걸음": None, "단계": "검증·정리", "생각토큰": 0, "도구": [], "딥시크": 0.003, "아피파이": 0,
                            "합계": 0.003},
                           {"걸음": None, "단계": "카드", "생각토큰": 0, "도구": [], "딥시크": 0.067, "아피파이": 0,
                            "그림": 0.061, "합계": 0.128},
                           {"걸음": None, "단계": "도구 고치기", "생각토큰": 0, "도구": [], "딥시크": 0.02, "아피파이": 0.011,
                            "합계": 0.031}],
        "cost": {"딥시크": 0.61, "그림": 0, "그림장수": 0, "아피파이": 0.27, "수리": 0.031, "합계": 0.911, "표지값모름": False},
        "result": {"bundle": [
            {"순서": 1, "주인공": "그룹", "사건": "뮤직비디오 공개", "요약": "코르티스가 9월 24일 «FaSHioN» 뮤직비디오를 공개했다 [E3].",
             "날짜": "2026-09-24", "출처": {"주소": "https://x.com/CORTIS_official/status/1", "계정": "cortis_official",
                                         "플랫폼": "x", "증거": "E3"},
             "발췌": "CORTIS 'FaSHioN' Official MV", "미디어": {"갈래": "사진", "주소": 그림주소.format(1)},
             "반응": {"좋아요": 12400}, "배수": 4.2, "딱지": []},
            {"순서": 2, "주인공": "그룹", "사건": "음악방송 첫 1위", "요약": "코르티스가 9월 25일 음악방송에서 첫 1위를 했다 [E41].",
             "날짜": "2026-09-25", "출처": {"주소": "https://news.example.com/a/1", "계정": "news.example.com",
                                         "플랫폼": "page", "증거": "E41"},
             "발췌": "코르티스가 25일 음악방송에서 첫 1위를 했다.",
             "미디어": {"갈래": "영상", "원주소": "https://example.com/v.mp4", "못옮김": "HTTPError: 403"},
             "반응": {}, "배수": 0, "딱지": ["2차"]},
            {"순서": 3, "주인공": "마틴", "사건": "개인 화보 공개", "요약": "멤버 마틴의 화보가 9월 26일 공개됐다 [E77].",
             "날짜": "2026-09-26", "출처": {"주소": "https://www.instagram.com/p/abc/", "계정": "cortis_official",
                                         "플랫폼": "instagram", "증거": "E77"},
             "발췌": "MARTIN for magazine", "미디어": None, "반응": {"좋아요": 88000}, "배수": 1.3, "딱지": ["불확실"]}],
            "unfilled": [{"slot": "멤버 개인 활동", "searched": ["x:cortis_official", "web:코르티스 마틴"],
                          "why": "그 주에 다른 개인 활동 글이 없음", "more_cost": "약 $0.3"}],
            "dropped": [{"사건": "팬미팅 공지", "까닭": "E52 원문 날짜 2026-09-30 가 기간(2026-09-21~2026-09-27) 밖"}],
            # 매주 볼 곳 후보(계획 4) — 저장 펼침 화면 점검. 긴 주소 한 줄은 폰 폭 줄바꿈을 본다
            "목록후보": [
                {"도구": "x_account", "인자": {"account": "CORTIS_official", "deep": True, "count": 40},
                 "까닭": "코르티스 공식 계정 — 공지·영상", "글": "X @CORTIS_official 최근 글 40개",
                 "숫자": "이번 판: 기간 안 글 18개 · 소식 1건에 쓰임", "갈래": None},
                {"도구": "instagram_account", "인자": {"account": "cortis_official", "deep": True},
                 "까닭": "공식 인스타 — 화보·릴스", "글": "인스타 @cortis_official 최근 글 30개",
                 "숫자": "이번 판: 기간 안 글 9개 · 소식 1건에 쓰임", "갈래": None},
                {"도구": "web_search", "인자": {"query": "코르티스", "use_period": True}, "까닭": "음악방송·기사",
                 "글": "웹·뉴스에서 «코르티스» 검색", "숫자": "이번 판: 기간 안 글 7개 · 소식 1건에 쓰임", "갈래": None},
                {"도구": "read_page", "인자": {"url": "https://ibighit.com/cortis/notice/list/category/all/page/1"},
                 "까닭": "소속사 공지 목록", "글": "페이지 https://ibighit.com/cortis/notice/list/category/all/page/1 보기",
                 "숫자": "이번 판에서 안 봄", "갈래": None}],
            # 새 분야 카드뉴스(계획 3) — 진짜 AI 소식 넘겨보기 한 쪽을 빌려 쓴다
            "카드": {"보기": "https://<S3 통 이름>.s3.ap-northeast-2.amazonaws.com/viewer/<넘겨보기 번호>.html",
                     "장수": 5, "빠진장": [{"no": 4, "why": "영상, 시간 초과(6분)"}]},
            # 수리공(계획 4) — 화면 점검용
            "수리": {"고침": [{"도구": "x_search", "까닭": "입력 형식이 바뀌어 새 형식으로 맞춤", "돈": 0.031}],
                     "못고침": [{"도구": "threads_account", "까닭": "재현: 고장: 없는 도구 · 갈아탈 도구를 못 찾음",
                                 "사람이 할 일": "Apify 가게에서 같은 일을 하는 도구를 골라 장부를 고친다"}],
                     "고치는중": []}}},
})
# 매주 볼 곳으로 돈 판(계획 4) — 저장한 분야 «아이브»(표가 있는 브라우저만 «매주 볼 곳 바꾸기»)
아이브분야 = "20260930-090000-ff000001"
아이브표 = "가짜표아이브" + "0" * 26  # 32자 — 화면 점검 때 localStorage «분야표:아이브분야» 에 넣는다
아이브후보 = [
    {"글": "X @IVEstarship 최근 글 60개", "까닭": "아이브 공식 계정", "숫자": "이번 판: 기간 안 글 21개 · 소식 2건에 쓰임"},
    {"글": "인스타 @ivestarship 최근 글 40개", "까닭": "공식 인스타 — 티저", "숫자": "이번 판: 기간 안 글 11개 · 소식 1건에 쓰임"},
    {"글": "웹·뉴스에서 «아이브» 검색", "까닭": "기사", "숫자": "이번 판: 기간 안 글 9개 · 소식 1건에 쓰임"},
    {"글": "X @gone_ive 최근 글 40개", "까닭": "옛 팬 계정", "숫자": "이번 판: 못 읽음"},
    {"글": "X @ive_staff 최근 글 40개", "까닭": "스태프 계정 — 현장 사진", "숫자": "이번 판: 기간 안 글 6개 · 소식 0건에 쓰임",
     "갈래": "새로 찾은 곳"},
    {"글": "웹·뉴스에서 «장원영» 검색", "까닭": "멤버 개인 활동", "숫자": "이번 판: 기간 안 글 9개 · 소식 1건에 쓰임",
     "갈래": "새로 찾은 곳"}]
for _x in 아이브후보:
    _x.setdefault("갈래", "지금 목록")
판들["20261001-140000-ab000001"] = {
    "job": "20261001-140000-ab000001", "kind": "주제", "field": 아이브분야, "chat": None,
    "order": {**주제주문서, "주제": "아이브(IVE)", "분야이름": "아이브", "기간말": "9월 3주차"},
    "state": "됨", "pct": 100, "step": "끝", "error": None, "started": 전(40), "updated": 전(25),
    "steps": [{"name": "매주 볼 곳 보기", "state": "됨", "sec": 71, "note": "4곳 중 3곳 봄 · 못 본 곳 1"},
              {"name": "모으기", "state": "됨", "sec": 410, "note": "도구 9번 · 증거 132건 · 낸 소식 3건"},
              {"name": "검증", "state": "됨", "sec": 30, "note": "통과 3건"}, {"name": "정리", "state": "됨", "sec": 9, "note": "소식 3건"}],
    "board": None, "lines": ["⑤ 저장한 목록으로 모은 글에서 사건 셋 — 빈칸 없음"],
    "spend": [{"걸음": 0, "단계": "", "생각토큰": 0, "도구": ["x_account", "instagram_account", "web_search", "x_account"],
               "딥시크": 0, "아피파이": 0.0412, "합계": 0.0412}] + 걸음돈,
    "cost": {"딥시크": 0.21, "그림": 0, "그림장수": 0, "아피파이": 0.09, "합계": 0.30, "표지값모름": False},
    "result": {"bundle": 판들["20261001-110000-ffffffff"]["result"]["bundle"], "unfilled": [], "dropped": [],
               "목록": {"전체": 4, "본곳": 3, "못본곳": [{"글": "X @gone_ive 최근 글 40개", "까닭": "글이 없거나 못 읽음"}]},
               "목록후보": 아이브후보}}
받은기간 = []  # 저장한 분야로 모으기 — 화면이 보낸 기간(주차 고르기 점검: {"종류": "주차", "앞": 2})
대화들 = {}
지갑 = {"apify": {"쓸수있는합": 1.6, "낮음": True, "멈춤": False, "모름": False}, "deepseek": {"남은": 56.07, "멈춤": False}}
분야들 = [{"field": "20260925-090000-ff000000", "이름": "엔비디아 주가", "job": "20260925-080000-aaaaaaaa", "saved": 전(9000),
          "본": {"주제": "엔비디아(NVDA) 주가와 주가를 움직인 사건", "범위": "엔비디아 한 종목", "넣을것": ["실적", "발표"],
                "뺄것": ["단순 시세"], "목표건수": 5, "한장단위": "소식 하나", "분야이름": "엔비디아 주가", "등급": "A"}},
         {"field": 아이브분야, "이름": "아이브", "job": "20260930-080000-aaaa0001", "saved": 전(3000), "_표": 아이브표,
          "본": {"주제": "아이브(IVE)", "범위": "그룹 + 멤버 개인", "넣을것": ["컴백", "음악방송"], "뺄것": ["팬 잡담"],
                "목표건수": 5, "한장단위": "소식 하나", "분야이름": "아이브", "등급": "B"},
          "목록": [x["글"] for x in 아이브후보 if x["갈래"] == "지금 목록"]}]


def _기간들():
    """서버와 같은 셈 — 주차 넷은 [시작, 끝, «9월 3주차»](계획 4)."""
    오늘 = datetime.now(timezone(timedelta(hours=9))).date()
    난것 = {종류: list(order.기간계산({"종류": 종류, "N": 7}, 오늘)) for 종류 in ("지난주", "이번주", "최근N일", "이번달", "지난달")}
    난것["주차"] = []
    for 앞 in range(4):
        시작, 끝 = order.기간계산({"종류": "주차", "앞": 앞}, 오늘)
        난것["주차"].append([시작, 끝, weeks.이름짓기(date.fromisoformat(시작))["label"]])
    return 난것


def _대화답(d):
    """첫 말엔 되묻고, 두 번째 말엔 주문서. 2초 동안은 «생각 중»."""
    import time
    if d["state"] == "생각 중" and time.time() - d["_때"] > 2:
        사람말 = [m for m in d["messages"] if m["who"] == "사람"]
        if len(사람말) == 1:
            d["messages"].append({"who": "지휘자", "text": "어느 기간을 볼까요? 이번 주 / 지난주(9월 3주차) / 최근 한 달"})
        else:
            d["messages"].append({"who": "지휘자", "text": "이렇게 모을게요 — 9월 3주차 코르티스 소식 4건, 컴백·음악방송 위주."})
            d["order"] = 주제주문서
        d["state"] = "답함"
        d["cost"] = {"딥시크": 0.0021 * len(사람말), "합계": 0.0021 * len(사람말)}
    return {k: d.get(k) for k in ("chat", "state", "messages", "order", "error", "cost", "job")}


class 받기(BaseHTTPRequestHandler):
    def _답(self, 상태, 몸):
        글 = json.dumps(몸, ensure_ascii=False).encode("utf-8")
        self.send_response(상태)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(글)))
        self.end_headers()
        self.wfile.write(글)

    def do_GET(self):
        if self.path == "/wallet":
            return self._답(200, 지갑)
        if self.path.startswith("/media/"):
            n = unquote(self.path[len("/media/"):]).removesuffix(".svg")
            글 = (f'<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="100%" height="100%" '
                 f'fill="#2b3350"/><text x="50%" y="50%" fill="#fff" font-size="64" text-anchor="middle">미디어 {n}</text></svg>')
            몸 = 글.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "image/svg+xml")
            self.send_header("Content-Length", str(len(몸)))
            self.end_headers()
            return self.wfile.write(몸)
        if self.path.startswith("/topic/chat/"):
            d = 대화들.get(self.path[len("/topic/chat/"):])
            return self._답(200, _대화답(d)) if d else self._답(404, {"error": "없는 대화입니다"})
        if self.path == "/topic/fields":  # 지우기 표(_표)는 안 내보낸다
            return self._답(200, {"fields": [{k: v for k, v in f.items() if k != "_표"} for f in 분야들],
                                 "기간들": _기간들()})
        if self.path == "/fake/made":  # 화면 점검 — 저장한 분야로 모으기에 화면이 보낸 기간들
            return self._답(200, {"기간": 받은기간})
        if self.path == "/weeks":
            return self._답(200, {"weeks": weeks.최근주차들(datetime.now(timezone(timedelta(hours=9))).date())})
        if self.path == "/jobs":
            return self._답(200, {"jobs": sorted(판들.values(), key=lambda x: x["job"], reverse=True)})
        if self.path.startswith("/jobs/"):
            판 = 판들.get(self.path[len("/jobs/"):])
            return self._답(200, 판) if 판 else self._답(404, {"error": "없는 결과입니다"})
        return self._답(404, {"error": "모르는 길"})

    def do_POST(self):
        몸 = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
        if self.path == "/topic/chat":
            import time
            번호 = 몸.get("chat") or f"20261001-120000-cc{len(대화들) + 1:06d}"
            d = 대화들.setdefault(번호, {"chat": 번호, "messages": [], "order": None, "error": None})
            d["messages"].append({"who": "사람", "text": 몸.get("text", "")})
            d.update(state="생각 중", _때=time.time())
            return self._답(202, {"chat": 번호})
        if self.path == "/topic/fields":
            if any(f["job"] == 몸.get("job") for f in 분야들):
                return self._답(200, {"field": next(f["field"] for f in 분야들 if f["job"] == 몸.get("job"))})
            판 = 판들.get(몸.get("job")) or {}
            후보 = (판.get("result") or {}).get("목록후보") or []
            남길 = 몸.get("남길줄")
            고른 = 후보 if 남길 is None else [후보[i] for i in 남길 if isinstance(i, int) and 0 <= i < len(후보)]
            번호 = f"20261001-130000-ff{len(분야들) + 1:06d}"
            분야들.insert(0, {"field": 번호, "이름": 판["order"]["분야이름"], "job": 몸["job"], "saved": 전(0),
                           "본": {k: 판["order"].get(k) for k in ("주제", "범위", "넣을것", "뺄것", "목표건수", "한장단위",
                                                                 "분야이름", "등급")},
                           "목록": [x["글"] for x in 고른]})
            분야들[0]["_표"] = 표 = "가짜표" + 번호[-6:] + "0" * 23  # 32자
            return self._답(201, {"field": 번호, "표": 표})
        if self.path.startswith("/topic/fields/") and self.path.endswith("/delete"):
            번호 = self.path[len("/topic/fields/"):-len("/delete")]
            f = next((x for x in 분야들 if x["field"] == 번호), None)
            if not f:
                return self._답(404, {"error": "없는 분야입니다"})
            if not f.get("_표") or 몸.get("표") != f["_표"]:
                return self._답(403, {"error": "저장한 브라우저에서만 지울 수 있어요"})
            분야들.remove(f)
            return self._답(200, {"지움": 번호})
        if self.path.startswith("/topic/fields/") and self.path.endswith("/list"):
            번호 = self.path[len("/topic/fields/"):-len("/list")]
            f = next((x for x in 분야들 if x["field"] == 번호), None)
            if not f:
                return self._답(404, {"error": "없는 분야입니다"})
            if not f.get("_표") or 몸.get("표") != f["_표"]:
                return self._답(403, {"error": "저장한 브라우저에서만 바꿀 수 있어요"})
            후보 = ((판들.get(몸.get("job")) or {}).get("result") or {}).get("목록후보") or []
            f["목록"] = [후보[i]["글"] for i in 몸.get("남길줄") or [] if isinstance(i, int) and 0 <= i < len(후보)]
            return self._답(200, {"field": 번호, "목록": f["목록"]})
        if self.path == "/topic/make" and 몸.get("field"):  # 저장한 분야 — 받은 기간을 적어 둔다
            받은기간.append(몸.get("기간"))
            return self._답(202, {"job": "20261001-140000-ab000001" if 몸["field"] == 아이브분야
                                 else "20261001-121500-eeeeeeee"})
        if self.path == "/topic/make":
            d = 대화들.get(몸.get("chat")) or {}
            if d.get("job"):
                return self._답(200, {"job": d["job"]})
            d["job"] = "20261001-121500-eeeeeeee"
            return self._답(202, {"job": d["job"]})
        if self.path.startswith("/topic/jobs/") and self.path.endswith("/cards"):  # 카드 다시 굽기(계획 4 D-4)
            판 = 판들.get(self.path[len("/topic/jobs/"):-len("/cards")])
            if not 판:
                return self._답(404, {"error": "없는 결과입니다"})
            if 판.get("카드다시", 0) >= 2:
                return self._답(409, {"error": "카드 다시 굽기는 한 판에 2번까지예요"})
            판["카드다시"] = 판.get("카드다시", 0) + 1
            판.update(state="만드는 중", pct=50, step="본문 대본", updated=전(0), 다시시작=전(0))  # 진짜 서버처럼(과제 35)
            (판.get("result") or {}).pop("카드", None)
            return self._답(202, {"job": 판["job"]})
        if self.path == "/make":
            return self._답(202, {"job": "20260930-030000-bbbbbbbb"})
        if self.path.startswith("/jobs/") and self.path.endswith("/retry"):
            판 = 판들.get(self.path[len("/jobs/"):-len("/retry")])
            if not 판:
                return self._답(404, {"error": "없는 결과입니다"})
            if 판["state"] not in ("실패", "멈춤"):
                return self._답(409, {"error": "지금 만드는 중입니다"})
            판.update(state="만드는 중", error=None, updated=전(0))
            판["steps"][-1]["state"] = "하는 중"
            return self._답(202, {"job": 판["job"]})
        return self._답(404, {"error": "모르는 길"})


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1] if len(sys.argv) > 1 else 47301)), 받기).serve_forever()
