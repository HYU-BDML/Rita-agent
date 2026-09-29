# -*- coding: utf-8 -*-
"""람다가 **사람 화면으로** 내보내는 말. 한 벌만 둔다.

사람 지시 2026-09-19: 「영어로 바꾸면 모든 것이 영어로 되어야 한다」.

화면 글자(`web/lib/라벨말.js`)와 서버 거절 말(`web/server/라벨서버말.js`)은
옮겼는데, **람다가 번호표에 적어 보내는 말**이 한국어로 남아 있었다. 그 말은
채팅이 그대로 띄운다 — `web/lib/chat.js` 머리말이 이미 적고 있었다:

    람다가 써 보낸 말은 여기 없다 — 봉투에 실려 오는 그대로 보여 준다
    (`봉투.result.content`). 그래서 카드가 다 됐을 때 나오는 한 줄은
    아직 한국어다.

그 한 줄이 이것들이다. 담기가 끝났을 때·분석이 끝났을 때·담다가 막혔을 때.

**로그(`print`)는 한국어 그대로 둔다.** 우리가 읽는 곳이다 — 여기 것은
«사람 화면으로 나가는 답» 하나뿐이다.

언어 값은 `dify/프롬프트.py` 의 한국어·영어 와 **글자까지 같아야 한다** —
한 글자라도 어긋나면 조용히 한국어로 떨어진다.
"""

한국어 = "한국어"
영어 = "영어"


def 쓸말(값: str) -> str:
    """모르는 값은 한국어로 떨어뜨린다 — **거절하지 않는다.**

    「en」·「English」·오타가 와도 답은 나와야 한다. 안 나오는 것보다 한국어로
    나오는 편이 낫다(`web/lib/언어.js` 와 같은 규칙).
    """
    return 영어 if 값 == 영어 else 한국어


_말 = {
    # ── 담기가 끝났다 ────────────────────────────────────────────
    "담았다": {
        한국어: lambda n: f"게시물을 담았습니다 — {n}장.",
        영어: lambda n: f"Saved the post — {n} slides.",
    },
    "담은뒤안내": {
        한국어: lambda: "아래에서 장마다 네모를 치고 저장한 뒤, 여기로 돌아와 "
                     "「분석해줘」 하면 템플릿으로 저장합니다.",
        영어: lambda: "Draw boxes on each slide below and save, then come back here "
                    "and say «analyze» to turn it into a template.",
    },
    "라벨하러가기": {한국어: lambda: "라벨하러 가기", 영어: lambda: "Go label it"},
    "웹에서담고라벨하기": {
        한국어: lambda: "웹에서 담고 라벨하기",
        영어: lambda: "Save and label on the web",
    },

    # ── 담다가 막혔다 ────────────────────────────────────────────
    "길안열림": {
        한국어: lambda: "서버에서 담는 길이 아직 안 열렸습니다. 아래 웹에서 담아 주세요.",
        영어: lambda: "Saving from the server isn't open yet. Please save it on the web below.",
    },
    "게시판주소없음": {
        한국어: lambda: "게시판 주소가 없습니다.",
        영어: lambda: "There is no board address.",
    },
    "못담음": {
        한국어: lambda: "게시물을 담지 못했습니다. 아래 웹에서 담아 주세요.",
        영어: lambda: "Couldn't save the post. Please save it on the web below.",
    },
    "웹에서담아주세요": {
        한국어: lambda: " 아래 웹에서 담아 주세요.",
        영어: lambda: " Please save it on the web below.",
    },

    # ── 분석이 끝났다 ────────────────────────────────────────────
    "템플릿저장": {
        한국어: lambda 이름, 장수: f"템플릿 「{이름}」 을 저장했습니다 — {장수}장.",
        영어: lambda 이름, 장수: f'Saved the template "{이름}" — {장수} slides.',
    },
    "말투도저장": {
        한국어: lambda 설명: f"말투도 같이 저장했습니다: {설명}",
        영어: lambda 설명: f"Saved its tone too: {설명}",
    },
}


def 말(열쇠: str, 언어: str = 한국어, *값):
    """고른 언어로 한 마디. 모르는 언어는 한국어로 떨어진다."""
    return _말[열쇠][쓸말(언어)](*값)
