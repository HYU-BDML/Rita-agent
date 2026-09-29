# -*- coding: utf-8 -*-
"""작업대의 판 쌓기와 설계도 검사.

**창고를 직접 안 부른다.** `읽기(key)`·`쓰기(key, data, ctype)` 두 가지만 하는
물건을 받아 쓴다 — 그래야 S3 없이 시험을 돌릴 수 있다(`test_edit_store.py` 는
dict 를 넣는다).

키 규칙:
    edit/{id}/{판}.json   판마다의 설계도
    edit/{id}/index.json  판 목록

**0판은 덮어쓰지 않는다.** Dify 가 처음 만든 것이고, 「처음으로 되돌리기」가
언제나 가능해야 한다.
"""
import json
import re

정렬들 = ("왼쪽", "가운데", "오른쪽")
색꼴 = re.compile(r"^#[0-9A-Fa-f]{6}$")
캔버스 = (1080, 1350)

# 영상 주소는 우리 창고의 photos/ 만 받는다 — 굽는 쪽이 아무 주소나 내려받지 않게.
영상주소꼴 = re.compile(r"^https://[a-z0-9.-]+\.s3\.[a-z0-9-]+\.amazonaws\.com/photos/[A-Za-z0-9_.-]+\.mp4$")


def 설계도키(edit_id: str, 판: int) -> str:
    return f"edit/{edit_id}/{판}.json"


def 목록키(edit_id: str) -> str:
    return f"edit/{edit_id}/index.json"


# ---------------------------------------------------------------- 검사

# 굽는 쪽(`cardnews_compose._draw_background`)이 아는 배경 종류 — 색으로 적을 수
# 없는 둘. **저쪽을 넓히면 여기도 넓혀야 한다.**
배경종류 = ("사진", "미측정")


def _네모탈(어디: str, box) -> list:
    if not isinstance(box, (list, tuple)) or len(box) != 4:
        return [f"{어디}: 네모가 숫자 넷이 아니다 — {box!r}"]
    if any(not isinstance(v, (int, float)) for v in box):
        return [f"{어디}: 네모에 숫자가 아닌 것이 있다 — {box!r}"]
    x0, y0, x1, y1 = box
    if x1 <= x0 or y1 <= y0:
        return [f"{어디}: 네모가 뒤집혔다 — {box!r}"]
    return []


# 굽는 쪽(`cardnews_compose.글머리갈래`)이 그릴 줄 아는 것과 같아야 한다.
글머리갈래 = ("원", "네모", "줄표", "번호")


def _각도탈(어디: str, r: dict) -> list:
    각 = r.get("각도")
    if 각 is None:
        return []          # 옛 설계도에는 이 칸이 없다 — 0 으로 친다
    if isinstance(각, bool) or not isinstance(각, (int, float)):
        return [f"{어디}: 각도가 숫자가 아니다 — {각!r}"]
    if not (-360 <= 각 <= 360):
        return [f"{어디}: 각도가 한 바퀴를 넘는다 — {각!r}"]
    return []


def 설계도_탈(cards, 영상접두=None) -> list:
    """설계도가 굽기에 안전한가. 문제 목록을 준다 — 빈 목록이면 통과.

    **화면 밖으로 나간 것은 탈이 아니다.** 일부러 걸치는 디자인이 있다
    (실측 1장 인물이 그렇다). 여기서 막는 것은 «구울 수 없는» 것뿐이다.

    `영상접두` 를 주면 영상 주소가 **그 주소로 시작하는지도** 본다. 꼴만 보면
    `https://남의통.s3.ap-northeast-2.amazonaws.com/photos/x.mp4` 도 통과한다 —
    우리 통 이름을 아는 것은 부르는 쪽(`app.py`)뿐이라 거기서 받아 온다.
    """
    탈 = []
    if not isinstance(cards, list) or not cards:
        return ["설계도가 비었거나 목록이 아니다"]
    for i, c in enumerate(cards, start=1):
        if not isinstance(c, dict):
            탈.append(f"{i}번 장이 사전이 아니다")
            continue
        배경 = c.get("배경") or {}
        종류 = 배경.get("종류")
        # **굽는 쪽이 받는 것을 여기서도 받아야 한다.** 안 그러면 「구울 수는
        # 있는데 열 수는 없는」 카드가 생긴다 — 배경이 사진인 게시물의 틀이
        # 실제로 그랬다(2026-08-27, 작업대가 500).
        if 종류 == "단색" and not 색꼴.match(str(배경.get("hex", ""))):
            탈.append(f"{i}번 장 배경색이 #RRGGBB 가 아니다 — {배경.get('hex')!r}")
        elif 종류 == "그라데이션" and not str(배경.get("띠", "")).strip():
            탈.append(f"{i}번 장 그라데이션 띠가 비었다")
        elif 종류 in 배경종류:
            # 사진·미측정은 «색으로 못 적는 배경» 이다. 그 밑에 깔 바닥색만
            # 확인한다 — 있으면 꼴이 맞아야 하고, 없으면 굽는 쪽이 흰색을 쓴다.
            바닥 = 배경.get("hex")
            if 바닥 is not None and not 색꼴.match(str(바닥)):
                탈.append(f"{i}번 장 배경 바닥색이 #RRGGBB 가 아니다 — {바닥!r}")
        elif 종류 not in ("단색", "그라데이션"):
            탈.append(f"{i}번 장 배경 종류를 모른다 — {종류!r}")

        영상수 = 0
        for j, r in enumerate(c.get("장식영역") or [], start=1):
            어디 = f"{i}번 장 장식{j}"
            탈 += _네모탈(어디, r.get("box"))
            탈 += _각도탈(어디, r)
            탈 += _음영탈(어디, r)
            탈 += _선탈(어디, r)
            주소 = str(r.get("media_url") or "").strip()
            if 주소.lower().endswith(".mp4"):
                영상수 += 1
                if not 영상주소꼴.match(주소) or (영상접두 and not 주소.startswith(영상접두)):
                    탈.append(f"{어디}: 영상 주소가 우리 창고가 아니다")
                # 숫자가 아니면 _각도탈 이 이미 잡았다 — 여기서 float() 로 터지면 검사가 아니라 사고다.
                각도 = r.get("각도")
                if isinstance(각도, (int, float)) and not isinstance(각도, bool) and 각도:
                    탈.append(f"{어디}: 영상 자리는 못 돌린다 — 각도 {각도}")
        if 영상수 > 1:
            탈.append(f"{i}번 장에 영상이 둘이다 — 한 장에 하나")

        for j, r in enumerate(c.get("글자영역") or [], start=1):
            어디 = f"{i}번 장 글자{j}"
            탈 += _네모탈(어디, r.get("box"))
            pt = r.get("pt")
            if not isinstance(pt, (int, float)) or pt <= 0:
                탈.append(f"{어디}: 글자 크기가 0 이하다 — {pt!r}")
            if not 색꼴.match(str(r.get("글자색", ""))):
                탈.append(f"{어디}: 글자색이 #RRGGBB 가 아니다 — {r.get('글자색')!r}")
            if r.get("align") not in 정렬들:
                탈.append(f"{어디}: 모르는 정렬 — {r.get('align')!r}")
            # **글자 효과는 글자에 붙는다**(2026-09-28). 옛 모양은 여기서 바꿔 본다 —
            # 없는 줄을 가리키던 옛 효과는 막지 않고 버려진다(`글줄로`).
            if "글줄" not in r and not isinstance(r.get("lines"), list):
                탈.append(f"{어디}: 줄 목록이 없다")
            else:
                탈 += _글줄탈(어디, 글줄로(r))
            탈 += _각도탈(어디, r)
            탈 += _선탈(어디, r)
    return 탈


def _선탈(어디: str, r: dict) -> list:
    """테두리(둘레에 두르는 선). **없으면 통과** — 옛 설계도에는 이 키가 없다.

    `선색`·`선굵기` 다. 도형 «모양» 인 `테두리` 와 헷갈리지 말 것 — 그건 점
    목록이고 이건 눈에 보이는 선이다. 굵기 상한은 굽는 쪽(`cardnews_compose.
    _선그리기`)이 받는 것과 같아야 한다.
    """
    탈 = []
    색 = r.get("선색")
    if 색 is not None and not 색꼴.match(str(색)):
        탈.append(f"{어디}: 선색이 #RRGGBB 가 아니다 — {색!r}")
    굵기 = r.get("선굵기")
    if 굵기 is None:
        return 탈
    if not isinstance(굵기, (int, float)) or isinstance(굵기, bool):
        탈.append(f"{어디}: 선굵기가 숫자가 아니다 — {굵기!r}")
    elif not 0 <= 굵기 <= 선굵기상한:
        탈.append(f"{어디}: 선굵기는 0~{선굵기상한} 이다 — {굵기!r}")
    return 탈


# 테두리 굵기 상한. 1080 폭에서 이보다 두꺼우면 선이 아니라 면이다.
선굵기상한 = 60


# ---------------------------------------------------------------- 글줄 (2026-09-28)
#
# **글자 효과는 글자에 붙는다**(사람 지시 여섯 번 — 설계
# `docs/superpowers/specs/2026-09-28-카드뉴스-글자효과는-글자에-design.md`).
# 글자 칸의 `글줄` 은 줄마다 덩어리 목록이고, 덩어리마다 글과 효과가 있다.
# **숫자 위치는 어디에도 없다.** 옛 모양(`lines` + 숫자 위치 효과)을 아는 것은
# 아래 `글줄로` 하나뿐이다 — 설계도가 드나드는 문마다 이것을 거친다.

덩어리효과 = ("색", "형광펜", "굵게", "밑줄")
문장효과 = ("글머리", "정렬")
옛칸들 = ("색구간", "형광펜", "굵기", "밑줄구간", "글머리", "줄굵기", "줄색", "출처")


def _효과만(d: dict) -> dict:
    return {k: d[k] for k in 덩어리효과 if d.get(k) not in (None, False, "")}


def 덩어리정리(덩어리들: list) -> list:
    """빈 덩어리를 빼고, 이웃한 두 덩어리의 효과가 같으면 하나로 합친다."""
    난것 = []
    for d in 덩어리들 or []:
        글 = str((d or {}).get("글") or "")
        if not 글:
            continue
        효과 = _효과만(d)
        if 난것 and _효과만(난것[-1]) == 효과:
            난것[-1] = {**난것[-1], "글": 난것[-1]["글"] + 글}
        else:
            난것.append({"글": 글, **효과})
    return 난것


def 글줄글들(글줄: list) -> list:
    """`lines` 읽기용 사본 — 줄마다 글만 잇는다. **`lines` 는 이것으로만 만든다.**

    **망가진 모양도 받는다** — 저장 검사(`설계도_탈`)가 모든 `글줄`을 이 함수에
    먼저 통과시킨다. 여기서 터지면 400 대신 500 이 나간다(2026-09-29). 목록이
    아니면 빈 목록, 줄이 사전이 아니면 건너뛰고, 덩어리가 목록이 아니거나 그
    안에 사전이 아닌 것이 있으면 없는 셈 친다 — 탈은 `_글줄탈`이 낸다.
    """
    if not isinstance(글줄, list):
        return []
    난것 = []
    for 줄 in 글줄:
        if not isinstance(줄, dict):
            continue
        덩어리들 = 줄.get("덩어리")
        if not isinstance(덩어리들, list):
            덩어리들 = []
        난것.append("".join(str(d.get("글") or "") for d in 덩어리들 if isinstance(d, dict)))
    return 난것


def _옛목록(값) -> list:
    if isinstance(값, dict):
        return [값]
    return [x for x in 값 if isinstance(x, dict)] if isinstance(값, list) else []


def _형광펜합치기(곳들: list) -> list:
    """`[(줄, 시작, 끝, 색)]` 을 줄마다 합친다 — 겹치거나 맞닿으면 하나, 색은 앞엣것.

    옛 굽는 쪽(`cardnews_compose._형광펜들`)이 그리던 그대로다 — 화면에 보이던
    그대로 옮기려고 **이 한 번만** 옛 규칙을 쓴다.
    """
    쓸것 = sorted([x for x in 곳들 if x[2] > x[1]], key=lambda x: (x[0], x[1]))
    난것 = []
    for 줄, 시작, 끝, 색 in 쓸것:
        if 난것 and 난것[-1][0] == 줄 and 시작 <= 난것[-1][2]:
            앞 = 난것[-1]
            난것[-1] = (앞[0], 앞[1], max(앞[2], 끝), 앞[3])
        else:
            난것.append((줄, 시작, 끝, 색))
    return 난것


def 글줄로(r: dict, 버린것: list | None = None) -> dict:
    """옛 글자 칸을 새 모양(`글줄`)으로. **이미 새 모양이면 `lines` 만 다시 맞춘다.**

    **지금 화면에 보이던 그대로** 옮긴다 — 옛 굽는 쪽의 규칙을 딱 한 번 쓴다:
    굵기·밑줄구간은 그 글자에, 색구간은 뒤엣것이 이기고, 형광펜은 겹치면 앞 색으로
    합치고(색이 없으면 카드 강조색 = `true`), `줄색`·`줄굵기` 는 모자라면 마지막 것을
    이어 쓰고, `출처` 는 그때의 마지막 줄(줄이 하나여도) 글자에 색, 그 줄에 정렬
    (모르는 정렬 값은 옛 굽는 쪽처럼 `왼쪽`).

    문장 나누기: 빈 줄 사이의 줄들이 한 문장이다(옛 `감기` 가 그렇게 합쳤다). 단
    글머리 줄·그 다음 줄·출처 정렬 줄은 새 문장으로 뗀다 — 안 그러면 넓힐 때 합쳐진다.

    없는 줄을 가리키는 효과는 **그것만** 버리고 `버린것` 에 적는다. 받은 칸은 안 건드린다.

    **`글줄` 과 `lines` 의 글이 다르면 `lines` 를 따른다**(2026-09-29 검토). 배포 전에 구운
    옛 작업대는 판을 갈아 끼우면 새 서버가 준 `글줄` 을 모른 채 들고 있다가 `lines` 만
    고쳐 보낸다 — 낡은 `글줄` 을 따르면 고친 글이 소리 없이 사라진다. 그 칸은 옛 모양으로
    보고 바꾼다(`글줄` 의 효과는 버리고 알린다). 새 작업대·배치는 늘 둘을 같게 보낸다.

    **`글줄` 도 없고 `lines` 가 목록도 아니면 그대로 돌려준다** — 저장 검사가
    「줄 목록이 없다」로 막는다. 여기서 빈 칸이나 글자 하나씩의 줄로 만들면 못 막는다.
    """
    def 버림(말: str) -> None:
        if 버린것 is not None:
            버린것.append(말)

    if "글줄" not in r and not isinstance(r.get("lines"), list):
        return dict(r)
    if "글줄" in r and isinstance(r.get("lines"), list) and r["lines"] != 글줄글들(r["글줄"]):
        버림("글줄: 글줄과 lines 가 달라 lines 를 따랐다 — 이 칸의 글줄 효과는 버렸다")
    elif "글줄" in r:
        새 = {k: v for k, v in r.items() if k not in 옛칸들}
        새["lines"] = 글줄글들(새["글줄"])
        return 새

    줄들 = [str(x or "") for x in r["lines"]]
    n = len(줄들)
    글자 = [[{} for _ in 줄] for 줄 in 줄들]          # 줄마다 글자마다 효과

    def 곳(g: dict, 이름: str):
        i = g.get("줄번호")
        if not isinstance(i, int) or isinstance(i, bool) or not 1 <= i <= n:
            버림(f"{이름}: {i!r} 번 줄이 없다 (줄은 {n}개)")
            return None
        try:
            시작 = int(g.get("시작", 0) or 0)
            끝 = int(g.get("끝", g.get("글자수", 0)) or 0)
        except (TypeError, ValueError):
            버림(f"{이름}: 자리가 숫자가 아니다 — {g!r}")
            return None
        글수 = len(줄들[i - 1])
        return i - 1, max(0, min(글수, 시작)), max(0, min(글수, 끝))

    def 줄값(값목록: list, i: int):
        if not 값목록:
            return None
        return 값목록[i] if i < len(값목록) else 값목록[-1]

    줄색 = r.get("줄색") if isinstance(r.get("줄색"), list) else []
    줄굵기 = r.get("줄굵기") if isinstance(r.get("줄굵기"), list) else []
    출처 = r.get("출처") if isinstance(r.get("출처"), dict) else {}
    for i in range(n):
        색 = 줄값(줄색, i)
        if i == n - 1 and 출처.get("색"):
            색 = 출처["색"]
        굵 = 줄값(줄굵기, i)
        if 굵 == "Regular" and r.get("weight") == "Bold":
            버림(f"줄굵기: {i + 1}번 줄 Regular 는 굵은 칸에서 못 살린다")
        for e in 글자[i]:
            if 색:
                e["색"] = 색
            if 굵 == "Bold":
                e["굵게"] = True
    for g in _옛목록(r.get("굵기")):
        c = 곳(g, "굵기")
        if c:
            for k in range(c[1], c[2]):
                글자[c[0]][k]["굵게"] = True
    for g in _옛목록(r.get("색구간")):               # 뒤엣것이 이긴다
        c = 곳(g, "색구간")
        if c and g.get("색"):
            for k in range(c[1], c[2]):
                글자[c[0]][k]["색"] = g["색"]
    for g in _옛목록(r.get("밑줄구간")):
        c = 곳(g, "밑줄구간")
        if c:
            for k in range(c[1], c[2]):
                글자[c[0]][k]["밑줄"] = True
    형광곳들 = []
    for g in _옛목록(r.get("형광펜")):
        c = 곳(g, "형광펜")
        if c:
            형광곳들.append((*c, g.get("색")))
    for 줄, 시작, 끝, 색 in _형광펜합치기(형광곳들):
        for k in range(시작, 끝):
            글자[줄][k]["형광펜"] = 색 or True

    글머리 = r.get("글머리") if isinstance(r.get("글머리"), dict) else {}
    갈래 = 글머리.get("갈래") if 글머리.get("갈래") in 글머리갈래 else None
    글머리줄 = set()
    for x in (글머리.get("줄들") or []) if 갈래 else []:
        if isinstance(x, int) and not isinstance(x, bool) and 1 <= x <= n:
            글머리줄.add(x - 1)
        else:
            버림(f"글머리: {x!r} 번 줄이 없다 (줄은 {n}개)")
    출처줄 = n - 1 if (n >= 1 and 출처.get("align")) else None

    글줄 = []
    for i, 줄 in enumerate(줄들):
        새문장 = (i == 0 or not 줄 or not 줄들[i - 1]
                 or i in 글머리줄 or (i - 1) in 글머리줄 or i == 출처줄)
        한줄 = {"새문장": 새문장,
               "덩어리": 덩어리정리([{"글": ch, **e} for ch, e in zip(줄, 글자[i])])}
        if i in 글머리줄:
            한줄["글머리"] = 갈래
        if i == 출처줄:
            한줄["정렬"] = 출처["align"] if 출처["align"] in 정렬들 else "왼쪽"
        글줄.append(한줄)
    새 = {k: v for k, v in r.items() if k not in 옛칸들}
    새["글줄"] = 글줄
    새["lines"] = 글줄글들(글줄)
    return 새


def _글줄탈(어디: str, r: dict) -> list:
    """글줄이 굽기에 안전한가. **덩어리에 모르는 칸이 있으면 탈** — 숫자 위치
    (`줄번호`·`시작`·`끝`·`몇번째`)가 다시 들어오면 여기서 막힌다(원칙 1)."""
    글줄 = r.get("글줄")
    if not isinstance(글줄, list):
        return [f"{어디}: 글줄이 목록이 아니다 — {글줄!r}"]
    탈 = []
    for i, 줄 in enumerate(글줄, start=1):
        앞 = f"{어디} {i}번 줄"
        if not isinstance(줄, dict):
            탈.append(f"{앞}: 사전이 아니다 — {줄!r}")
            continue
        새문장 = 줄.get("새문장")
        if not isinstance(새문장, bool):
            탈.append(f"{앞}: 새문장이 참·거짓이 아니다 — {새문장!r}")
        elif i == 1 and not 새문장:
            탈.append(f"{앞}: 첫 줄은 새 문장이어야 한다")
        모름 = set(줄) - {"새문장", "덩어리", *문장효과}
        if 모름:
            탈.append(f"{앞}: 모르는 칸 — {', '.join(sorted(모름))}")
        if 새문장 is False:
            for k in 문장효과:
                if k in 줄:
                    탈.append(f"{앞}: {k} 는 문장 첫 줄에만 붙는다")
        if "글머리" in 줄 and 줄["글머리"] not in 글머리갈래:
            탈.append(f"{앞}: 모르는 글머리 — {줄['글머리']!r} (아는 것: {', '.join(글머리갈래)})")
        if "정렬" in 줄 and 줄["정렬"] not in 정렬들:
            탈.append(f"{앞}: 모르는 정렬 — {줄['정렬']!r}")
        덩어리들 = 줄.get("덩어리")
        if not isinstance(덩어리들, list):
            탈.append(f"{앞}: 덩어리가 목록이 아니다 — {덩어리들!r}")
            continue
        for j, d in enumerate(덩어리들, start=1):
            dd = f"{앞} 덩어리{j}"
            if not isinstance(d, dict):
                탈.append(f"{dd}: 사전이 아니다 — {d!r}")
                continue
            모름 = set(d) - {"글", *덩어리효과}
            if 모름:
                탈.append(f"{dd}: 모르는 칸 — {', '.join(sorted(모름))}")
            글 = d.get("글")
            if not isinstance(글, str) or not 글:
                탈.append(f"{dd}: 글이 비었다")
            elif "\n" in 글:
                탈.append(f"{dd}: 글에 줄바꿈이 있다")
            if "색" in d and not 색꼴.match(str(d["색"])):
                탈.append(f"{dd}: 색이 #RRGGBB 가 아니다 — {d['색']!r}")
            if "형광펜" in d and d["형광펜"] is not True and not 색꼴.match(str(d["형광펜"])):
                탈.append(f"{dd}: 형광펜이 #RRGGBB 도 true 도 아니다 — {d['형광펜']!r}")
            for k in ("굵게", "밑줄"):
                if k in d and d[k] is not True:
                    탈.append(f"{dd}: {k} 는 true 만 된다 — {d[k]!r}")
    return 탈


def 카드들글줄로(cards, 버린것: list | None = None):
    """카드 목록의 글자 칸을 전부 `글줄로`. 다른 칸은 그대로다. 목록이 아니면 그대로 돌려준다."""
    if not isinstance(cards, list):
        return cards
    난것 = []
    for i, c in enumerate(cards, start=1):
        if not isinstance(c, dict) or not isinstance(c.get("글자영역"), list):
            난것.append(c)
            continue
        새칸들 = []
        for j, r in enumerate(c["글자영역"], start=1):
            if not isinstance(r, dict):
                새칸들.append(r)
                continue
            이번 = []
            새칸들.append(글줄로(r, 이번))
            if 버린것 is not None:
                버린것.extend(f"{i}번 장 글자{j} {말}" for 말 in 이번)
        난것.append({**c, "글자영역": 새칸들})
    return 난것


# ---------------------------------------------------------------- 판

# 사진에 얹는 «색 + 진하기» 한 쌍들. 음영은 사진 «안» 아래쪽, 그림자는 사진
# «바깥» 이다 — 값의 꼴은 같아서 한 자리에서 본다.
색진하기쌍 = ("음영", "그림자")


def _음영탈(어디: str, r: dict) -> list:
    """음영·그림자 값. **없으면 통과** — 굽는 쪽이 기본값을 쓴다.

    값이 없는 옛 설계도를 여기서 막으면 여태 만든 카드를 못 연다. 있을 때만
    꼴을 본다: 색은 `#RRGGBB`, 진하기는 0~100. 굽는 쪽(`cardnews_compose.
    _음영얹기`·`_그림자깔기`)이 받는 것과 같은 범위여야 한다 — 어긋나면 「구울
    수는 있는데 작업대에서 못 여는」 카드가 생긴다.
    """
    탈 = []
    for 이름 in 색진하기쌍:
        색 = r.get(f"{이름}색")
        if 색 is not None and not 색꼴.match(str(색)):
            탈.append(f"{어디}: {이름}색이 #RRGGBB 가 아니다 — {색!r}")
        진하기 = r.get(f"{이름}진하기")
        if 진하기 is None:
            continue
        if not isinstance(진하기, (int, float)) or isinstance(진하기, bool):
            탈.append(f"{어디}: {이름}진하기가 숫자가 아니다 — {진하기!r}")
        elif not 0 <= 진하기 <= 100:
            탈.append(f"{어디}: {이름}진하기는 0~100 이다 — {진하기!r}")
    return 탈


def _목록(창고, edit_id: str) -> list:
    raw = 창고.읽기(목록키(edit_id))
    if not raw:
        return []
    try:
        것 = json.loads(raw.decode("utf-8"))
        return 것 if isinstance(것, list) else []
    except (ValueError, UnicodeDecodeError):
        # 목록이 깨져도 설계도 자체는 살아 있다 — 목록만 비운다.
        return []


def 다음판(창고, edit_id: str) -> int:
    목록 = _목록(창고, edit_id)
    return (max(x["판"] for x in 목록) + 1) if 목록 else 0


def 판저장(창고, edit_id: str, 판: int, cards: list, png주소들: list, 때: str) -> dict:
    if 판 == 0 and 창고.읽기(설계도키(edit_id, 0)):
        raise ValueError("0판은 덮어쓰지 않는다 — 처음으로 되돌아갈 길이다")
    창고.쓰기(설계도키(edit_id, 판),
             json.dumps(cards, ensure_ascii=False).encode("utf-8"),
             "application/json; charset=utf-8")
    목록 = [x for x in _목록(창고, edit_id) if x["판"] != 판]
    목록.append({"판": 판, "때": 때, "장": png주소들})
    목록.sort(key=lambda x: x["판"])
    창고.쓰기(목록키(edit_id),
             json.dumps(목록, ensure_ascii=False).encode("utf-8"),
             "application/json; charset=utf-8")
    return {"판": 판, "판목록": 목록}


def 판읽기(창고, edit_id: str, 판=None) -> dict:
    목록 = _목록(창고, edit_id)
    if 판 is None:
        판 = max((x["판"] for x in 목록), default=0)
    raw = 창고.읽기(설계도키(edit_id, int(판)))
    if not raw:
        raise KeyError(f"{edit_id} 의 {판}판이 없다")
    return {"판": int(판), "cards": json.loads(raw.decode("utf-8")), "판목록": 목록}
