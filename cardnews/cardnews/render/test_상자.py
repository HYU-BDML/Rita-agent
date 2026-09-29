# -*- coding: utf-8 -*-
"""상자(Dockerfile)에 넣는 파일과 실제로 임포트하는 파일이 맞는지 본다.

**하나라도 빠지면 «모든» 문이 500 이 된다.** `app.py` 가 임포트하다 죽기
때문이다. 저쪽에서 `template_out.py` 를 안 넣어 실제로 그렇게 됐고
(2026-08-25), 그때는 배포하고 나서야 알았다. 여기서 미리 막는다.
"""
import ast
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))


def _상자에_넣는것() -> set:
    """Dockerfile 의 COPY 줄에서 «이 폴더의 .py 파일» 이름만 모은다."""
    글 = (HERE / "Dockerfile").read_text(encoding="utf-8")
    이름들 = set()
    for 줄 in 글.splitlines():
        if not 줄.startswith("COPY "):
            continue
        for 조각 in 줄.split()[1:-1]:          # 맨 뒤는 목적지다
            if 조각.endswith(".py"):
                이름들.add(조각)
    return 이름들


def _우리모듈() -> set:
    return {p.name for p in HERE.glob("*.py")
            if not p.name.startswith("test_")}


def test_우리_모듈이_전부_상자에_들어간다():
    빠진것 = _우리모듈() - _상자에_넣는것()
    assert not 빠진것, f"Dockerfile 에 안 넣은 모듈: {sorted(빠진것)}"


def test_상자에_없는_것을_임포트하지_않는다():
    """`app.py` 가 부르는 우리 모듈이 전부 상자에 있어야 한다."""
    t = ast.parse((HERE / "app.py").read_text(encoding="utf-8"))
    부름 = set()
    for n in ast.walk(t):
        if isinstance(n, ast.Import):
            for a in n.names:
                부름.add(a.name.split(".")[0])
        elif isinstance(n, ast.ImportFrom) and n.module and n.level == 0:
            부름.add(n.module.split(".")[0])
    우리것 = {m for m in 부름 if (HERE / f"{m}.py").exists()}
    빠진것 = {f"{m}.py" for m in 우리것} - _상자에_넣는것()
    assert not 빠진것, f"임포트하는데 상자에 없다: {sorted(빠진것)}"


def test_붙박이_파일도_상자에_들어간다():
    """글꼴과 template.json 이 없으면 FontBook 이 뜨다가 죽는다."""
    글 = (HERE / "Dockerfile").read_text(encoding="utf-8")
    for 있어야 in ("fonts/", "template.json", "weblib/"):
        assert re.search(rf"^COPY .*{re.escape(있어야)}", 글, re.M), 있어야


def test_모르는_이름을_쓰지_않는다():
    """함수 안에서 «임포트 안 한» 이름을 부르는 곳이 없어야 한다.

    **이 파일은 저쪽 `app.py` 에서 «뽑아» 온 것이라 이 탈이 나기 쉽다.** 함수는
    그대로 왔는데 그 함수가 기대던 임포트가 안 따라오면, 임포트도 시험도 멀쩡히
    통과하고 **그 줄을 실제로 밟을 때만** 죽는다. 실제로 셋이 그랬다
    (2026-08-26: `time` · `base64`, 그리고 `edit_save` 는 시험이 «때» 를 넘겨
    주는 바람에 그 줄을 한 번도 안 밟았다).
    """
    t = ast.parse((HERE / "app.py").read_text(encoding="utf-8"))
    import builtins
    바깥 = set(dir(builtins))
    for n in t.body:
        if isinstance(n, ast.Import):
            for a in n.names:
                바깥.add((a.asname or a.name).split(".")[0])
        elif isinstance(n, ast.ImportFrom):
            for a in n.names:
                바깥.add(a.asname or a.name)
        elif isinstance(n, ast.Assign):
            # **묶어서 대입한 것도 센다** — `가, 나 = 1, 2` 는 대상이 `Name` 이
            # 아니라 `Tuple` 이라, 곧이곧대로 보면 둘 다 «모르는 이름» 이 된다
            # (실물 2026-09-19: `_사진최대, _주소최대 = 30, 500` 에서 빨개졌다).
            바깥 |= {y.id for x in n.targets for y in ast.walk(x)
                    if isinstance(y, ast.Name)}
        elif isinstance(n, (ast.FunctionDef, ast.ClassDef)):
            바깥.add(n.name)

    def 안쪽(fn):
        """그 함수가 스스로 만든 이름들 — 인자 · 대입 · 지역 임포트 · 안쪽 함수."""
        안 = {a.arg for a in fn.args.args} | {a.arg for a in fn.args.kwonlyargs}
        읽음 = set()
        for x in ast.walk(fn):
            if isinstance(x, ast.Import):
                for a in x.names:
                    안.add((a.asname or a.name).split(".")[0])
            elif isinstance(x, ast.ImportFrom):
                for a in x.names:
                    안.add(a.asname or a.name)
            elif isinstance(x, ast.Name):
                (안 if isinstance(x.ctx, ast.Store) else 읽음).add(x.id)
            elif isinstance(x, (ast.FunctionDef, ast.Lambda)):
                안.add(getattr(x, "name", ""))
                for a in x.args.args:
                    안.add(a.arg)
            elif isinstance(x, ast.comprehension):
                안 |= {y.id for y in ast.walk(x.target) if isinstance(y, ast.Name)}
            elif isinstance(x, ast.ExceptHandler) and x.name:
                안.add(x.name)
        return 읽음 - 안

    탈 = {n.name: sorted(안쪽(n) - 바깥)
         for n in ast.walk(t) if isinstance(n, ast.FunctionDef) and 안쪽(n) - 바깥}
    assert not 탈, f"임포트 안 한 이름을 쓴다: {탈}"


def test_우리_폴더가_저쪽_render_server_를_안_부른다():
    """`cardnews/` 안의 코드는 «우리» 렌더만 본다.

    **파일 일곱이 두 곳에 똑같이 있다** — `render-server/` 에도 `cardnews_compose.py`
    `edit_store.py` `template_out.py` `template_render.py` `workbench.py` 가 남아
    있다(저쪽 `app.py` 가 아직 임포트한다). 우리 쪽이 실수로 저쪽을 보면 **우리가
    고친 값이 안 온다** — 이 프로젝트가 반복해서 당한 「두 벌이 갈라진다」 유형이다.

    **경로를 «만드는» 조각만 본다.** 파이썬은 경로를 `/ "render-server"` 처럼 조각
    하나로 잇는다. 그래서 «정확히 그 낱말인» 글자값만 잡으면, 설명글 안의
    `render-server/fonts` 같은 긴 문장은 안 걸린다(그건 남의 폴더를 «말하는» 것이지
    «부르는» 것이 아니다).
    """
    뿌리 = HERE.parent            # cardnews/
    걸린것 = []
    for p in 뿌리.rglob("*.py"):
        if p.is_relative_to(HERE):          # cardnews/render 자신은 뺀다
            continue
        t = ast.parse(p.read_text(encoding="utf-8"))
        for n in ast.walk(t):
            if isinstance(n, ast.Constant) and n.value == "render-server":
                걸린것.append(f"{p.relative_to(뿌리)}:{n.lineno}")
    assert not 걸린것, "경로를 저쪽 render-server 로 만든다: " + ", ".join(걸린것)


def test_상자에_ffmpeg_이_있다():
    """영상 자리를 굽는다(사람 결정 2026-09-16). 저쪽 render-server 와 같은 정적 빌드."""
    글 = (HERE / "Dockerfile").read_text(encoding="utf-8")
    assert "FROM mwader/static-ffmpeg:7.1 AS ffmpeg" in 글
    assert "COPY --from=ffmpeg /ffmpeg /usr/local/bin/ffmpeg" in 글


def test_배포가_영상_굽기_설정을_건다():
    글 = (HERE / "deploy.sh").read_text(encoding="utf-8")
    assert "--timeout 600" in 글 and "--timeout 120" not in 글
    assert "--memory-size 3008" in 글
    assert '--ephemeral-storage "{\\"Size\\":2048}"' in 글 or "--ephemeral-storage '{\"Size\":2048}'" in 글
    assert "invoke-self" in 글
    assert '"POST /upload/sign"' in 글
    # 죽으면 다시 부르지 않는다 — 안 끄면 실패한 영상 굽기가 판을 겹쌓는다.
    assert "--maximum-retry-attempts 0" in 글
