# -*- coding: utf-8 -*-
import re
from pathlib import Path

import pytest

from topic import page

재료 = Path(__file__).resolve().parent / "재료" / "topic"

합성 = """<html><head><meta charset="utf-8"><title>사이트 제목</title>
<meta property="og:title" content="코르티스, 새 앨범 발매">
<meta property="og:image" content="/img/main.jpg">
<meta property="article:published_time" content="2026-09-24T09:00:00+09:00">
<script type="application/ld+json">{"@type":"NewsArticle","datePublished":"2026-09-24T09:00:00+09:00"}</script>
<script>var 숨은글 = "본문 아님";</script></head><body>
<nav>메뉴 홈 연예 스포츠</nav>
<article><p>코르티스가 24일 새 앨범을 냈다.</p><p>타이틀곡은 «FaSHioN» 이다.<br>공식 계정에도 올라왔다.</p>
<img src="/img/logo.png" alt="로고"><img src="https://cdn.example.com/photo/1.jpg" alt="무대" width="800" height="600">
<img src="https://cdn.example.com/icon/x.png" width="24" height="24">
<a href="https://www.instagram.com/cortis_official/">인스타</a><a href="https://x.com/CORTIS_official">X</a>
<a href="https://www.instagram.com/cortis_official/">인스타 또</a><a href="/news/2">다음 기사</a></article>
<footer>저작권</footer></body></html>"""


def 바꿔치기(monkeypatch, 몸: bytes, 꼴="text/html; charset=utf-8", 뽑기=("", "")):
    """받기를 갈아 끼운다. 뽑기=None 이면 진짜 trafilatura, 아니면 그 값을 trafilatura 결과로 쓴다."""
    monkeypatch.setattr(page, "받기", lambda 주소, 최대바이트=page.최대바이트: (몸, 꼴, 주소))
    if 뽑기 is not None:
        monkeypatch.setattr(page, "_본문뽑기", lambda 글, 주소: 뽑기)


@pytest.mark.parametrize("주소", ["http://127.0.0.1:9001/2018-06-01/runtime/invocation/next",
                                 "http://169.254.169.254/latest/meta-data/", "http://10.0.0.5/", "http://localhost/",
                                 "file:///etc/passwd"])
def test_내부_주소는_안_읽는다(주소):
    with pytest.raises(page.페이지탈, match="내부 주소|http"):
        page.읽기(주소)


def test_넘겨주기로_내부에_가도_막는다():
    import urllib.request
    요청 = urllib.request.Request("https://example.com/a")
    with pytest.raises(page.페이지탈, match="내부 주소"):
        page._넘겨주기막기().redirect_request(요청, None, 302, "Found", {}, "http://169.254.169.254/x")


def test_합성_기사(monkeypatch):
    바꿔치기(monkeypatch, 합성.encode("utf-8"))
    d = page.읽기("https://news.example.com/a/1")
    assert d["플랫폼"] == "page" and d["계정"] == "news.example.com" and d["제목"] == "코르티스, 새 앨범 발매"
    assert d["날짜"] == "2026-09-24" and d["시각"] == "2026-09-24T00:00:00Z"
    assert "타이틀곡은 «FaSHioN» 이다." in d["글"] and "메뉴" not in d["글"] and "숨은글" not in d["글"]
    assert d["링크"] == ["https://www.instagram.com/cortis_official/", "https://x.com/CORTIS_official"]
    assert [x["주소"] for x in d["사진후보"]] == ["https://news.example.com/img/main.jpg",
                                               "https://cdn.example.com/photo/1.jpg"]


def test_시간대_없는_날짜는_한국_시간으로_읽는다(monkeypatch):
    바꿔치기(monkeypatch, '<span data-date-time="2026-09-30 23:30:00"></span><article><p>본문</p></article>'.encode())
    assert page.읽기("https://n.news.naver.com/x")["날짜"] == "2026-09-30"


def test_euc_kr_도_읽는다(monkeypatch):
    바꿔치기(monkeypatch, "<title>한글 제목</title><p>한글 본문</p>".encode("cp949"), "text/html; charset=EUC-KR")
    d = page.읽기("https://old.example.co.kr/")
    assert d["제목"] == "한글 제목" and "한글 본문" in d["글"]


def test_글_페이지가_아니면_탈(monkeypatch):
    바꿔치기(monkeypatch, b"%PDF-1.7", "application/pdf")
    with pytest.raises(page.페이지탈, match="글 페이지가 아니"):
        page.읽기("https://example.com/a.pdf")


def test_본문은_trafilatura_가_먼저(monkeypatch):
    바꿔치기(monkeypatch, 합성.encode("utf-8"), 뽑기=("trafilatura 가 뽑은 본문", "2026-09-20"))
    d = page.읽기("https://news.example.com/a/1")
    assert d["글"] == "trafilatura 가 뽑은 본문"
    assert d["날짜"] == "2026-09-24"  # 페이지 메타의 발행 시각이 먼저


def test_메타_날짜가_없으면_trafilatura_날짜(monkeypatch):
    바꿔치기(monkeypatch, "<p>본문</p>".encode(), 뽑기=("본문", "2026-09-20"))
    assert page.읽기("https://blog.example.com/1")["날짜"] == "2026-09-20"


def test_진짜_네이버_기사(monkeypatch):
    몸 = (재료 / "page_naver.html").read_bytes()
    주소 = (재료 / "page_naver.url").read_text(encoding="utf-8").strip()
    바꿔치기(monkeypatch, 몸, 뽑기=None)  # 진짜 trafilatura
    d = page.읽기(주소)
    assert d["제목"] and re.fullmatch(r"\d{4}-\d{2}-\d{2}", d["날짜"]) and len(d["글"]) > 200
    assert page._본문뽑기(page._풀기(몸, "text/html; charset=utf-8"), 주소)[0], "trafilatura 가 본문을 못 뽑았다"


def test_천천히_흘려_보내는_페이지는_전체_마감에서_자른다(monkeypatch):
    # 소켓 한 번당 20초만 걸려 있어 조금씩 흘려 보내는 서버면 끝이 없었다(최종 검토 I3)
    class 느린답:
        headers = {"Content-Type": "text/html"}

        def read(self, n=-1):
            return b"x" * 10

        def geturl(self):
            return "https://slow.example/"

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    monkeypatch.setattr(page, "_안전한가", lambda 주소: None)
    monkeypatch.setattr(page._열기, "open", lambda 요청, timeout: 느린답())
    시각 = iter(range(0, 10000, 10))
    with pytest.raises(page.페이지탈, match="너무 느려"):
        page.받기("https://slow.example/", 지금=lambda: next(시각))


def test_본문_뽑기_꾸러미는_쓸_때_불러온다():
    # 맨 위에서 불러오면 꾸러미가 깨질 때 AI 소식·모든 화면 길까지 멈춘다(최종 검토 I6)
    import ast
    import inspect
    맨위 = [n for n in ast.parse(inspect.getsource(page)).body if isinstance(n, (ast.Import, ast.ImportFrom))]
    assert all("trafilatura" not in ast.dump(n) for n in 맨위)


def test_본문_뽑기_꾸러미가_깨져도_빈_값으로_내려간다(monkeypatch):
    import builtins
    원래 = builtins.__import__

    def 막기(이름, *a, **kw):
        if 이름 == "trafilatura":
            raise ImportError("깨짐")
        return 원래(이름, *a, **kw)

    monkeypatch.setattr(builtins, "__import__", 막기)
    글 = "<html><body><article>" + "<p>코르티스가 새 앨범을 냈다. 타이틀곡은 많은 사람에게 사랑받고 있다.</p>" * 12 + "</article></body></html>"
    assert page._본문뽑기(글, "https://news.example.com/a") == ("", "")


def test_주소를_찾다_시스템_오류가_나도_못읽음으로(monkeypatch):
    # 람다(리눅스)는 없는 도메인(cyworld.com)의 주소 찾기 실패를 gaierror 가 아니라 OSError(«Device or resource busy»)로
    # 내기도 해 «못읽음» 이 아닌 «오류» 가 됐다(평가 싸이월드 판 두 번, 계획 4 D-12)
    def 바쁨(*a, **kw):
        raise OSError(16, "Device or resource busy")

    monkeypatch.setattr(page.socket, "getaddrinfo", 바쁨)
    with pytest.raises(page.페이지탈, match="주소를 찾을 수 없어요"):
        page.읽기("https://cyworld.com")


def test_사진_후보는_원본_주소로_받고_원래_주소는_작은주소로(monkeypatch):
    # 슬리스트 썸네일 300×225 가 카드에서 흐렸다 — 원본 600×450 은 /news/photo/ 에 있다(계획 4 과제 42+ C)
    assert page.원본주소("https://cdn.slist.kr/news/thumbnail/202610/770822_1179388_820_v150.jpg") == \
        "https://cdn.slist.kr/news/photo/202610/770822_1179388_820.jpg"
    assert page.원본주소("https://img1.daumcdn.net/thumb/R658x0.q70/?fname=https%3A%2F%2Ft1.daumcdn.net%2Fnews%2F"
                       "202610%2F05%2Fa.jpg") == "https://t1.daumcdn.net/news/202610/05/a.jpg"
    assert page.원본주소("https://imgnews.pstatic.net/image/076/2026/10/05/b.jpg?type=w860") == \
        "https://imgnews.pstatic.net/image/076/2026/10/05/b.jpg"
    for 그대로 in ("https://cdn.example.com/photo/1.jpg", "https://imgnews.pstatic.net/image/c.jpg?type=ofullfill",
                "https://img1.daumcdn.net/thumb/R658x0/?fname=nothttp"):
        assert page.원본주소(그대로) == 그대로
    글 = ('<article><p>본문</p><img src="https://cdn.slist.kr/news/thumbnail/202610/770822_1179388_820_v150.jpg" '
         'alt="무대"><img src="https://cdn.slist.kr/news/photo/202610/770822_1179388_820.jpg" alt="또"></article>')
    바꿔치기(monkeypatch, 글.encode("utf-8"))
    assert page.읽기("https://www.slist.kr/news/articleView.html?idxno=1")["사진후보"] == [
        {"주소": "https://cdn.slist.kr/news/photo/202610/770822_1179388_820.jpg", "설명": "무대", "가로": 0, "세로": 0,
         "작은주소": "https://cdn.slist.kr/news/thumbnail/202610/770822_1179388_820_v150.jpg"}]  # 같은 원본은 한 번만
