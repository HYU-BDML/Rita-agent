# -*- coding: utf-8 -*-
import json
from pathlib import Path

from topic import normalize as n

재료 = Path(__file__).resolve().parent / "재료" / "topic"


def 원본(이름):
    return json.loads((재료 / f"{이름}.json").read_text(encoding="utf-8"))


def test_시각은_세_꼴을_다_읽고_한국_날짜로():
    assert n.한국날짜(n.시각읽기("Wed Sep 30 16:30:00 +0000 2026")) == "2026-10-01"  # UTC 16:30 = KST 01:30 다음 날
    assert n.한국날짜(n.시각읽기("2026-09-30T10:00:00.000Z")) == "2026-09-30"
    assert n.한국날짜(n.시각읽기(1783994401)) == n.한국날짜(n.시각읽기("1783994401"))
    assert n.시각읽기("3 days ago") is None and n.한국날짜(None) == ""


def test_X_광고문은_버리고_영상은_카드폭_두배_이하에서_가장_좋은_것():
    광고 = {"text": "From KaitoEasyAPI, a reminder: Our API pricing is…"}
    글 = {"text": "CORTIS 'FaSHioN' MV", "url": "https://x.com/cortis_official/status/1", "createdAt": "2026-09-24T03:00:00Z",
          "likeCount": 12400, "retweetCount": 3100, "replyCount": 80, "viewCount": 900000,
          "author": {"userName": "CORTIS_official", "name": "CORTIS", "isBlueVerified": True, "followers": 812000,
                     "description": "BIGHIT MUSIC"},
          "extendedEntities": {"media": [{"media_url_https": "https://pbs.twimg.com/t.jpg", "video_info": {"variants": [
              {"content_type": "video/mp4", "bitrate": 9000000, "url": "https://video.twimg.com/v/3840x2160/a.mp4"},
              {"content_type": "video/mp4", "bitrate": 5000000, "url": "https://video.twimg.com/v/1920x1080/b.mp4"},
              {"content_type": "application/x-mpegURL", "url": "https://video.twimg.com/v/c.m3u8"}]}}]}}
    글들, 버림 = n.x글들([광고, 글])
    assert 버림 == 1 and len(글들) == 1
    g = 글들[0]
    assert (g["플랫폼"], g["계정"], g["날짜"]) == ("x", "cortis_official", "2026-09-24")
    assert g["미디어"] == [{"갈래": "영상", "주소": "https://video.twimg.com/v/1920x1080/b.mp4",
                         "대표화면": "https://pbs.twimg.com/t.jpg", "가로": 1920, "세로": 1080}]
    assert g["반응"] == {"좋아요": 12400, "공유": 3100, "댓글": 80, "조회": 900000} and n.반응점수(g) == 15500
    assert g["계정정보"]["인증"] is True and g["계정정보"]["팔로워"] == 812000


def test_X_사진은_원본_크기로_달라고_한다():
    글들, _ = n.x글들([{"text": "a", "url": "https://x.com/a/status/2",
                        "extendedEntities": {"media": [{"media_url_https": "https://pbs.twimg.com/p.jpg"}]}}])
    assert 글들[0]["미디어"][0]["주소"] == "https://pbs.twimg.com/p.jpg?name=orig"


def test_스레드_진짜_원본():
    for 한줄 in 원본("threads_account"):
        정보, 글들 = n.스레드프로필(한줄)
        if 정보["계정"] == "bts.bighitofficial":
            assert 정보["인증"] is True and 정보["팔로워"] > 1_000_000
            assert len(글들) == 4 and all(g["미디어"][0]["갈래"] == "영상" for g in 글들)
            assert all(g["주소"].startswith("https://www.threads.com/@bts.bighitofficial/post/") for g in 글들)
            assert all(len(g["날짜"]) == 10 for g in 글들)


def test_X_인스타_구글_진짜_원본은_공통_모양으로():
    for 이름 in ("x_search", "x_account"):
        글들, _ = n.x글들(원본(이름))
        assert 글들 and all(g["플랫폼"] == "x" and g["주소"].startswith("https://") and g["계정"] for g in 글들)
    정보, 글들 = n.인스타프로필(원본("instagram_account")[0])
    assert 정보["계정"] == "nvidia" and 정보["팔로워"] > 0 and 글들
    assert all(g["플랫폼"] == "instagram" and g["계정"] == "nvidia" for g in 글들)
    for 이름 in ("instagram_search", "instagram_posts"):
        assert all(g["플랫폼"] == "instagram" and g["주소"].startswith("https://www.instagram.com/")
                   for g in n.인스타글들(원본(이름)))
    웹 = n.구글결과(원본("web_search"))
    assert 웹 and all(g["플랫폼"] == "web" and g["주소"].startswith("http") and g["제목"] for g in 웹)


def test_인스타_묶음글은_낱장마다_훑는다():
    글 = {"url": "https://www.instagram.com/p/abc/", "ownerUsername": "Cortis", "caption": "티저",
          "timestamp": "2026-09-23T09:00:00.000Z", "likesCount": 50000, "commentsCount": 900, "type": "Sidecar",
          "childPosts": [{"type": "Image", "displayUrl": "https://cdn/1.jpg"},
                         {"type": "Video", "displayUrl": "https://cdn/2.jpg", "videoUrl": "https://cdn/2.mp4"}]}
    g = n.인스타글들([글])[0]
    assert g["계정"] == "cortis" and g["날짜"] == "2026-09-23"
    assert [m["갈래"] for m in g["미디어"]] == ["사진", "영상"] and g["반응"]["좋아요"] == 50000
