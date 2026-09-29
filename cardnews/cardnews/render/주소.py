# -*- coding: utf-8 -*-
"""주소 다듬기. **여기 한 벌만 둔다.**

같은 탈이 2026-08-29 하루에 두 번 났다.

1. 아침 — RITA 목록 카드의 미리보기 그림이 안 떴다(`templates/미리보기/…`)
2. 저녁 — 배경판이 한 장도 안 붙었다(`배경판/…`)

둘 다 창고 열쇠에 한글을 쓴 탓이다. 거기서 나온 주소는 아스키가 아니라
`urlopen` 이 `UnicodeEncodeError` 를 던진다. 브라우저는 `<img src>` 를 알아서
바꿔 주기 때문에 웹 화면에서는 멀쩡해 보이고, **주소를 서버가 직접 여는
자리에서만** 깨진다. 게다가 그 자리들은 「한 장 때문에 전체를 죽이지 말자」고
예외를 삼키게 돼 있어서 **아무 자국도 안 남는다.**

아침에 한 군데 고치고 다 고쳤다고 여긴 것이 저녁의 탈이다. 두 벌이 있으면
언젠가 갈린다 — 그래서 한 벌로 모은다.
"""
import re
from urllib.parse import quote, urlsplit, urlunsplit


def 다듬기(주소) -> str:
    """주소에 아스키 아닌 글자가 있으면 퍼센트로 바꾼다. 아니면 그대로.

    호스트는 안 건드린다 — 한글 도메인은 이 창고에 없고, 섣불리 손대면 멀쩡한
    주소를 망칠 수 있다. 그런 주소는 뒤에서 안전 검사에 걸린다.
    """
    if not isinstance(주소, str) or not 주소 or 주소.isascii():
        return 주소 if isinstance(주소, str) else ""
    쪼갬 = urlsplit(주소)
    return urlunsplit((쪼갬.scheme, 쪼갬.netloc, quote(쪼갬.path),
                       quote(쪼갬.query, safe="=&"), ""))


# **바깥에서 온 주소로 우리 서버가 어디든 접속하면 안 된다.**
#
# 그림을 받아오는 자리(`cardnews_compose._fetch_media`)는 받은 주소를 그대로
# 열었다. 굽는 문은 초안을 «우리가 낸 것» 으로 믿고 칸을 안 걸렀으므로, 꾸민
# 요청 하나면 우리 서버가 내부망이나 `169.254.169.254`(아마존 열쇠가 있는
# 자리)에 접속하게 만들 수 있었다.
#
# **받아온 것이 공격자에게 돌아가지는 않는다** — 그림이 아니면 조용히 버린다.
# 그래도 「우리 서버가 아무 데나 두드리게 시킬 수 있다」는 그대로 남는다.
막을호스트 = re.compile(r"(^|\.)(localhost|local|internal)$", re.I)
막을아이피 = re.compile(r"^(127\.|10\.|192\.168\.|169\.254\.|0\.|"
                    r"172\.(1[6-9]|2\d|3[01])\.)")


def 안전한가(주소) -> bool:
    """공개 `https://` 만. 사용자 정보·사설 주소·긴 것은 막는다.

    **여기 한 벌만 둔다** — `rita.안전한주소` 도 이것을 부른다. 두 벌이 있으면
    언젠가 갈린다(이 파일이 생긴 까닭이 그것이다).

    실제로 쓰는 주소는 다 통과한다(실측 2026-09-23): 우리 창고(S3)·AI 사진
    (fal)·인스타 CDN·우리 웹·한글이 기호로 바뀐 주소.
    """
    if not isinstance(주소, str) or not 주소 or len(주소) > 2048:
        return False
    쪼갬 = urlsplit(주소)
    if 쪼갬.scheme.lower() != "https" or not 쪼갬.hostname:
        return False
    if 쪼갬.username or 쪼갬.password:
        return False
    이름 = 쪼갬.hostname.lower()
    return not (막을호스트.search(이름) or 막을아이피.match(이름))
