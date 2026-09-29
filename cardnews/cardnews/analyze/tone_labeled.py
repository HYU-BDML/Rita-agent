# analyze/tone_labeled.py
"""말투 여섯 축 — 넷은 정규식, 셋은 모델 한 호출.

**왜 넷을 정규식으로 가르나:** 어미·격식·인칭·물음표 제목은 규칙이 명확하다.
정규식이 모델보다 더 정확하고 공짜고 항상 같은 답을 준다.

**왜 셋은 모델로 가르나:** 재미·정중·열정은 규칙으로 안 잡힌다. 역할도
앞뒤 장과의 관계로 정해야 한다("같은 틀이 3번 반복되면 그 셋은 사례"). 글만
보면 되므로(그림은 안 준다) 값싼 텍스트 모델로 충분하고, 이미 게시물당 한
번 부르니 세 축을 그 호출에 얹으면 값이 안 는다 — 두 번 부르면 값이 두
배가 되고 답도 서로 어긋날 수 있다.

**"아니다" 함정:** 종결 어미가 "니다"로 끝난다고 다 합니다체가 아니다 —
"아니다"는 반말이다. 진짜 합니다체(됩니다·했습니다)는 "니다" 바로 앞
글자가 ㅂ 받침으로 끝난다(됩·습 모두 ㅂ 받침) — "아니다"의 "니" 앞은
받침 없는 "아"다. 그래서 문자열 접미사 대신 한글 음절의 종성(jongseong)을
직접 갈라 본다.
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config

_LEVELS = ["낮음", "중간", "높음"]

# ---------------------------------------------------------------- 어미

_JONGSEONG_BIEUP = 17  # 28개 종성 목록에서 ㅂ 의 자리(0=받침 없음)


def _jongseong(ch: str) -> int | None:
    code = ord(ch) - 0xAC00
    if not (0 <= code <= 11171):   # 완성형 한글 음절 범위 밖(자음·모음 낱자·기타 문자)
        return None
    return code % 28


def _last_clause(text: str) -> str:
    """마침표·느낌표·물음표로 문장을 가른 뒤 마지막 문장만 쓴다."""
    parts = [p.strip() for p in re.split(r"[.!?]+", text) if p.strip()]
    return parts[-1] if parts else ""


def _hapsyo(clause: str) -> bool:
    """"...니다"/"...니까" 바로 앞 음절이 ㅂ받침인지 — 진짜 합니다체(됩니다·
    했습니다)와 그 물음꼴(습니까)인지를 가른다. "아니다"의 "니" 앞은 받침
    없는 "아"라 여기서 걸러진다."""
    return (len(clause) >= 3 and clause[-2] == "니"
            and _jongseong(clause[-3]) == _JONGSEONG_BIEUP)


def ending_of(text: str) -> str:
    """마지막 문장의 종결 어미로 합니다체·해요체·반말·명사형을 가른다.

    `_last_clause()` 가 마침표·느낌표·**물음표**로 문장을 가르면서 그 문장부호
    자체를 지워버린다 — "될까?" 의 "?" 가 사라진 채로 어미를 본다는 뜻이다.
    물음표 제목은 흔하므로("왜 잘 될까?") 이걸 그냥 두면 물음꼴 문장이 전부
    "명사형"으로 새 나간다. 남은 비한글 꼬리(이모지 등, `ruler/text.py` 의
    EMOJI_RE 가 세는 것과 같은 것들)도 마저 벗겨내고, "까" 로 끝나는 물음꼴도
    "다" 와 같은 방식(ㅂ받침 검사)으로 합니다체/반말을 가른다.
    """
    clause = re.sub(r"[^가-힣]+$", "", _last_clause(text))
    if not clause:
        return "없음"
    last = clause[-1]
    if last in ("다", "까") and _hapsyo(clause):
        return "합니다체"
    if last in ("요", "죠"):
        return "해요체"
    if last in ("다", "냐", "자", "야", "까"):
        return "반말"
    return "명사형"


# ---------------------------------------------------------------- 격식

# 브리프가 꼽은 캐주얼 문장부호는 !·~·ㅋ 세 개다. 홑개는 격식 있는 문장에도
# 흔히 붙는다("확인하세요!") — 겹쳐 써야("~~"·"!!") 편안함의 신호로 본다.
# ㅋ 는 겹칠 것도 없이(한 글자만 있어도 캐주얼 표식이라) 그대로 둔다.
_CASUAL_RE = re.compile(r"ㅋ|~~|!!")


def formality_of(text: str) -> str:
    if not text.strip():
        return "중간"
    if _CASUAL_RE.search(text):
        return "편안"
    end = ending_of(text)
    if end == "합니다체":
        return "격식"
    if end == "반말":
        return "편안"
    return "중간"   # 해요체·명사형·없음


# ---------------------------------------------------------------- 인칭

# 낱말이 이 대명사 + 흔한 조사로 끝나야 진짜 그 인칭이다 — 아니면 "너무"가
# "너"로, "우리나라"가 "우리"로 잘못 걸린다.
_PARTICLES = ("", "가", "이", "는", "은", "도", "를", "을", "의", "와", "과",
              "야", "여", "랑", "한테", "에게", "께", "들")


def _has_word(text: str, word: str) -> bool:
    for tok in re.split(r"\s+", text):
        tok = tok.strip(".,!?~…\"'()")
        if tok.startswith(word) and tok[len(word):] in _PARTICLES:
            return True
    return False


def person_of(text: str) -> str:
    if _has_word(text, "여러분"):
        return "여러분"
    if _has_word(text, "우리"):
        return "우리"
    if _has_word(text, "너"):
        return "너"
    return "생략"


# ---------------------------------------------------------------- 물음표 제목

def question_title(text: str) -> bool:
    return text.rstrip().endswith(("?", "？"))


# ------------------------------------------------- 모델 (역할·훅·재미·정중·열정)

def _fallback(n: int) -> dict:
    """호출이 실패했을 때. 이 갈래만 미정이고 나머지 계량은 다 나온다."""
    return {
        "post_type": "미정",
        "hook_strategy": "미정",
        "slides": [
            {"index": i + 1, "role": "미정", "humor": "미정", "respect": "미정", "enthusiasm": "미정"}
            for i in range(n)
        ],
    }


# 말투를 판정하라고 거는 말. **대본을 쓰는 것과 같은 모델(Bedrock)** 을 쓴다.
_말투시스템 = ("너는 카드뉴스 편집자다. 글만 보고 각 장이 흐름에서 맡은 역할과 "
            "말투를 판단한다. JSON 하나만 출력한다 — 다른 설명은 붙이지 마라.")


def _벗기기(글: str) -> str:
    """모델이 ```json 으로 감싸 보내는 일이 흔하다. 중괄호 사이만 남긴다."""
    글 = (글 or "").strip()
    처음, 끝 = 글.find("{"), 글.rfind("}")
    return 글[처음:끝 + 1] if 처음 >= 0 and 끝 > 처음 else 글


# **다시 해도 달라지지 않는 탈.** 사람이 설정을 고쳐야 풀린다 — 열쇠가 없거나,
# 틀렸거나, 잔액이 없거나, 막혔거나. 이런 것에 「미정」으로 물러서면 못 쓰는 틀이
# 성공처럼 창고에 쌓인다(실물 2026-09-19).
# `thinking_overflow` 도 여기 있다 — `대본짓기` 가 **여유를 늘려 가며 세 번**
# 걸어 본 뒤에야 이 탈을 내놓는다. 거기까지 갔으면 다시 해도 같다.
못고칠탈 = {"no_api_key", "401", "402", "403", "thinking_overflow"}


def ask(pid: str, texts: list[str]) -> dict:
    """게시물 하나의 장별 글로 역할·훅과 재미·정중·열정을 받는다.

    **대본과 같은 모델을 쓴다**(`대본짓기.부르기`). 2026-08-27 에 딥시크에서
    Bedrock 으로 옮겼다가, 2026-09-19 에 사람 지시로 다시 딥시크로 왔다.
    어느 쪽이든 **대본과 한 벌**인 것이 요점이다 — 까닭 셋 —

    1. 대본을 이미 Bedrock 이 쓴다. 열쇠가 하나 줄고 남의 서버 하나가 빠진다.
    2. 재시도·마감 규칙이 `대본짓기` 에 이미 있고 시험까지 되어 있다.
    3. **말투가 곁다리가 아니게 됐다.** 사람이 「디자인·말투」 둘로 고르게
       할 참이라, 이게 실패하면 조용히 넘어가면 안 되는 자리가 됐다.

    옮기게 된 계기는 실물 탈이다 — 딥시크가 여덟 장짜리 요청에 **빈 답**을
       줘서 역할이 전부 「미정」이 됐고, 그 틀로는 카드를 한 장도 못 만들었다.

    그림은 주지 않는다 — 이 축들은 글만으로 판단한다.
    """
    if not texts:
        return _fallback(0)

    slides_txt = "\n".join(f"{i + 1}번 장: {t or '(글 없음)'}" for i, t in enumerate(texts))
    prompt = (
        "아래는 인스타그램 카드뉴스 한 게시물의 장별 글이다. 게시물 전체 성격과 "
        "각 장이 흐름에서 맡은 역할, 그 장 말투의 재미·정중·열정을 판단해라.\n\n"
        f"{slides_txt}\n\n"
        f"role 은 다음 중 하나로: {', '.join(config.ROLES)}\n"
        f"hook_strategy 는 1번 장이 훅일 때 그 훅이 쓰는 수법(다음 중 하나): "
        f"{', '.join(config.HOOKS)}\n"
        f"humor·respect·enthusiasm(재미·정중·열정)은 각 장마다 다음 중 하나: "
        f"{', '.join(_LEVELS)}\n\n"
        "**장 수만큼 정확히** slides 를 내라. JSON 으로만 답해라:\n"
        '{"post_type": "...", "hook_strategy": "...", "slides": '
        '[{"index": 1, "role": "...", "humor": "...", "respect": "...", "enthusiasm": "..."}]}'
    )
    try:
        import 대본짓기  # noqa: PLC0415 — boto3 를 여기서만 끌어온다

        # 장마다 다섯 칸이라 넉넉히 준다. 모자라면 답이 중간에 끊겨 JSON 이
        # 깨지는데, 그게 바로 딥시크에서 났던 «빈 답» 탈이다.
        글 = 대본짓기.부르기(_말투시스템, prompt,
                        최대토큰=max(1000, 220 * len(texts)))
        d = json.loads(_벗기기(글))
        if not isinstance(d, dict) or not isinstance(d.get("slides"), list):
            raise ValueError("slides 목록이 없다")
        # **장 수가 어긋나도 다 버리지 않는다.** 예전엔 여기서 던지고 전부
        # 「미정」으로 돌아갔다 — 그러면 틀의 골격이 통째로 미정이 되어 그
        # 틀로는 카드를 한 장도 못 만든다(실물 2026-08-27, 키키 8장).
        if len(d["slides"]) != len(texts):
            print(f"!! 말투: 장이 {len(texts)}개인데 {len(d['slides'])}개가 왔다 "
                  f"— 온 만큼만 쓴다")
            빈것 = _fallback(len(texts))["slides"]
            받은것 = list(d["slides"])[:len(texts)]
            d["slides"] = 받은것 + 빈것[len(받은것):]
        return d
    except Exception as e:  # noqa: BLE001 — 갈래를 나눠 처리한다(아래)
        # **다시 해서 달라질 탈만 삼킨다.**
        #
        # 실물 2026-09-19: 대본 모델을 딥시크로 옮기면서 람다에 열쇠를 안 실었다.
        # 그 실패까지 여기서 삼키는 바람에 **골격 여덟 장이 전부 「미정」인 틀**을
        # 만들고도 `ok: true` 를 냈다. 사람이 값을 직접 안 봤으면 나머지 아홉 벌도
        # 같은 꼴이 될 뻔했다.
        #
        # 가르는 잣대는 **「다시 해서 달라질 수 있나」** 다. 열쇠가 없거나 틀렸거나
        # 잔액이 없는 것은 열 번 해도 열 번 같다 — 그때는 **분석을 실패시킨다.**
        # 못 쓰는 틀을 성공이라 내놓는 것보다, 안 만들고 왜인지 말하는 편이 낫다.
        print(f"!! 말투 판정 실패 — {type(e).__name__}: {str(e)[:200]}")
        if getattr(e, "코드", "") in 못고칠탈:
            print("!! 이건 다시 해도 같다 — 분석을 세운다. 설정을 고쳐라.")
            raise
        return _fallback(len(texts))
