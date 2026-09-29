# -*- coding: utf-8 -*-
"""**코드에 낸 문이 게이트웨이에도 뚫려 있나.**

실물 2026-09-19: `POST /draft`·`POST /bake` 를 `app.py` 에 냈는데
`deploy.sh` 의 길 목록에 안 적었다. 람다는 잘 올라갔고, 시험도 다 통과했고,
**배포도 «성공» 이라고 나왔다.** 그런데 그 두 문을 부르면 404 였다 —
게이트웨이가 그 길을 이 함수에게 안 보낸 것이다.

이 탈은 **배포한 뒤에야** 보인다. 그래서 여기서 미리 센다.

**세는 법**: `handler` 안의 `path.endswith("…")` 는 「이 주소를 내가 받겠다」는
선언이다. 그 주소가 `deploy.sh` 의 `ROUTES` 에 한 줄도 없으면, 아무도 그 문을
못 두드린다.
"""
import re
from pathlib import Path

import pytest

여기 = Path(__file__).resolve().parent
_앱 = (여기 / "app.py").read_text(encoding="utf-8")
_배포 = (여기 / "deploy.sh").read_text(encoding="utf-8")

# `path.endswith("/무엇")` 에서 그 「/무엇」만.
_문들 = sorted(set(re.findall(r'path\.endswith\(\s*"(/[^"]+)"', _앱)))

# 자리표시자가 든 길은 `endswith` 로 안 잡는다(`edit_id_of` 같은 함수가 가른다).
# 그래서 여기서 세는 것은 «고정된 주소» 뿐이다 — 그것만으로도 이번 탈은 잡힌다.
_길목록 = re.findall(r'"(?:GET|POST|OPTIONS) ([^"]+)"', _배포)


def test_문을_하나라도_찾았다():
    """정규식이 헛돌면 이 파일 전체가 조용히 아무것도 안 지킨다."""
    assert len(_문들) >= 10, _문들
    assert len(_길목록) >= 20, _길목록


@pytest.mark.parametrize("문", _문들)
def test_코드에_낸_문이_게이트웨이에도_뚫려_있다(문):
    """안 뚫려 있으면 **배포는 성공하고 그 문만 404 다.**"""
    assert 문 in _길목록, (
        f"«{문}» 을 app.py 가 받겠다고 했는데 deploy.sh 의 ROUTES 에 없다 — "
        "올려 봐야 404 다. deploy.sh 의 ROUTES 에 «POST " + 문 + "» 를 더해라")


def test_굽기_전에_멈추는_두_문이_다_있다():
    """사람 결정 2026-09-19 「항상 거친다」 — 이 둘이 빠지면 만들기가 통째로 막힌다."""
    for 문 in ("/draft", "/bake"):
        assert 문 in _문들, f"app.py 가 «{문}» 을 안 받는다"
        assert 문 in _길목록, f"deploy.sh 에 «{문}» 이 없다"
