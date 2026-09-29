# -*- coding: utf-8 -*-
"""RITA 봉투. **규격서가 빨간 글씨로 적은 자리를 하나씩 못 박는다.**

여기서 틀리면 화면에 「빈 자리」나 `invalid_envelope` 만 뜨고 왜인지 안 나온다.
그래서 사람이 눈으로 잡을 수 없는 것들이다 — 시험이 유일한 그물이다.
"""
import os
import importlib.util
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
os.environ.setdefault("BUCKET", "시험통")

import pytest  # noqa: E402
import rita  # noqa: E402


def _요청(**고칠것):
    몸 = {"schema_version": "rita.agent.v1",
         "request_id": "6f9619ff-8b86-4d01-b42d-00cf4fc964ff",
         "user_id": "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
         "conversation_id": "1b4e28ba-2fa1-4d1b-a4c1-8b7f2b0e9d55",
         "message": "강남 카페 트렌드로 만들어줘",
         "conversation_history": [], "history_truncated": False,
         "history_message_count_total": 0}
    몸.update(고칠것)
    return 몸


# ── 자물쇠 ─────────────────────────────────────────────────────────

def test_열쇠가_맞으면_연다(monkeypatch):
    monkeypatch.setenv(rita.열쇠칸, "여기가열쇠")
    assert rita.열쇠확인({"Authorization": "Bearer 여기가열쇠"})


def test_헤더_이름의_대소문자를_안_가린다(monkeypatch):
    monkeypatch.setenv(rita.열쇠칸, "ㅋ")
    assert rita.열쇠확인({"authorization": "Bearer ㅋ"})


def test_틀린_열쇠는_막는다(monkeypatch):
    monkeypatch.setenv(rita.열쇠칸, "진짜")
    assert not rita.열쇠확인({"Authorization": "Bearer 가짜"})
    assert not rita.열쇠확인({})


def test_열쇠가_아예_없으면_아무도_못_들어온다(monkeypatch):
    """편의로 열어 두면 그게 바로 문이 열린 상태다."""
    monkeypatch.delenv(rita.열쇠칸, raising=False)
    assert not rita.열쇠확인({"Authorization": "Bearer 아무거나"})


def test_Bearer_말고는_안_받는다(monkeypatch):
    monkeypatch.setenv(rita.열쇠칸, "ㅋ")
    assert not rita.열쇠확인({"Authorization": "ㅋ"})
    assert not rita.열쇠확인({"x-api-key": "ㅋ"})


# ── 요청 읽기 ──────────────────────────────────────────────────────


# ── 번호표와 봉투 ──────────────────────────────────────────────────

def test_번호는_아무도_못_찍는다():
    번호들 = {rita.번호만들기() for _ in range(50)}
    assert len(번호들) == 50
    assert all(len(x) > 40 for x in 번호들)


def test_접수증은_칸이_정확히_넷이다():
    봉투 = rita.접수봉투("job_ㅋ", "https://a.example")
    assert set(봉투) == {"type", "job_id", "status_url", "poll_after_ms"}
    assert 봉투["type"] == "job"
    assert 봉투["status_url"] == "https://a.example/jobs/job_ㅋ"


def test_물어볼_주소가_같은_집이다():
    """규격이 scheme·host·port 가 같아야 한다고 못 박았다."""
    봉투 = rita.접수봉투("j", "https://a.example/chat".rsplit("/chat", 1)[0])
    assert 봉투["status_url"].startswith("https://a.example/")


def test_폴링_봉투에_군더더기가_없다():
    """job_id 를 넣으면 invalid_envelope 로 거부된다 — 접수증과 모양이 다르다."""
    assert rita.폴링봉투({"status": "queued"}) == {"status": "queued"}
    assert set(rita.폴링봉투({"status": "running", "progress": 40})) == {"status", "progress"}


def test_진행률은_0에서_100_사이_정수만():
    assert "progress" not in rita.폴링봉투({"status": "running", "progress": 140})
    assert "progress" not in rita.폴링봉투({"status": "running", "progress": "40"})
    assert rita.폴링봉투({"status": "running", "progress": 0})["progress"] == 0


def test_끝난_봉투는_result_를_담는다():
    봉투 = rita.폴링봉투({"status": "succeeded", "result": {"content": "됐다"}})
    assert set(봉투) == {"status", "result"}
    assert 봉투["result"] == {"content": "됐다"}


def test_실패_봉투는_code_와_message_뿐이다():
    봉투 = rita.폴링봉투({"status": "failed",
                     "error": {"code": "job_failed", "message": "못 했다"}})
    assert set(봉투["error"]) == {"code", "message"}


def test_실패인데_탈이_없어도_모양은_지킨다():
    봉투 = rita.폴링봉투({"status": "failed"})
    assert 봉투["error"]["code"] and 봉투["error"]["message"]


# ── 주소 ───────────────────────────────────────────────────────────

def test_https_만_받는다():
    assert rita.안전한주소("https://a.example/x.png")
    assert not rita.안전한주소("http://a.example/x.png")
    assert not rita.안전한주소("data:image/png;base64,ㅋ")
    assert not rita.안전한주소("javascript:alert(1)")


def test_사용자_정보가_붙은_주소를_막는다():
    assert not rita.안전한주소("https://사람:암호@a.example/x")


def test_내부_주소를_막는다():
    for 주소 in ("https://localhost/x", "https://127.0.0.1/x",
                "https://10.0.0.1/x", "https://192.168.1.1/x",
                "https://a.internal/x"):
        assert not rita.안전한주소(주소), 주소


def test_너무_긴_주소를_막는다():
    assert not rita.안전한주소("https://a.example/" + "x" * 2100)


# ── 구조화 결과 ────────────────────────────────────────────────────

def test_그림칸은_url_과_alt_뿐이다():
    칸 = rita.그림칸("https://a.example/1.png", "표지")
    assert set(칸) == {"type", "url", "alt"}


def test_링크칸은_label_이지_title_이_아니다():
    칸 = rita.링크칸("https://a.example/판", "작업대에서 고치기")
    assert set(칸) == {"type", "url", "label"}
    assert "title" not in 칸


def test_위험한_주소는_칸을_안_만든다():
    """빈 칸을 만드느니 안 보내는 게 낫다 — 통째로 버려지면 화면이 빈다."""
    assert rita.그림칸("http://a.example/1.png", "표지") is None
    assert rita.링크칸("javascript:alert(1)", "누르세요") is None


# ── 글 거르기 ──────────────────────────────────────────────────────

def test_그림_마크다운을_걷어낸다():
    """그림은 마크다운이 아니라 image 칸으로만 간다."""
    assert "![" not in rita.글거르기("보세요 ![표지](https://a.example/1.png) 끝")


def test_태그와_주석을_걷어낸다():
    assert rita.글거르기("<script>ㅋ</script>안녕<!-- 숨김 -->") == "ㅋ안녕"


def test_위험한_꼴을_걷어낸다():
    난것 = rita.글거르기("[누르기](javascript:alert(1))")
    assert "javascript:" not in 난것


def test_평문_http_주소를_걷어낸다():
    assert "http://" not in rita.글거르기("여기 http://a.example/x 봐")


def test_되비출_때_서식_글자를_뺀다():
    """사람이 보낸 글에 답의 서식이 넘어가면 안 된다."""
    난것 = rita.되비출글("**굵게** <b>태그</b> [링크](x)")
    assert "*" not in 난것 and "<" not in 난것 and "[" not in 난것


def test_되비출_글을_짧게_자른다():
    assert len(rita.되비출글("가" * 500)) <= 61


# ── 답 ─────────────────────────────────────────────────────────────

def _난것(**고칠것):
    것 = {"장수": 6, "주제": "강남 카페 트렌드",
         "표지": "https://a.example/1.png", "작업대": "https://a.example/판.html"}
    것.update(고칠것)
    return 것


def test_답에_표지와_작업대가_담긴다():
    답 = rita.답만들기(_난것())
    갈래 = [c["type"] for c in 답["components"]]
    assert 갈래 == ["image", "link"]
    assert "6장" in 답["content"]


def test_작업대가_없어도_답은_나온다():
    답 = rita.답만들기(_난것(작업대=""))
    assert [c["type"] for c in 답["components"]] == ["image"]


def test_아무_칸도_못_만들면_글만_보낸다():
    """빈 components 를 보내면 규격이 거부한다."""
    답 = rita.답만들기(_난것(표지="", 작업대=""))
    assert "components" not in 답
    assert 답["content"]


def test_사람이_보낸_말이_답의_서식을_못_흔든다():
    답 = rita.답만들기(_난것(주제="![x](https://a/b.png) <b>굵게</b>"))
    assert "![" not in 답["content"] and "<b>" not in 답["content"]


def test_우리가_만든_번호는_꼴이_맞다():
    assert all(rita.번호맞나(rita.번호만들기()) for _ in range(20))


def test_주소를_거슬러_올라가는_번호를_막는다():
    """번호로 창고 열쇠를 만든다 — 안 보면 딴 파일을 읽어 간다."""
    for 나쁜것 in ("../templates/목록", "job_../x", "job_짧음", "", "templates/기본"):
        assert not rita.번호맞나(나쁜것), 나쁜것


# ── 길 나누기 ──────────────────────────────────────────────────────

def _작업대앱():
    """`render/app.py` 를 **자리로** 불러온다.

    **이름으로 부르면 안 된다.** `analyze/app.py` 도 이름이 `app` 이라, 분석
    시험이 먼저 돌면 `import app` 이 그쪽 손잡이를 집어 온다 — 따로 돌리면
    통과하고 같이 돌리면 깨지는, 제일 헷갈리는 모양이 된다(2026-08-27).
    """
    자리 = importlib.util.spec_from_file_location("작업대앱", HERE / "app.py")
    몸 = importlib.util.module_from_spec(자리)
    자리.loader.exec_module(몸)
    return 몸


app = _작업대앱()


def test_jobs_길에서_번호를_뽑는다():
    assert app.jobs_id_of("/jobs/job_ㅋ") == "job_ㅋ"
    assert app.jobs_id_of("/chat") == ""
    assert app.jobs_id_of("/template/jobs") == ""


def test_밑주소를_요청에서_읽는다():
    """박아 두면 어느 집으로 등록하든 어긋난다 — 규격은 같은 집을 요구한다."""
    난것 = app._밑주소({"requestContext": {"domainName": "a.example"}})
    assert 난것 == "https://a.example"
    assert app._밑주소({}) == ""


def _부름(path, method="POST", headers=None, body=None):
    import json as _json
    return {"rawPath": path, "requestContext": {"http": {"method": method},
                                                "domainName": "a.example"},
            "headers": headers or {}, "body": _json.dumps(body or {}, ensure_ascii=False)}


def test_없는_번호는_404(monkeypatch):
    monkeypatch.setenv(rita.열쇠칸, "ㅋ")
    monkeypatch.setattr(app, "일읽기", lambda 번호: None)
    답 = app.handler(_부름("/jobs/job_" + "a" * 30, "GET",
                         {"Authorization": "Bearer ㅋ"}), None)
    assert 답["statusCode"] == 404


def test_꼴이_이상한_번호는_창고를_안_읽는다(monkeypatch):
    """번호로 창고 열쇠를 만든다 — 꼴을 안 보면 딴 파일을 읽어 간다."""
    monkeypatch.setenv(rita.열쇠칸, "ㅋ")
    읽은것 = []
    monkeypatch.setattr(app, "일읽기", lambda 번호: 읽은것.append(번호))
    답 = app.handler(_부름("/jobs/..%2Ftemplates", "GET",
                         {"Authorization": "Bearer ㅋ"}), None)
    assert 답["statusCode"] == 404 and 읽은것 == []


# ── 답하는 길은 하나다 ─────────────────────────────────────────────

def _번호받기(monkeypatch, 말):
    """`/chat` 을 부르고 접수 봉투를 돌려준다. 창고는 딴 데로 돌린다."""
    import json as _json
    담긴것 = {}
    monkeypatch.setenv(rita.열쇠칸, "ㅋ")
    monkeypatch.setattr(app, "일저장", lambda 번호, 일: 담긴것.update({번호: 일}))
    monkeypatch.setattr(app, "_목록", lambda: [{"이름": "키키"}])
    monkeypatch.setattr(app, "말투목록", lambda: [{"이름": "아기"}])
    답 = app.handler(_부름("/chat", headers={"Authorization": "Bearer ㅋ"},
                         body=_요청(message=말)), None)
    return 답, _json.loads(답["body"]), 담긴것


# ── 주소에 한글이 섞였을 때 ────────────────────────────────────────

_한글그림 = ("https://cardnews-render-554608989606.s3.ap-northeast-2."
          "amazonaws.com/templates/미리보기/DG0AA6PJ8s4.jpg")


def test_한글이_섞인_주소를_퍼센트로_바꾼다():
    """**RITA 는 그림을 서버가 직접 가져간다**(실물 2026-08-28).

    브라우저는 `<img src>` 를 알아서 바꿔 주지만 서버는 안 그런다. 한글이
    남으면 요청 자체가 안 되고 카드에 그림 자리만 빈다.
    """
    난것 = rita.주소다듬기(_한글그림)
    assert 난것.isascii(), 난것
    assert "%EB%AF%B8" in 난것, "「미」가 퍼센트로 바뀌어야 한다"
    assert 난것.endswith("/DG0AA6PJ8s4.jpg")


def test_아스키_주소는_그대로_둔다():
    맨것 = "https://example.org/a/b.jpg?x=1&y=2"
    assert rita.주소다듬기(맨것) == 맨것


def test_그림칸과_링크칸도_다듬는다():
    assert rita.그림칸(_한글그림, "표지")["url"].isascii()
    assert rita.링크칸(_한글그림, "보기")["url"].isascii()


# ── 틀 이름을 묻는 자리 ────────────────────────────────────────────

# 진짜 흐름은 두 마디로 갈린다 — 주소를 붙여 담고(**주소가 있으면 담기가
# 이긴다**, `뜻읽기`), 라벨을 마친 뒤 「분석해줘」라고 한다. 그래서 아래 기록에
# 주소는 앞에 있고 분석은 뒤에 온다.
_담은기록 = [{"role": "user", "content": "https://instagram.com/p/ABC123"},
          {"role": "assistant", "content": "게시물을 담았습니다 — 7장."}]


