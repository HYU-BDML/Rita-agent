# analyze/tint.py
"""배경·도형·로고의 색을 LAB 격자로 훑어 단색·그라데이션·사진을 가른다.

**왜 LAB 인가:** RGB 유클리드 거리는 사람 눈과 다르게 잰다 — 회색↔밝은회색은
과장하고 빨강↔주황은 축소한다. "이건 그라데이션인가 사진인가"는 사람이 보는
잣대로 재야 한다.

**왜 격자인가:** 이미지 전체 평균 하나만 보면 두 가지 색으로 이뤄진 디자인도
진흙색이 된다. 칸별 평균으로 **변화의 모양**(그라데이션의 방향과 꺾이는 자리)을
보고, 대표색은 최빈색으로 따로 뽑는다 — 평균과 최빈색은 다른 질문에 답한다.
"""
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config  # noqa: F401  # cp949 콘솔에서 유니코드 대시가 안 죽게 만든다

GRID_ROWS, GRID_COLS = 16, 12
SMALL_ROWS, SMALL_COLS = 4, 4     # 칩·버튼처럼 작은 네모
NEED = 0.3                        # 칸에 이만큼은 유효 픽셀이 있어야 센다
SOLID_DE = 3.0                    # 칸 사이 최대 색차가 이보다 작으면 단색
# 마스크 경계에서 안쪽으로 이만큼(px) 깎고 잰다. 라벨 박스 바로 바깥 픽셀은
# 안티에일리어싱·그림자 때문에 옆 영역(사진·글자)의 색이 살짝 번져 있다
# (실측: DHqCBQnRAjW 1번 장 배경 마스크에서 깎기 전 칸 퍼짐 7.10 → 4px 깎은 뒤
# 1.91). small=True(칩·버튼처럼 작은 네모)에서는 몇 픽셀이 전체를 좌우해서 끈다.
MASK_ERODE = 4
# 직교 방향으로 이보다 덜 변해야 그 축이 맞다. 위 MASK_ERODE 로 깎은 뒤 기준으로
# 잡았다 — 실측: 진짜 배경(DHqCBQnRAjW 1번 장, 깎은 뒤 퍼짐 1.91)은 2.0 밑에서도
# 살아남고, 진짜 사진 크롭(DauoXg5mYjE/04.jpg @(372,780,452), 파란 건물 파사드,
# 퍼짐 3.92)은 3.0 위에 있다 — 3.0 이 양쪽에 여유를 두고 가른다(1500장 스윕
# 오탐률: 2.0→0.20% · 3.0→0.33% · 4.0→0.67% · 8.0→1.40%, 낮을수록 안전하다).
# 4.0 을 썼을 때는 이 사진(3.92 < 4.0)이 그라데이션으로 잘못 넘어갔다 — "빈 틈"이
# 있다고 적었던 이전 주석은 틀렸다. 빈 틈은 없고, 3.0 이 그 틈에 가장 가깝다.
FLAT_DE = 3.0
# 단조 판정(각 채널이 한 방향으로 가는지)에서 봐주는 되돌아감.
#
# 실측(2026-08-19 스윕: 커밋된 250장 전부 × 한 장당 크롭 49개 = 12,250개. 크롭은
# 전체 1개 + 200·300·452px 정사각을 가로세로 4자리씩 = 48개. 마스크 없음):
# 이 단조 관문까지 **도달하는** 크롭이 91개, 최대 되돌아감 **22.442**
# (p50 0.254 · p90 1.803). 그중 되돌아감이 1.5~2.5 사이라 브리프 기본값 1.5 로
# 되돌리면 사진으로 떨어지는 크롭이 **3개** 있고, 셋 다 지금 그라데이션이다 —
# DXZF_hwDoAf/01 @(479,1848,200) 2.148 · DYwloaEk73S/09 @(0,1150,200) 1.803 ·
# DYwloaEk73S/09 @(260,1050,300) 1.683. 셋의 잘게 썬 재구성 오차는 4.94~9.08 로
# 진짜 그라데이션이다(아래 DUP_FINE 참고). 즉 **이 값은 지금 실물 데이터에서 실제로
# 일하고 있다.** 재검토 3차 주석이 "도달 4건 · 최대 1.028 이라 2.5 대 1.5 가 판정을
# 하나도 안 바꾼다, 드리프트만 막는 방벽이다"라고 적었던 것은 틀렸다 — 그 수치는
# 훨씬 작은 스윕에서 나온 것이었고, 결론(필요 없는 값)까지 거꾸로였다.
MONO_TOL = 2.5
# 정지점(꺾이는 자리)을 sRGB 곡선에서 찾을 때 쓰는 문턱값(아래 _curve 참고) — LAB
# 문턱값(MONO_TOL)과는 다른 공간이라 별도로 둔다.
#
# 격자가 꺾이는 자리와 안 맞아떨어지면(흰→분홍→빨강 시험처럼 경계가 칸 하나 안에
# 걸치면) 그 칸이 양쪽 기울기를 섞어 평균 낸다 — 이건 "가짜 정지점"이 아니라
# **실제로 그 칸이 두 기울기를 섞어 잰 진짜 오차**다. 재구성 오차로 확인했다
# (회색 240→125→20 램프): eps=12 는 정지점 2개·잔차 7.85 로 진짜 가운데 정지점을
# 놓치고, eps=3 은 정지점 3개·잔차 0.86 으로 정확히 맞춘다 — 낮춘 문턱값이 오차를
# **줄이는** 쪽이라 "가짜로 늘었다"는 판단이 틀렸다.
#
# 이 격자-어긋남 오차는 대비(진폭)에 비례해 커진다 — 같은 모양을 대비만 바꿔 재면
# 5.97~57.45 까지 흔들려서, **고정 문턱값으로는 이 오차를 못 걸러낸다.** 대신
# 브리프 원안대로 정지점 개수는 `MAX_STOPS` 로만 막고, 그 안에서는 잔차를 낮추는
# 쪽(작은 eps)을 택한다 — 시험은 개수가 아니라 재구성 오차로 판정한다
# (test_labeled.py 의 test_꺾이면_정지점이_생기고_되그리면_맞는다·
# test_회색_3단_그라데이션은_되그리면_맞는다).
BEND_DE = 3.0
# 정지점 개수의 상한. 사진인지 아닌지는 이걸로 되돌리지 않는다(아래 stops() 주석
# 참고) — 그 판단은 이미 LAB 격자(_gradient_ok)가 실물로 맞춘 값으로 끝나 있다.
MAX_STOPS = 4
BINS = 16                         # 최빈색을 셀 때 색을 뭉치는 단계 (JPEG 잡티 흡수)
# 이어지는 정지점 둘이 "사실상 같은 색"인지 가르는 sRGB(0~255) 유클리드 거리.
# SOLID_DE 와 이름만 비슷할 뿐 공간이 다르다(SOLID_DE 는 LAB ΔE) — 그래서 재활용
# 하지 않고 따로 둔다. **두 공간의 환산은 한 숫자로 못 적는다 — 미는 방향에 따라
# 크게 달라진다**(실측: sRGB 거리 3.46 을 회색축 방향으로 밀면 ΔE 0.549~1.049
# [4~252 밝기 63점], 무작위 방향으로 밀면 ΔE 0.171~4.475 [중앙값 1.602, 4,880점]).
# 재검토 3차 주석의 "sRGB 3.46 ≈ ΔE 0.62~0.88" 은 무채색 근처에서만 맞는 말이었다.
DUP_STOP_RGB = 3.0
# 겹침이 걸렸을 때 재구성 오차를 다시 잴 격자를 가로·세로 각각 몇 배로 잘게 썰지.
#
# **정지점을 맞춘 바로 그 격자(16행)에서 오차를 재면 안 된다** — 자기가 맞춘
# 해상도로 자기를 채점하는 꼴이라 칸 하나보다 가는 것은 전부 안 보인다. 극단은
# 격자에 딱 맞아떨어지는 계단이다: 정확히 50%에서 흑백이 갈리는 두 면(카드뉴스에서
# 흔한 반반 배경)은 16행 기준 오차가 **0.00** 이라 대비가 아무리 세도 그냥 통과한다
# (실측). 4배(64행)로 썰면 같은 계단이 **167.73** 으로 드러난다 —
# test_격자에_딱_맞는_반반_계단은_사진이다 가 이걸 박는다.
#
# **잘게 썰어도 못 잡는 것이 하나 남는다 — 대비가 낮은 격자정렬 계단.** 400×300 합성
# 계단으로 재면 140/120(폭 34.6)은 잘게 썬 오차가 13.97 뿐이라 통과한다. 그래도 두는
# 이유는 **이 구멍이 대비에 묶여 있어서 저절로 얌전해지기 때문**이다: MAX_STOPS=4 가
# 거의 겹친 정지점 둘을 놓을 수 있어 1픽셀 경계가 26픽셀 램프로 기록되는데, 그때의
# 되돌려그리기 오차는 픽셀 최대 16.62·평균 0.54, **Lab ΔE 최대 3.93·평균 0.13** 이고
# 400줄 중 몇십 줄에만 걸린다 — 눈에 띄는 띠가 안 생긴다. 같은 모양을 255/0 으로
# 키우면 픽셀 최대 211.91·ΔE 최대 51.24 로 **보인다**, 그리고 그건 잡힌다. 절대 오차를
# 축으로 삼았기에 이 사각지대가 대비를 따라 부드럽게 사라진다 — 문턱값을 이 밑으로
# 내려서 잡으려 들면 진짜 그라데이션이 먼저 죽는다.
DUP_FINE = 4
# 이어지는 정지점이 위 기준으로 "같다"고 걸렸을 때만, DUP_FINE 로 잘게 썬 격자에서
# 재는 재구성 오차 문턱값.
#
# **아래 수치에는 반드시 어느 표본에서 잰 것인지가 붙어 있다.** 표본을 바꾸면 답이
# 달라지기 때문이다(재검토 6차에서 이것 때문에 주석 두 줄이 거짓이 됐다). 두 표본:
#   · **격자 표본** — 250장 × 49개(전체 1개 + 200·300·452px 정사각을 가로세로 4자리씩)
#     = 12,250 크롭. 재검토 4·5차가 쓴 것.
#   · **무작위 표본** — 같은 250장 × 40개, 변 120~min(W,H) 균일·위치 균일, 씨앗
#     20260819 = 10,000 크롭. 재검토 6차에서 추가.
#
# 격자 표본 실측(이 커밋 상태): 겹침 방아쇠가 켜지는 크롭이 51개이고, 그 51개는
# **잘게 썬 오차로 두 덩어리로 갈라진다.** 통과 13개와 거부 38개 사이가 이 표본에서는
# 비어 있다(아래에서 이게 표본의 성질일 뿐임이 드러난다).
#
#            | 잘게 썬 오차  | 폭(축 방향 색 진폭) | 픽셀 최대 | ΔE 최대
#   통과 13개 |  2.73 ~  21.26 |  22.6 ~  64.1     |  3.7 ~ 29.1 | 2.10 ~ 8.22
#   거부 38개 | 137.42 ~ 240.79| 335.9 ~ 441.7     |152.2 ~293.8 |38.05 ~69.46
#
# **이 관문이 실제로 가르는 것은 "계단이냐 램프냐"가 아니라 "절대 대비가 크냐"다.**
# 통과하는 13개 중 픽셀로 잴 수 있는 9개를 보면 6개가 진폭의 30% 이상을 픽셀 하나에서
# 넘긴다(한 픽셀 몫 6~82%: DWFpXMBiY3T/01 셋이 82%, DYUDHNrjg0e/09 둘이 32~38%,
# DYzN0Uzgaq6/03 이 62%). 매끈한 램프는 3개뿐이다. 거부되는 38개의 한 픽셀 몫은
# 85.3~99.6% 로, 통과분 최대(82.2%)와 **맞닿아 있을 뿐 겹치지는 않는다**(재검토 5차
# 주석은 "겹친다"고 적었는데 실측하면 82.2% 와 85.3% 가 붙어 있다 — 결론은 그대로다).
# 어쨌든 그 3.1%p 틈으로는 아무것도 못 가른다 — 갈라지는 것은 폭(22.6~64.1 대
# 335.9~441.7)이다. 그러니 통과분을
# "진짜 그라데이션"이라 부르면 안 된다. 정확히는 **되돌려 그렸을 때 절대 오차가 작아서
# 눈에 안 띄는 것들**이다.
#
# **21.26~137.42 사이가 비어 있는 것은 격자 표본에서만 그렇다.** 재검토 5차 주석은
# 여기에 "그 사이 어떤 값을 골라도 커밋된 250장에서 판정이 똑같다"고 적었는데 **거짓
# 이었다** — 같은 250장을 무작위 표본으로 훑으면 그 구간에 3건이 있고, 그중 2건이
# 25.0 과 50.0 사이에서 판정이 뒤집힌다(실측):
#   · DQbyy0hiOCc/07 @(68,373,149)  21.52 — 두 값 모두 그라데이션
#   · DYzN0Uzgaq6/03 @(514,322,126) 30.48 — 25.0→사진 / 50.0→그라데이션
#   · DSW-6lrk5rs/10 @(951,708,458) 36.50 — 25.0→사진 / 50.0→그라데이션
# 격자 표본에 안 걸렸을 뿐 실물에 있는 모양이다. 같은 판(DSW-6lrk5rs/10)을 다른
# 자리에서 떠도 마찬가지다(@(989,948,185) 41.74 · @(940,743,375) 39.00, 둘 다 지금
# `그라데이션` 으로 나온다). 정체는 **연한 하늘색 판과 흰 배경이 만나는 세로 칼금**
# 으로, 폭 73.6 중 59.5% 가 픽셀 하나에서 넘어간다.
#
# **50.0 은 그 비용을 알고 치른다.** 저대비 칼금을 굵은 칸 하나에 걸쳐 뭉개는 것은
# **부분 손실**이다 — 양쪽 평면색은 정지점으로 그대로 남는다(위 크롭의 정지점이
# `#C4D7FF`와 `#FFFFFF`다). 반대로 25.0 이 물리던 비용은 긴 플래토 배경이 통째로
# `사진` 이 되는 **전손**이다. 이 프로젝트는 되돌려 그리기로 판정하므로 전손이 훨씬
# 나쁘다 — 그래서 부분 손실 쪽을 골랐다. 이 상수를 다음에 건드릴 사람은 이 맞바꿈을
# 알고 움직여야 한다.
#
# 그 위에서 여유가 가장 고른 자리라 50.0 이다: 격자 표본 기준 아래로 2.35배·위로
# 2.75배(25.0 은 1.18배·5.50배로 아래가 아슬아슬했다), 기하 중앙 54.1 과 사실상 같다.
#
# **위에서 이 값을 붙잡는 것이 아무것도 없다**: 문턱값을 50.0 에서 **122.78** 까지
# 올려도 시험이 하나도 안 깨진다(실측: 122 에서 53 passed, 125 에서 1 failed —
# test_단단한_경계는_정지점이_겹쳐도_사진이다 의 크롭이 122.78 이라 거기서 처음
# 걸린다). 즉 50~122 사이는 시험이 비어 있는 구간이다.
#
# **왜 25.0 을 버렸나 — 이 값은 "되돌려그리기 오차 상한"이 아니다.** 재검토 4차 주석이
# 그렇게 적었지만 틀렸다. 이 점수는 꺾인 그라데이션에서 체계적으로 부풀고, 애초에
# 겹침이 안 걸리면 아무리 나빠도 이 관문에 오지도 않는다 — 실측:
#   · P=50% 플래토: 잘게 썬 15.79 인데 실제 픽셀 되돌려그리기는 최대 20.78·평균 1.10
#     (ΔE 최대 5.37·평균 0.24) — 점수가 실제 오차보다 크다.
#   · P=75% 플래토: 겹침이 아예 안 걸려 **이 관문에 오지도 않는다**. 실제
#     되돌려그리기는 굵은 격자 19.93·잘게 썬 33.16 으로 P=70% 보다 나쁜데도 그렇다.
#     (다만 "그래서 통과한다"는 뜻은 아니다 — 이 그림은 축이 `대각↘` 로 잡혀서
#     결국 `사진` 이 된다. 미뤄 둔 축 선택 문제 때문이지 이 관문과는 무관하다.)
# 즉 판별기이지 오차 한도가 아니다.
#
# **25.0 이 실제로 물린 비용(실측)**: `linear-gradient(#fff 0%, #fff 70%, #333 100%)`
# 가 잘게 썬 27.61(1080×1350)로 `사진` 이 됐다. P=80% 도 40.86 으로 마찬가지.
# 카드뉴스에서 흔한 모양이고, **배경을 사진이라 잘못 부르면 되돌려 그리기가 통째로
# 실패한다** — 이 프로젝트에서 가장 나쁜 결과다. 50.0 이 둘을 되살린다(P=90% 는
# 81.55 라 여전히 `사진` 이다 — 되살아나는 것은 ~85% 언저리까지다).
#
# **올려서 넓어진 사각지대(숨기지 않고 적는다)**: 저대비 단단한 경계를 못 잡는 한계가
# 25.0 일 때보다 넓어졌다 — 400×300 합성 격자정렬 계단 기준 170/110(폭 103.9)이 잘게
# 썬 40.16 이라 이제 통과한다(픽셀 최대 49.86·평균 1.61, ΔE 최대 11.40·평균 0.36).
# 200/100(폭 173.2, 66.36)은 여전히 거부된다.
#
# **"커밋된 250장에는 이 대비대의 계단이 하나도 없다"고 적었던 재검토 5차 주석은
# 거짓이었다** — 격자 표본만 보고 한 말이다. 위 DSW-6lrk5rs/10 의 하늘색 판 경계가
# 폭 73.6 으로 정확히 이 대비대에 있다. 그러니 이 사각지대의 비용은 0이 아니다.
#
# **얼마나 큰 비용인가(실측)**: 통과해 버리는 것 중 가장 나쁜 경우가
#   · 실물(무작위 표본): DSW-6lrk5rs/10 @(951,708,458) — ΔE 최대 **13.73**
#   · 합성(반반 계단을 대비별로 훑어 통과분 중 최대): 135/60, 잘게 썬 49.61 — ΔE 최대 **15.34**
# 위 DUP_FINE 주석이 "무해하다"고 적은 140/120 계단의 ΔE 최대가 3.93 이었으니, 이건
# 그보다 3~4배 크다 — **안 보이는 수준이 아니다. 못 본 게 아니라 알고 받아들인 것이다.**
DUP_RECON_DE = 50.0

AXES = ["세로", "가로", "대각↘", "대각↗", "방사"]


# ---------------------------------------------------------------- LAB 변환

def to_lab(rgb: np.ndarray) -> np.ndarray:
    """RGB(0~255, uint8) → 진짜 CIE Lab(L 0~100, a·b 대략 -128~127).

    cv2 는 8비트 입력에 대해 L 을 0~255 로 다시 스케일한 '가짜' Lab 을 준다
    (L 축만 2.55배 늘어나 유클리드 거리가 뒤틀린다). float32 로 캐스팅해
    0~1 로 넣으면 진짜 Lab 이 나온다 — 실측 확인.
    """
    shape = rgb.shape
    flat = rgb.reshape(-1, 1, 3).astype(np.float32) / 255.0
    lab = cv2.cvtColor(flat, cv2.COLOR_RGB2Lab)
    return lab.reshape(shape).astype(np.float64)


def _lab_to_rgb(lab) -> np.ndarray:
    """LAB 칸 평균 → sRGB(0~255). 정지점을 찾을 때만 쓴다(아래 _curve 참고)."""
    arr = np.asarray(lab, dtype=np.float32).reshape(1, 1, 3)
    rgb = cv2.cvtColor(arr, cv2.COLOR_Lab2RGB)[0, 0]
    return np.clip(rgb, 0, 1).astype(np.float64) * 255.0


def _rgb_to_hex(rgb) -> str:
    r, g, b = (int(round(float(np.clip(v, 0, 255)))) for v in rgb)
    return f"#{r:02X}{g:02X}{b:02X}"


def _hex_to_rgb(hex_str: str) -> np.ndarray:
    h = hex_str.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], float)


# ---------------------------------------------------------------- 격자

def _erode(mask: np.ndarray, px: int) -> np.ndarray:
    """마스크를 안쪽으로 px 만큼 깎는다 — 라벨 박스 경계 바로 안쪽은 옆 영역(사진·
    글자)의 색이 안티에일리어싱으로 살짝 번져 있어, 안 깎으면 그 몇 픽셀이 칸 하나를
    통째로 오염시킨다."""
    if px <= 0:
        return mask
    kernel = np.ones((3, 3), np.uint8)
    return cv2.erode(mask.astype(np.uint8), kernel, iterations=px).astype(bool)


def cells(img, mask, rows=GRID_ROWS, cols=GRID_COLS, need=NEED):
    """칸별 평균 LAB 과 유효 여부. 마스크 밖 픽셀은 안 센다."""
    h, w = img.shape[:2]
    if mask is None:
        mask = np.ones((h, w), bool)
    lab = to_lab(img)
    ys = np.linspace(0, h, rows + 1).round().astype(int)
    xs = np.linspace(0, w, cols + 1).round().astype(int)
    out = np.zeros((rows, cols, 3), np.float64)
    valid = np.zeros((rows, cols), bool)
    for r in range(rows):
        for c in range(cols):
            y0, y1, x0, x1 = ys[r], ys[r + 1], xs[c], xs[c + 1]
            m = mask[y0:y1, x0:x1]
            if m.size == 0 or m.sum() / m.size < need:
                continue
            valid[r, c] = True
            out[r, c] = lab[y0:y1, x0:x1][m].mean(axis=0)
    return out, valid


# ---------------------------------------------------------------- 축

def _axis_key(rows: int, cols: int, r: int, c: int, axis: str) -> int:
    """칸(r,c)이 이 축을 따라 몇 번째 자리인지. 정수 키라 같은 자리 칸을 묶기 쉽다."""
    if axis == "세로":
        return r
    if axis == "가로":
        return c
    if axis == "대각↘":
        return r + c
    if axis == "대각↗":
        return (rows - 1 - r) + c
    if axis == "방사":
        cr, cc = (rows - 1) / 2, (cols - 1) / 2
        return int(round(((r - cr) ** 2 + (c - cc) ** 2) ** 0.5))
    raise ValueError(axis)


def _buckets(lab_cells: np.ndarray, valid: np.ndarray, axis: str):
    """축 자리별로 칸을 묶어 (자리, 평균LAB, 그 자리 안에서의 퍼짐)을 자리순으로 낸다.

    '그 자리 안에서의 퍼짐'이 직교 방향 평평함이다 — 같은 행(세로축 기준)인데
    칸마다 색이 다르면 그건 세로 그라데이션이 아니라 다른 무늬다.
    """
    rows, cols = lab_cells.shape[:2]
    groups: dict[int, list] = {}
    for r in range(rows):
        for c in range(cols):
            if not valid[r, c]:
                continue
            groups.setdefault(_axis_key(rows, cols, r, c, axis), []).append(lab_cells[r, c])
    out = []
    for k in sorted(groups):
        labs = np.array(groups[k])
        mean = labs.mean(axis=0)
        spread = float(np.linalg.norm(labs - mean, axis=1).max()) if len(labs) > 1 else 0.0
        out.append((k, mean, spread))
    return out


def axis_of(lab_cells: np.ndarray, valid: np.ndarray) -> str | None:
    """다섯 축 중 양 끝 색차가 가장 큰 축. 유효 칸이 너무 적으면 None."""
    if valid.sum() < 4:
        return None
    best_axis, best_de = None, -1.0
    for ax in AXES:
        b = _buckets(lab_cells, valid, ax)
        if len(b) < 2:
            continue
        de = float(np.linalg.norm(b[-1][1] - b[0][1]))
        if de > best_de:
            best_axis, best_de = ax, de
    return best_axis


def _monotone(seq: np.ndarray, tol: float) -> bool:
    """seq 가 한 방향으로 흐르는지, tol 만큼의 되돌아감은 봐주고 본다."""
    if len(seq) < 2:
        return True
    inc = seq[-1] >= seq[0]
    run = seq[0]
    for v in seq[1:]:
        if inc:
            if v < run - tol:
                return False
            run = max(run, v)
        else:
            if v > run + tol:
                return False
            run = min(run, v)
    return True


def _gradient_ok(lab_cells: np.ndarray, valid: np.ndarray, axis: str) -> bool:
    b = _buckets(lab_cells, valid, axis)
    if len(b) < 2:
        return False
    if max(s for _, _, s in b) >= FLAT_DE:
        return False
    means = np.array([m for _, m, _ in b])
    return all(_monotone(means[:, ch], MONO_TOL) for ch in range(3))


# ---------------------------------------------------------------- 정지점

def _farthest(pts: list, lo: int, hi: int):
    """[lo,hi] 구간을 잇는 직선에서 가장 멀리 벗어난 점의 인덱스와 거리.

    `pts` 의 값이 LAB 이든 sRGB 든 상관없다 — 그냥 벡터 사이 유클리드 거리다.
    """
    if hi - lo < 2:
        return None, -1.0
    t0, v0 = pts[lo]
    t1, v1 = pts[hi]
    best_i, best_d = None, -1.0
    for i in range(lo + 1, hi):
        t, v = pts[i]
        frac = (t - t0) / (t1 - t0) if t1 != t0 else 0.0
        interp = v0 + (v1 - v0) * frac
        d = float(np.linalg.norm(v - interp))
        if d > best_d:
            best_i, best_d = i, d
    return best_i, best_d


def _simplify(pts: list, epsilon: float, max_stops: int) -> list[int]:
    """축에 투영한 1차원 색 곡선을 직선 조각으로 근사한다(Douglas-Peucker 변형).

    매번 남은 구간 중 직선에서 가장 많이 벗어난 점을 하나씩 추가한다 —
    `max_stops` 개를 다 쓰면 오차가 남아 있어도 거기서 멈춘다(정지점 개수의
    상한일 뿐 사진 여부 판정에는 안 쓴다 — stops() 주석 참고).

    점 자체가 아니라 **인덱스**를 돌려준다 — 점에는 numpy 배열(LAB)이 들어 있어
    동일성 비교(`in`)를 하면 "배열의 진위값이 모호하다" 오류가 난다.
    """
    n = len(pts)
    if n <= 2:
        return list(range(n))
    kept = [0, n - 1]
    segments = [(0, n - 1)]
    while len(kept) < max_stops:
        worst_d, worst_i, worst_seg = -1.0, None, None
        for lo, hi in segments:
            i, d = _farthest(pts, lo, hi)
            if i is not None and d > worst_d:
                worst_d, worst_i, worst_seg = d, i, (lo, hi)
        if worst_i is None or worst_d <= epsilon:
            break
        kept.append(worst_i)
        segments.remove(worst_seg)
        segments.append((worst_seg[0], worst_i))
        segments.append((worst_i, worst_seg[1]))
    kept.sort()
    return kept


def _curve(lab_cells: np.ndarray, valid: np.ndarray, axis: str) -> list:
    """축 자리를 0~1 로 정규화한 (자리, 평균 sRGB) 목록 — 정지점 찾기의 재료.

    LAB 이 아니라 **sRGB** 로 낸다. 디자인 도구(피그마·포토샵·캔바)는 그라데이션을
    sRGB 로 보간한다 — LAB 에서 재면 감마 때문에 진짜 직선(2단 그라데이션)도 크게
    휘고(실측 8.9 ΔE), 반대로 진짜 꺾인 자리(회색 240→100→20)는 오히려 덜 휘어
    보인다(실측 7.33 ΔE, sRGB 로는 46.2). 둘을 가르는 문턱값이 LAB 에는 없다 —
    sRGB 로 재야 그 둘이 500배 가까이 벌어진다.
    """
    b = _buckets(lab_cells, valid, axis)
    if not b:
        return []
    ks = [k for k, _, _ in b]
    span = max(ks[-1] - ks[0], 1)
    return [((k - ks[0]) / span, _lab_to_rgb(m)) for k, m, _ in b]


def stops(lab_cells: np.ndarray, valid: np.ndarray, axis: str, max_stops: int = MAX_STOPS) -> list[dict]:
    """정지점을 찾아 `{at, hex}` 목록으로 낸다.

    `judge()` 가 그라데이션이라고 이미 정한 뒤에만 부른다 — 그 판단은 LAB 격자에서
    단조·직교평평(`_gradient_ok`)으로 실물 배경/사진 1500장을 걸러 맞춘 것이라
    여기서 다시 사진인지 재판정하지 않는다. `max_stops` 를 다 쓰고도 sRGB 잔차가
    남을 수 있다 — 실물 그라데이션은 두 직선이 아니라 완만한 곡선(이징)으로 만들어질
    때가 있어서다(실측: DHqCBQnRAjW 1번 장 배경, 4개를 다 써도 최대 잔차 22 ΔE).
    그래도 그 잔차를 근거로 사진으로 되돌리지 않는다 — 되돌리면 이 실물 배경도
    잘못 사진이 된다. `max_stops` 는 그저 정지점 개수의 상한이다.
    """
    pts = _curve(lab_cells, valid, axis)
    if len(pts) < 2:
        return []
    kept = _simplify(pts, BEND_DE, max_stops)
    return [{"at": round(float(pts[i][0]), 3), "hex": _rgb_to_hex(pts[i][1])} for i in kept]


def _has_dup_stops(stop_list: list[dict], tol: float | None = None) -> bool:
    """이어지는 정지점 둘의 색이 sRGB 로 사실상 같으면 True 다.

    **이것만으로 사진이라 단정하지 않는다** — judge() 는 이 신호를 방아쇠로만
    쓰고, 실제 판정은 잘게 썬 격자의 재구성 오차로 한다(`_fine_curve`·
    `_recon_error`, 아래). 겹치는 정지점이 켜졌다고 바로 사진 처리하면 흰 50%→
    #333 처럼 **평평한 구간이 있는 흔한 그라데이션**까지 죽는다 — 12,250 크롭
    스윕에서 이 방아쇠는 51개에서 켜지는데, 그중 **13개**만 되돌려그리면 멀쩡하고
    나머지 38개는 아래 관문이 걸러야 할 단단한 경계다. 바로 사진 처리하던 재검토
    2차 판본은 그 13개를 죽였다. (재검토 4차 주석은 19개라고 적었다 — 관문이
    **제대로 거른** 단단한 경계 6개를 멀쩡한 그라데이션 쪽에 얹어 세어, 2차 판본의
    피해를 46% 부풀린 숫자였다. 같은 파일 DUP_RECON_DE 주석이 바로 그 6개를
    「거부」쪽에 두고 있었는데도 그랬다.)

    `tol` 을 기본 인자에 상수로 묶어 두면 임포트 시점 값이 박혀서 나중에
    `tint.DUP_STOP_RGB` 를 바꿔도 안 따라온다(재검토 3차 판본이 그랬다) —
    부를 때 읽는다.
    """
    tol = DUP_STOP_RGB if tol is None else tol
    for i in range(len(stop_list) - 1):
        c0 = _hex_to_rgb(stop_list[i]["hex"])
        c1 = _hex_to_rgb(stop_list[i + 1]["hex"])
        if float(np.linalg.norm(c0 - c1)) < tol:
            return True
    return False


def _fine_curve(img: np.ndarray, grid_mask: np.ndarray, axis: str, rows: int, cols: int) -> list:
    """같은 마스크를 `DUP_FINE` 배로 잘게 썰어 만든 축 곡선 — 채점 전용이다.

    정지점은 굵은 격자(16×12)에서 맞췄다. 그 채점을 **같은 굵은 격자**로 하면
    칸 하나보다 가는 것은 원리상 안 보인다(DUP_FINE 주석의 반반 계단 참고).
    맞춘 해상도보다 가는 자로 재야 놓친 게 드러난다. 비싸므로(칸 수가 16배)
    겹침 방아쇠가 켜졌을 때만 부른다.
    """
    lab_cells, valid = cells(img, grid_mask, rows * DUP_FINE, cols * DUP_FINE, NEED)
    return _curve(lab_cells, valid, axis)


def _recon_error(pts: list, stop_list: list[dict]) -> float:
    """이 정지점만으로 곡선을 다시 그리면(칸 사이 sRGB 선형보간) 실제 칸 색과
    최대 얼마나 벌어지는지. `_has_dup_stops` 가 방아쇠를 당겼을 때만 judge() 가
    부른다 — 평소엔 이 계산 없이 그냥 그라데이션으로 낸다."""
    if len(stop_list) < 2:
        return 0.0
    ats = [s["at"] for s in stop_list]
    rgbs = np.array([_hex_to_rgb(s["hex"]) for s in stop_list])
    worst = 0.0
    for t, v in pts:
        pred = np.array([np.interp(t, ats, rgbs[:, ch]) for ch in range(3)])
        worst = max(worst, float(np.linalg.norm(v - pred)))
    return worst


# ---------------------------------------------------------------- 최빈색

def dominant(img: np.ndarray, mask=None, bins: int = BINS) -> str:
    """마스크 안 픽셀의 최빈색. 평균이 아니라 최빈이라 두 색 섞인 면에서도 답이 또렷하다."""
    h, w = img.shape[:2]
    if mask is None:
        mask = np.ones((h, w), bool)
    px = img[mask].reshape(-1, 3)
    if len(px) == 0:
        return "#000000"
    step = max(256 // bins, 1)
    q = px.astype(np.int64) // step
    keys = q[:, 0] * 65536 + q[:, 1] * 256 + q[:, 2]
    vals, counts = np.unique(keys, return_counts=True)
    sel = keys == vals[counts.argmax()]
    r, g, b = px[sel].mean(axis=0).round().astype(int)
    return f"#{r:02X}{g:02X}{b:02X}"


def mean(img: np.ndarray, mask=None) -> str:
    """마스크 안 픽셀의 **평균색**.

    `dominant` 와 갈라 두는 까닭이 있다. 최빈색은 «가장 넓은 한 덩이» 라 도형처럼
    색이 몇 안 되는 면에 맞다. 사진은 반대다 — 최빈색이 하늘 한 조각처럼 튀는
    자리로 잡히면 그 위에 얹힌 흰 글자가 그대로 사라진다. 사진을 대신할 색은
    «눈이 뭉뚱그려 보는 밝기» 라야 해서 평균이 맞다.
    """
    h, w = img.shape[:2]
    if mask is None:
        mask = np.ones((h, w), bool)
    px = img[mask].reshape(-1, 3)
    if len(px) == 0:
        return "#000000"
    r, g, b = px.mean(axis=0).round().astype(int)
    return f"#{r:02X}{g:02X}{b:02X}"


# ---------------------------------------------------------------- 판정

def judge(img: np.ndarray, mask, small: bool = False) -> dict:
    """단색·그라데이션·사진을 가른다.

    순서: ① 유효 칸 4개 미만 → 단색. ② 칸들이 전체 평균에서 얼마나 흩어졌는지
    (아래 참고)가 작으면 → 단색. ③ 변화가 가장 큰 축을 골라, 그 축으로 단조이고
    직교로 평평하면 그라데이션. ④ 아니면 사진.

    ②는 원래 "칸 사이 최대 색차"(모든 칸 쌍 중 최댓값)로 쟀는데, 오염된 칸
    **하나**가 최댓값을 통째로 끌어올려 단색을 그냥 지나쳐 버렸다(실측:
    DHqCBQnRAjW 2·4·5번 장의 크림 배경 — 격자 대부분은 거의 한 색인데 마스크
    경계 칸 하나가 5~6 ΔE 튀어서 사진으로 잘못 넘어갔다). **90 백분위수**로
    바꾸면 칸의 10%까지는 이상치라도 무시한다 — 크림 배경(90분위 0.09~0.16)과
    사진 격자·잡음(90분위 4.08 이상)은 여전히 크게 벌어져 있어 SOLID_DE=3.0을
    그대로 쓸 수 있다.

    **`SOLID_DE` 가 재는 것이 바뀌었다는 점을 밝혀 둔다**: "칸 사이 최대"였을 때는
    `SOLID_DE=3` 이 곧 전체 색 폭(span) 3 이었다. "90분위 편차"로 바꾸면서 폭이
    조금 넓어졌다 — 편차 90분위가 3 이면 폭은 그보다 커질 수 있다(실측: 흰(255)→
    거의흰(239) 램프, 폭 5.37 인데 이제 "단색"으로 나온다). 여기서는 무해하다
    (실물 배경들의 폭은 이보다 훨씬 크거나 작아서 여유가 있다 — 1번 장 그라데이션
    폭 74.4, 2~7번 장 크림 배경 폭은 사실상 0) 그러나 "SOLID_DE=3.0 을 그대로
    쓸 수 있다"는 말은 "폭 3짜리까지만 단색으로 본다"는 뜻이 더는 아니다.

    **`cover` 는 깎은(erode) 격자 기준이다**: `small=False` 일 때 마스크를
    `MASK_ERODE`px 안쪽으로 깎고 그 위에서 유효 칸을 센다(아래). 그래서 `cover`
    는 원래 마스크보다 살짝(대략 그 픽셀 폭만큼) 적게 잡힌다 — 라벨 박스 자체가
    가려짐 없이 꽉 차 있어도 `cover` 가 정확히 1.0 은 안 나올 수 있다는 뜻이다.
    (다만 `cv2.erode` 는 그림 가장자리를 `+inf`로 취급해 거기서는 안 깎는다 —
    마스크가 그림 경계에 닿아 있으면 그 변만큼은 이 손실이 없다.)

    **함정**: 유효 칸이 4개 미만이면(①) 자신 있게 잰 게 아니라 잴 게 거의 없어서인데도
    그냥 "단색"을 돌려준다 — `cover` 가 0에 가까워도 마찬가지다. 호출하는 쪽이
    `cells`(유효 칸 수)를 같이 보고 신뢰할지 정해야 한다 — 그러라고 모든 갈래가
    `cells` 를 같이 돌려준다(`merge_labeled._mark()` 가 그렇게 쓴다).
    """
    h, w = img.shape[:2]
    if mask is None:
        mask = np.ones((h, w), bool)
    rows, cols = (SMALL_ROWS, SMALL_COLS) if small else (GRID_ROWS, GRID_COLS)
    # 작은 네모(칩·버튼)에서는 몇 픽셀이 전체를 좌우해서 깎지 않는다.
    grid_mask = mask if small else _erode(mask, MASK_ERODE)
    lab_cells, valid = cells(img, grid_mask, rows, cols, NEED)
    cover = round(float(valid.sum()) / (rows * cols), 3)
    # `cells` 는 `cover` 와 달리 격자 크기를 몰라도 읽히는 **날것의 근거**다.
    # 부르는 쪽이 아래 "함정"(칸 4개 미만이면 재지 않고 단색을 돌려준다)을
    # 가리려면 이 수가 필요하다 — `cover` 에서 되돌리려면 어느 격자로 쟀는지를
    # 알아야 하는데, 그건 부르는 쪽이 `small` 을 바꾸는 순간 조용히 어긋난다.
    n_cells = int(valid.sum())

    if n_cells < 4:
        return {"kind": "단색", "hex": dominant(img, mask, BINS), "cover": cover, "cells": n_cells}

    vlabs = lab_cells[valid]
    grand = vlabs.mean(axis=0)
    dev = np.linalg.norm(vlabs - grand, axis=1)
    if float(np.percentile(dev, 90)) < SOLID_DE:
        return {"kind": "단색", "hex": dominant(img, mask, BINS), "cover": cover, "cells": n_cells}

    axis = axis_of(lab_cells, valid)
    if axis is not None and _gradient_ok(lab_cells, valid, axis):
        b = _buckets(lab_cells, valid, axis)
        if float(np.linalg.norm(b[-1][1] - b[0][1])) < SOLID_DE:
            return {"kind": "단색", "hex": dominant(img, mask, BINS), "cover": cover, "cells": n_cells}
        st = stops(lab_cells, valid, axis, MAX_STOPS)
        # 겹치는 정지점은 방아쇠일 뿐이다 — 흰 50%→#333 처럼 평평한 구간이 있는
        # 그라데이션도 겹친 정지점을 낸다. 진짜 계단인지는 재구성 오차로 가르되,
        # **정지점을 맞춘 격자가 아니라 잘게 썬 격자에서** 잰다 — 같은 격자로 재면
        # 격자에 맞아떨어지는 계단이 오차 0.00 으로 통과한다(_fine_curve 주석 참고).
        if (not _has_dup_stops(st)
                or _recon_error(_fine_curve(img, grid_mask, axis, rows, cols), st) < DUP_RECON_DE):
            return {"kind": "그라데이션", "dir": axis, "stops": st, "cover": cover, "cells": n_cells}

    return {"kind": "사진", "cover": cover, "cells": n_cells}
