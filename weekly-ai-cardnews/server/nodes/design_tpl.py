# 뽑음: 주간AI소식_카드뉴스.yml 의 «디자인 틀» 단계 — 손으로 고치지 말 것 (weekly/server/extract.py 로 다시 뽑는다)
# 디자인 자리표 — **이 판의 생김새는 전부 여기에 있다.**
#
# 고치고 싶으면 아래 JSON 만 고치면 된다. 서버 코드도, 다른 노드도 안 건드린다.
#
#     글자 크기   slide_types.뉴스.headline.font_size
#     글자 색     slide_types.뉴스.headline.color
#     글자 자리   slide_types.뉴스.headline.lines_y / left_margin
#     바탕색      slide_types.CTA.background_gradient
#     글꼴 고르기  fonts.headline_default / body_default
#
# **안 준 칸은 서버 기본값으로 남는다.** 통째로 바뀌는 게 아니라 얹는 것이라
# 필요한 줄만 남겨도 되고, 오타가 나도 그 줄만 무시된다.
#
# **판 크기·사진 자리도 고칠 수 있다.** canvas · 뉴스.media_box ·
# CTA.photo_box 를 바꾸면 글자판과 사진이 «같이» 움직인다. 다만 글자 자리
# (lines_y·brand_chip·badge)는 따라오지 않으니 함께 옮겨야 한다.
#
# **못 고치는 것 하나.** `fonts.candidates` — 글꼴 «파일» 은 서버에 있다.
# 넷 중에 고르는 것만 된다. 「폭 검사」가 무료로 짚어 준다.
#
# _ 로 시작하는 칸은 왜 그 값인지 적어둔 주석이다. 서버는 안 읽는다.

# **글자 한 덩이로 내놓는다 — 객체가 아니다.** Dify 는 코드 노드가 내놓는
# 객체의 깊이를 5층까지만 받는다(«Depth limit 5 reached, object too deep»).
# 자리표를 객체로 넘기면 「대본 합치기」의 출력이
# slides→장→template→slide_types→뉴스→headline 로 6층이 되어 걸린다
# (실측 2026-08-19). 글자로 넘기면 깊이가 1이다. 서버가 받아서 도로 푼다.

import json

틀 = json.loads(r"""
{
 "_measured_from": "ai_freaks.kr DbkuOn_mgi3 — 06/12/15/16.jpg 픽셀 직접 실측 (2026-08-17)",
 "canvas": {
  "w": 1080,
  "h": 1350
 },
 "slide_types": {
  "뉴스": {
   "_confidence": "높음 — 사진 장 3개(06/12/15)에서 동일 좌표 재확인",
   "background": "#FFFFFF",
   "media_box": {
    "y0": 0,
    "y1": 796
   },
   "badge": {
    "cx": 89,
    "cy": 783,
    "r": 55,
    "fill": "rgba(255,255,255,0.55)",
    "shadow": true,
    "text_color": "#FFFFFF",
    "font_size": 40,
    "weight": "Bold"
   },
   "source_label": {
    "y0": 805,
    "y1": 828,
    "align": "right",
    "right_margin": 12,
    "color": "#6C6D72",
    "font_size": 16,
    "weight": "Medium",
    "format": "{source_kind} / {source_name}",
    "_note": "대본 칸 이름을 중괄호로 쓴다. 없는 칸은 빈 글자가 되고, 통째로 비면 딱지를 안 붙인다"
   },
   "brand_chip": {
    "x": 89,
    "y0": 863,
    "y1": 889,
    "color": "#6C6D72",
    "font_size": 20,
    "weight": "Medium",
    "icon_gap": 8,
    "format": "AI NEWS  |  {brand}",
    "_note": "예전엔 «AI NEWS» 가 렌더러 코드에 박혀 있었다. 브랜드가 없으면 칩을 안 붙인다",
    "_icon_note": "**안 쓰는 값이다.** 잴 때 아이콘 자리인 줄 알고 넣었는데, 원본 06·12.jpg 를 확대해 보니 브랜드 칩은 «AI NEWS | Claude» 글자뿐이고 아이콘이 없다(2026-08-19 눈으로 확인). 로고를 여기 그리면 원본과 달라진다. 받아둔 로고 7개는 표지 전략 B(밈 위에 얹기)에만 쓴다."
   },
   "headline": {
    "lines_y": [
     932,
     1030
    ],
    "line_height": 98,
    "font_size": 81,
    "weight": "Bold",
    "tracking": -1.0,
    "color": "#000000",
    "left_margin": 89,
    "_tuned_note": "잰 값은 82px · y[933,1031] 이었다. 사용자가 실제 결과물을 보고 «아주 살짝 줄이고 1pt 위로» 라고 해서 81px · y 각 -1 로 손봤다(2026-08-20). 원본 계측값이 아니라 «보기에 맞춘» 값이다 — 되돌리려면 위 숫자로."
   },
   "body": {
    "lines_y": [
     1152,
     1198,
     1244
    ],
    "line_height": 46,
    "font_size": 36,
    "weight": "Medium",
    "tracking": -0.3,
    "color": "#000000",
    "left_margin": 89
   },
   "photo_placeholder": {
    "fill": "#D9D9D9",
    "mark": "?",
    "mark_color": "#9A9A9A",
    "mark_size": 140,
    "_왜": "미디어를 아직 못 넣은 장(AI 생성 예정 등). 비워두면 새까맣게 나와 구별이 안 된다."
   }
  },
  "표지": {
   "_confidence": "높음 — 01.jpg 픽셀 직접 실측 (2026-08-18). 헤드라인 107px 에서 첫줄 폭이 591 대 591, 강조 «7월 5주차» 가 422 대 422 로 일치",
   "background": "media_full_bleed",
   "left_margin": 78,
   "accent_bar": {
    "x0": 82,
    "x1": 87,
    "y0": 848,
    "y1": 894,
    "color": "#00E1FF"
   },
   "eyebrow": {
    "text": "Weekly AI",
    "color": "#FFFFFF",
    "x": 108,
    "y": 842,
    "font_size": 49
   },
   "headline": {
    "color": "#FFFFFF",
    "accent_color": "#00E1FF",
    "lines_y": [
     932,
     1058
    ],
    "line_height": 126,
    "font_size": 107,
    "tracking": -1.0,
    "note": "강조 구간(accent_text)만 accent_color, 나머지는 color. 한 줄 안에서 갈린다"
   },
   "logo": {
    "_measured": "2026-08-20 실측 — 18편 전부 같은 자리. 검정 바탕 편(2월 1주차)에서 잘라냈다",
    "_status": "안 그린다 — 사용자 결정(2026-08-20). 다시 그리려면 `asset` 을 되살려라",
    "_asset": "로고.png",
    "x0": 451,
    "y0": 1233,
    "x1": 668,
    "y1": 1316,
    "_왜": "18편 표지에 «예외 없이» 들어 있다. 이게 없으면 한눈에 남의 판으로 보인다. 상자 가운데가 560 이라 판 가운데(540)보다 오른쪽인데, 글자는 가운데에 있고 마스코트가 오른쪽 위로 삐져나와서 그렇다 — 상자를 그대로 쓴다"
   },
   "photo_placeholder": {
    "fill": "#6B6B6B",
    "mark": "?",
    "mark_color": "#9E9E9E",
    "mark_size": 220,
    "_왜": "표지 배경 사진의 출처를 모른다. 사람이 넣을 자리를 표시한다. 밝은 회색이 아니라 어두운 회색인 이유: 표지 글자가 흰색이라 밝은 바탕에서는 안 읽힌다. 원본이 어두운 사진 위에 흰 글자를 얹는 구조라 그걸 흉내 낸다."
   },
   "scrim": {
    "start": 0.55,
    "max_alpha": 150,
    "_왜": "아래로 갈수록 검게 덮는다. 표지 글자가 흰색이라 밝은 사진 위에서는 안 읽힌다. 원본 01.jpg 오른쪽 여백 밝기가 위 400줄 90, 아래 400줄 57 로 떨어지는 것을 보고 넣었다."
   }
  },
  "CTA": {
   "_confidence": "중간 — 17.jpg 좌우 여백 픽셀 실측(2026-08-19)으로 세로 그러데이션 확인. 가로 방향은 균일로 본다(폰·글자 구역 빼고는 좌우 차가 노이즈 수준). 글자 세 덩어리는 코드에 박혀 있던 값을 여기로 옮긴 것이고, 원본과 대조해 y·x 네 덩어리 모두 0px 로 맞는 것을 확인했다",
   "background": "#EAF3FB",
   "note": "로고 글자 + 팔로우 유도 문구 + 계정 이름 + 폰 목업 자리(사람이 채움)",
   "photo_box": {
    "x0": 310,
    "y0": 544,
    "x1": 770,
    "y1": 1350,
    "radius": 40,
    "fill": "#D9D9D9",
    "mark": "?",
    "mark_color": "#9A9A9A",
    "mark_size": 150,
    "_note": "원본은 인스타 프로필을 담은 폰 목업이다. `asset` 이 있으면 그 그림을 칸에 맞춰 넣고, 없으면 회색 자리표시로 둔다. **계정이 자라면 이 파일만 갈아 끼우면 된다** — 코드도 자리표도 안 건드린다.",
    "asset": "폰목업.png"
   },
   "background_gradient": [
    {
     "at": 0.0,
     "color": "#F5FBFF"
    },
    {
     "at": 0.2,
     "color": "#E8F9FE"
    },
    {
     "at": 0.85,
     "color": "#ECF4FE"
    },
    {
     "at": 1.0,
     "color": "#F3F9FF"
    }
   ],
   "align": "center",
   "wordmark": {
    "_measured": "잉크 y190-223 · x430-648 — 그림이 아니라 찍은 글자다",
    "y": 180,
    "font_size": 44,
    "weight": "Bold",
    "color": "#000000"
   },
   "headline": {
    "_measured": "잉크 1행 y327-369 · 2행 y387-429",
    "lines_y": [
     320,
     380
    ],
    "line_height": 60,
    "font_size": 46,
    "weight": "Bold",
    "color": "#000000"
   },
   "handle": {
    "_measured": "잉크 y466-488 · x462-618. 색은 원본 실측값(#4B5256)이다 — 코드에 박혀 있던 #505050 보다 푸른 쪽이고, 뉴스 장 회색(#6C6D72)과도 다르다",
    "y": 460,
    "font_size": 26,
    "color": "#4B5256"
   }
  },
  "채용공고": {
   "_status": "2026-08-23 신설. 실측 기준 없음 — 취업 카드뉴스는 원본이 없어 처음부터 설계한 값이다. 실제 결과를 보고 다시 손볼 초안",
   "background": "#FFFFFF",
   "media_box": {
    "y0": 0,
    "y1": 540,
    "_왜": "이미지 40% : 텍스트 60% — 사용자 지정(2026-08-23). 로고 한 장보다 마감일 같은 정보가 이 카드에서 더 중요하다"
   },
   "chip": {
    "x": 89,
    "y": 570,
    "font_size": 28,
    "weight": "Bold",
    "color": "#FFFFFF",
    "bg_color": "#00E1FF",
    "pad_x": 16,
    "pad_y": 8,
    "radius": 8,
    "_왜": "기업형태(대기업·스타트업 등) 배지. 값이 없는 공고는 안 그린다"
   },
   "headline": {
    "lines_y": [
     636,
     706
    ],
    "line_height": 70,
    "font_size": 58,
    "weight": "Bold",
    "tracking": -0.5,
    "color": "#000000",
    "left_margin": 89,
    "_왜": "직무명. 뉴스 장 헤드라인(82px)보다 작다 — 긴 채용공고 제목이 잘리기 쉬워서"
   },
   "body": {
    "lines_y": [
     800,
     848,
     896,
     944
    ],
    "line_height": 48,
    "font_size": 34,
    "weight": "Medium",
    "tracking": -0.3,
    "color": "#3C3C3C",
    "left_margin": 89,
    "_왜": "회사명·마감일·경력조건·지역 네 줄. 뉴스 장은 세 줄이지만 여긴 정보가 더 필요해 하나 늘렸다"
   },
   "photo_placeholder": {
    "fill": "#D9D9D9",
    "mark": "?",
    "mark_color": "#9A9A9A",
    "mark_size": 140
   }
  }
 },
 "fonts": {
  "candidates": {
   "Pretendard-Bold": "fonts/Pretendard-Bold.otf",
   "Pretendard-Medium": "fonts/Pretendard-Medium.otf",
   "WantedSans-Bold": "fonts/WantedSans-Bold.otf",
   "WantedSans-Medium": "fonts/WantedSans-Medium.otf"
  },
  "headline_default": "Pretendard-Bold",
  "body_default": "Pretendard-Medium",
  "_decision_note": "82px 8줄 대조 NCC: Pretendard-Bold 0.9781 vs WantedSans-Bold 0.9774 — 잡음 수준 차이라 확정 못함. verify.py가 17장 전체로 두 글꼴을 각각 구워 점수 높은 쪽을 고른다. 기본값은 이미 설치돼 있는 Pretendard."
 },
 "brand_logos": {
  "_status": "미확보",
  "_note": "2026-08-19 확정 명단 일곱. 그전 목록(Codex·Nvidia·GoogleDeepMind 등)은 복제판 한 건에서 나온 것이라 지웠다",
  "needed": [
   "ChatGPT",
   "Claude",
   "Gemini",
   "Grok",
   "Cursor",
   "Perplexity",
   "Meta AI"
  ],
  "_쓰는곳": "표지 전략 B 뿐. 뉴스 장 브랜드 칩에는 아이콘이 없다"
 }
}
""")


def main() -> dict:
    return {"tpl": json.dumps(틀, ensure_ascii=False)}
