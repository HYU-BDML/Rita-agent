# -*- coding: utf-8 -*-
"""**바깥에서 온 주소로 우리 서버가 아무 데나 접속하지 않는다.**

초반 리뷰 🔴. 굽는 문(`POST /bake`)은 초안을 «우리가 낸 것» 으로 믿고 칸을 안
걸렀다. 사진 주소는 장마다 박혀 오고 로고는 한 줄로 오는데, 받는 쪽은 앞뒤
빈칸만 떼고 그대로 썼다(`_사진칸`). 로고 쪽에는 「**주소를 안 재검사한다** —
채팅 서버가 이미 걸렀다」고 적혀 있었는데, **채팅을 안 거치고 굽는 문을 직접
두드리면 그 거름망을 건너뛴다.**

그래서 꾸민 요청 하나로 우리 서버가 `169.254.169.254`(아마존 열쇠가 있는 자리)
나 내부망을 두드리게 만들 수 있었다.

**「우리 창고 것만 허용」으로 안 갔다**(사람 결정 2026-09-23). AI 사진이
`v3b.fal.media` 라 창고 밖이고, 막히면 오류가 아니라 **조용히 빈칸**이 되며,
허용 목록은 저장소가 늘 때마다 손봐야 한다. 진짜 위험은 「내부망 접속」 하나라
그것만 막는다 — **기능은 하나도 안 줄어든다.**
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import pytest  # noqa: E402
import cardnews_compose as C  # noqa: E402
import rita  # noqa: E402
import 주소 as _주소  # noqa: E402

# 실제로 쓰이는 길 여섯에서 나오는 주소들(실측 2026-09-23).
진짜주소 = [
    ("채팅·작업대에서 올린 사진",
     "https://cardnews-render-554608989606.s3.ap-northeast-2.amazonaws.com/photos/"
     "0123456789abcdef0123456789abcdef.png"),
    ("AI 가 만든 사진", "https://v3b.fal.media/files/b/0aab6ddd/xUvs7G7PKK3JCBBZT8aco.png"),
    ("인스타에서 담아 온 것", "https://scontent-gru1-2.cdninstagram.com/v/t51.jpg?oe=1"),
    ("우리 웹이 중계하는 그림", "https://cardnews.david112702.workers.dev/img?u=x"),
    ("틀 미리보기",
     "https://cardnews-render-554608989606.s3.ap-northeast-2.amazonaws.com/"
     "templates/%EB%AF%B8%EB%A6%AC%EB%B3%B4%EA%B8%B0/x.jpg"),
]

위험주소 = [
    ("아마존 열쇠 자리", "http://169.254.169.254/latest/meta-data/iam/security-credentials/"),
    ("아마존 열쇠 자리(https)", "https://169.254.169.254/latest/meta-data/"),
    ("이 서버 자신", "http://127.0.0.1:8788/"),
    ("내부망 10", "https://10.0.0.5/secret.png"),
    ("내부망 192", "https://192.168.0.1/x.png"),
    ("내부망 172", "https://172.16.0.1/x.png"),
    ("이름으로 부른 자기 자신", "https://localhost/x.png"),
    ("사내 이름", "https://db.internal/x.png"),
    ("사용자 정보 낀 것", "https://사람:암호@evil.example/x.png"),
    ("암호 안 걸린 길", "http://example.com/x.png"),
    ("주소가 아닌 것", "javascript:alert(1)"),
    ("data 주소", "data:image/png;base64,ㅋ"),
]


@pytest.mark.parametrize("이름,주소", 진짜주소)
def test_실제로_쓰는_주소는_다_통과한다(이름, 주소):
    """**여기서 헛걸리면 사진이 조용히 빈다.** 사람 눈에는 까닭이 안 보인다."""
    assert _주소.안전한가(주소), 이름


@pytest.mark.parametrize("이름,주소", 위험주소)
def test_위험한_주소는_막는다(이름, 주소):
    assert not _주소.안전한가(주소), 이름


@pytest.mark.parametrize("이름,주소", 위험주소)
def test_받아오는_자리가_열지도_않는다(이름, 주소, capsys):
    """**망을 아예 안 탄다.** 검사에서 걸리면 그 앞에서 끝난다 — 요청이 나가면
    그것만으로도 내부망을 두드린 것이다."""
    assert C._fetch_media(주소) is None, 이름
    assert "안전하지 않은 주소라 안 받아왔다" in capsys.readouterr().out, \
        "조용히 넘기면 사진이 왜 비었는지 아무도 못 찾는다"


def test_규칙은_한_벌뿐이다():
    """두 벌이 있으면 언젠가 갈린다 — `주소.py` 가 생긴 까닭이 그것이다."""
    for _, 주소 in 진짜주소 + 위험주소:
        assert rita.안전한주소(주소) == _주소.안전한가(주소), 주소
    assert rita.막을호스트 is _주소.막을호스트
    assert rita.막을아이피 is _주소.막을아이피


def test_너무_긴_주소는_막는다():
    assert not _주소.안전한가("https://a.example/" + "가" * 3000)


def test_글이_아니면_막는다():
    for x in (None, 123, [], {}, ""):
        assert not _주소.안전한가(x), repr(x)
