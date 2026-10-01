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


class 받기(BaseHTTPRequestHandler):
    def _답(self, 상태, 몸):
        글 = json.dumps(몸, ensure_ascii=False).encode("utf-8")
        self.send_response(상태)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(글)))
        self.end_headers()
        self.wfile.write(글)

    def do_GET(self):
        if self.path == "/weeks":
            return self._답(200, {"weeks": weeks.최근주차들(datetime.now(timezone(timedelta(hours=9))).date())})
        if self.path == "/jobs":
            return self._답(200, {"jobs": sorted(판들.values(), key=lambda x: x["job"], reverse=True)})
        if self.path.startswith("/jobs/"):
            판 = 판들.get(self.path[len("/jobs/"):])
            return self._답(200, 판) if 판 else self._답(404, {"error": "없는 결과입니다"})
        return self._답(404, {"error": "모르는 길"})

    def do_POST(self):
        self.rfile.read(int(self.headers.get("Content-Length") or 0))
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
