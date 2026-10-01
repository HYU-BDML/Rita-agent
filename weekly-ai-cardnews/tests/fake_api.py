# -*- coding: utf-8 -*-
"""화면 확인용 가짜 지휘 서버 — 돈 안 든다.

    python weekly/tests/fake_api.py 47301
"""
import json
import sys
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
import weeks  # noqa: E402

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
        "result": {"viewer": "https://<S3 통 이름>.s3.ap-northeast-2.amazonaws.com/viewer/ea28721ddbcb4f08a3c21f258f2e870b.html",
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
                            "합계": 0.003}],
        "cost": {"딥시크": 0.61, "그림": 0, "그림장수": 0, "아피파이": 0.27, "합계": 0.88, "표지값모름": False},
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
            "dropped": [{"사건": "팬미팅 공지", "까닭": "E52 원문 날짜 2026-09-30 가 기간(2026-09-21~2026-09-27) 밖"}]}},
})
대화들 = {}
지갑 = {"apify": {"쓸수있는합": 1.6, "낮음": True, "멈춤": False, "모름": False}, "deepseek": {"남은": 56.07, "멈춤": False}}
분야들 = [{"field": "20260925-090000-ff000000", "이름": "엔비디아 주가", "job": "20260925-080000-aaaaaaaa", "saved": 전(9000),
          "본": {"주제": "엔비디아(NVDA) 주가와 주가를 움직인 사건", "범위": "엔비디아 한 종목", "넣을것": ["실적", "발표"],
                "뺄것": ["단순 시세"], "목표건수": 5, "한장단위": "소식 하나", "분야이름": "엔비디아 주가", "등급": "A"}}]


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
        if self.path == "/topic/fields":
            return self._답(200, {"fields": 분야들})
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
            번호 = f"20261001-130000-ff{len(분야들) + 1:06d}"
            분야들.insert(0, {"field": 번호, "이름": 판["order"]["분야이름"], "job": 몸["job"], "saved": 전(0),
                           "본": {k: 판["order"].get(k) for k in ("주제", "범위", "넣을것", "뺄것", "목표건수", "한장단위",
                                                                 "분야이름", "등급")}})
            return self._답(201, {"field": 번호})
        if self.path == "/topic/make":
            d = 대화들.get(몸.get("chat")) or {}
            if d.get("job"):
                return self._답(200, {"job": d["job"]})
            d["job"] = "20261001-121500-eeeeeeee"
            return self._답(202, {"job": d["job"]})
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
