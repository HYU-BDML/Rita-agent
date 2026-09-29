# -*- coding: utf-8 -*-
"""분석 Lambda 의 상자에 넣을 것을 빠뜨리지 않았나.

**빠뜨리면 임포트에서 죽는다.** 그런데 이 함수는 «비동기» 로 불려서 아무도
답을 못 본다 — 게시물이 「분석중」에 갇히고 사람은 왜 안 끝나는지 모른다.
작업대 쪽 `test_상자.py` 와 같은 이유, 같은 모양의 시험이다.
"""
import ast
import io
import re
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]        # cardnews/analyze
뿌리 = HERE.parent                                 # cardnews


def _요구목록() -> str:
    """주석을 뺀 «진짜 줄» 만. 주석에 이름이 나온다고 지고 가는 것은 아니다."""
    글 = io.open(HERE / "requirements-lambda.txt", encoding="utf-8").read()
    줄 = [l for l in 글.splitlines() if l.strip() and not l.lstrip().startswith("#")]
    return chr(10).join(줄).lower()


def _도커():
    """Dockerfile 을 읽되 **이어진 줄을 한 줄로 편다.**

    `COPY a.py \` 로 줄을 이어도 그건 COPY 한 명령이다. 안 펴면 둘째 줄에
    적힌 파일을 「없다」고 잘못 잡는다 — 파일은 상자에 잘 들어가는데 시험만
    빨개진다(2026-08-27 실제로 그랬다).
    """
    글 = (HERE / "Dockerfile").read_text(encoding="utf-8")
    return re.sub(r"\\\n\s*", " ", 글)


def _임포트(경로: Path) -> set:
    t = ast.parse(경로.read_text(encoding="utf-8"))
    이름 = set()
    for n in ast.walk(t):
        if isinstance(n, ast.Import):
            이름 |= {a.name.split(".")[0] for a in n.names}
        elif isinstance(n, ast.ImportFrom) and n.module and n.level == 0:
            이름.add(n.module.split(".")[0])
    return 이름


def test_손잡이가_전부_ASCII다():
    """Lambda 는 손잡이 이름을 «글자» 로 받아 importlib 에 넘긴다."""
    m = re.search(r'^CMD \["([^"]+)"\]', _도커(), re.M)
    assert m, "Dockerfile 에 CMD 가 없다"
    assert m.group(1).isascii(), f"손잡이에 ASCII 아닌 글자: {m.group(1)}"
    assert (HERE / "app.py").exists(), "손잡이 파일(app.py)이 없다"


def test_손잡이가_알맹이를_부른다():
    글 = (HERE / "app.py").read_text(encoding="utf-8")
    assert "handler" in 글 and "lambda_분석" in 글


def test_알맹이가_부르는_우리_모듈이_다_상자에_있다():
    """`lambda_분석.py` 가 끌어오는 사슬을 따라가며 상자와 대조한다."""
    도커 = _도커()
    본것, 볼것 = set(), ["lambda_분석"]
    while 볼것:
        이름 = 볼것.pop()
        if 이름 in 본것:
            continue
        본것.add(이름)
        for 터, 표 in ((HERE, "analyze"), (뿌리 / "dify", "dify"), (뿌리 / "render", "render")):
            f = 터 / f"{이름}.py"
            if not f.exists():
                continue
            assert re.search(rf"^COPY .*{표}/(\*\.py|[^\s]*{re.escape(이름)}\.py)", 도커, re.M), \
                f"{표}/{이름}.py 를 임포트하는데 상자에 없다"
            볼것 += [n for n in _임포트(f) if n not in 본것]
            break
    # 사슬이 실제로 넓게 퍼졌는지 — 한두 개만 보고 통과하면 시험이 아니다
    assert len(본것) > 8, f"따라간 모듈이 {len(본것)}개뿐이다 — 사슬 추적이 끊겼다"


def test_붙박이_파일도_상자에_들어간다():
    """글꼴·눈금이 없으면 글꼴 맞추기와 되돌려 그리기가 뜨다가 죽는다."""
    도커 = _도커()
    for 있어야 in ("analyze/fonts/", "analyze/ruler/", "analyze/calibration.json",
                 "render/fonts/", "dify/*.py"):
        assert re.search(rf"^COPY .*{re.escape(있어야)}", 도커, re.M), 있어야


def test_쓸_자리를_tmp_로_준다():
    """`/var/task` 는 읽기 전용이라 `config.py` 가 임포트에서 mkdir 하다 죽는다."""
    도커 = _도커()
    assert re.search(r"^ENV CARDNEWS_DATA=/tmp/", 도커, re.M)
    assert re.search(r"^ENV CARDNEWS_RECIPES=/tmp/", 도커, re.M)


def test_config가_그_환경변수를_읽는다():
    글 = io.open(HERE / "config.py", encoding="utf-8").read()
    assert "CARDNEWS_DATA" in 글 and "CARDNEWS_RECIPES" in 글


def test_pycocotools_는_안_지고_간다():
    """`rle` 갈래를 걷어내며 빠졌다. 제일 무거운 짐이라 되돌아오면 알아야 한다."""
    assert "pycocotools" not in _요구목록()
    assert "_rle_mask" not in io.open(HERE / "merge_labeled.py", encoding="utf-8").read()


def test_바깥_꾸러미가_다_요구목록에_있다():
    """상자가 지고 갈 바깥 꾸러미. 빠지면 임포트에서 죽는다."""
    필요 = _요구목록()
    표 = {"cv2": "opencv", "numpy": "numpy", "PIL": "pillow",
         "requests": "requests", "yaml": "pyyaml"}
    for 모듈, 꾸러미 in 표.items():
        assert 꾸러미 in 필요, f"{모듈} 을 쓰는데 {꾸러미} 가 요구목록에 없다"
    # boto3 는 Lambda 런타임이 이미 갖고 있다 — 넣으면 상자만 무거워진다
    assert "boto3" not in 필요
    # **openai 는 일부러 뺐다.** 말투 판정이 딥시크에서 Bedrock 으로 옮겨 오면서
    # (2026-08-27) 아무도 안 부르게 됐다. 다시 들어오면 상자만 무거워지고,
    # 「대본도 말투도 같은 모델」이라는 결이 조용히 깨진다.
    assert "openai" not in 필요


def test_목록얹기가_앞서_잰_것을_안_지운다():
    """**창고 목록을 통째로 덮어쓰면 안 된다.**

    `목록만들기` 는 폴더를 훑는데 Lambda 의 /tmp 에는 방금 잰 게시물 하나뿐이다.
    그대로 올리면 앞서 잰 것들이 목록에서 사라진다 — 2026-08-27 실제로 그랬다
    (둘이던 목록이 하나가 됐다). 틀 파일은 창고에 그대로 남는데 목록에만 없으니
    아무도 못 찾는다.
    """
    import sys
    sys.path.insert(0, str(HERE))
    import lambda_분석 as L

    있던것 = [{"코드": "A", "만든날": "2026-08-01"}, {"코드": "B", "만든날": "2026-08-02"}]
    L._목록읽기 = lambda: list(있던것)
    난것 = L._목록얹기([{"코드": "C", "만든날": "2026-08-03"}])
    assert [x["코드"] for x in 난것] == ["A", "B", "C"]


def test_목록얹기가_같은_코드는_갈아_끼운다():
    import sys
    sys.path.insert(0, str(HERE))
    import lambda_분석 as L

    L._목록읽기 = lambda: [{"코드": "A", "만든날": "2026-08-01", "장수": 7}]
    난것 = L._목록얹기([{"코드": "A", "만든날": "2026-08-27", "장수": 8}])
    assert len(난것) == 1 and 난것[0]["장수"] == 8, 난것


def test_목록을_못_읽어도_이번_것은_남는다():
    """창고에 목록이 아직 없는 첫 판에서 죽으면 안 된다."""
    import sys
    sys.path.insert(0, str(HERE))
    import lambda_분석 as L

    L._목록읽기 = lambda: []
    assert [x["코드"] for x in L._목록얹기([{"코드": "A", "만든날": "2026-08-27"}])] == ["A"]
