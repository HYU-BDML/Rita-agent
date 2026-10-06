# -*- coding: utf-8 -*-
import poll


class 시계:
    def __init__(self):
        self.t = 0.0

    def 지금(self):
        return self.t

    def 자기(self, s):
        self.t += s


def test_다_되면_바로():
    답 = iter([{"state": "굽는 중", "done": False}, {"state": "됨", "done": True, "url": "u"}])
    시 = 시계()
    d = poll.기다리기(lambda n: next(답), "j", 360, 10, 시.자기, 시.지금)
    assert d["url"] == "u" and 시.t == 10


def test_시간이_넘으면_timed_out():
    시 = 시계()
    d = poll.기다리기(lambda n: {"state": "굽는 중", "done": False}, "j", 30, 10, 시.자기, 시.지금)
    assert d["timed_out"] is True and 시.t == 30
