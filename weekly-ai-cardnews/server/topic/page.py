# -*- coding: utf-8 -*-
"""기사·공식 사이트 읽기 — 제목·발행일·본문·링크(공식 SNS 찾기)·사진 후보(설계 3장 read_page).

**내부 주소는 읽지 않는다.** 지휘자가 검색 결과에서 고른 주소를 그대로 열기 때문에, 람다 안쪽
(127.0.0.1:9001 람다 내부 문, 169.254.x)이나 사설망으로 가는 주소와 그쪽으로 넘겨주는 주소를 막는다.
본문·날짜는 trafilatura 가 먼저 뽑고(계획 머리 «세부 제안» 3), 못 뽑으면 표준 라이브러리 뜯기로 채운다.
SNS 링크·사진 후보·메타 날짜는 표준 라이브러리 뜯기. 시간대가 없는 날짜는 한국 시간으로 읽는다."""
import ipaddress
import json
import re
import socket
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser

from topic.normalize import KST, 한국날짜

최대바이트 = 3_000_000
전체초 = 30  # 한 페이지를 받는 데 쓰는 최대 시간(걸음 전 남길 시간 안에)
본문최대 = 20_000
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/120.0 Safari/537.36")
_SNS = re.compile(r"^https?://(?:www\.|m\.)?(instagram\.com|x\.com|twitter\.com|threads\.(?:net|com)|youtube\.com|"
                  r"tiktok\.com|facebook\.com)/", re.I)
_안그림 = re.compile(r"logo|icon|sprite|avatar|profile|btn|button|banner|blank|1x1|pixel|emoji|loading|\.svg|\.gif",
                    re.I)
_건너뛸태그 = {"script", "style", "noscript", "nav", "header", "footer", "aside", "form", "button", "svg"}
_날짜메타 = ("article:published_time", "og:article:published_time", "datepublished", "pubdate", "publishdate",
           "date", "dc.date.issued", "article:modified_time")


class 페이지탈(Exception):
    """지휘자에게 그대로 보일 한 줄."""


def _안전한가(주소: str) -> None:
    p = urllib.parse.urlsplit(주소)
    if p.scheme not in ("http", "https") or not p.hostname:
        raise 페이지탈("http·https 주소만 읽어요")
    try:
        주소들 = {a[4][0] for a in socket.getaddrinfo(p.hostname, p.port or (443 if p.scheme == "https" else 80))}
    except (socket.gaierror, UnicodeError):
        raise 페이지탈("주소를 찾을 수 없어요") from None
    for a in 주소들:
        if not ipaddress.ip_address(a.split("%")[0]).is_global:
            raise 페이지탈("내부 주소라 못 읽어요")


class _넘겨주기막기(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        _안전한가(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


_열기 = urllib.request.build_opener(_넘겨주기막기)


def 받기(주소: str, 최대바이트: int = 최대바이트, 지금=time.monotonic) -> tuple[bytes, str, str]:
    """(몸, 내용꼴, 마지막 주소). 크기 상한 넘는 것은 자른다. 조금씩 흘려 보내는 서버도 전체 30초에서 자른다.
    **시험이 여기를 갈아 끼운다.**"""
    _안전한가(주소)
    요청 = urllib.request.Request(주소, headers={"User-Agent": UA, "Accept-Language": "ko,en;q=0.8",
                                            "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8"})
    try:
        with _열기.open(요청, timeout=20) as r:
            마감, 조각, 받은 = 지금() + 전체초, [], 0
            while 받은 < 최대바이트:
                if 지금() > 마감:
                    raise 페이지탈(f"너무 느려서 {전체초}초 안에 못 읽었어요")
                b = r.read(min(65536, 최대바이트 - 받은))
                if not b:
                    break
                조각.append(b)
                받은 += len(b)
            return b"".join(조각), r.headers.get("Content-Type", ""), r.geturl()
    except 페이지탈:
        raise
    except Exception as e:
        raise 페이지탈(f"못 열었어요 — {type(e).__name__}: {str(e)[:100]}") from None


def _수(값) -> int:
    return int(값) if str(값 or "").isdigit() else 0


class _뜯기(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.메타, self.제목, self.링크, self.그림, self.시간들, self.제이슨, self.조각 = {}, "", [], [], [], [], []
        self._건너뜀 = self._기사 = self._문단 = 0
        self._안제목 = self._안제이슨 = False
        self._제이슨조각 = []

    def handle_starttag(self, tag, attrs):
        a = {k: v or "" for k, v in attrs}
        if a.get("data-date-time"):
            self.시간들.append(a["data-date-time"])
        if tag == "script" and a.get("type", "").lower() == "application/ld+json":
            self._안제이슨, self._제이슨조각 = True, []
        if tag in _건너뛸태그:
            self._건너뜀 += 1
            return
        if tag == "meta":
            k = (a.get("property") or a.get("name") or a.get("itemprop") or "").lower()
            if k and a.get("content"):
                self.메타.setdefault(k, a["content"])
        elif tag == "title":
            self._안제목 = True
        elif tag == "a" and a.get("href"):
            self.링크.append(a["href"])
        elif tag == "img":
            src = a.get("src") or a.get("data-src") or a.get("data-original")
            if src and not src.startswith("data:"):
                self.그림.append({"주소": src, "설명": a.get("alt", ""), "가로": _수(a.get("width")), "세로": _수(a.get("height"))})
        elif tag == "time" and a.get("datetime"):
            self.시간들.append(a["datetime"])
        elif tag == "article":
            self._기사 += 1
        elif tag == "p":
            self._문단 += 1
        elif tag == "br" and (self._기사 or self._문단):
            self.조각.append("\n")

    def handle_endtag(self, tag):
        if tag in _건너뛸태그:
            if tag == "script" and self._안제이슨:
                self.제이슨.append("".join(self._제이슨조각))
                self._안제이슨 = False
            self._건너뜀 = max(0, self._건너뜀 - 1)
        elif tag == "title":
            self._안제목 = False
        elif tag in ("article", "p"):
            if tag == "article":
                self._기사 = max(0, self._기사 - 1)
            else:
                self._문단 = max(0, self._문단 - 1)
            self.조각.append("\n")

    def handle_data(self, data):
        if self._안제이슨:
            self._제이슨조각.append(data)
        elif not self._건너뜀:
            if self._안제목:
                self.제목 += data
            if self._기사 or self._문단:
                self.조각.append(data)


def _시각(값: str) -> datetime | None:
    try:
        d = datetime.fromisoformat(str(값).strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    return d if d.tzinfo else d.replace(tzinfo=KST)


def _제이슨날짜(조각들: list) -> list:
    난것 = []

    def 훑기(x):
        if isinstance(x, dict):
            if x.get("datePublished"):
                난것.append(x["datePublished"])
            for v in x.values():
                훑기(v)
        elif isinstance(x, list):
            for v in x:
                훑기(v)

    for 글 in 조각들:
        try:
            훑기(json.loads(글))
        except ValueError:
            pass
    return 난것


def _풀기(몸: bytes, 꼴: str) -> str:
    m = re.search(r"charset=([\w-]+)", 꼴, re.I) or re.search(rb'charset=["\']?([\w-]+)', 몸[:3000], re.I)
    이름 = (m.group(1).decode() if isinstance(m.group(1), bytes) else m.group(1)).lower() if m else "utf-8"
    if 이름 in ("euc-kr", "ks_c_5601-1987", "ksc5601"):
        이름 = "cp949"
    try:
        return 몸.decode(이름, "replace")
    except LookupError:
        return 몸.decode("utf-8", "replace")


def _본문뽑기(글: str, 주소: str) -> tuple[str, str]:
    """trafilatura 로 (본문, 'YYYY-MM-DD'). 못 뽑으면 ("", ""). **시험이 여기를 갈아 끼운다.**"""
    try:
        import trafilatura  # 쓸 때 불러온다 — 꾸러미가 깨져도 AI 소식·다른 길은 그대로(최종 검토)
        답 = trafilatura.extract(글, url=주소, output_format="json", with_metadata=True,
                                include_comments=False, include_tables=False, favor_precision=True)
    except Exception:
        return "", ""
    if not 답:
        return "", ""
    d = json.loads(답)
    return (d.get("text") or "").strip(), (d.get("date") or "")[:10]


def 읽기(주소: str) -> dict:
    몸, 꼴, 마지막 = 받기(주소)
    if 꼴 and not re.search(r"html|xml|text/plain", 꼴, re.I):
        raise 페이지탈(f"글 페이지가 아니에요 ({꼴.split(';')[0]})")
    글 = _풀기(몸, 꼴)
    뜯 = _뜯기()
    뜯.feed(글)
    뽑은본문, 뽑은날짜 = _본문뽑기(글, 마지막)
    시각 = next((d for d in map(_시각, [뜯.메타.get(k) for k in _날짜메타 if 뜯.메타.get(k)]
                                + _제이슨날짜(뜯.제이슨) + 뜯.시간들 + ([뽑은날짜] if 뽑은날짜 else [])) if d), None)
    줄들 = [re.sub(r"[ \t ]+", " ", x).strip() for x in "".join(뜯.조각).split("\n")]
    본문 = 뽑은본문 or "\n".join(x for x in 줄들 if x) or 뜯.메타.get("og:description", "")
    링크 = []
    for h in 뜯.링크:
        절대 = urllib.parse.urljoin(마지막, h)
        if _SNS.match(절대) and 절대 not in 링크:
            링크.append(절대)
    사진 = []
    for x in [{"주소": 뜯.메타[k], "설명": "대표 그림", "가로": 0, "세로": 0}
              for k in ("og:image", "twitter:image") if 뜯.메타.get(k)] + 뜯.그림:
        절대 = urllib.parse.urljoin(마지막, x["주소"])
        작다 = (x["가로"] and x["가로"] < 200) or (x["세로"] and x["세로"] < 200)
        if 작다 or _안그림.search(절대) or any(y["주소"] == 절대 for y in 사진):
            continue
        사진.append({**x, "주소": 절대})
    return {"플랫폼": "page", "계정": urllib.parse.urlsplit(마지막).netloc.lower().removeprefix("www."), "주소": 마지막,
            "제목": (뜯.메타.get("og:title") or 뜯.제목).strip(),
            "시각": 시각.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if 시각 else "",
            "날짜": 한국날짜(시각), "글": 본문[:본문최대], "링크": 링크[:20], "사진후보": 사진[:8],
            "미디어": [], "반응": {}, "답글": False}
