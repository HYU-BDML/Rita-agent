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
                              "arn:aws:s3:::<S3 통 이름>/weekly/chats/*"]
    assert 막기["Condition"] == {"StringNotEquals": {"aws:PrincipalAccount": "<AWS 계정 번호>"}}


def test_두_번_돌려도_한_줄만():
    한번 = deploy._기록칸막기정책(옛정책)
    assert deploy._기록칸막기정책(한번) == 한번


def test_정책이_없던_통이면_그_줄만():
    assert [x["Sid"] for x in deploy._기록칸막기정책(None)["Statement"]] == ["WeeklyPrivate"]
