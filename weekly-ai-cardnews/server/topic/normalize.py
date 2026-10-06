# -*- coding: utf-8 -*-
"""도구 원본 → 공통 글 모양. 뒤의 Apify 도구가 바뀌어도 지휘자가 보는 모양은 같다(설계 3장 «결과 모양»).

칸 이름은 Task 1 에서 받은 진짜 원본으로 맞췄다. 도구가 칸 이름을 바꿔도 견디게 여러 이름을 훑는다
(옛 서버 x.py 의 `_수` 와 같은 생각)."""
import re
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

KST = timezone(timedelta(hours=9))
카드폭 = 1080  # 뉴스 장 가로 — 이보다 두 배 넘는 영상은 받아 봐야 줄인다


def 시각읽기(값) -> datetime | None:
    """유닉스 초·밀리초, ISO(끝 Z 포함), X 꼴(«Tue Sep 30 16:30:00 +0000 2026»). 못 읽으면 None."""
    if 값 is None or 값 == "":
        return None
    if isinstance(값, (int, float)) or (isinstance(값, str) and 값.strip().isdigit()):
        수 = int(값)
        return datetime.fromtimestamp(수 // 1000 if 수 > 10**12 else 수, timezone.utc)
    글 = str(값).strip()
    try:
        d = datetime.fromisoformat(글.replace("Z", "+00:00"))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except ValueError:
        pass
    try:
        return datetime.strptime(글, "%a %b %d %H:%M:%S %z %Y")
    except ValueError:
        return None


def 한국날짜(d: datetime | None) -> str:
    return d.astimezone(KST).date().isoformat() if d else ""


def _시각글(d: datetime | None) -> str:
    return d.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if d else ""


def _수(d: dict, *이름들) -> int:
    for 이름 in 이름들:
        v = (d or {}).get(이름)
        if isinstance(v, bool):
            continue
        if isinstance(v, (int, float)):
            return int(v)
        if isinstance(v, str) and v.replace(",", "").isdigit():
            return int(v.replace(",", ""))
    return 0


def _가로세로(주소: str) -> tuple[int, int]:
    m = re.search(r"/(\d{3,4})x(\d{3,4})/", 주소 or "")
    return (int(m.group(1)), int(m.group(2))) if m else (0, 0)


def 반응점수(글: dict) -> int:
    """평소 대비 인기를 잴 때 쓰는 셈 — 주간 AI 소식과 같다(좋아요 + 공유)."""
    r = 글.get("반응") or {}
    return int(r.get("좋아요") or 0) + int(r.get("공유") or 0)


# ── X ───────────────────────────────────────────────────────────────────

def _x미디어(t: dict) -> list:
    묶음 = (t.get("extendedEntities") or {}).get("media") or t.get("media") or []
    if isinstance(묶음, dict):
        묶음 = [묶음]
    난것 = []
    for m in 묶음:
        if not isinstance(m, dict):
            continue
        변형 = (m.get("video_info") or {}).get("variants") or (m.get("videoInfo") or {}).get("variants") or []
        mp4 = [v for v in 변형 if (v.get("content_type") or v.get("contentType")) == "video/mp4" and v.get("url")]
        그림 = m.get("media_url_https") or m.get("mediaUrlHttps") or ""
        크기 = m.get("original_info") or m.get("originalInfo") or {}
        if mp4:
            맞는것 = [v for v in mp4 if 0 < _가로세로(v["url"])[0] <= 카드폭 * 2]
            고른것 = max(맞는것 or mp4, key=lambda v: v.get("bitrate") or 0)
            w, h = _가로세로(고른것["url"])
            난것.append({"갈래": "영상", "주소": 고른것["url"], "대표화면": 그림,
                       "가로": w or 크기.get("width") or 0, "세로": h or 크기.get("height") or 0})
        elif 그림:
            원본 = 그림 if "name=" in 그림 else 그림 + ("&" if "?" in 그림 else "?") + "name=orig"
            난것.append({"갈래": "사진", "주소": 원본, "대표화면": 그림,
                       "가로": 크기.get("width") or 0, "세로": 크기.get("height") or 0})
    return 난것


def _주소계정(주소: str) -> str:
    m = re.search(r"(?:x|twitter)\.com/@?([A-Za-z0-9_]+)", 주소 or "")
    return m.group(1) if m else ""


def x글들(원본: list) -> tuple[list, int]:
    """(글 목록, 버린 줄 수). **진짜 글에는 주소가 있다** — 액터가 섞어 주는 광고문에는 없다(옛 서버 실측)."""
    글들, 버림 = [], 0
    for t in 원본 or []:
        if not isinstance(t, dict):
            버림 += 1
            continue
        글, 주소 = t.get("text") or t.get("fullText") or "", t.get("url") or t.get("twitterUrl") or ""
        if not 글 or not 주소:
            버림 += 1
            continue
        작성자 = t.get("author") or {}
        시각 = 시각읽기(t.get("createdAt") or t.get("created_at"))
        글들.append({
            "플랫폼": "x", "계정": (작성자.get("userName") or _주소계정(주소)).lstrip("@").lower(),
            "주소": 주소, "시각": _시각글(시각), "날짜": 한국날짜(시각), "글": 글, "미디어": _x미디어(t),
            "반응": {"좋아요": _수(t, "likeCount", "favorite_count"), "공유": _수(t, "retweetCount", "retweet_count"),
                   "댓글": _수(t, "replyCount", "reply_count"), "조회": _수(t, "viewCount", "view_count")},
            "답글": bool(t.get("isReply") or t.get("inReplyToId") or t.get("inReplyToStatusId")),
            "계정정보": {"이름": 작성자.get("name") or "", "인증": bool(작성자.get("isBlueVerified") or 작성자.get("isVerified")),
                       "팔로워": _수(작성자, "followers", "followersCount"), "소개": 작성자.get("description") or "",
                       "링크": 작성자.get("url") or ""}})
    return 글들, 버림


# ── 인스타그램 ─────────────────────────────────────────────────────────────

def _인스타글(p: dict, 계정정보: dict | None = None) -> dict | None:
    주소 = p.get("url") or (f"https://www.instagram.com/p/{p['shortCode']}/" if p.get("shortCode") else "")
    if not 주소:
        return None
    미디어 = []
    for c in p.get("childPosts") or [p]:
        가로, 세로 = c.get("dimensionsWidth") or 0, c.get("dimensionsHeight") or 0
        if c.get("videoUrl"):
            미디어.append({"갈래": "영상", "주소": c["videoUrl"], "대표화면": c.get("displayUrl") or "", "가로": 가로, "세로": 세로})
        elif c.get("displayUrl"):
            미디어.append({"갈래": "사진", "주소": c["displayUrl"], "대표화면": c["displayUrl"], "가로": 가로, "세로": 세로})
    시각 = 시각읽기(p.get("timestamp"))
    글 = {"플랫폼": "instagram", "계정": (p.get("ownerUsername") or "").lower(), "주소": 주소,
          "시각": _시각글(시각), "날짜": 한국날짜(시각), "글": p.get("caption") or "", "미디어": 미디어,
          "반응": {"좋아요": _수(p, "likesCount"), "공유": 0, "댓글": _수(p, "commentsCount"),
                 "조회": _수(p, "videoPlayCount", "videoViewCount")}, "답글": False}
    if 계정정보:
        글["계정정보"] = 계정정보
    return 글


def 인스타글들(원본: list) -> list:
    return [g for g in (_인스타글(p) for p in 원본 or [] if isinstance(p, dict)) if g]


def 인스타프로필(p: dict) -> tuple[dict, list]:
    계정 = (p.get("username") or "").lower()
    정보 = {"이름": p.get("fullName") or "", "인증": bool(p.get("verified")), "팔로워": _수(p, "followersCount"),
           "소개": p.get("biography") or "", "링크": p.get("externalUrl") or ""}
    # 프로필 격자엔 다른 계정이 주인인 협업 글도 섞여 온다(2026-10-01 nvidia 12개 중 3개) — 이 계정 정보를
    # 붙이면 남의 글이 공식 글처럼 보이니 이 계정이 주인인 글만 둔다.
    글들 = [g for g in (_인스타글({**x, "ownerUsername": x.get("ownerUsername") or 계정}, 정보)
                        for x in p.get("latestPosts") or [] if isinstance(x, dict)) if g and g["계정"] == 계정]
    return {"계정": 계정, **정보}, 글들


# ── 스레드 ────────────────────────────────────────────────────────────────

def 스레드프로필(p: dict) -> tuple[dict, list]:
    계정 = (p.get("username") or "").lower()
    링크 = next((b.get("url") for b in p.get("bio_links") or [] if isinstance(b, dict) and b.get("url")), "")
    정보 = {"이름": p.get("full_name") or "", "인증": bool(p.get("is_verified")), "팔로워": _수(p, "follower_count"),
           "소개": p.get("biography") or "", "링크": 링크}
    글들 = []
    for x in p.get("latestPosts") or []:
        if not isinstance(x, dict) or not x.get("code"):
            continue
        캡션 = x.get("caption")
        미디어 = []
        for c in x.get("carousel_media") or [x]:
            영상 = c.get("video_versions") or []
            후보 = (c.get("image_versions2") or {}).get("candidates") or []
            사진 = 후보[0].get("url", "") if 후보 else ""
            if 영상 and 영상[0].get("url"):  # 첫 번째가 가장 좋은 판(인스타 CDN 정렬)
                미디어.append({"갈래": "영상", "주소": 영상[0]["url"], "대표화면": 사진,
                             "가로": c.get("original_width") or 0, "세로": c.get("original_height") or 0})
            elif 사진:
                미디어.append({"갈래": "사진", "주소": 사진, "대표화면": 사진,
                             "가로": 후보[0].get("width") or c.get("original_width") or 0,
                             "세로": 후보[0].get("height") or c.get("original_height") or 0})
        앱 = x.get("text_post_app_info") or {}
        시각 = 시각읽기(x.get("taken_at"))
        글들.append({"플랫폼": "threads", "계정": 계정, "주소": f"https://www.threads.com/@{계정}/post/{x['code']}",
                    "시각": _시각글(시각), "날짜": 한국날짜(시각),
                    "글": (캡션.get("text") if isinstance(캡션, dict) else 캡션) or "", "미디어": 미디어,
                    "반응": {"좋아요": _수(x, "like_count"), "공유": _수(앱, "repost_count"),
                           "댓글": _수(앱, "direct_reply_count"), "조회": 0},
                    "답글": bool(앱.get("is_reply")), "계정정보": 정보})
    return {"계정": 계정, **정보}, 글들


# ── 웹 검색 ───────────────────────────────────────────────────────────────

def 구글결과(원본: list) -> list:
    난것 = []
    for 쪽 in 원본 or []:
        for o in (쪽 or {}).get("organicResults") or []:
            주소 = o.get("url") or ""
            if not 주소.startswith("http"):
                continue
            시각 = 시각읽기(o.get("date"))
            난것.append({"플랫폼": "web", "계정": urlparse(주소).netloc.lower().removeprefix("www."), "주소": 주소,
                        "제목": o.get("title") or "", "글": o.get("description") or "", "시각": _시각글(시각),
                        "날짜": 한국날짜(시각), "미디어": [], "반응": {}, "답글": False})
    return 난것


# ── 이미지 검색(계획 4 과제 42++ A) ─────────────────────────────────────────

def 그림검색결과(원본: list) -> list:
    """결과 한 건 = 증거 한 건 — 주소는 그림이 실린 쪽, 미디어는 원본 크기를 아는 그림 한 장. 날짜는 모른다(기간은 액터가
    거른다) — «이미지검색» 표시로 사진 찾기가 날짜 거르기 대신 제목을 본다."""
    난것 = []
    for o in 원본 or []:
        if not isinstance(o, dict):
            continue
        그림, 쪽 = o.get("imageUrl") or "", o.get("pageUrl") or ""
        if not 그림.startswith("http") or not 쪽.startswith("http"):
            continue
        난것.append({"플랫폼": "web", "계정": (o.get("domain") or urlparse(쪽).netloc).lower().removeprefix("www."),
                    "주소": 쪽, "제목": o.get("title") or "", "글": "", "시각": "", "날짜": "", "반응": {}, "답글": False,
                    "이미지검색": True, "미디어": [{"갈래": "사진", "주소": 그림, "대표화면": "",
                                               "가로": _수(o, "imageWidth"), "세로": _수(o, "imageHeight")}]})
    return 난것
