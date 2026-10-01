# -*- coding: utf-8 -*-
"""블로그 — 그 주에 올라온 글 목록을 받아온다.

OpenAI 와 Google 은 RSS 가 있어 날짜까지 딸려온다. Anthropic 은 RSS 가
없어서(rss.xml · news/rss.xml · feed.xml 전부 404 확인) 목록 쪽을 훑는다.

대표 이미지는 **고른 뒤에** 한 번만 받는다. 후보 전부의 페이지를 여는 건
낭비다 — 순위는 제목과 요약만으로 충분히 갈린다.
"""
import re
import xml.etree.ElementTree as ET

import web

# Google 은 전체 피드가 20건뿐이라 며칠치밖에 안 나온다(실측: 2026-08-12~17).
# 제품별 피드는 하루 건수가 적어 훨씬 멀리 간다 — 그래서 여러 개를 합친다.
FEEDS = {
    "OpenAI": ("rss", ["https://openai.com/news/rss.xml"]),
    "Google": ("rss", ["https://blog.google/products/gemini/rss/",
                       "https://blog.google/technology/ai/rss/",
                       "https://blog.google/innovation-and-ai/rss/"]),
    "Anthropic": ("html", ["https://www.anthropic.com/news"]),
    # 2026-08-19 에 넷을 더 열어 봤는데 **RSS 가 한 곳도 없었다.**
    # xAI·Cursor 는 Anthropic 과 같은 방식(목록에서 주소를 긁고 글마다 og 를 읽기)으로 된다.
    "xAI": ("html", ["https://x.ai/news"]),
    "Cursor": ("html", ["https://cursor.com/blog"]),
    # 2026-10-01 추가 — 명단엔 있는데 여기 없어서 매번 KeyError 로 죽었다. 공식 블로그 RSS 는
    # 18건(약 2주치)을 준다. 개발자 블로그(developer.nvidia.com/blog/feed)는 Atom 이라 지금 못 읽는다.
    "NVIDIA": ("rss", ["https://blogs.nvidia.com/feed/"]),
}

없는곳 = {
    "Perplexity": "403 으로 막혀 있다 (2026-08-19 실측). 어느 주소로 가도 거부한다",
    "Meta AI": "목록이 JS 로 그려져 글 주소가 HTML 에 없다 (2026-08-19 실측)",
}
"""블로그를 못 붙인 곳. **이 브랜드는 X 만으로 간다** — 설계상 블로그는
살 붙이는 보조라 없어도 슬라이드는 나온다."""

# 목록 쪽에서 글 주소를 뽑는 규칙. (정규식, 주소 앞머리)
_긁기 = {
    "https://www.anthropic.com/news": (r'href="/news/([a-z0-9\-]+)"', "https://www.anthropic.com/news/"),
    "https://x.ai/news": (r'href="/news/([a-z0-9\-]+)"', "https://x.ai/news/"),
    "https://cursor.com/blog": (r'href="/blog/([a-z0-9\-\.]+)"', "https://cursor.com/blog/"),
}


def posts(publisher: str, limit: int = 200) -> list:
    종류, 주소들 = FEEDS[publisher]
    모음, 본주소 = [], set()
    for u in 주소들:
        try:
            것들 = _rss(u, limit) if 종류 == "rss" else _목록긁기(u, limit)
        except Exception as e:
            print(f"  ! {publisher} 피드 하나 실패: {u} ({type(e).__name__})")
            continue
        for x in 것들:
            if x["url"] not in 본주소:
                본주소.add(x["url"]); 모음.append(x)
    return 모음


def _rss(url: str, limit: int) -> list:
    뿌리 = ET.fromstring(web.get(url))
    out = []
    for item in 뿌리.iter("item"):
        제목 = (item.findtext("title") or "").strip()
        요약 = re.sub(r"<[^>]+>", " ", item.findtext("description") or "")
        out.append({
            "text": f"{제목} {요약}".strip(),
            "url": (item.findtext("link") or "").strip(),
            "date": _날짜(item.findtext("pubDate") or ""),
        })
        if len(out) >= limit:
            break
    return out


def _목록긁기(url: str, limit: int) -> list:
    """RSS 가 없어서 목록 쪽을 훑는다.

    주소 조각(slug)만 쓰면 «position open weights models» 처럼 서너 낱말뿐이라
    후보들이 죄다 동점이 된다. 그래서 글마다 한 번씩 열어 진짜 제목과 요약을
    가져온다. 열세 편뿐이라 값이 싸다.
    """
    규칙, 앞머리 = _긁기.get(url, (r'href="/news/([a-z0-9\-]+)"', url.rstrip("/") + "/"))
    html = web.get(url)
    슬러그 = []
    for s in re.findall(규칙, html):
        if s not in 슬러그:
            슬러그.append(s)

    out = []
    for s in 슬러그[:limit]:
        주소 = 앞머리 + s
        제목, 요약, 날짜 = _og(주소)
        out.append({
            "text": f"{제목} {요약}".strip() or s.replace("-", " "),
            "url": 주소,
            "date": 날짜,
        })
    return out


def _og(page_url: str) -> tuple:
    """(제목, 요약, 발행일). 발행일이 없으면 빈 글자.

    **발행일이 있어야 주 필터가 걸린다.** 이게 없으면 그 블로그의 옛 글까지 전부
    후보로 올라온다 — 실제로 xAI 가 40건을 통째로 뱉었다(2026-08-19). 다만
    Anthropic 은 글 페이지에도 발행일이 없어서 여전히 빈 글자다.
    """
    try:
        html = web.get(page_url)
    except Exception:
        return ("", "", "")
    def 뽑기(prop):
        m = re.search(r'<meta[^>]+property=["\']og:%s["\'][^>]+content=["\']([^"\']*)' % prop, html)
        return m.group(1) if m else ""
    날짜 = ""
    for 이름 in ("article:published_time", "datePublished", "publishedAt", "og:updated_time"):
        m = re.search(r'["\']%s["\'][^"\']{0,20}["\'](20\d{2}-\d{2}-\d{2})' % re.escape(이름), html)
        if m:
            날짜 = m.group(1)
            break
    return (뽑기("title"), 뽑기("description"), 날짜)


_달 = {m: i + 1 for i, m in enumerate(
    "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split())}


def _날짜(s: str) -> str:
    m = re.search(r"(\d{1,2}) (\w{3}) (\d{4})", s)      # "30 Jul 2026"
    if m:
        return f"{m.group(3)}-{_달.get(m.group(2), 1):02d}-{int(m.group(1)):02d}"
    m = re.search(r"\d{4}-\d{2}-\d{2}", s)
    return m.group() if m else ""


def media_of(post_url: str) -> list:
    img = web.og_image(post_url)
    return [img] if img else []
