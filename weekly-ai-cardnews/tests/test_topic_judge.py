# -*- coding: utf-8 -*-
import json

from topic.judge import 판정관


class 가짜대화:
    def __init__(self, 답들):
        self.답들, self.받은 = list(답들), []

    def __call__(self, 메시지들, 한도, 모델=None, 생각=True, **kw):
        self.받은.append({"메시지들": 메시지들, "한도": 한도, "모델": 모델, "생각": 생각})
        글 = self.답들.pop(0)
        return {"글": 글 if isinstance(글, str) else json.dumps(글, ensure_ascii=False), "모델": 모델,
                "입력토큰": 300, "캐시토큰": 0, "출력토큰": 40, "생각토큰": 0, "초": 1}


def 관(답들, 받기=None):
    대화, 적은 = 가짜대화(답들), []
    return 판정관(대화, lambda 답, 열쇠: 적은.append(열쇠), 받기 or (lambda 주소, 최대바이트=0: (b"jpg", "image/jpeg", 주소))), 대화, 적은


def test_문장_판정은_flash_생각끔으로_묻고_적는다():
    판, 대화, 적은 = 관([{"판정": "받쳐줌", "까닭": "발췌에 그대로 있다"}])
    assert 판.문장("코르티스가 24일 앨범을 냈다.", "CORTIS 앨범 발매 (9/24)") == {"판정": "받쳐줌", "까닭": "발췌에 그대로 있다"}
    받은 = 대화.받은[0]
    assert 받은["모델"] == "deepseek-flash" and 받은["생각"] is False and 받은["한도"] == 400
    assert "발췌: CORTIS 앨범 발매 (9/24)" in 받은["메시지들"][1]["content"] and 적은 == ["판정"]


def test_답을_못_읽으면_빼는_쪽으로():
    판, _, _ = 관(["음… 아마 맞는 듯", {"판정": "글쎄"}])
    assert 판.문장("가", "나")["판정"] == "모자람"
    assert 판.문장("가", "나")["판정"] == "모자람"


def test_사진은_순서를_바꿔_두번_묻고_엇갈리면_불확실():
    판, 대화, _ = 관([{"E1#1": "장면", "E1#2": "로고"}, {"E1#1": "장면", "E1#2": "장면"}])
    결과 = 판.사진들([{"번호": "E1#1", "주소": "https://cdn/a.jpg"}, {"번호": "E1#2", "주소": "https://cdn/b.jpg"}])
    assert 결과 == {"E1#1": "장면", "E1#2": "불확실"}
    순서 = [[p["text"] for p in 받은["메시지들"][1]["content"] if p["type"] == "text" and p["text"].startswith("번호")]
          for 받은 in 대화.받은]
    assert 순서 == [["번호 E1#1", "번호 E1#2"], ["번호 E1#2", "번호 E1#1"]]
    그림칸 = [p for p in 대화.받은[0]["메시지들"][1]["content"] if p["type"] == "image_url"]
    assert 그림칸[0]["image_url"]["url"].startswith("data:image/jpeg;base64,")


def test_그림을_못_받으면_묻지도_않는다():
    def 받기(주소, 최대바이트=0):
        return (b"<html>", "text/html", 주소)
    판, 대화, _ = 관([], 받기)
    assert 판.사진들([{"번호": "E2#1", "주소": "https://x/a"}]) == {"E2#1": "못받음"} and 대화.받은 == []


def test_같은_사건():
    판, _, _ = 관([{"같다": True, "까닭": "같은 발매"}, {"같다": "아마"}])
    assert 판.같은사건("앨범 발매", "새 앨범 공개") is True
    assert 판.같은사건("가", "나") is False


def test_판정관은_답을_오래_안_기다린다():
    # 걸음 전 남길 시간 안에 들어가게 — flash 생각 끔은 몇 초면 답한다(최종 검토 I3, 기본 300초 × 두 번이었다)
    받은 = []

    def 대화(메시지들, 한도, **kw):
        받은.append(kw.get("읽기"))
        return {"글": '{"판정": "받쳐줌", "까닭": "x"}', "모델": "deepseek-flash", "입력토큰": 1, "캐시토큰": 0,
                "출력토큰": 1, "생각토큰": 0, "초": 1}

    판정관(대화, lambda 답, 열쇠: None).문장("가", "나")
    assert 받은 == [60]
