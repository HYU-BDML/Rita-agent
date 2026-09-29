# -*- coding: utf-8 -*-
"""**「새 대화」가 올린 것을 지운다**(사람 지시 2026-09-22: 「새 대화라는 게 리셋임
모든게 리셋(로고까지)」).

여태 한 번 올라간 그림을 지우는 길이 **아예 없었다** — 사람이 AWS 화면에 들어가
손으로 지우는 수밖에 없었다.

여기서 지키는 것은 하나다: **우리가 지은 이름만 지운다.** 받은 주소를 그대로 믿고
지우면 이 문이 «창고 아무거나 지우는 문» 이 된다.
"""
import importlib.util
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
# 통 이름은 **진짜 S3 꼴**이어야 한다 — 주소 앞자리를 견주는 코드가 여럿이다.
os.environ["BUCKET"] = "cardnews-render-554608989606"

import pytest  # noqa: E402


def _작업대앱():
    """`render/app.py` 를 **자리로** 불러온다 — `analyze/app.py` 와 이름이 같다."""
    자리 = importlib.util.spec_from_file_location("작업대앱지우기", HERE / "app.py")
    몸 = importlib.util.module_from_spec(자리)
    자리.loader.exec_module(몸)
    return 몸


app = _작업대앱()

창고앞 = f"https://{app.BUCKET}.s3.{app.REGION}.amazonaws.com/photos/"
_이름 = "0123456789abcdef0123456789abcdef"      # `uuid4().hex` 와 같은 꼴


class _가짜S3:
    """지우라는 말만 받아 적는다. **진짜 창고에는 손도 안 댄다.**"""

    def __init__(self):
        self.지운것 = []

    def delete_object(self, Bucket, Key):  # noqa: N803 — boto3 칸 이름 그대로
        self.지운것.append((Bucket, Key))


@pytest.fixture
def s3(monkeypatch):
    가짜 = _가짜S3()
    monkeypatch.setattr(app, "_s3", 가짜)
    return 가짜


def test_창고의_올린_그림을_지운다(s3):
    난것 = app.upload_delete({"주소들": [f"{창고앞}{_이름}.png"]})
    assert 난것 == {"ok": True, "지운수": 1, "건너뛴수": 0}
    assert s3.지운것 == [(app.BUCKET, f"photos/{_이름}.png")]


def test_사진과_로고를_함께_지운다(s3):
    """로고도 같은 칸(`photos/`)에 산다 — 「모든게 리셋」이라 같이 간다."""
    둘 = [f"{창고앞}{_이름}.png", f"{창고앞}{_이름.replace('0', 'a')}.jpg"]
    assert app.upload_delete({"주소들": 둘})["지운수"] == 2
    assert len(s3.지운것) == 2


@pytest.mark.parametrize("주소", [
    f"https://evil.example/photos/{_이름}.png",                                 # 남의 집
    f"https://{app.BUCKET}.s3.{app.REGION}.amazonaws.com/templates/mok.json",   # 우리 창고의 딴 칸
    f"{창고앞}../templates/mok.json",                                            # 위로 올라가려는 것
    f"{창고앞}{_이름}.exe",                                                       # 우리가 안 짓는 확장자
    f"{창고앞}shortname.png",                                                    # 32자리가 아닌 것
    f"{창고앞}{_이름}",                                                           # 확장자가 없는 것
    f"{창고앞}{_이름.upper()}.png",                                               # 대문자 — 우리는 소문자로 짓는다
])
def test_우리가_지은_이름이_아니면_한_개도_안_지운다(s3, 주소):
    난것 = app.upload_delete({"주소들": [주소]})
    assert 난것 == {"ok": True, "지운수": 0, "건너뛴수": 1}
    assert s3.지운것 == [], "창고에 손을 댔다"


def test_글자가_아닌_것이_섞여도_안_죽는다(s3):
    """상태는 사람이 만지는 값이라 무엇이든 들어올 수 있다."""
    난것 = app.upload_delete({"주소들": [None, 7, {"u": 1}, f"{창고앞}{_이름}.png"]})
    assert 난것["지운수"] == 1 and 난것["건너뛴수"] == 3


def test_목록이_아니면_거절한다(s3):
    assert app.upload_delete({"주소들": "하나"})["ok"] is False
    assert app.upload_delete({})["ok"] is False
    assert s3.지운것 == [], "거절하면서 지우면 안 된다"


def test_한_번에_지울_수_있는_수에_천장이_있다(s3):
    """천장이 없으면 한 번 부름으로 창고를 훑게 된다."""
    많이 = [f"{창고앞}{_이름}.png"] * (app._지울최대 + 5)
    assert app.upload_delete({"주소들": 많이})["지운수"] == app._지울최대


def test_없는_것을_지워도_탈이_아니다(s3):
    """두 번 눌러도 같아야 한다 — S3 는 없는 열쇠에도 성공을 준다."""
    주소 = [f"{창고앞}{_이름}.png"]
    assert app.upload_delete({"주소들": 주소})["ok"] is True
    assert app.upload_delete({"주소들": 주소})["ok"] is True


def test_문이_게이트웨이에도_뚫려_있다():
    """`test_문등록.py` 가 자동으로도 잡지만, 여기서도 못 박는다 —
    안 걸면 **배포는 성공하고 이 문만 404 다.**"""
    글 = (HERE / "deploy.sh").read_text(encoding="utf-8")
    assert '"POST /upload/delete"' in 글
