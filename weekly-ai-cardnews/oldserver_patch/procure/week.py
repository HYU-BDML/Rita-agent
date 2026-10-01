# -*- coding: utf-8 -*-
"""한 주치 소식을 브랜드별로 긁어 온다 — 워크플로우의 첫 걸음.

주차 하나만 주면 명단 일곱을 한 바퀴 돌아 «그 주에 무슨 일이 있었나» 를 돌려준다.
**고르는 일은 여기서 안 한다.** 후보만 추려 보내고 어느 게 그 브랜드의 소식인지는
Dify 코드 노드가 판정한다 — `procure_api.py` 와 같은 분업선이다.

**왜 서버가 하나.** Dify 코드 노드는 문자열 40만 자가 한도인데 받아올 것이 그보다
크다. 게다가 X 는 Apify 키가 필요하고 블로그는 곳마다 방식이 다르다.

**주차 라벨은 규칙으로 안 나온다 — 되짚지 마라.** 원본 19편의 게시일과 라벨을 대보면
어떤 규칙도 다 안 맞는다(제일 잘 맞는 것도 12/19). 게시 요일이 월·화·수·토·일로 제각각이고,
늦게 올린 편은 지난 주 이름을 달았다. 심지어 7/27 주를 «7월 4주차» 로 냈다가 그 다음
편을 «7월 5주차» 로 또 냈다. **사람이 그때그때 붙인 이름이다.**

그래서 여기서는 **우리 규칙을 정해 쓴다** — 그 달 **첫 월요일**이 1주차이고, 한 주는
월요일에 시작해 일요일에 끝난다(19편 중 12편이 이 규칙과 맞아 제일 잘 들어맞았다).
라벨은 표지 2행에 그대로 들어가는 «이름» 이고, 실제로 긁는 구간은 이 규칙이 정한다.

**규칙이 마음에 안 들면 날짜를 직접 주면 된다** — `긁기(start, end)` 가 먼저다.

    from week import 주차, 긁기
    긁기(*주차("8월 2주차", 2026))          # 2026-08-10 ~ 2026-08-16
    긁기("2026-08-10", "2026-08-16")       # 날짜를 직접
"""
import re
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

# 2026-08-19 확정 명단 일곱. 브랜드 -> (X 계정, 블로그 발행처 또는 None)
# **계정이 하나면 놓치는 게 많다.** 2026-08-20 확인: Claude 는 `@AnthropicAI` 만 보면
# 그 주 글이 3건인데 `@claudeai` 를 더하면 영상이 나온다. OpenAI 도 `@OpenAIDevs` 에
# 영상 4개가 더 있었다. 계정 하나 긁는 데 $0.0037 뿐이라 늘리는 게 싸다.
#
# **빼기로 한 것** — 실제로 긁어 보고 정했다(2026-08-20):
#   `@grok`     글 120건인데 전부 사용자 답글이다. 소식이 아니라 잡음이다
#   `@CursorHQ` 0건. `@cursor_ai` 가 맞는 계정이다
#   `@Meta`     0건
#
# **스레드가 영상 창고다.** 2026-08-20 에 11계정을 $0.055 로 긁어 보고 알았다 —
# X 로는 영상을 한 장도 못 건지던 `@claudeai` 에 영상 11개, `@grok` 에 4개가 있었다.
# 값이 계정당 $0.005 라 다섯을 다 넣어도 주당 $0.025 다.
#   빈 계정(글 0건) — @googledeepmind · @xai · @perplexity.ai · @cursor_ai
#   @anthropic 은 팔로워 14명짜리 사칭이다. 진짜는 @claudeai (40만)
#
# 칸: (브랜드, X 계정 여럿, 블로그 발행처|None, 유튜브 채널|None, 스레드 계정|None)
명단 = [
    ("ChatGPT",    ["@OpenAI", "@OpenAIDevs"],        "OpenAI",    "@OpenAI",          "openai"),
    ("Claude",     ["@AnthropicAI", "@claudeai"],     "Anthropic", "@anthropic-ai",    "claudeai"),
    ("Gemini",     ["@GeminiApp", "@GoogleDeepMind"], "Google",    "@GoogleDeepMind",  "google"),
    # **Grok 은 뺐다 (2026-10-01 사용자 «그록은 그럼 빼자»).** X 액터가 `@xai` 에서 글 대신
    # 요금 안내문 15줄만 줘서 매주 «X 계정을 못 읽음» 으로 빠졌고, 블로그·스레드도 그 주 0건이었다.
    # (`@grok` 은 분당 85건씩 사용자 답글이라 발표 글이 안 잡힌다 — 실측 2026-08-20)
    ("Cursor",     ["@cursor_ai"],                    "Cursor",    "@cursor_ai",       None),
    ("Perplexity", ["@perplexity_ai"],                None,        None,               None),
    ("Meta AI",    ["@AIatMeta"],                     None,        "@AIatMeta",        "aiatmeta"),
    # 2026-08-21 추가. 얼굴은 젠슨 황 — 위키미디어에 645x839 퍼블릭 도메인이 있다.
    # **실제로 긁어 보고 넣었다** (8월 2주차 기준):
    #   X @nvidia    21건    X @NVIDIAAI  60건 — 둘 다 전부 «소식» 이다
    #   스레드 @nvidia 4건    (@google 3건 · @aiatmeta 2건과 비슷한 수준)
    # @NVIDIAAI 가 훨씬 알차다. 둘 다 두는 게 맞다.
    ("NVIDIA",     ["@nvidia", "@NVIDIAAI"],          "NVIDIA",    "@NVIDIA",          "nvidia"),
]

TEXT_MAX = 400    # 글 한 편에서 이만큼만. 고유명사는 앞쪽에 나온다
BLOG_MAX = 40     # 블로그 후보 상한
YT_MAX = 8        # 유튜브 채널에서 최근 몇 개까지 볼까


def 주차(라벨: str, 해: int = None) -> tuple:
    """«8월 2주차» -> ('2026-08-10', '2026-08-16', '2026-08-17', '8월 2주차').

    그 달 **첫 월요일**이 1주차의 시작이다. **원본 계정을 되짚은 게 아니라 우리가
    정한 규칙이다** — 위 머리말을 보라. 넷째 값은 표지 2행에 그대로 들어가는 이름이고,
    셋째 값은 그 주 다음 월요일(참고용 게시일)이다.
    """
    m = re.search(r"(\d+)\s*월\s*(\d+)\s*주", 라벨)
    if not m:
        raise ValueError(f"주차를 못 읽었다: {라벨!r} — «8월 2주차» 꼴이어야 한다")
    달, 주 = int(m.group(1)), int(m.group(2))
    # **글자로 와도 받는다.** Dify 의 입력 칸은 텍스트라 `"2026"` 으로 온다.
    # 그냥 넘기면 `date("2026", 8, 1)` 에서 TypeError 로 죽는다(실측 2026-08-19).
    해 = int(str(해).strip()) if str(해 or "").strip().isdigit() else date.today().year
    첫날 = date(해, 달, 1)
    첫월요일 = 첫날 + timedelta(days=(7 - 첫날.weekday()) % 7)
    시작 = 첫월요일 + timedelta(weeks=주 - 1)
    끝 = 시작 + timedelta(days=6)
    return (시작.isoformat(), 끝.isoformat(),
            (끝 + timedelta(days=1)).isoformat(), f"{달}월 {주}주차")


def _그주(것들: list, start: str, end: str) -> list:
    """날짜가 있는 것만, 그 주 안에 있는 것만. 날짜가 없으면 버리지 않고 남긴다."""
    난것 = []
    for c in 것들:
        d = (c.get("date") or "").strip()
        if d and not (start <= d <= end):
            continue
        난것.append(c)
    return 난것


def _자르기(c: dict, 블로그: bool = False) -> dict:
    작은것 = {"text": (c.get("text") or "")[:TEXT_MAX],
             "url": c.get("url") or "",
             "date": c.get("date") or "",
             "media": c.get("media") or []}
    if not 블로그:
        # 고르는 규칙이 «반응 수 1등» 이라 이 넷이 있어야 판정이 된다
        for k in ("likes", "retweets", "replies", "views"):
            작은것[k] = c.get(k) or 0
    return 작은것


def 긁기(start: str, end: str, 게시일: str = "", 라벨: str = "",
        브랜드들: list = None, x: bool = True, 블로그: bool = True,
        스레드: bool = True) -> dict:
    """명단을 한 바퀴 돈다. 한 곳이 실패해도 나머지는 그대로 돌려준다."""
    고를것 = set(브랜드들 or [])
    난것 = {"week": {"start": start, "end": end, "게시일": 게시일, "라벨": 라벨},
           "브랜드": [], "탈": []}

    # **병렬로 긁는다.** 하나씩 차례로 하면 계정 하나에 25초라, 계정을 아홉으로
    # 늘리면 225초가 되어 Lambda 제한(300초)에 닿는다(실측 2026-08-20: 7계정
    # 순차가 175초였다). 서로 기다릴 이유가 없는 일이라 한꺼번에 던진다.
    from concurrent.futures import ThreadPoolExecutor

    # **스레드는 한 번만 부른다.** 액터가 계정 배열을 받고 «프로필 하나» 를 한 건으로
    # 셈한다 — 따로따로 부르면 실행 수만 늘고 값은 똑같다. 브랜드 고리 밖에서
    # 미리 받아 두고 아래에서 나눠 준다.
    스레드것 = {}
    스레드탈 = []
    쓸것 = [줄 for 줄 in 명단 if not 고를것 or 줄[0] in 고를것]
    스레드계정 = [줄[4] for 줄 in 쓸것 if len(줄) > 4 and 줄[4]]
    if 스레드 and 스레드계정:
        try:
            import threads as 스모듈
            스레드것 = 스모듈.글들(스레드계정, verbose=False)
        except Exception as e:
            스레드탈.append("스레드: %s: %s" % (type(e).__name__, e))

    def 한브랜드(줄):
        브랜드, 계정들, 발행처, 채널 = 줄[:4]
        스계정 = 줄[4] if len(줄) > 4 else None
        한칸 = {"brand": 브랜드, "x계정": ", ".join(계정들), "블로그": 발행처,
               "x": [], "blog": [], "youtube": [], "threads": []}
        탈 = []
        for 계정 in (계정들 if x else []):
            try:
                import x as x모듈
                글들 = x모듈.timeline(계정, start, end, verbose=False)
                한칸["x"] += [_자르기(t) for t in _그주(글들, start, end)]
            except Exception as e:
                탈.append(f"{브랜드} X({계정}): {type(e).__name__}: {e}")
        if 블로그 and 발행처:
            try:
                import blog
                것들 = blog.posts(발행처, limit=BLOG_MAX)
                한칸["blog"] = [_자르기(c, True) for c in _그주(것들, start, end)]
            except Exception as e:
                탈.append(f"{브랜드} 블로그: {type(e).__name__}: {e}")
        if 채널:
            # **유튜브 목록은 공짜다** — 채널 페이지를 읽을 뿐이다. 다만 날짜가
            # «3주 전» 꼴이라 그 주인지 못 가린다. 그래서 최근 몇 개만 담고,
            # 고르는 쪽이 «내용이 겹치나» 를 보고 쓴다. 받아 오는 건 돈이 든다.
            try:
                import youtube
                한칸["youtube"] = youtube.videos(
                    f"https://www.youtube.com/{채널}/videos", limit=YT_MAX)
            except Exception as e:
                탈.append(f"{브랜드} 유튜브: {type(e).__name__}: {e}")
        if 스계정:
            한칸["threads"] = _그주(스레드것.get(스계정) or [], start, end)
        return 한칸, 탈

    with ThreadPoolExecutor(max_workers=8) as 풀:
        for 한칸, 탈 in 풀.map(한브랜드, 쓸것):
            난것["브랜드"].append(한칸)
            난것["탈"] += 탈

    난것["탈"] += 스레드탈
    난것["count"] = {"x": sum(len(b["x"]) for b in 난것["브랜드"]),
                    "blog": sum(len(b["blog"]) for b in 난것["브랜드"]),
                    "youtube": sum(len(b.get("youtube") or []) for b in 난것["브랜드"]),
                    "threads": sum(len(b.get("threads") or []) for b in 난것["브랜드"])}

    # **긁기로 해놓고 한 건도 못 긁었으면 죽는다.**
    #
    # 예전엔 브랜드마다의 실패를 «탈» 목록에 담고 200 으로 돌려줬다. 그랬더니
    # 서버에서 Apify 열쇠를 못 읽어 X 7계정이 «전부» 실패했는데도 판이 끝까지
    # 돌아서 **마무리 한 장짜리 결과가 「성공」으로 나왔다**(실측 2026-08-20).
    #
    # **명확한 실패보다 나쁜 것이 «실패했는데 성공으로 뜨는 것» 이다.**
    # 한두 곳이 빠지는 건 정상이지만(그 주에 글이 없을 수 있다), **전부 실패는
    # 사고다.** 사고는 여기서 멈춘다.
    if x and 난것["count"]["x"] == 0:
        raise RuntimeError(
            "X 를 한 건도 못 긁었다 — 그 주에 글이 없는 게 아니라 긁기가 실패한 것이다. "
            + (" / ".join(난것["탈"][:4]) or "이유가 안 남았다"))
    return 난것


if __name__ == "__main__":
    import json
    라벨 = sys.argv[1] if len(sys.argv) > 1 else "8월 2주차"
    s, e, 게시, L = 주차(라벨, 2026)
    print(f"{L}: {s} ~ {e} (게시 {게시})")
    쓸것 = sys.argv[2:] or None
    난것 = 긁기(s, e, 게시, L, 브랜드들=쓸것, x=("--블로그만" not in sys.argv))
    for b in 난것["브랜드"]:
        print(f"  {b['brand']:11s} X {len(b['x']):3d}건 · 블로그 {len(b['blog']):3d}건"
              f" · 스레드 {len(b.get('threads') or []):2d}건")
    for t in 난것["탈"]:
        print(f"  ! {t}")
    Path("week.json").write_text(json.dumps(난것, ensure_ascii=False, indent=1), encoding="utf-8")
    print("→ week.json")
