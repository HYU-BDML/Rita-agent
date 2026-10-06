# -*- coding: utf-8 -*-
"""배포 — 창고 통 정책에 «기록·대화 칸은 우리 계정 밖이면 거절» 한 줄 (사용자 2026-10-01 «가»).
통은 옛 서버와 같이 쓰고 «누구나 읽기» 가 걸려 있다 — 다른 줄은 건드리지 않는다."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import deploy  # noqa: E402

옛정책 = {"Version": "2012-10-17", "Statement": [
    {"Sid": "PublicRead", "Effect": "Allow", "Principal": "*", "Action": "s3:GetObject",
     "Resource": "arn:aws:s3:::<S3 통 이름>/*"}]}


def test_거절_한_줄을_더하고_옛_줄은_그대로():
    새 = deploy._기록칸막기정책(옛정책)
    assert 새["Statement"][0] == 옛정책["Statement"][0]
    막기 = 새["Statement"][1]
    assert (막기["Sid"], 막기["Effect"], 막기["Principal"], 막기["Action"]) == ("WeeklyPrivate", "Deny", "*", "s3:GetObject")
    assert 막기["Resource"] == ["arn:aws:s3:::<S3 통 이름>/weekly/trace/*",
                              "arn:aws:s3:::<S3 통 이름>/weekly/chats/*",
                              "arn:aws:s3:::<S3 통 이름>/weekly/memory/*"]  # 긁은 결과·성적표(작은 것 11)
    assert 막기["Condition"] == {"StringNotEquals": {"aws:PrincipalAccount": "<AWS 계정 번호>"}}


def test_두_번_돌려도_한_줄만():
    한번 = deploy._기록칸막기정책(옛정책)
    assert deploy._기록칸막기정책(한번) == 한번


def test_정책이_없던_통이면_그_줄만():
    assert [x["Sid"] for x in deploy._기록칸막기정책(None)["Statement"]] == ["WeeklyPrivate"]


def test_역할은_분야_지우기_권한을_준다():
    # 권한 목록에 s3:DeleteObject 가 없어 운영에서 지우기가 늘 500 이었을 것(최종 검토 C1)
    import json
    받은 = {}

    class 가짜iam:
        def get_role(self, RoleName):
            return {"Role": {"Arn": "arn:aws:iam::0:role/x"}}

        def attach_role_policy(self, **kw):
            pass

        def put_role_policy(self, **kw):
            받은.update(kw)

    deploy._역할(가짜iam())
    문 = json.loads(받은["PolicyDocument"])["Statement"]
    assert any(s["Action"] == "s3:DeleteObject" and s["Resource"].endswith("/weekly/fields/*") for s in 문)


def test_역할은_묵은_긁은_결과_지우기_권한을_준다():
    import json
    받은 = {}

    class 가짜iam:
        def get_role(self, RoleName):
            return {"Role": {"Arn": "arn:aws:iam::0:role/x"}}

        def attach_role_policy(self, **kw):
            pass

        def put_role_policy(self, **kw):
            받은.update(kw)

    deploy._역할(가짜iam())
    지우기 = [s["Resource"] for s in json.loads(받은["PolicyDocument"])["Statement"] if s["Action"] == "s3:DeleteObject"]
    assert any(r.endswith("/weekly/memory/scrapes/*") for r in 지우기)


def test_카드_다시_굽기_길이_앞문에_있다():
    # 앞문(API Gateway)은 길들에 적은 길만 받는다 — 없으면 화면 단추가 404 를 받는다(계획 4 D-4)
    assert "POST /topic/jobs/{job}/cards" in deploy.길들


def test_매주_볼_곳_바꾸기_길이_앞문에_있다():
    # 앞문(API Gateway)은 길들에 적은 길만 받는다 — 없으면 배포 뒤 «매주 볼 곳 바꾸기» 가 404 를 받는다(계획 4)
    assert "POST /topic/fields/{field}/list" in deploy.길들


def test_판_지우기_길과_권한이_있다():
    # 지난 결과 지우기(사용자 2026-10-05) — 앞문 길이 없으면 404, 권한이 없으면 운영에서 늘 500
    import json
    assert "POST /jobs/{job}/delete" in deploy.길들
    받은 = {}

    class 가짜iam:
        def get_role(self, RoleName):
            return {"Role": {"Arn": "arn:aws:iam::0:role/x"}}

        def attach_role_policy(self, **kw):
            pass

        def put_role_policy(self, **kw):
            받은.update(kw)

    deploy._역할(가짜iam())
    지우기 = [s["Resource"] for s in json.loads(받은["PolicyDocument"])["Statement"] if s["Action"] == "s3:DeleteObject"]
    assert any(r.endswith("/weekly/jobs/*") for r in 지우기)
