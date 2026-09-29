# -*- coding: utf-8 -*-
"""작업대 쪽 만들기 시험. 브라우저 없이 «쪽에 무엇이 들어갔나»만 본다."""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import pytest      # noqa: E402
import workbench   # noqa: E402


def _카드():
    return {"index": 1, "역할": "훅",
            "배경": {"종류": "그라데이션", "방향": "세로",
                   "띠": "#FEFEFE@0% → #3C3C3C@100%"},
            "장식영역": [{"종류": "사진", "box": [10, 10, 100, 100],
                      "media_url": "https://x/a.png"},
                     {"종류": "로고", "box": [200, 10, 260, 60]}],
            "글자영역": [{"종류": "글자", "box": [10, 200, 500, 300], "pt": 40,
                       "weight": "Bold", "align": "오른쪽", "font": "프리텐다드",
                       "글자색": "#010203", "줄종류": "한줄", "lines": ["가나다"]}]}


def test_쪽이_자족적이다():
    """바깥 파일을 안 부른다 — 글꼴만 창고에서 받는다."""
    쪽 = workbench.쪽만들기("abc", [_카드()], ["https://x/1.png"])
    assert "<script" in 쪽
    assert 'src="http' not in 쪽, "바깥 스크립트를 부르면 안 된다"
    assert "workbench.js" not in 쪽, "파일을 부르지 말고 안에 박아야 한다"
    assert "export function 앵커" not in 쪽, "export 를 벗겨서 박아야 한다"
    assert "function 앵커" in 쪽


def test_설계도와_id_가_쪽에_들어간다():
    쪽 = workbench.쪽만들기("abc123", [_카드()], ["https://x/1.png"])
    assert "abc123" in 쪽
    assert "가나다" in 쪽
    assert "https://x/a.png" in 쪽


def test_그라데이션이_CSS_로_바뀐다():
    assert workbench.배경CSS({"종류": "그라데이션", "방향": "세로",
                            "띠": "#FEFEFE@0% → #3C3C3C@100%"}) == \
        "linear-gradient(180deg, #FEFEFE 0%, #3C3C3C 100%)"


def test_단색은_그냥_색이다():
    assert workbench.배경CSS({"종류": "단색", "hex": "#F1FFE5"}) == "#F1FFE5"


def test_모르는_배경은_흰색으로_눕는다():
    """옛 설계도가 와도 쪽이 안 죽는다."""
    assert workbench.배경CSS({"종류": "무지개"}) == "#FFFFFF"


def test_글꼴_주소가_창고를_가리킨다():
    쪽 = workbench.쪽만들기("abc", [_카드()], ["https://x/1.png"])
    assert "Pretendard-Bold.otf" in 쪽
    assert "@font-face" in 쪽


def test_세로보정값이_쪽에_박힌다():
    """PIL 은 어센더 위(anchor «la»)를 y 로 삼고 CSS 는 줄상자 가운데에 앉힌다.
    그 차이를 상수로 박아 둔다 — 짐작이 아니라 실측값이어야 한다."""
    assert isinstance(workbench.세로보정, float)
    쪽 = workbench.쪽만들기("abc", [_카드()], ["https://x/1.png"])
    assert str(workbench.세로보정) in 쪽


def test_강조색을_설계도에서_유추한다():
    """다른 틀을 편집할 때도 새로 찍는 형광펜 기본색이 그 틀 색을 따라야 한다
    — cards_json 이 자족적이므로(형광펜이 제 색을 갖는다) 이미 칠해진 색에서
    유추할 수 있다."""
    c = _카드()
    c["글자영역"][0]["형광펜"] = [{"줄번호": 1, "시작": 0, "끝": 2, "색": "#FF8800"}]
    쪽 = workbench.쪽만들기("abc", [c], [])
    assert '"강조색": "#FF8800"' in 쪽 or '"강조색":"#FF8800"' in 쪽


def test_형광펜이_없으면_실측_강조색을_쓴다():
    쪽 = workbench.쪽만들기("abc", [_카드()], [])
    assert "#C9FC95" in 쪽


def test_안저장표시가_정의되고_typeof_가드가_없다():
    """Task 7·8 은 안저장표시() 가 아직 없어 typeof 가드로 감싸 뒀다 — Task 9
    가 정의한 뒤로는 그 가드가 남아 있으면 안 된다(없으면 안 되는 함수가 됐다)."""
    쪽 = workbench.쪽만들기("abc", [_카드()], ["https://x/1.png"])
    assert "function 안저장표시" in 쪽
    assert "typeof 안저장표시" not in 쪽


def test_저장과_판_고르기가_쪽에_들어간다():
    쪽 = workbench.쪽만들기("abc", [_카드()], ["https://x/1.png"])
    assert "beforeunload" in 쪽
    assert "판칸그리기" in 쪽
    assert "/edit/" in 쪽


# ── 쪽이 «돌아가는» 자바스크립트인가 ──────────────────────────────
# 쪽은 글자 붙이기로 만들어진다. 그래서 문법이 깨져도 파이썬 시험은 다 통과하고,
# 배포한 뒤 브라우저에서야 흰 화면으로 드러난다. 여기서 미리 막는다.

def _쪽스크립트(tmp_path):
    import re
    h = workbench.쪽만들기("시험", [_카드()], ["https://x/1.png"])
    src = re.search(r"<script>(.*)</script>", h, re.S).group(1)
    p = tmp_path / "쪽.js"
    p.write_text(src, encoding="utf-8")
    return h, p


def test_쪽_자바스크립트의_문법이_성하다(tmp_path):
    import shutil
    import subprocess
    node = shutil.which("node")
    if not node:
        pytest.skip("node 가 없다")
    _, p = _쪽스크립트(tmp_path)
    난것 = subprocess.run([node, "--check", str(p)], capture_output=True, text=True)
    assert 난것.returncode == 0, 난것.stderr


def test_층_다루는_것들이_쪽에_다_있다(tmp_path):
    """층은 `web/lib/workbench.js` 에서 오고 쓰는 쪽은 여기서 쓴다 — 둘 다 있어야 한다."""
    h, _ = _쪽스크립트(tmp_path)
    for 이름 in ("function 장식순서", "function 층밀기", "function 층으로밀기",
                "function 층표그리기", "function 선택겹만들기"):
        assert 이름 in h, 이름
    # 층은 «사진끼리만» 이다 — 글자를 미는 길이 남아 있으면 안 된다.
    assert "층줄세우기" not in h


def test_없앤_단추들이_안_남아_있다(tmp_path):
    """사진 빼기·자리 없애기·형광펜 빼기는 Del 과 토글로 갔다."""
    h, _ = _쪽스크립트(tmp_path)
    for 이름 in ("ㄴ사진", "ㄷ자리", "ㅋ형광빼기"):
        assert 이름 not in h, 이름
    # 「템플릿으로 내보내기」도 뺐다(사람 지시 2026-09-22).
    assert "템플릿으로 내보내기" not in h
    assert "틀단추" not in h, "단추는 지웠는데 잡는 코드가 남으면 그 자리에서 죽는다"
    assert "function 지우기" in h


def test_넘침_높이맞추기_줄높이가_줄간격을_다_받는다(tmp_path):
    """A3(R11): 부르는 자리 하나가 줄간격을 안 넘겨서 화면 넘침 표시가 붙박이
    1.32 로 계산되고 구운 그림과 어긋났었다(2026-08-26). 그 자리는
    `requestAnimationFrame` 안, 브라우저에서만 도는 DOM 코드라 `node --test`
    가 못 본다 — 이 시험은 브라우저를 안 띄우고 쪽 글자를 정규식으로 훑어
    같은 빠뜨림을 잡는 그물이다.
    """
    import re
    h, _ = _쪽스크립트(tmp_path)

    넘침호출 = re.findall(r"[^\w]넘침\(([^)]*)\)", h)
    assert len(넘침호출) >= 2, "넘침( 부르는 자리를 못 찾았다(정의 포함 최소 2곳)"
    for 인자 in 넘침호출:
        assert 인자.count(",") == 4, f"넘침({인자}) 가 다섯 인자(줄간격 포함)를 안 받는다"

    높이맞추기호출 = re.findall(r"[^\w]높이맞추기\(([^)]*)\)", h)
    assert len(높이맞추기호출) >= 4, "높이맞추기( 부르는 자리를 못 찾았다(정의 포함 최소 4곳)"
    for 인자 in 높이맞추기호출:
        assert 인자.count(",") == 3, f"높이맞추기({인자}) 가 네 인자(줄간격 포함)를 안 받는다"

    줄높이호출 = re.findall(r"[^\w]줄높이\(([^)]*)\)", h)
    assert len(줄높이호출) >= 1, "줄높이( 부르는 자리를 못 찾았다"
    for 인자 in 줄높이호출:
        assert 인자.count(",") == 1, f"줄높이({인자}) 가 두 인자(줄간격 포함)를 안 받는다"


def test_테두리가_있으면_clip_path_로_오린다():
    c = _카드()
    c["장식영역"][0]["테두리"] = [[10, 10], [100, 10], [100, 100], [10, 100]]
    쪽 = workbench.쪽만들기("abc", [c], ["https://x/1.png"])
    assert "clip-path" in 쪽
    assert "polygon(" in 쪽


def test_clip_path_는_테두리가_있을_때만_건다():
    """(R23) `장식칸` 은 카드 데이터와 무관한 스크립트 한 벌이다 — 그래서
    "쪽 글자에 clip-path 가 아예 없는지" 를 보면 안 된다. 그 단언을 지키려면
    서버에서 카드를 미리 살펴 clip-path 조각을 조건부로 끼워 넣어야 하는데,
    그러면 테두리 없는 쪽과 있는 쪽의 스크립트가 서로 달라져 «두 벌로 갈라진다」
    (이 저장소가 반복해서 당한 문제)로 이어진다. 대신 **런타임 지킴이**
    (`r.테두리 && …`) 가 이미 걸어 둔 조건을 본다 — clip-path 를 거는 줄이
    그 지킴이 블록 **안**에 있으면, 테두리 없는 장식영역엔 실행 시점에 저절로
    안 걸린다.
    """
    import re
    쪽 = workbench.쪽만들기("abc", [_카드()], ["https://x/1.png"])
    # **`장식칸` 안에서만 찾는다.** `선그리기` 도 같은 지킴이(`r.테두리 && …`)
    # 를 쓰는데 그것이 쪽 글자에서 앞서 나온다 — 안 끊으면 엉뚱한 블록을 본다.
    시작 = 쪽.index("function 장식칸")
    본문 = 쪽[시작:쪽.index("\nfunction ", 시작 + 1)]
    # if 블록 속에 `${...}` 템플릿 문자열이 있어 단순 `[^}]*` 로는 못 끊는다 —
    # if 자신과 같은 들여쓰기(두 칸)의 `}` 줄까지를 그 블록으로 본다.
    m = re.search(r"if\s*\(r\.테두리[^)]*\)\s*\{(.*?)\n  \}", 본문, re.S)
    assert m and "clip-path" in m.group(1), \
        "clip-path 를 거는 줄이 `r.테두리` 지킴이 안에 없다"


def test_media_url이_그림보다_앞선다():
    """사람이 장식 칸에 사진·영상을 올려도, 그 자리에 자동 누끼 `그림` 이
    이미 있으면 조용히 무시됐다(2026-09-17 최종 검토 지적 ①) — 굽는 쪽
    (`cardnews_compose._decoration_속`)과 같은 순서라야 화면이 안 갈린다."""
    쪽 = workbench.쪽만들기("abc", [_카드()], [])
    시작 = 쪽.index("function 장식칸")
    끝 = 쪽.index("\nfunction ", 시작 + 1)
    본문 = 쪽[시작:끝]
    assert 본문.index("r.media_url") < 본문.index("r.그림")


def test_도형은_채움색으로_그린다():
    c = _카드()
    c["장식영역"].append({"종류": "도형", "box": [10, 300, 500, 400], "채움색": "#111111"})
    쪽 = workbench.쪽만들기("abc", [c], [])
    assert "#111111" in 쪽


def test_구멍은_화면에서_못_판다는_귀띔이_있다(tmp_path):
    """CSS 로는 구멍을 못 판다 — 사람이 그 차이를 알아야 한다."""
    쪽 = workbench.쪽만들기("abc", [_카드()], [])
    assert "구멍" in 쪽


# ── ＋도형과 도형 패널 (사람 결정 2026-09-19) ──────────────────────
#
# 여태 칸을 더하는 단추는 ＋글자·＋사진 둘뿐이었다. 그리고 도형을 고르면
# **사진 패널이 떴다** — `패널갈래()` 가 아는 갈래가 글자·사진·배경사진 셋뿐이라
# 도형이 사진으로 떨어졌기 때문이다. 그래서 도형은 옮기고 키우는 것은 되는데
# **색을 못 바꿨다.**

def test_도형_더하기_단추가_있다(tmp_path):
    h, _ = _쪽스크립트(tmp_path)
    assert "ㅁ도형추가" in h
    assert "＋도형" in h


def test_도형을_더하면_채움색이_있는_도형이_생긴다(tmp_path):
    """**만드는 자리는 `도형넣기` 하나다.** 단추가 여섯이어도 길을 둘로 만들면
    한쪽만 고치게 된다(사람 요청 2026-09-19: 「도형 추가에서 모양도」)."""
    본문, _ = _쪽스크립트(tmp_path)
    시작 = 본문.index("function 도형넣기")
    토막 = 본문[시작:시작 + 900]
    assert "종류: '도형'" in 토막, 토막[:300]
    # 채움색이 없으면 화면에 아무것도 안 보인다(`r.종류 === '도형' && r.채움색`).
    assert "채움색" in 토막, 토막[:300]
    # 장식영역에 넣고 그것을 고른 채로 둔다 — 더하자마자 색을 바꿀 수 있어야 한다.
    assert "장식영역" in 토막 and "고른것" in 토막, 토막[:300]


def test_도형을_고르면_도형_패널이_뜬다(tmp_path):
    """도형이 사진 패널로 떨어지면 색을 못 바꾼다 — 갈래를 따로 둔다."""
    본문, _ = _쪽스크립트(tmp_path)
    시작 = 본문.index("function 패널갈래")
    토막 = 본문[시작:시작 + 700]
    assert "'도형'" in 토막, 토막[:400]


def test_도형_패널에_채움색_손잡이가_있다(tmp_path):
    본문, _ = _쪽스크립트(tmp_path)
    assert "갈래 === '도형'" in 본문
    # 패널 이름표에도 도형이 있어야 「이 장」으로 안 뜬다.
    시작 = 본문.index("패널이름")
    assert "도형" in 본문[시작:시작 + 200]


def test_장식칸은_도형에도_물음표를_안_찍는다():
    """굽는 쪽(`cardnews_compose._decoration_속`)은 `종류 in ('장식','도형')`
    이면 물음표 없이 자리만 비운다. 작업대가 도형에만 물음표를 찍으면 화면에서
    본 것과 구운 결과가 갈린다(2026-08-26 판정 리뷰) — 굽는 쪽에 맞춘다."""
    쪽 = workbench.쪽만들기("abc", [_카드()], [])
    assert "r.종류 !== '장식' && r.종류 !== '도형'" in 쪽


# ── 칸 더 만들기 · 누르기만 한 것 ──────────────────────────────────

def _쪽():
    return workbench.쪽만들기("abc", [_카드()], ["https://x/1.png"])


def test_글자와_사진을_더_만드는_단추가_있다():
    """여태 있는 것을 고치기만 했다 — 없던 줄을 쓰려면 라벨부터 다시 해야 했다."""
    쪽 = _쪽()
    assert 'id="ㄴ글자추가"' in 쪽 and 'id="ㄷ사진추가"' in 쪽


def test_새_사진_자리는_주소를_안_담는다():
    """회색 자리표시로 나오고 「사진 넣기」로 채운다 — 넣는 길은 하나다."""
    쪽 = _쪽()
    자리 = 쪽[쪽.index("ㄷ사진추가'"):]
    덩이 = 자리[:자리.index("const 파일칸")]
    assert "media_url" not in 덩이


def test_새_글자칸이_그_장_생김새를_물려받는다():
    """글꼴·크기를 새로 고르게 하면 그 장만 겉도는 글자가 생긴다."""
    쪽 = _쪽()
    # 2026-09-19: 패널에도 `대신누르기('ㄴ글자추가')` 가 생겨 이름이 두 번 나온다.
    # 처리 코드는 `getElementById('ㄴ글자추가').onclick` 쪽이므로 그 뒤를 본다.
    앞 = 쪽.index("getElementById('ㄴ글자추가').onclick")
    덩이 = 쪽[앞:쪽.index("getElementById('ㄷ사진추가').onclick")]
    for 칸 in ("본.pt", "본.weight", "본.font", "본.글자색"):
        assert 칸 in 덩이, f"{칸} 를 안 물려받는다"


def test_누르기만_하면_다시_안_감는다():
    """구운 줄바꿈은 PIL 자, 화면 감기는 캔버스 자다 — 둘이 달라서 글을 하나도
    안 고쳤는데 줄이 갈리고 네모 높이가 바뀌었다."""
    쪽 = _쪽()
    # 2026-09-28: 누른 순간의 글을 적어 두는 대신 화면에서 읽은 글줄을 모델과 견준다.
    덩이 = 쪽[쪽.index("addEventListener('blur'"):]
    덩이 = 덩이[:덩이.index("addEventListener('keydown'")]
    assert "if (글줄같나(지금, r.글줄)) return" in 덩이


# ── 화면과 구운 그림이 같아야 한다 ──────────────────────────────

def test_도형에서_온_글자칸은_화면에서도_세로_가운데다():
    """굽는 쪽은 가운데로 그리는데 화면만 위에 붙였다 — 사람이 알려 줬다
    (2026-08-27). 본 것과 나올 것이 다르면 고칠 자리를 잘못 짚는다."""
    쪽 = workbench.쪽만들기("abc", [_카드()], ["https://x/1.png"])
    덩이 = 쪽[쪽.index("function 글자칸("):]      # `function 글자칸el` 이 앞에 있다
    덩이 = 덩이[:덩이.index("\n}")]
    assert "r.세로가운데" in 덩이
    assert "justifyContent" in 덩이


def test_빈_자리는_속이_비고_겉만_점선이다():
    """**굽는 쪽과 같은 규칙**(사람 결정 2026-09-18: 「그냥 투명하게 그리고
    겉에만 점선, 중앙에 ?」). 한쪽만 바꾸면 화면과 구운 그림이 갈린다."""
    쪽 = workbench.쪽만들기("abc", [_카드()], ["https://x/1.png"])
    assert "#D9D9D9" not in 쪽, "아직 회색으로 채운다"
    빈칸 = 쪽[쪽.index(".칸.빈 {"):]
    빈칸 = 빈칸[:빈칸.index("}")]
    assert "repeating-linear-gradient" in 빈칸 and "#B4B4B4" in 빈칸, "겉 점선이 없다"
    # **점선이 자리를 먹으면 안 된다.** `border` 로 그리면 테두리(`선색`·`선굵기`)
    # 가 그 폭만큼 안으로 밀려 「선이 칸 맨 바깥이 아니다」가 된다(사람 지적
    # 2026-09-19). 그래서 무늬로 깐다.
    assert "border:" not in 빈칸.replace(" ", ""), "점선이 자리를 먹는다"


def test_물음표를_칸_크기에_맞춰_키운다():
    """굽는 쪽은 max(24, min(w,h)/3) 을 쓴다 — 큰 사진 자리에 작은 물음표
    하나면 그것도 «비어» 보인다."""
    쪽 = workbench.쪽만들기("abc", [_카드()], ["https://x/1.png"])
    덩이 = 쪽[쪽.index("classList.add('빈')"):]
    assert "Math.max(24" in 덩이[:400]
    assert "/ 3" in 덩이[:400]


def test_자리표시_색이_굽는_쪽_상수와_같다():
    """두 벌로 적어 두면 한쪽만 바뀌어도 아무도 모른다."""
    import cardnews_compose as cc
    쪽 = workbench.쪽만들기("abc", [_카드()], ["https://x/1.png"])
    assert cc.PLACEHOLDER_MARK_COLOR in 쪽


# ── 결과물 보기 ────────────────────────────────────────────────────

def test_전부_다운로드_단추가_여기_있다():
    """**2026-09-19 에 결과 쪽으로 옮겼다가 2026-09-21 에 되돌렸다.**

    옮긴 자리로 가는 길이 저장 뒤에만 열려서, 만들기만 한 사람은 **어디서도 못
    받는 상태**가 됐다(교수님이 그래서 못 찾으셨다). 만드는 자리에 둔다.

    단추만 그리고 손잡이를 안 붙이면 눌러도 아무 일이 안 난다 — 둘 다 본다.
    """
    쪽 = workbench.쪽만들기("abc", [_카드()], ["https://x/1.png"])
    assert 'id="ㅈ받기"' in 쪽, "단추가 없다"
    assert "getElementById('ㅈ받기').onclick" in 쪽, "손잡이가 없다"


def test_전부_다운로드는_압축_파일_하나다():
    """사람 지시 2026-09-21: 「폴더 안에 다 넣어서」. 브라우저는 폴더를 못 주므로
    압축 파일이 그것에 가장 가깝다 — 풀면 폴더가 된다."""
    쪽 = workbench.쪽만들기("abc", [_카드()], ["https://x/1.png"])
    assert "모아받기(상태.png" in 쪽, "모아받기를 안 부른다"
    assert "function makeZip" in 쪽, "묶는 코드가 안 박혔다"


def test_저장_안_한_것이_있으면_안_받아진다():
    """화면에 보이는 것과 다른 그림을 받아 가면 사람은 그걸 모른다 —
    틀 뽑기·결과물 보기와 같은 잣대다."""
    쪽 = workbench.쪽만들기("abc", [_카드()], ["https://x/1.png"])
    assert "받기단추.disabled = 안저장" in 쪽


def test_결과물_보기_단추가_있고_손잡이가_붙어_있다():
    """단추만 그리고 손잡이를 안 붙인 적이 있다 — 눌러도 아무 일이 안 났다."""
    쪽 = workbench.쪽만들기("abc", [_카드()], ["https://x/1.png"])
    assert 'id="ㅇ결과"' in 쪽, "단추가 없다"
    assert "결과물 보기" in 쪽, "이름이 «결과물 보기» 여야 한다"
    assert "getElementById('ㅇ결과').onclick" in 쪽, "손잡이가 없다"


def test_구운_그림_주소가_쪽에_실린다():
    """굽고 나면 이 주소로 결과 쪽을 연다. 안 실리면 볼 것이 없다."""
    쪽 = workbench.쪽만들기("abc", [_카드()], ["https://x/1.png", "https://x/2.png"])
    assert "https://x/2.png" in 쪽


def test_저장_안_했으면_결과물을_못_연다():
    """화면에 보이는 것과 다른 그림을 보여 주면 사람은 그걸 모른다."""
    쪽 = workbench.쪽만들기("abc", [_카드()], ["https://x/1.png"])
    assert "결과.disabled = 안저장 || !상태.결과" in 쪽
    assert "먼저 저장하세요" in 쪽


# ── Del 과 엔터 ────────────────────────────────────────────────────

def test_글자칸에도_Del_이_먹는다():
    """예전엔 장식(사진)에만 먹어서, 글자칸을 고르고 누르면 아무 일도 안 났다
    (사람 지적 2026-08-29: 「del 버튼 눌러도 뭐 없더라」)."""
    쪽 = workbench.쪽만들기("abc", [_카드()], [])
    assert "고른것.갈래 === '글자'" in 쪽, "글자 갈래를 안 본다"
    assert "c.글자영역.splice(번호, 1)" in 쪽, "칸을 없애는 길이 없다"


def test_Del_은_두_단계다():
    """내용을 바꾸려던 것과 칸을 없애려던 것은 다르다 — 사진과 같은 결이다."""
    쪽 = workbench.쪽만들기("abc", [_카드()], [])
    assert "남은글" in 쪽, "글이 남았는지 안 본다"


def test_엔터가_커서_자리에서_쪼갠다():
    """예전엔 커서가 어디 있든 빈 줄만 뒤에 더했다."""
    쪽 = workbench.쪽만들기("abc", [_카드()], [])
    # 2026-09-28: 줄이 아니라 문장을 나눈다(효과는 글자에 붙은 채 따라간다).
    assert "문장나누기(지금, 곳.k, 곳.자리)" in 쪽, "나누는 함수를 안 부른다"
    assert "anchorOffset" in 쪽, "커서 자리를 안 읽는다"


def test_엔터_뒤에_커서를_돌려놓는다():
    """다시 그리면서 날아간다 — 없으면 이어서 치지도 못한다."""
    쪽 = workbench.쪽만들기("abc", [_카드()], [])
    # 2026-09-28: 다시 그린 새 칸에 입력을 다시 준다.
    assert "상자.focus(" in 쪽
    assert "removeAllRanges" in 쪽


def test_쪼개는_함수가_쪽_안에_박혀_있다():
    """바깥 파일을 안 부르므로 함수가 통째로 들어와야 한다."""
    쪽 = workbench.쪽만들기("abc", [_카드()], [])
    assert "function 문장나누기" in 쪽


# ── 고치는 화면의 배경 ─────────────────────────────────────────────
#
# 구운 그림에는 종이 질감·찢어진 가장자리가 있는데 **고치는 화면에는 없었다**
# (사람 지적 2026-08-29: 「아직도 배경을 반영 안 했는데…?」). `배경CSS` 가 판을
# 아예 안 봤다.

_판 = "https://x.example/plates/DY/03.png"
_띠 = {"종류": "그라데이션", "띠": "#E7E7E7@0% → #FDFDFD@100%"}


def test_판을_그라데이션_위에_얹는다():
    """굽는 쪽과 같은 차례다 — 색을 칠하고 판을 덮는다. CSS 는 앞 겹이 위다."""
    난것 = workbench.배경CSS({**_띠, "판": _판})
    assert 난것.startswith(f'url("{_판}")'), 난것
    assert 난것.endswith("linear-gradient(180deg, #E7E7E7 0%, #FDFDFD 100%)"), 난것


def test_판이_없으면_예전과_똑같다():
    assert workbench.배경CSS(_띠) == "linear-gradient(180deg, #E7E7E7 0%, #FDFDFD 100%)"
    assert workbench.배경CSS({"종류": "단색", "hex": "#ABCDEF"}) == "#ABCDEF"
    assert workbench.배경CSS({"종류": "사진"}) == "#FFFFFF"


def test_사진_배경에도_판이_얹힌다():
    난것 = workbench.배경CSS({"종류": "사진", "판": _판})
    assert 난것.startswith('url(') and 난것.endswith("#FFFFFF"), 난것


def test_한글이_섞인_옛_주소를_퍼센트로_바꾼다():
    """이미 저장된 틀에는 «배경판/» 이 박혀 있다 — 그대로 쓰면 안 뜬다."""
    옛것 = "https://x.example/배경판/DY/01.png"
    난것 = workbench.배경CSS({**_띠, "판": 옛것})
    assert 난것.isascii(), 난것
    assert "%EB%B0%B0" in 난것


def test_주소에_따옴표가_있으면_판을_버린다():
    """CSS 를 깨뜨리느니 판을 포기한다 — 쪽 전체가 죽으면 안 된다."""
    for 나쁜것 in ('https://x.example/a".png', "https://x.example/a(1).png",
                 "https://x.example/a b.png"):
        assert workbench.배경CSS({**_띠, "판": 나쁜것}).startswith("linear-gradient"), 나쁜것


# ── 글씨체와 굵기 ──────────────────────────────────────────────────
#
# 굽는 쪽은 여덟 종을 그리는데 **작업대는 프리텐다드만 그렸다**(사람 지적
# 2026-08-29). 틀에 「검은고딕」이라 적혀 있어도 화면과 구운 그림이 달랐다.

def test_여덟_글꼴을_쪽에_싣는다():
    쪽 = workbench.쪽만들기("abc", [_카드()], [])
    assert 쪽.count("@font-face") == len(workbench._글꼴들) * 2
    for 이름, (씨에스에스, _, _) in workbench._글꼴들.items():
        assert f"font-family: {씨에스에스}" in 쪽, 이름


def test_굽는_쪽과_같은_여덟이다():
    """이름이 갈리면 화면과 구운 그림이 달라진다."""
    import sys as _sys
    _sys.path.insert(0, str(HERE))
    import cardnews_compose as cc  # noqa: PLC0415
    assert set(workbench._글꼴들) == set(cc.한글글꼴)


def test_슬롯의_글씨체를_쓴다():
    쪽 = workbench.쪽만들기("abc", [_카드()], [])
    assert "글꼴패밀리(r.font)" in 쪽
    assert "function 글꼴패밀리" in 쪽
    assert "|| 'Pretendard'" in 쪽, "모르는 글꼴에 물러설 자리가 없다"


def test_굵게_단추가_긁은_만큼만_굵힌다():
    """**긁은 만큼이 굵어진다**(사람 결정 2026-09-18: 「내가 스크롤을 3단어를
    하면 3단어가 적용되는 거고, 1개만 하면 1낱말만 되는 거고」).

    여태 이 단추는 «커서가 있는 줄» 을 통째로 뒤집었다(`줄굵기`). 그 칸은
    틀에서 이미 뺐는데(줄 번호 기반을 없앴다) 단추를 누르면 되살아났다.
    형광펜 단추와 같은 셈으로 바꾼다 — 긁은 구간이 이미 굵으면 빼고 아니면 넣는다.
    """
    쪽 = workbench.쪽만들기("abc", [_카드()], [])
    # 2026-09-19: 아래 도구막대 단추는 지웠다 — 패널의 `B` 하나가 대신한다.
    assert "단추('B'" in 쪽
    # 2026-09-19: `굵게토글` → `굵게걸기`(안 긁으면 칸 전체까지 맡는다).
    assert "굵게걸기" in 쪽
    assert "효과바꾸기(글줄, 곳들, '굵게')" in 쪽, "고친 것을 설계도에 안 남긴다"
    assert "r.줄굵기 = " not in 쪽, "없앤 칸(줄굵기)을 되살린다"
    assert "긁은자리" in 쪽, "긁은 구간을 안 본다 — 줄 단위로 도는 것이다"


def test_굵게는_글_고치는_중에도_먹는다():
    """굵게 할 줄은 지금 커서가 있는 줄이다 — 고치는 중이 아니면 알 수 없다."""
    쪽 = workbench.쪽만들기("abc", [_카드()], [])
    자리 = 쪽.find("'b'")
    막는곳 = 쪽.find("ev.target.isContentEditable")
    assert 0 < 자리 < 막는곳, "Ctrl+B 가 «고치는 중엔 안 받는다» 뒤에 있다"


# ── 배경 사진 자리 ────────────────────────────────────────────────
#
# 사람 지적 2026-08-31: 「사진 자리에 ? 있잖아 근데 그거 빼니까 글자 자리랑
# 이것저것 자리가 나와 뭔가 지금 ? 가 전체 자리를 뺏는 느낌이야」.
#
# 그 자리는 «장 전체» 다(`[0,0,1080,1350]`). 그래서 셋이 한꺼번에 어그러졌다 —
# 점선이 카드 테두리와 겹치고, 물음표가 카드 한가운데 박히고, 빈 곳을 누를
# 때마다 카드 한 장이 통째로 잡혀 끌려 나왔다.

def _배경자리카드():
    카드 = _카드()
    카드["배경"] = {"종류": "사진", "hex": "#615244"}
    카드["장식영역"] = [{"종류": "사진", "box": [0, 0, 1080, 1350], "배경자리": True}]
    return 카드


def test_잰_색은_배경이_칠한다():
    """**자리표시가 아니라 배경이다**(사람 결정 2026-09-01). 자리표시에 담으면
    그것을 옮기거나 지울 때 배경이 같이 사라진다."""
    assert workbench.배경CSS({"종류": "사진", "hex": "#615244"}) == "#615244"
    쪽 = workbench.쪽만들기("abc", [_배경자리카드()], [])
    assert "#615244" in 쪽


def test_사진_자리는_투명하고_가운데_물음표만_있다():
    쪽 = workbench.쪽만들기("abc", [_배경자리카드()], [])
    자리 = 쪽[쪽.index(".칸.배경빈"):쪽.index(".칸.빈 {")]
    assert "background:transparent" in 자리, 자리
    assert "dashed" in 자리 and "content:'?'" in 자리, 자리


def test_배경_사진_자리는_못_옮기고_못_늘린다():
    """장 전체라 «위치» 도 «크기» 도 없다. 고를 수는 있어야 한다 —
    「사진 넣기」로 채우는 자리다."""
    쪽 = workbench.쪽만들기("abc", [_배경자리카드()], [])
    assert "if (r.배경자리) { 무대.appendChild(el); return }" in 쪽, "손잡이를 그대로 단다"
    # 2026-09-18 에 조건이 하나 늘었다(이미 고른 글자칸 안에서는 안 끈다).
    # 재는 뜻은 그대로다 — **배경 사진 자리는 끌기를 안 건다.**
    assert "if (!r.배경자리 && !글자를긁는중) 끌기시작(ev, r, 잡음.손잡이, p)" in 쪽,         "배경자리는 끌기에서 빠진다"
    # 손잡이를 만드는 고리가 그 뒤에 있어야 «돌아간 뒤» 가 된다
    막는곳 = 쪽.index("if (r.배경자리) { 무대.appendChild(el); return }")
    손잡이 = 쪽.index("const AT = { nw:[0,0]")
    assert 막는곳 < 손잡이, "막기가 손잡이 만들기 뒤에 있다"


def test_굽는_쪽과_같은_판단이다():
    """화면과 구운 그림이 갈리면 고치는 사람이 속는다."""
    import sys as _sys
    _sys.path.insert(0, str(HERE))
    import cardnews_compose as cc  # noqa: PLC0415
    글 = Path(cc.__file__).read_text(encoding="utf-8")
    앞 = 글.index('if region.get("배경자리"):')
    몸 = 글[앞:].splitlines()[1].strip()
    assert 몸 == "return", f"굽는 쪽이 배경 자리에 무언가를 그린다 — {몸}"


# ── 영상 자리 (사람 결정 2026-09-16) ────────────────────────────────

def _쪽():
    return workbench.쪽만들기("abc", [_카드()], [])


def test_사진_또는_영상을_고른다():
    쪽 = _쪽()
    assert 'accept="image/*,video/mp4"' in 쪽
    # 2026-09-19: 아래 도구막대를 없앴다. 패널의 「바꾸기」가 숨긴 단추를 누른다.
    assert "단추('넣기'" in 쪽 and "대신누르기('ㄱ사진')" in 쪽


def test_영상은_video_로_미리_본다():
    쪽 = _쪽()
    assert ".칸.사진 video, .칸.인물 video { width:100%; height:100%; object-fit:cover; display:block; }" in 쪽
    assert "const 영상인가 = (r) => /\\.mp4$/i.test(r.media_url || '')" in 쪽
    assert "el2.playsInline = true" in 쪽


def test_넣기_전에_셋을_검사한다():
    쪽 = _쪽()
    assert "영상이 30초를 넘습니다" in 쪽
    assert "영상이 너무 큽니다 (200MB 까지)" in 쪽
    assert "한 장에 영상은 하나입니다" in 쪽
    assert "이 영상은 읽을 수 없습니다" in 쪽
    assert "/upload/sign" in 쪽 and "method: 'PUT'" in 쪽
    # 서명을 받을 때 크기를 같이 보내야 창고가 그 크기만 받는다.
    assert "JSON.stringify({ ext: 'mp4', size: f.size })" in 쪽


def test_영상_든_저장은_번호표를_기다린다():
    쪽 = _쪽()
    assert "res.status === 202" in 쪽
    assert "'/make/' + j.job_id" in 쪽
    assert "너무 오래 걸립니다" in 쪽


def test_굽는_동안_고친_것은_저장된_것으로_치지_않는다():
    """15분 굽는 사이에 사람이 화면을 고칠 수 있다. 구운 것과 화면이 다르면
    «저장됨» 으로 치면 안 된다 — 내려받기가 화면과 다른 그림을 준다."""
    쪽 = _쪽()
    assert "const 굽던설계도 = JSON.stringify(상태.cards)" in 쪽
    assert "저장상태(JSON.stringify(상태.cards) !== 굽던설계도)" in 쪽


def test_작업대가_장식_그림을_보인다():
    """작업대 화면과 구운 그림이 갈리면 안 된다."""
    # 상대 경로("workbench.py")로 열면 저장소 뿌리에서 돌릴 때 못 찾는다
    # (실물 2026-09-17: `cd cardnews && pytest render` 에서 FileNotFoundError).
    # 이 시험 파일 자신의 위치를 기준으로 잡는다.
    글 = Path(workbench.__file__).read_text(encoding="utf-8")
    assert "r.그림" in 글, "작업대가 장식 그림을 안 읽는다"


def test_작업대가_굵기를_읽는다():
    """작업대 화면과 구운 그림이 갈리면 안 된다."""
    from pathlib import Path
    글 = (Path(__file__).resolve().parent / "workbench.py").read_text(encoding="utf-8")
    assert "굵기" in 글


# ── 전체 사진 아래 음영 ────────────────────────────────────────

def test_화면도_전체_사진_아래에_음영을_깐다():
    """**굽는 쪽과 같은 겹을 화면도 그린다.** 한쪽만 그리면 미리보기엔 음영이
    없는데 내려받으면 생긴다 — 2026-08-29 에 배경판으로 똑같이 당했다."""
    쪽 = workbench.쪽만들기("abc", [_배경자리카드()], [])
    assert "function 음영CSS" in 쪽, "음영 겹을 만드는 함수가 있어야 한다"
    assert "linear-gradient(180deg, transparent " in 쪽, "세로 그라데이션이어야 한다"
    assert "rgba(" in 쪽 and "100%)" in 쪽, "맨 아래에서 그 색이 가장 짙어야 한다"


def test_음영_기본값이_굽는_쪽과_같다():
    """기본값이 두 곳에 따로 적히면 언젠가 갈라진다 — 같은 숫자인지 시험이 잡는다.

    실제로 갈라졌다(2026-09-18): 굽는 쪽을 40 에서 45 로 바꿨는데 화면에는 40 이
    글자로 굳어 있었다. 그래서 화면이 `cardnews_compose` 값을 읽어 넣도록 바꿨다
    (`workbench._음영기본값`) — 원본은 한 곳뿐이다."""
    import cardnews_compose as cc
    쪽 = workbench.쪽만들기("abc", [_배경자리카드()], [])
    import json
    기대 = json.dumps([cc.음영기본색, cc.음영기본진하기, cc.음영시작])
    assert f"const [음영기본색, 음영기본진하기, 음영시작] = {기대}" in 쪽, 기대


def test_음영은_배경자리에만_건다():
    """슬라이드 안 사진 칸에는 안 붙인다 — 굽는 쪽과 같은 규칙."""
    쪽 = workbench.쪽만들기("abc", [_배경자리카드()], [])
    assert "r.배경자리 ? 음영CSS(r) : ''" in 쪽, "배경자리일 때만 겹을 얹는다"


# ── 음영 손잡이 (패널의 접는 묶음) ────────────────────────────

def test_음영_손잡이가_패널에_있다():
    # 2026-09-19: 아래 도구막대를 없애고 패널의 접는 묶음으로 옮겼다.
    쪽 = workbench.쪽만들기("abc", [_배경자리카드()], [])
    assert "'음영 (사진 안쪽 아래)'" in 쪽, "음영 묶음"
    assert "색과막대(r, '음영색', '음영진하기'" in 쪽, "색칩 + 진하기 막대"
    assert "막대.type = 'range'" in 쪽 and "막대.min = 0" in 쪽 and "막대.max = 100" in 쪽,         "0~100 막대여야 한다"


def test_음영_손잡이는_전체_사진_칸에서만_켜진다():
    """보통 사진 칸·글자 칸에서는 잠근다 — 음영은 배경자리에만 붙는다."""
    쪽 = workbench.쪽만들기("abc", [_배경자리카드()], [])
    assert "갈래 === '배경사진'" in 쪽, "음영은 배경 사진 갈래에서만 뜬다"
    assert "접는묶음('음영" in 쪽, "평소 안 만지니 접어 둔다"


def test_음영_손잡이가_설계도를_고친다():
    """되돌리기가 걸리게 `설계도고치기` 를 거쳐야 한다 — 글자색칸과 같은 방식."""
    쪽 = workbench.쪽만들기("abc", [_배경자리카드()], [])
    assert "r[색키] = 색 || 기본색" in 쪽
    assert "r[진키] = Number(막대.value)" in 쪽
    assert "막대.onchange = () => 설계도고치기" in 쪽, "change 라야 되돌리기가 안 쌓인다"


# ── 사진 바깥 그림자 ──────────────────────────────────────────

def _그림자카드():
    카드 = _카드()
    카드["장식영역"] = [{"종류": "사진", "box": [300, 400, 700, 700],
                    "media_url": "http://x/y.jpg", "그림자진하기": 40}]
    return 카드


def test_화면은_모양을_따라가는_그림자를_쓴다():
    """`clip-path` 로 오린 요소에 `box-shadow` 를 걸면 그림자까지 잘려 안 보인다 —
    원형 사진이 원형 그림자를 가지려면 `drop-shadow` 여야 한다."""
    쪽 = workbench.쪽만들기("abc", [_그림자카드()], [])
    assert "function 그림자CSS" in 쪽
    assert "drop-shadow(" in 쪽, "box-shadow 가 아니라 drop-shadow 여야 한다"
    assert "box-shadow" not in 쪽.split("function 그림자CSS")[1][:400]


def test_그림자_기본값이_굽는_쪽과_같다():
    import json
    import cardnews_compose as cc
    쪽 = workbench.쪽만들기("abc", [_그림자카드()], [])
    기대 = json.dumps([cc.그림자기본색, cc.그림자기본진하기, cc.그림자아래, cc.그림자흐림])
    assert f"const [그림자기본색, 그림자기본진하기, 그림자아래, 그림자흐림] = {기대}" in 쪽, 기대


def test_그림자_손잡이가_사진_칸에서_켜진다():
    쪽 = workbench.쪽만들기("abc", [_그림자카드()], [])
    assert "'그림자 (사진 바깥)'" in 쪽
    assert "색과막대(r, '그림자색', '그림자진하기'" in 쪽
    assert "r[색키] = 색 || 기본색" in 쪽
    assert "r[진키] = Number(막대.value)" in 쪽


def test_글자칸에_브라우저_기본_포커스_링을_안_그린다():
    """**계단 모양 검은 선을 끈다**(사람 지적 2026-09-18: 「난 그냥 줄 일자였으면」).

    글자칸은 `contentEditable` 이라 크롬이 누를 때 제 포커스 링을 그리는데,
    그 링은 네모가 아니라 «줄마다의 실제 글자 폭» 을 따라가서 줄 길이가 다르면
    층이 진다. 고른 표시는 우리가 그리는 파란 네모(`.선택겹`)가 이미 한다.
    """
    쪽 = workbench.쪽만들기("abc", [_카드()], [])
    assert ".칸.글자:focus, .칸.글자 *:focus { outline:none; }" in 쪽


def test_가로로_넘친_줄에_빨간_바탕을_안_깐다():
    """**색만 뺀다**(사람 지적 2026-09-18: 「줄 넘어가면 빨간색으로 보이잖아
    그거 없애자, 색깔 이 부분만」).

    넘침 «셈» 은 그대로다 — `넘침()` 을 부르고 `.넘침` 표를 줄에 붙이는 것까지
    남긴다. 굽는 쪽·대본 검증이 같은 셈을 쓰기 때문이다. 화면에서 빨갛게
    칠하지만 않는다. 다른 빨간 표시(카드 밖으로·세로 넘침·올리기 실패)는
    뜻이 달라서 그대로 둔다.
    """
    쪽 = workbench.쪽만들기("abc", [_카드()], [])
    assert "background:rgba(255,0,0" not in 쪽, "가로 넘침 빨간 바탕이 남아 있다"
    assert "classList.toggle('넘침'" in 쪽, "넘침 셈과 표는 그대로 둔다"
    assert ".칸.밖으로 { outline:2px solid #ff5555; }" in 쪽, "카드 밖으로는 그대로"


def test_세로로_넘쳐도_빨갛게_안_두른다():
    """**2026-09-18 결정을 사람이 넓혔다**(2026-09-20: 「글자 아웃되어도
    빨간색 안뜨게 하고싶어 보기 흉흉해」).

    그때는 «가로» 넘침만 칠을 뺐고 «세로» 넘침의 빨간 테두리는 남겼는데,
    사람이 보기엔 둘 다 「글자가 넘쳤다」 하나다. 셈은 그대로 둔다 —
    굽는 쪽·대본 검증이 같은 셈을 쓴다. 화면에서 두르지만 않는다.

    **남기는 둘은 뜻이 다르다** — 칸이 카드 밖으로 나간 것과 사진 올리기
    실패는 «사람이 고쳐야 하는 일» 이고, 글자 넘침은 그 자체로 흔하다.
    """
    쪽 = workbench.쪽만들기("abc", [_카드()], [])
    assert ".칸.세로넘침 { outline:2px solid #ff5555; }" not in 쪽, (
        "세로 넘침을 아직 빨갛게 두른다")
    assert "세로넘침" in 쪽, "셈까지 없앴다 — 표는 붙이되 칠만 안 한다"
    # 뜻이 다른 둘은 그대로여야 한다.
    assert ".칸.밖으로 { outline:2px solid #ff5555; }" in 쪽, "카드 밖으로가 같이 사라졌다"
    assert ".칸.올리기실패 { outline:2px solid #ff5555; }" in 쪽, "올리기 실패가 같이 사라졌다"


# ── 글자칸을 상자 하나로 ────────────────────────────────────────

def test_글자칸은_상자_하나다():
    """**줄마다 상자를 만들면 커서가 줄을 못 넘는다**(사람 지적 2026-09-18:
    「아래키 눌러도 거기로 안 가고, 드래그해도 각 줄에서만 되더라」).

    브라우저는 `contentEditable` 요소 «하나» 를 글 한 덩어리로 본다. 줄마다
    걸면 서로 남남인 입력칸이 되어 커서·선택이 그 안에 갇힌다.
    """
    쪽 = workbench.쪽만들기("abc", [_카드()], [])
    assert "el.contentEditable = 'true'" in 쪽, "칸에 걸어야 한다"
    assert "d.contentEditable" not in 쪽, "줄에는 안 건다"


def test_글자_이벤트는_칸에_건다():
    """상자가 칸 하나이므로 `input`·`focus`·`blur`·`keydown` 도 칸에 걸어야 한다.
    줄에 걸면 상자가 아닌 요소라 이벤트가 안 온다."""
    쪽 = workbench.쪽만들기("abc", [_카드()], [])
    # 2026-09-28: `focus`(누를 때의 글 적기)는 없어졌다 — `blur` 가 화면과 모델을 견준다.
    for 이름 in ("input", "blur", "keydown", "paste"):
        assert f"el.addEventListener('{이름}'" in 쪽, 이름
        assert f"d.addEventListener('{이름}'" not in 쪽, f"줄에 걸린 {이름} 가 남았다"


def test_엔터는_커서가_든_줄을_쪼갠다():
    """상자가 하나가 되면서 `d`(그 줄)가 없어졌다 — 커서가 어느 줄에 있는지
    셀렉션으로 찾아야 한다. 못 찾으면 아무것도 안 한다(글을 잃지 않는다)."""
    쪽 = workbench.쪽만들기("abc", [_카드()], [])
    assert "function 커서줄" in 쪽, "커서가 든 줄을 찾는 함수"
    assert "문장나누기(" in 쪽, "나누는 셈을 쓴다"
    assert "const 곳 = 커서줄(el)" in 쪽 and "if (!곳) return" in 쪽, "못 찾으면 아무것도 안 한다"


def test_우리_표가_없는_조각을_줄로_되돌린다():
    """붙여넣기·백스페이스로 브라우저가 `.줄` 없는 div 를 만들 수 있다.
    그대로 두면 줄 세기가 어긋나 형광펜이 엉뚱한 줄에 붙는다."""
    쪽 = workbench.쪽만들기("abc", [_카드()], [])
    assert "function 줄표다시붙이기" in 쪽
    assert "줄표다시붙이기(el, r, s)" in 쪽, "글이 바뀔 때마다 부른다"


def test_여러_줄을_긁으면_줄마다_자리를_낸다():
    """상자가 칸 하나가 되어 여러 줄을 긁을 수 있다(2026-09-18). 시작점이 든
    줄 하나만 보면 두 줄을 긁었을 때 끝 자리가 엉뚱한 줄 기준으로 읽힌다."""
    쪽 = workbench.쪽만들기("abc", [_카드()], [])
    assert "function 긁은자리들" in 쪽, "줄마다 자리를 내는 함수"
    # 2026-09-28: 형광펜도 효과를 거는 한 길(`효과로고치기`)을 거친다.
    assert "효과로고치기(r, (글줄, 곳들) => 효과바꾸기(글줄, 곳들, '형광펜', 색)" in 쪽, "형광펜걸기가 쓴다"
    # 2026-09-19: 굵게도 `굵게걸기()` 를 거친다(안 긁으면 칸 전체).
    assert "function 굵게걸기" in 쪽, "굵게걸기가 쓴다"
    assert "for (const 곳 of 곳들 || [])" in 쪽, "줄마다 건다"
    # 2026-09-19: 못 읽으면(안 긁었으면) 이제 «칸 전체» 로 간다 — 형광펜은
    # 이미 칠한 것들의 색을 바꾸고, 굵게는 칸 굵기를 뒤집는다.
    assert "if (!곳들.length && 칸바꿈) 칸바꿈()" in 쪽, "안 긁었을 때 갈 길이 있어야 한다"


# ── 옆 세로 패널 ──────────────────────────────────────────────

def test_무대와_패널이_가로로_나뉜다():
    """**단추 15개가 한 줄에 몰려 있어서 슬라이더를 넣을 자리가 없었다.**
    가로 막대를 세로 패널로 바꾼다(미리캔버스 구조, 사람 결정 2026-09-18).
    """
    쪽 = workbench.쪽만들기("abc", [_카드()], [])
    assert '<div class="일터">' in 쪽
    assert '<aside id="패널">' in 쪽
    assert ".일터 { display:flex;" in 쪽, "무대와 패널을 가로로 나란히"


def test_패널은_고른_것에_따라_바뀐다():
    """글자를 골랐는데 사진 손잡이가 보이면 안 된다 — 여태 도구막대가 그랬다
    (단추 15개가 늘 다 보였다).

    사람에게는 「배경 사진」이라 적는다(사람 결정 2026-09-18). 코드 표는
    그대로 `배경자리` 다 — 굽는 쪽·틀이 그 이름을 쓴다.
    """
    쪽 = workbench.쪽만들기("abc", [_카드()], [])
    assert "function 패널그리기" in 쪽
    assert "function 패널갈래" in 쪽
    assert "배경사진: '배경 사진'" in 쪽, "사람에게 보이는 이름"
    assert "r.배경자리" in 쪽, "판단은 코드 표로 한다"
    assert "패널그리기()" in 쪽, "고른 것이 바뀔 때 다시 그린다"


def test_글자_묶음에_크기_정렬_글씨체가_있다():
    """설계도에 `pt`·`align`·`font` 가 있는데 사람이 바꿀 길이 없었다 —
    가로 도구막대에 자리가 없어서다(2026-09-18)."""
    쪽 = workbench.쪽만들기("abc", [_카드()], [])
    assert "function 줄칸" in 쪽, "패널 한 줄 만드는 도우미"
    assert "function 단추" in 쪽
    assert "r.pt = pt" in 쪽, "크기를 설계도에 되쓴다"
    assert "r.align = a" in 쪽, "정렬을 설계도에 되쓴다"
    assert "r.font = 글꼴칸.value" in 쪽, "글씨체를 설계도에 되쓴다"


def test_크기를_바꾸면_네모_높이도_따라간다():
    """글자가 커지면 줄이 높아진다 — 네모가 그대로면 글이 밖으로 넘친다.
    `높이맞추기()` 가 이미 하는 셈을 그대로 쓴다."""
    쪽 = workbench.쪽만들기("abc", [_카드()], [])
    assert "function 글자크기바꾸기" in 쪽
    assert "높이맞추기(r.box, 줄수, pt, r.줄간격)" in 쪽


def test_줄_간격_손잡이가_있다():
    """설계도에 `줄간격` 이 이미 있고(틀 120개 중 64개) 굽는 쪽도 그 값을 쓰는데
    사람이 바꿀 길이 없었다. 값이 없으면 붙박이 1.32 를 쓴다."""
    쪽 = workbench.쪽만들기("abc", [_카드()], [])
    assert "function 줄간격바꾸기" in 쪽
    assert "r.줄간격 = 간격" in 쪽, "설계도에 되쓴다"
    assert "높이맞추기(r.box, 줄수, r.pt, 간격)" in 쪽, "네모 높이도 따라간다"


def test_패널_단추마다_마우스_설명이_있다():
    """**아이콘만 있으면 무슨 단추인지 모른다**(사람 지적 2026-09-18:
    「모양 부분에 마우스 갖다대면 뭔지 알려줘야지 굵기인지 뭐인지」).

    `B`·`▤▥▦` 는 글자만 봐서는 뜻이 안 드러난다. 도구막대 단추들이 이미
    `title` 을 달고 있으므로 패널도 같은 대접을 한다.
    """
    쪽 = workbench.쪽만들기("abc", [_카드()], [])
    assert "function 단추(글, 눌림, 눌렀을때, 설명)" in 쪽, "단추가 설명을 받는다"
    assert "b.title = 설명" in 쪽
    # 2026-09-19: 설명은 짧게 — 「굵기」·「밑줄」 한 마디(사람 결정).
    for 말 in ("'굵기'", "'밑줄'", "왼쪽 정렬", "가운데 정렬", "오른쪽 정렬"):
        assert 말 in 쪽, 말
    assert "'굵기·정렬'" in 쪽, "「모양」은 무엇의 모양인지 안 드러난다"


# ── 글씨체 목록이 여섯 곳에서 같은가 ─────────────────────────

def _글꼴목록들():
    """글씨체 이름이 적힌 여섯 곳을 읽어 {어디: [이름들]} 로.

    **여섯이 다 같아야 한다.** 하나만 빠지면 「고를 수는 있는데 저장이 400 으로
    거절」되거나 「저장은 되는데 딴 글꼴로 그려지는」 일이 생긴다.
    """
    import re
    뿌리 = HERE.parent
    난것 = {}

    import cardnews_compose as cc
    난것["render/cardnews_compose.한글글꼴"] = list(cc.한글글꼴)
    난것["render/workbench._글꼴들"] = list(workbench._글꼴들)

    import sys
    sys.path.insert(0, str(뿌리 / "analyze"))
    import fontmatch
    난것["analyze/fontmatch.FONT_FILES"] = list(fontmatch.FONT_FILES)

    글 = (뿌리 / "dify" / "틀점검.py").read_text(encoding="utf-8")
    m = re.search(r"그릴수있는글꼴 = \(([^)]*)\)", 글, re.S)
    난것["dify/틀점검.그릴수있는글꼴"] = re.findall(r'"([^"]+)"', m.group(1))

    for 자리 in ("web/lib/label.js", "web/server/labels.js"):
        글 = (뿌리 / 자리).read_text(encoding="utf-8")
        m = re.search(r"export const FONTS = \[([^\]]*)\]", 글, re.S)
        난것[자리 + ".FONTS"] = re.findall(r"'([^']+)'", m.group(1))
    return 난것


def test_글씨체_목록이_여섯_곳에서_같다():
    """표가 여섯 군데 흩어져 있다(2026-09-18 실측). 늘릴 때 하나만 빠뜨리면
    화면·굽기·분석·라벨·틀점검이 갈린다 — 이 시험이 그 그물이다."""
    표 = _글꼴목록들()
    기준이름, 기준 = next(iter(표.items()))
    for 어디, 목록 in 표.items():
        assert set(목록) == set(기준), (
            f"{어디} 가 {기준이름} 과 다르다\n"
            f"  {어디}: {sorted(목록)}\n"
            f"  {기준이름}: {sorted(기준)}")


def test_원티드산스가_들어_있다():
    """파일(`fonts/WantedSans-*.otf`)과 굽는 쪽 후보(`template.json`)에는 있는데
    표 여섯 곳에서만 빠져 있었다(2026-09-18)."""
    for 어디, 목록 in _글꼴목록들().items():
        assert "원티드산스" in 목록, f"{어디} 에 없다"


def test_글자색_형광펜은_패널에만_있다():
    """**같은 손잡이가 두 곳에 있으면 하나가 낡는다.** 값을 두 곳에서 그리면
    언젠가 갈라진다(음영 기본값이 실제로 그렇게 갈렸다, 2026-09-18).
    """
    쪽 = workbench.쪽만들기("abc", [_카드()], [])
    assert '<label class="색칸">글자 <input type="color" id="ㅈ글자색"></label>' not in 쪽
    assert '<label class="색칸">형광펜 <input type="color" id="ㅊ형광색"></label>' not in 쪽
    # 2026-09-19: 브라우저 기본 색칸 대신 «색칩»(우리 팔레트를 여는 네모)이다.
    assert "글자색칩" in 쪽, "패널이 제 색칩을 만든다"
    assert "형광칩" in 쪽


def test_형광펜_단추는_색칸을_그때그때_찾는다():
    """패널은 고를 때마다 다시 그려져 요소가 새로 생긴다 — 변수에 담아 둔 옛
    요소를 읽으면 낡은 값을 쓴다."""
    쪽 = workbench.쪽만들기("abc", [_카드()], [])
    assert "function 지금형광색()" in 쪽
    # 2026-09-18: 색을 안 넘기면(「칠하기」 단추) 그때 색칸에서 읽는다.
    assert "const 색 = 새색 || 지금형광색()" in 쪽, "색을 안 주면 지금 색칸에서 읽는다"


def test_같은_것을_고른_채면_패널을_다시_안_만든다():
    """**색칸을 누르는 순간 그 색칸이 사라져서 클릭이 안 먹었다**(사람 지적
    2026-09-18: 「지금은 클릭도 안 되는데」).

    색칸을 누르면 글자칸에서 초점이 빠지고(`blur`), 그것이 `그리기()` →
    `색칸그리기()` → `패널그리기()` 를 부른다. `패널그리기()` 는 맨 먼저
    `innerHTML = ''` 로 안을 지우므로 «누르고 있던 요소» 가 그 자리에서
    없어진다.

    그래서 고른 것이 그대로면 아무것도 안 한다 — 다시 만들 까닭이 없다.
    """
    쪽 = workbench.쪽만들기("abc", [_카드()], [])
    assert "패널.dataset.무엇" in 쪽, "무엇을 그려 뒀는지 적어 둔다"
    assert "if (패널.dataset.무엇 === 열쇠) return" in 쪽, "같으면 그대로 둔다"


def test_긁고_색을_고르면_긁은_데만_바뀐다():
    """**안 긁었으면 칸 전체다** — 여태 하던 대로. 손에 익은 것을 안 뺏는다.

    칸 색과 같은 색을 고르면 그 구간을 «빼는» 것으로 친다 — 되돌릴 길이 있어야
    하고, 형광펜을 한 번 더 눌러 빼는 것과 같은 뜻이다.
    """
    쪽 = workbench.쪽만들기("abc", [_카드()], [])
    assert "function 글자색걸기" in 쪽
    assert "긁은자리들(r, null)" in 쪽, "긁은 데가 없으면 말없이 칸 전체로 간다"
    assert "색걸기(글줄, 곳들, 새색, r.글자색)" in 쪽, "긁었으면 그 글자에 건다"
    assert "r.글자색 = 새색" in 쪽, "안 긁었으면 칸 전체"
    assert "if (할말) alert" in 쪽, "할말이 없으면 안 띄운다"


def test_이미_고른_글자칸_안에서는_안_끌린다():
    """**글자를 긁으려는데 칸이 움직였다**(사람 지적 2026-09-18: 「형광펜
    안 되는데?」). 브라우저에서 재현: 글자칸 안을 드래그했더니 긁힌 글이 빈
    채로 칸 네모만 [70,140,…] → [306.9,140,…] 으로 옮겨졌다.

    옮기는 길은 따로 있다 — 칸 왼쪽 위 「옮기기 손잡이」다. 그래서 이미 고른
    글자칸 «안» 을 다시 누르면 끌기를 안 걸고 브라우저의 글자 선택에 맡긴다.
    처음 누를 때는 그대로 끌린다 — 고르자마자 옮기는 손이 익어 있다.
    """
    쪽 = workbench.쪽만들기("abc", [_카드()], [])
    assert "const 글자를긁는중 =" in 쪽
    assert "if (!r.배경자리 && !글자를긁는중) 끌기시작" in 쪽


def test_패널_형광펜으로_칠하고_색도_고른다():
    """**아래 도구막대는 안 쓴다**(사람 결정 2026-09-18: 「난 오른쪽에 있는
    형광펜으로 형광펜을 적용시키고 그리고 색깔도 하고 싶다」).

    색칸 하나가 두 일을 한다 — 긁은 데가 있으면 그 색으로 «칠하고», 안 긁었으면
    이미 칠한 것들의 색만 바꾼다. 「칠하기」 단추는 색을 안 바꾸고 지금 색으로
    칠한다(이미 칠한 데면 뺀다).
    """
    쪽 = workbench.쪽만들기("abc", [_카드()], [])
    assert "function 형광펜걸기" in 쪽
    # 2026-09-19: 우리 팔레트는 창을 안 띄우므로 «자리를 미리 적어 두는 꼼수»
    # 가 필요 없다 — 누르는 동안 긁어놓은 선택이 그대로 살아 있다.
    assert "색고르개열기(형광칩" in 쪽, "형광펜이 우리 팔레트를 연다"
    # 2026-09-19: 「낱말 굵게」 줄은 뺐다 — `B` 하나가 둘을 다 한다(중복이었다).
    assert "단추('B'" in 쪽, "굵게는 B 하나로"


def test_굵게는_긁으면_낱말만_안_긁으면_칸_전체():
    """**단추 둘은 중복이다**(사람 결정 2026-09-19: 「낱말 굵게는 이미 굵기·정렬
    부분에 있잖아 중복이잖아」).

    `B` 하나가 글자색·형광펜과 같은 규칙을 따른다 — 긁었으면 긁은 낱말만
    (`굵기` 구간), 안 긁었으면 칸 전체(`weight`).
    """
    쪽 = workbench.쪽만들기("abc", [_카드()], [])
    assert "function 굵게걸기" in 쪽
    assert "r.weight = " in 쪽, "안 긁었으면 칸 전체"
    assert "효과바꾸기(글줄, 곳들, '굵게')" in 쪽, "긁었으면 그 낱말만"
    assert "단추('낱말 굵게'" not in 쪽 and "'낱말 굵게'" not in 쪽, "중복 단추는 없앤다"


# ── 색 고르개 팔레트 ──────────────────────────────────────────

def test_색칸을_누르면_우리_팔레트가_뜬다():
    """**윈도우 색 고르개를 안 쓴다**(사람 결정 2026-09-19, 미리캔버스 화면을
    보여 줌). 그 창이 떴다 닫히는 사이 브라우저가 포커스를 잃어 긁어놓은
    선택이 풀린다 — 직접 만들면 창이 안 떠서 선택이 살아 있다.
    """
    쪽 = workbench.쪽만들기("abc", [_카드()], [])
    assert "function 색고르개열기" in 쪽
    assert "기본 팔레트" in 쪽, "색 격자에 이름을 단다"
    assert "id=\"색고르개\"" in 쪽 or "'색고르개'" in 쪽


def test_팔레트에_없음과_직접고르기가_있다():
    """맨 위 「없음」은 색을 빼는 것(형광펜을 지우거나 칸 색으로 되돌린다).
    맨 아래 직접 고르기는 격자에 없는 색을 쓸 때다 — `#RRGGBB` 를 직접 칠 수도
    있어야 한다."""
    쪽 = workbench.쪽만들기("abc", [_카드()], [])
    assert "없음" in 쪽
    assert "글칸.placeholder = '#000000'" in 쪽, "색을 직접 칠 수 있어야 한다"
    assert "/^#[0-9A-Fa-f]{6}$/.test(v)" in 쪽, "친 값이 색꼴인지 본다"
    # **브라우저 기본 색 고르개는 안 쓴다**(사람 지적 2026-09-19): 큰 창이 떠서
    # 우리 팔레트를 덮고, 그 사이 포커스가 옮겨가 긁은 선택도 풀린다.
    assert "정밀.type = 'color'" not in 쪽, "브라우저 색 고르개를 띄우면 안 된다"
    assert "미리보기.style.background" in 쪽, "친 색을 옆 네모로 보여 준다"


def test_팔레트에서_고르면_바로_걸린다():
    """색을 누르는 순간 적용된다 — 확인 단추를 또 누르게 하지 않는다."""
    쪽 = workbench.쪽만들기("abc", [_카드()], [])
    assert "고른뒤(색)" in 쪽, "팔레트가 고른 색을 그대로 넘긴다"


def test_패널_색칸이_우리_팔레트를_연다():
    """윈도우 창을 안 띄우므로 «자리를 미리 적어 두는 꼼수» 가 필요 없다 —
    누르는 동안 긁어놓은 선택이 그대로 살아 있다."""
    쪽 = workbench.쪽만들기("abc", [_카드()], [])
    assert "색고르개열기(글자색칩" in 쪽, "글자색이 팔레트를 연다"
    assert "색고르개열기(형광칩" in 쪽, "형광펜이 팔레트를 연다"
    assert "적어둔자리" not in 쪽, "창이 안 뜨니 미리 적어 둘 까닭이 없다"
    assert "형광적어둔자리" not in 쪽


def test_색칩을_눌러도_긁은_것이_안_풀린다():
    """**버튼을 누르면 포커스가 옮겨가며 선택이 풀린다.** 그래서 긁고 색을
    골라도 「안 긁었다」가 됐다(사람 지적 2026-09-19: 「형광펜은 아직도 안 된다」).

    `mousedown` 에서 기본 동작을 막으면 포커스가 안 옮겨가고 선택이 살아 있다.
    팔레트 안의 색 칩들도 같다.
    """
    쪽 = workbench.쪽만들기("abc", [_카드()], [])
    assert "선택안뺏기" in 쪽, "포커스를 안 뺏는 도우미"
    assert "글자색칩.onmousedown = 선택안뺏기" in 쪽
    assert "형광칩.onmousedown = 선택안뺏기" in 쪽
    assert "칩.onmousedown = 선택안뺏기" in 쪽, "팔레트 안 칩도 마찬가지"


def test_아래_도구막대에_형광펜_굵게가_없다():
    """**오른쪽 패널에 다 있으니 아래 것은 지운다**(사람 결정 2026-09-19:
    「밑에 형광펜 버튼이랑 굵게 버튼은 지워 우리 오른쪽에 다 있으니까」).
    """
    쪽 = workbench.쪽만들기("abc", [_카드()], [])
    assert 'id="ㄹ형광"' not in 쪽
    assert 'id="ㅈ굵게"' not in 쪽
    assert "getElementById('ㄹ형광')" not in 쪽, "없는 단추를 찾으면 그 자리에서 죽는다"
    assert "getElementById('ㅈ굵게')" not in 쪽


# ── 도구막대 정리 ────────────────────────────────────────────

def test_늘_쓰는_것만_머리줄에_있다():
    """**아래 가로 막대를 없앤다**(사람 결정 2026-09-19). 늘 쓰는 것은 위로,
    고른 것에 따라 쓰는 것은 오른쪽 패널로 간다.
    """
    쪽 = workbench.쪽만들기("abc", [_카드()], [])
    assert '<div id="줄단추">' not in 쪽, "가로 도구막대를 없앤다"
    머리 = 쪽.split('<div class="일터">')[0]
    # 「ㅇ틀」(템플릿으로 내보내기)은 뺐다(사람 지시 2026-09-22).
    for 이름 in ("ㅁ되돌", "ㅂ다시", "ㅅ저장", "ㅇ결과"):
        assert f'id="{이름}"' in 머리, f"{이름} 는 머리줄에"
    assert 'id="ㅇ틀"' not in 쪽


def test_숨긴_단추는_그대로_남는다():
    """**처리 코드가 단추 id 를 잡고 있다.** 없애면 그 자리에서 죽는다 —
    숨긴 채로 두고 패널 단추가 그것을 대신 누른다.
    """
    쪽 = workbench.쪽만들기("abc", [_카드()], [])
    for 이름 in ("ㄱ사진", "ㄴ글자추가", "ㄷ사진추가", "ㅌ뒤로", "ㅍ앞으로"):
        assert f'id="{이름}"' in 쪽, f"{이름} 가 사라지면 처리 코드가 죽는다"
    # 단추 하나하나가 아니라 «감싼 div» 에 hidden 을 건다.
    assert "<div hidden>" in 쪽, "숨긴 단추들을 한 겹에 담는다"


def test_패널에_넣기와_층이_있다():
    """아무것도 안 골랐으면 ＋글자·＋사진, 사진을 골랐으면 층(뒤로·앞으로)."""
    쪽 = workbench.쪽만들기("abc", [_카드()], [])
    assert "단추('＋글자'" in 쪽 and "단추('＋사진'" in 쪽
    assert "단추('⬓ 뒤로'" in 쪽 and "단추('⬒ 앞으로'" in 쪽


def test_화면도_긁은_데만_밑줄을_긋는다():
    """화면과 구운 그림이 갈리면 안 된다 — 같은 구간에 같은 밑줄."""
    쪽 = workbench.쪽만들기("abc", [_카드()], [])
    assert "효과바꾸기(글줄, 곳들, '밑줄')" in 쪽
    assert "조각.style.textDecoration = 'underline'" in 쪽, "덩어리마다 밑줄을 건다"


def test_패널에_밑줄_단추가_있다():
    """긁었으면 긁은 데만, 안 긁었으면 칸 전체 — 다른 손잡이와 같은 규칙."""
    쪽 = workbench.쪽만들기("abc", [_카드()], [])
    assert "function 밑줄걸기" in 쪽
    assert "단추('U'" in 쪽
    assert "효과바꾸기(글줄, 곳들, '밑줄')" in 쪽, "긁었으면 그 글자에 건다"
    assert "r.효과 = " in 쪽, "안 긁었으면 칸 전체"


def test_긁은_데에_걸린_굵기_밑줄이_단추에_비친다():
    """**적용된 데를 긁으면 그 단추가 파래져야 한다**(사람 지적 2026-09-19:
    「밑줄 적용된 부분은 드래그하면 적용되었다는 표시가 떴어야지」).

    여태 `B`·`U` 는 칸 전체 값(`weight`·`효과`)만 봤다 — 긁은 낱말에 걸린
    구간(`굵기`·`밑줄구간`)은 안 봤다. 긁은 자리가 그 구간에 «온전히 들어가면»
    걸린 것으로 친다.
    """
    쪽 = workbench.쪽만들기("abc", [_카드()], [])
    assert "function 긁은데걸렸나" in 쪽
    assert "function 표시갱신" in 쪽
    assert "selectionchange" in 쪽, "긁은 자리가 바뀌면 표시도 따라간다"
    assert "긁은데걸렸나(r, '굵게')" in 쪽 and "긁은데걸렸나(r, '밑줄')" in 쪽


def test_패널에_글머리기호_넷이_있다():
    """원·네모·줄표·번호(사람이 고름 2026-09-19). 긁은 «줄들» 에 붙는다 —
    낱말 하나에 점을 찍을 수는 없다.

    **도형으로 그린다** — 글자로 찍으면 글꼴에 따라 빈 네모가 나온다
    (검은고딕에는 ● ○ ■ 가 하나도 없다).
    """
    쪽 = workbench.쪽만들기("abc", [_카드()], [])
    assert "function 글머리걸기" in 쪽
    assert "글머리바꾸기(" in 쪽, "글머리를 설계도에 안 남긴다"
    for 갈래 in ("원", "네모", "줄표", "번호"):
        assert f"'{갈래}'" in 쪽, 갈래
    assert ".줄[data-글머리=\"원\"]::before" in 쪽, "화면도 도형으로 그린다"


def test_글머리는_긁은_줄_전체에_붙는다():
    """한 글자만 긁어도 그 줄 전체에 붙는다 — 줄 단위 값이다."""
    쪽 = workbench.쪽만들기("abc", [_카드()], [])
    assert "글머리바꾸기(글줄, [...new Set(곳들.map((곳) => 곳.줄))], 갈래)" in 쪽, \
        "긁은 자리에서 줄만 뽑는다"

def test_도형을_끌어_키우면_모양도_같이_늘어난다(tmp_path):
    """네모만 키우면 칸만 커지고 모양은 원래 크기로 남는다 — 화면도 구운 그림도
    `테두리` 점을 «칸 왼쪽 위에서 떨어진 거리» 로 읽기 때문이다. 끌 때 점을 같이
    늘려 둬야 둘 다 커진다(사람 지적 2026-09-19)."""
    h, _ = _쪽스크립트(tmp_path)
    assert "function 모양늘리기" in h, "늘리는 함수가 쪽에 박혀야 한다"
    assert "function 모양따라가기" in h
    # 세 자리에 다 걸어야 한다 — 하나만 걸면 미리보기와 저장이 갈린다.
    # 옮기기에는 안 건다: 점이 칸 기준이라 네모가 옮겨지면 저절로 따라간다.
    for 부름 in ("if (손잡이) 모양따라가기(r, 처음, r.box)",      # 끄는 동안
                "모양따라가기(r, 처음, 처음.box)",              # 놓을 때 되돌리기
                "모양따라가기(r, 처음, 끝난것.box)"):           # 설계도에 적기
        assert 부름 in h, 부름

def test_테두리_손잡이가_글자에도_사진에도_붙는다(tmp_path):
    """같은 값(`선색`·`선굵기`)이라 세 갈래에 같은 손잡이가 붙어야 한다 —
    갈래마다 따로 만들면 언젠가 갈라진다(사람 요청 2026-09-19)."""
    h, _ = _쪽스크립트(tmp_path)
    assert "function 색과굵기" in h
    assert "테두리 (둘레 선)" in h
    assert "갈래 === '글자' || 갈래 === '사진' || 갈래 === '배경사진'" in h


def test_테두리는_모양이_있으면_모양을_따라_긋는다(tmp_path):
    """오려낸(clip-path) 칸에는 CSS 선이 안 붙는다 — SVG 로 모양을 따라 긋고,
    굽는 쪽(`cardnews_compose._선그리기`)과 같이 **안쪽** 절반만 남긴다."""
    h, _ = _쪽스크립트(tmp_path)
    시작 = h.index("function 선그리기")
    본문 = h[시작:h.index("\nfunction ", 시작 + 1)]
    assert "polygon" in 본문 and "stroke" in 본문
    assert "굵기 * 2" in 본문, "바깥 절반이 잘리므로 두 배로 그어야 한다"
    # 네모도 «겹» 으로 긋는다 — 안쪽 그림자는 내용 밑에 깔려서 사진을 넣으면
    # `<img>` 가 덮어 선이 사라졌다(사람 지적 2026-09-19).
    assert "boxShadow" not in 본문, "안쪽 그림자는 사진에 덮인다"
    assert 본문.count("테두리겹") >= 2, "네모도 겹으로 그려야 한다"


def test_선굵기_상한은_설계도_검사에서_온다(tmp_path):
    """화면 막대가 검사보다 큰 값을 내면 사람이 끌어 놓고 저장할 때서야
    「선굵기는 0~60 이다」를 본다 — 숫자를 두 곳에 적지 않는다."""
    import edit_store
    h, _ = _쪽스크립트(tmp_path)
    assert f"const 선굵기상한 = {edit_store.선굵기상한}" in h

def test_모양_단추는_이름_말고_그_모양을_보여_준다(tmp_path):
    """사람 지시 2026-09-19: 「이름말고 … 모양을 보여주는거임 ＋도형모양 빼고」.
    좁은 패널에서 「둥근네모」 는 넉 줄로 접혀 읽을 수도 없었다."""
    본문, _ = _쪽스크립트(tmp_path)
    assert "function 모양그림(갈래, 크기)" in 본문, "모양을 그리는 길이 없다"
    assert "b.appendChild(모양그림(갈래, 20))" in 본문, "단추에 그림을 안 넣는다"
    # 그림은 실제 도형과 «같은 함수» 로 그린다 — 두 벌로 적으면 어긋난다.
    시작 = 본문.index("function 모양그림")
    assert "모양점들(갈래," in 본문[시작:시작 + 900]
    # 이름은 마우스를 올리면 뜬다(`ui-state-must-show` — 아이콘만 두지 않는다).
    assert "'이 장에 ' + 갈래 + ' 도형을 하나 더'" in 본문
    assert "'이 도형을 ' + 으로(갈래)" in 본문
    # 이름표를 뗀다.
    assert "줄칸('＋도형 모양'" not in 본문


def test_고른_도형의_모양도_그림으로_고른다(tmp_path):
    """넣을 때와 바꿀 때가 다르게 생기면 같은 것인 줄 모른다."""
    본문, _ = _쪽스크립트(tmp_path)
    assert "모양단추(갈래, 갈래 === 지금모양()" in 본문, "그림 단추가 아니다"
    assert "const 바꾸는줄 = 줄칸('모양', ...모양단추들)" in 본문


def test_모양을_바꾸면_파란_표시가_따라간다(tmp_path):
    """사람 지적 2026-09-19: 「사각형에서 원으로 바꾸면 그 부분이 파란색으로
    되어야하잖아」. 패널은 «고른 칸이 그대로면» 다시 안 그리므로 표시가 안 옮겨갔다.
    """
    본문, _ = _쪽스크립트(tmp_path)
    assert "function 모양표시하기()" in 본문, "다시 칠하는 길이 없다"
    # 바꾼 «뒤에» 칠한다 — 먼저 칠하면 옛 모양을 칠한다.
    시작 = 본문.index("const 모양단추들 = 도형모양들.map")
    토막 = 본문[시작:시작 + 700]
    assert 토막.index("설계도고치기(") < 토막.index("모양표시하기()"), "바꾸기 전에 칠한다"
    # 지금 걸린 모양은 «그때그때» 다시 센다 — 한 번 재고 마는 값이면 안 바뀐다.
    assert "const 지금모양 = () =>" in 본문


def test_도형은_모양을_골라야_생긴다(tmp_path):
    """사람 지시 2026-09-19: 「＋도형을 누르면 바로 도형이 생기는게 아니라
    ＋도형을 누르고 모양을 골라야 생긴다고」.
    """
    본문, _ = _쪽스크립트(tmp_path)
    assert "모양단추(갈래, false, () => 도형넣기(갈래)" in 본문, "모양 고르는 줄이 없다"
    # ＋도형은 이제 «펴고 접는» 단추다 — 눌러도 도형이 안 생긴다.
    assert "대신누르기('ㅁ도형추가')" not in 본문, "＋도형이 아직 바로 만든다"
    assert "모양줄.hidden = !모양줄.hidden" in 본문
    # 여섯 모양이 다 이 줄에 있다 — 네모도 여기서 고른다.
    시작 = 본문.index("const 모양줄 = 줄칸")
    assert "갈래 !== '네모'" not in 본문[시작:시작 + 400], "네모가 빠졌다"
    # 넣는 길은 하나다.
    assert 본문.count("function 도형넣기") == 1
    assert "getElementById('ㅁ도형추가').onclick = () => 도형넣기('네모')" in 본문


def test_모양_여섯이_패널_안에_들어간다(tmp_path):
    """사람 지적 2026-09-19 — 286px 패널에 34px 단추 여섯이 안 들어가서 가로
    밀대가 생기고 육각형이 잘렸다."""
    본문, _ = _쪽스크립트(tmp_path)
    assert "#패널 button.모양단추 { padding:3px; line-height:0; }" in 본문, "단추가 아직 크다"
    assert "#패널 .줄칸.모양줄 { gap:5px; flex-wrap:wrap; }" in 본문, "넘치면 접어야 한다"
    # 빈 이름칸이 52px 를 먹으면 여섯이 안 들어간다.
    assert "#패널 .줄칸.모양줄 > span:first-child:empty { display:none; }" in 본문
    # 두 줄 다 그 규칙을 쓴다.
    assert 본문.count(".classList.add('모양줄')") == 2


def test_모양줄은_눌러야_보인다(tmp_path):
    """사람 지시 2026-09-19: 「밑에 있는 5개 버튼 없애도 된다고」.
    안 쓸 때도 자리를 차지했다. 눌러 놓은 동안은 ＋도형이 파랗게 눌려 있다.
    """
    본문, _ = _쪽스크립트(tmp_path)
    assert "모양줄.hidden = true" in 본문, "처음부터 펴져 있다"
    assert "도형단추.classList.toggle('눌림', !모양줄.hidden)" in 본문, "누른 표시가 없다"
    # **`hidden` 만으로는 안 숨는다.** `#패널 .줄칸 { display:flex }` 가 아이디를
    # 끼고 있어 브라우저 기본 `[hidden] { display:none }` 보다 세다 — 붙여 놓고도
    # 그대로 보였다(사람 지적 2026-09-19: 「여전히 보임」).
    assert "#패널 .줄칸[hidden] { display:none; }" in 본문, "hidden 이 CSS 에 진다"
    # 모양 있는 것은 정사각에 가깝게 — 가로로 긴 네모에 원을 넣으면 찌그러진다.
    시작 = 본문.index("function 도형넣기")
    토막 = 본문[시작:시작 + 900]
    assert "모양점들(갈래, box)" in 토막, 토막[:400]


def test_결과_보기_단추가_저장_뒤에만_열린다(tmp_path):
    """결과 쪽은 저장할 때 같이 구워진다 — 굽기 전에는 열 것이 없다."""
    h, _ = _쪽스크립트(tmp_path)
    assert 'id="ㅇ결과"' in h, "결과 보기 단추가 없다"
    assert "결과.disabled = 안저장 || !상태.결과" in h, "저장 전에도 눌린다"
    assert "상태.결과 = j.결과" in h, "저장이 돌려준 주소를 안 받는다"


def test_사진_자리에_영상도_된다고_적혀_있다(tmp_path):
    """영상이 되는 걸 아무도 몰랐다(사람 지적 2026-09-19)."""
    h, _ = _쪽스크립트(tmp_path)
    assert "사진/영상" in h
    assert "mp4" in h and "30초" in h, "영상 조건이 안 적혀 있다"


# ── 색 고르개: 무지개 판 ───────────────────────────────────────────

def test_미리보기를_누르면_무지개_판이_펴진다(tmp_path):
    """사람 요청 2026-09-19: 「그 색깔 누르면 … 모든 색깔 막 고르는거 …
    모든 색깔에 다 적용해야함」."""
    본문, _ = _쪽스크립트(tmp_path)
    assert "미리보기.onclick = () => {" in 본문, "누를 수 없는 미리보기다"
    assert "무지개.hidden = !무지개.hidden" in 본문, "펴고 접는 길이 없다"
    # 처음에는 접혀 있다 — 팔레트를 덮으면 안 된다.
    assert "무지개.hidden = true" in 본문


def test_색_자리_다섯이_같은_고르개를_쓴다(tmp_path):
    """한 군데만 고치면 글자색·형광펜·채움색·테두리색·음영에 전부 붙는다."""
    본문, _ = _쪽스크립트(tmp_path)
    assert 본문.count("색고르개열기(") == 6, "여는 자리 다섯 + 함수 하나"
    assert 본문.count("function 색고르개열기") == 1


def test_끄는_동안에는_설계도를_안_고친다(tmp_path):
    """`설계도고치기` 는 되돌리기를 한 칸 쌓는다 — 끌 때마다 고치면 수백 칸이 된다."""
    본문, _ = _쪽스크립트(tmp_path)
    assert "if (뗐나) 고른뒤(색)" in 본문, "손 뗄 때만 고쳐야 한다"


def test_잡아_가두기를_안_쓴다(tmp_path):
    """`hasPointerCapture` 로 「내가 잡고 있나」를 물으면 손 떼는 순간 이미
    «아니오» 라 **뗐다는 것을 못 받는다** — 색이 설계도에 안 담겼다."""
    본문, _ = _쪽스크립트(tmp_path)
    시작 = 본문.index("function 끌어고르기")
    토막 = 본문[시작:시작 + 1400]
    assert "PointerCapture" not in 토막, "무지개 판이 잡아 가두기를 쓴다"
    assert "window.addEventListener('pointerup', 뗌)" in 토막
    # 무대(칸 끌기)는 그대로 둔다 — 거기서는 잘 돌고 있다.
    assert "무대.setPointerCapture" in 본문


def test_색_오가는_셈이_맞다(tmp_path):
    """`#RRGGBB` → 색·짙기·밝기 → `#RRGGBB` 가 제자리로 돌아와야 한다."""
    import shutil
    import subprocess
    node = shutil.which("node")
    if not node:
        pytest.skip("node 가 없다")
    본문, _ = _쪽스크립트(tmp_path)
    줄바꿈 = chr(10)
    조각 = []
    for 이름 in ("function hsv에서hex", "function hex에서hsv"):
        시작 = 본문.index(이름)
        끝 = 본문.index(줄바꿈 + "}" + 줄바꿈, 시작) + 3
        조각.append(본문[시작:끝])
    시험 = tmp_path / "색.mjs"
    시험.write_text(줄바꿈.join(조각) + MJS_꼬리, encoding="utf-8")
    난것 = subprocess.run([node, str(시험)], capture_output=True, text=True)
    assert 난것.returncode == 0, 난것.stdout + 난것.stderr


MJS_꼬리 = """
const 것들 = ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff',
            '#c9fc95', '#3b5bff', '#7f3f1f', '#123456']
for (const c of 것들) {
  const h = hex에서hsv(c)
  const 되 = hsv에서hex(h.h, h.s, h.v)
  if (되 !== c) { console.error(c + ' -> ' + 되); process.exit(1) }
}
"""

# ── 글자 효과는 글자에 붙는다 (사람 지시 여섯 번, 2026-09-28) ───────────
#
# 「"완벽히" 를 글색 바꾸면 "완벽히" 이 단어를 봐야지 왜 다른곳이 바뀌냐고」(2026-09-20).
#
# 숫자 위치를 옮겨 주던 땜질(자리 옮기기)은 지웠다 — 효과는 덩어리의 글자에 있다.
# **셈 자체는 `web/test/workbench.test.js` 가 지킨다** — 여기서는 작업대 쪽이 그 셈을
# «부르고 있나» 만 본다. 진짜로 누르는 것은 `test_작업대_브라우저.py` 가 본다.

# **이름을 `_쪽` 으로 두면 안 된다** — 이 파일에 이미 `_쪽()` 함수가 있어
# 그것을 덮는다(실물 2026-09-20: 시험 아홉이 «str 은 못 부른다» 로 죽었다).
_작업대소스 = Path(HERE / "workbench.py").read_text(encoding="utf-8")


def test_줄만_바꾸고_끝내는_자리가_없다():
    """고치기 «전» 의 꼴이다. 다시 나타나면 같은 버그가 돌아온 것이다."""
    assert "설계도고치기(() => { r.lines = 새줄들; r.box = 새네모 })" not in _작업대소스


def test_쪽에_효과용_숫자_위치가_없다():
    """원칙 1 — 작업대 화면 코드가 다시 줄 번호로 효과를 가리키지 않는다."""
    쪽 = workbench.쪽만들기("abc", [_카드()], ["https://x/1.png"])
    본문 = 쪽[쪽.index("<script>"):]
    for 옛것 in ("줄번호", "구간옮기기", "고르개긁은자리", "색구간", "밑줄구간", "r.굵기", "줄굵기"):
        assert 옛것 not in 본문, 옛것


def test_쪽에_글줄이_박힌다():
    c = _카드()
    쪽 = workbench.쪽만들기("abc", [c], ["https://x/1.png"])
    assert '"글줄"' in 쪽 and "화면글줄" in 쪽 and "다시끊기" in 쪽
