# -*- coding: utf-8 -*-
"""**없는 이름·아직 안 만든 이름을 찾는다.**

실물 2026-09-23. 동시 분석 길(`목록건너뛰기`)이 이 둘을 한꺼번에 들고 있었다:

    "말투": 말투낸것,    ← 네 줄 «뒤» 에서 만든다
    "점검": 점검난것     ← 이 파일 어디에도 없다

들어가기만 하면 반드시 터지는데 **아무도 몰랐다.** 그 길을 켜는 코드가 아직
없어서 한 번도 안 돌았고, 그 길을 보는 시험은 **코드를 돌리지 않고 글자만**
읽었다(`test_틀이름지키기` 의 「`if` 가 쓰는 줄보다 위에 있나」).

**린터를 쓰면 될 일이지만 이 컴퓨터에 하나도 없다**(ruff·pyflakes·flake8·pylint
모두 없음). 그래서 그 한 갈래만 직접 본다.

**함수 안팎을 제대로 갈라야 한다.** 처음엔 `ast.walk` 로 통째로 훑었더니 안쪽
함수와 `lambda` 의 제 이름까지 「없는 이름」으로 잡혔다 — 헛걸리는 시험은 없느니
만 못하다. 그래서 **바깥 함수의 이름은 안쪽에서도 보이게** 두고, 안쪽 함수 몸통은
제 차례에 따로 본다.
"""
import ast
import builtins
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parents[1]

# 이 폴더에서 «람다가 실제로 싣고 도는» 파일들. 도구·한 번 쓰는 script 는 뺀다.
볼파일 = ["lambda_분석.py", "카드뉴스만들기.py", "사진만들기.py", "대본짓기.py"]
안쪽 = (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda, ast.ClassDef)


def _제몸통(마디):
    """이 마디 아래를 훑되 **안쪽 함수·람다·클래스 몸통에는 안 들어간다.**"""
    쌓임 = list(ast.iter_child_nodes(마디))
    while 쌓임:
        x = 쌓임.pop()
        yield x
        if not isinstance(x, 안쪽):
            쌓임 += list(ast.iter_child_nodes(x))


def _박힌이름(마디) -> set:
    자리 = []
    if isinstance(마디, ast.Assign):
        자리 = 마디.targets
    elif isinstance(마디, (ast.AnnAssign, ast.AugAssign)):
        자리 = [마디.target]
    난것 = set()
    for t in 자리:
        for 속 in ast.walk(t):
            if isinstance(속, ast.Name):
                난것.add(속.id)
    return 난것


def _만드는이름(마디, 줄들: dict):
    """`마디` 의 제 몸통이 만드는 이름 → 처음 만드는 줄 번호."""
    def 적기(이름, 줄):
        if 이름 not in 줄들 or 줄 < 줄들[이름]:
            줄들[이름] = 줄

    args = getattr(마디, "args", None)
    if args is not None:
        for a in list(args.args) + list(args.kwonlyargs) + list(args.posonlyargs):
            적기(a.arg, 0)
        for x in (args.vararg, args.kwarg):
            if x:
                적기(x.arg, 0)
    for 속 in _제몸통(마디):
        if isinstance(속, (ast.Assign, ast.AnnAssign, ast.AugAssign)):
            for n in _박힌이름(속):
                적기(n, 속.lineno)
        elif isinstance(속, (ast.For, ast.AsyncFor, ast.comprehension)):
            for m in ast.walk(속.target):
                if isinstance(m, ast.Name):
                    적기(m.id, getattr(속, "lineno", 0))
        elif isinstance(속, ast.NamedExpr):
            적기(속.target.id, 속.lineno)
        elif isinstance(속, ast.withitem) and 속.optional_vars is not None:
            for m in ast.walk(속.optional_vars):
                if isinstance(m, ast.Name):
                    적기(m.id, 0)
        elif isinstance(속, ast.ExceptHandler) and 속.name:
            적기(속.name, 속.lineno)
        elif isinstance(속, (ast.Import, ast.ImportFrom)):
            for a in 속.names:
                적기((a.asname or a.name).split(".")[0], 속.lineno)
        elif isinstance(속, 안쪽):
            적기(getattr(속, "name", ""), getattr(속, "lineno", 0))
        elif isinstance(속, (ast.Global, ast.Nonlocal)):
            for n in 속.names:
                적기(n, 0)
    줄들.pop("", None)
    return 줄들


def _모듈이름(나무) -> set:
    난것 = set(dir(builtins))
    _만드는이름(나무, 빈 := {})
    return 난것 | set(빈)


def _돌며보기(마디, 보이는것: dict, 파일: str, 없는것: list, 늦은것: list):
    """이 마디의 제 몸통을 보고, 안쪽 함수는 제 차례에 다시 본다."""
    내것 = _만드는이름(마디, dict(보이는것))
    for 속 in _제몸통(마디):
        if isinstance(속, ast.Name) and isinstance(속.ctx, ast.Load):
            if 속.id not in 내것:
                없는것.append(f"{파일}:{속.lineno} «{속.id}»")
        elif isinstance(속, ast.Return) and 속.value is not None:
            for m in ast.walk(속.value):
                if (isinstance(m, ast.Name) and isinstance(m.ctx, ast.Load)
                        and 내것.get(m.id, 0) > 속.lineno):
                    늦은것.append(f"{파일}:{속.lineno} «{m.id}» 는 "
                                f"{내것[m.id]}줄에서 만든다")
        if isinstance(속, 안쪽):
            _돌며보기(속, 내것, 파일, 없는것, 늦은것)


def _보기(파일):
    나무 = ast.parse((HERE / 파일).read_text(encoding="utf-8"))
    없는것, 늦은것 = [], []
    바깥 = {x: 0 for x in _모듈이름(나무)}
    for 속 in ast.iter_child_nodes(나무):
        if isinstance(속, 안쪽):
            _돌며보기(속, 바깥, 파일, 없는것, 늦은것)
    return 없는것, 늦은것


@pytest.mark.parametrize("파일", 볼파일)
def test_없는_이름을_쓰지_않는다(파일):
    """이 파일 어디에도 없는 이름을 쓰면 그 줄에서 반드시 터진다."""
    없는것, _ = _보기(파일)
    assert not 없는것, "없는 이름을 쓴다:\n  " + "\n  ".join(sorted(set(없는것)))


@pytest.mark.parametrize("파일", 볼파일)
def test_아직_안_만든_이름을_돌려주지_않는다(파일):
    """`return` 이 쓰는 이름은 그 줄 «앞» 에서 만들어져 있어야 한다.

    실물에서 걸린 자리가 정확히 이것이다 — 네 줄 뒤에서 만드는 이름을 돌려줬다.
    """
    _, 늦은것 = _보기(파일)
    assert not 늦은것, "아직 안 만든 이름을 돌려준다:\n  " + "\n  ".join(sorted(set(늦은것)))
