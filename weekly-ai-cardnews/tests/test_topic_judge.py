# -*- coding: utf-8 -*-
import json
import threading
import time

import deepseek
from topic.judge import 판정관


class 가짜대화:
    def __init__(self, 답들):
        self.답들, self.받은 = list(답들), []

    def __call__(self, 메시지들, 한도, 모델=None, 생각=True, **kw):
        self.받은.append({"메시지들": 메시지들, "한도": 한도, "모델": 모델, "생각": 생각, "온도": kw.get("온도")})
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


def test_문장_판정에_출처_정보를_준다():
    # 발췌 글자만 보여 주면 «공식 인스타에 릴스» 같은 출처 사실을 «모자람» 으로 판정했다(진짜 한 판 10-01)
    판, 대화, _ = 관([{"판정": "받쳐줌", "까닭": "x"}])
    판.문장("공식 인스타에 릴스가 올라왔다.", "다 모여 #JUUN", 정보="인스타 @hearts2hearts ✓인증 · 2026-09-23 · 영상")
    내용 = 대화.받은[0]["메시지들"][1]["content"]
    assert "출처 정보" in 내용 and "인스타 @hearts2hearts" in 내용


def test_문장_판정은_흔들림_0으로_묻는다():
    판, 대화, _ = 관([{"판정": "받쳐줌", "까닭": "x"}])
    판.문장("코르티스가 24일 앨범을 냈다.", "CORTIS 앨범 발매 (9/24)")
    assert 대화.받은[0]["온도"] == 0


def test_문장_판정은_지어_넣은_새_사실만_본다():
    # 말투·추측까지 붙잡아 좋은 소식 2건을 버렸다(판 3) — 사용자 «느슨하게, 중요한 정보만»(2026-10-02)
    from topic import judge
    글 = judge.문장지시
    assert "새 사실" in 글 and "바꿔 말하기" in 글 and "공식 계정 글의 주인공은 그 계정 주인" in 글
    assert "함께한 회사" in 글


def test_얼굴_수는_JSON_의_사람_수():
    # 표지 사진에 얼굴이 몇 명인지 — 0명이면 얼굴 없이, 1명이면 그 사람, 2명 넘으면 그룹으로 그린다(계획 3 설계 2-3)
    판, 대화, 적은 = 관([{"사람": 8}])
    assert 판.얼굴수("https://s3/05.jpg") == 8 and 적은 == ["판정"]
    그림칸 = [p for p in 대화.받은[0]["메시지들"][1]["content"] if p["type"] == "image_url"]
    assert 그림칸[0]["image_url"]["url"].startswith("data:image/jpeg;base64,") and 대화.받은[0]["온도"] == 0
    assert 관([{"사람": "많음"}])[0].얼굴수("https://s3/a.jpg") is None


def test_사진을_못_받으면_얼굴_수는_None():
    def 받기(주소, 최대바이트=0):
        raise RuntimeError("403")
    판, 대화, _ = 관([], 받기)
    assert 판.얼굴수("https://s3/a.jpg") is None and 대화.받은 == []


def test_얼굴_지시는_크고_또렷한_얼굴만_센다():
    # 손흥민 표지: 멀리 작게 선 사람도 «1명» 이라 세서 얼굴 없는 사진이 얼굴 참고로 갔다(평가 사진 검토)
    from topic import judge
    assert "또렷" in judge.얼굴지시 and "멀리" in judge.얼굴지시


class 그림대화:
    """그림 번호로 답한다 — 묶음이 나란히 돌아 묻는 차례가 섞여도 같은 답(계획 4 B)."""

    def __init__(self, 갈래=None, 거절=()):
        self.갈래, self.거절, self.받은 = dict(갈래 or {}), set(거절), []
        self.자물쇠 = threading.Lock()

    def __call__(self, 메시지들, 한도, 모델=None, 생각=True, **kw):
        번호들 = [p["text"][3:] for p in 메시지들[1]["content"] if p["type"] == "text" and p["text"].startswith("번호 ")]
        with self.자물쇠:
            self.받은.append(번호들)
        if self.거절 & set(번호들):
            raise deepseek.모델탈("400", '{"error":{"message":".messages[1]: You have uploaded an unsupported image. '
                                        'Please make sure"}}')
        글 = json.dumps({b: {"갈래": self.갈래.get(b, "장면"), "글자": ""} for b in 번호들}, ensure_ascii=False)
        return {"글": 글, "모델": 모델, "입력토큰": 300, "캐시토큰": 0, "출력토큰": 40, "생각토큰": 0, "초": 1}


def 그림받기(주소, 최대바이트=0):
    return (b"jpg", "image/jpeg", 주소)


def test_사진보기는_갈래와_사진_속_글자를_적는다():
    # LAFC 공식 X «Final from Dallas.» — 점수 «1 : 0» 은 사진 속에만 있었다(계획 4 B)
    판, 대화, _ = 관([{"E1#1": {"갈래": "장면", "글자": "FC댈러스 1 : 0 LAFC  경기 끝"}},
                     {"E1#1": {"갈래": "장면", "글자": "두 번째 물음의 글자는 안 쓴다"}}])
    assert 판.사진보기([{"번호": "E1#1", "주소": "https://pbs/a.jpg"}]) == {
        "E1#1": {"갈래": "장면", "글자": "FC댈러스 1 : 0 LAFC 경기 끝", "크기": None}}  # 머리를 못 읽으면 크기 None
    assert 대화.받은[0]["한도"] == 1200 and "글자" in 대화.받은[0]["메시지들"][0]["content"]


def test_사진들은_갈래만_돌려준다():
    판, _, _ = 관([{"E1#1": {"갈래": "로고", "글자": "MBC"}}, {"E1#1": {"갈래": "로고", "글자": ""}}])
    assert 판.사진들([{"번호": "E1#1", "주소": "https://cdn/a.jpg"}]) == {"E1#1": "로고"}


def test_사진보기는_공식_그림_갈래를_받고_지시에_뜻을_싣는다():
    # 아이브 공식 X 의 트랙리스트 그림을 «로고» 로 봐 빼고 AI 로 지어낸 사람을 그렸다(계획 4 과제 42+ A, 2026-10-05)
    판, 대화, _ = 관([{"E1#1": {"갈래": "공식그림", "글자": "IVE TRACKLIST"}}, {"E1#1": {"갈래": "공식그림", "글자": ""}}])
    assert 판.사진보기([{"번호": "E1#1", "주소": "https://pbs/a.jpg"}])["E1#1"]["갈래"] == "공식그림"
    지시 = 대화.받은[0]["메시지들"][0]["content"]
    assert "공식그림(" in 지시 and "트랙리스트" in 지시 and "사진이 아니어도" in 지시
    assert "로고(상표·마크·이름만 있는 그림)" in 지시


def test_사진보기는_넉_장씩_묶어_나란히_묻는다():
    대화 = 그림대화({"E2#1": "로고"})
    판 = 판정관(대화, lambda 답, 열쇠: None, 그림받기)
    후보 = [{"번호": f"E{n}#{i}", "주소": f"https://cdn/{n}_{i}.jpg"} for n in (1, 2, 3) for i in (1, 2, 3)]
    결과 = 판.사진보기(후보)
    assert len(결과) == 9 and 결과["E2#1"] == {"갈래": "로고", "글자": "", "크기": None} and 결과["E3#3"]["갈래"] == "장면"
    assert sorted(len(x) for x in 대화.받은) == [1, 1, 4, 4, 4, 4]  # 4·4·1 장 묶음 셋 × 순서 바꿔 두 번


def test_딥시크가_거절한_그림은_그_한_장만_못받음():
    # 4장 묶음 전체가 «unsupported image» 로 거절됐다(평가 다시1-아이브 사진 보기, 계획 4 D-13)
    판 = 판정관(그림대화(거절={"E1#2"}), lambda 답, 열쇠: None, 그림받기)
    후보 = [{"번호": f"E1#{i}", "주소": f"https://cdn/{i}.jpg"} for i in (1, 2, 3)]
    assert 판.사진보기(후보) == {"E1#1": {"갈래": "장면", "글자": "", "크기": None},
                              "E1#2": {"갈래": "못받음", "글자": "", "크기": None},
                              "E1#3": {"갈래": "장면", "글자": "", "크기": None}}


def test_딥시크가_못_받는_꼴은_묻지_않고_못받음():
    def 받기(주소, 최대바이트=0):
        return (b"<svg/>", "image/svg+xml", 주소) if 주소.endswith(".svg") else (b"jpg", "image/jpeg; charset=x", 주소)
    대화 = 그림대화()
    판 = 판정관(대화, lambda 답, 열쇠: None, 받기)
    결과 = 판.사진보기([{"번호": "E1#1", "주소": "https://cdn/logo.svg"}, {"번호": "E1#2", "주소": "https://cdn/a.jpg"}])
    assert 결과 == {"E1#1": {"갈래": "못받음", "글자": "", "크기": None}, "E1#2": {"갈래": "장면", "글자": "", "크기": None}}
    assert 대화.받은 == [["E1#2"], ["E1#2"]]


def test_묶음이_다른_까닭으로_터지면_비워_두고_판은_계속():
    def 대화(메시지들, 한도, **kw):
        raise deepseek.모델탈("timeout", "read timed out")
    판 = 판정관(대화, lambda 답, 열쇠: None, 그림받기)
    assert 판.사진보기([{"번호": "E1#1", "주소": "https://cdn/a.jpg"}]) == {}
    assert 판.사진들([{"번호": "E1#1", "주소": "https://cdn/a.jpg"}]) == {}


def test_마감을_넘긴_묶음은_기다리지_않고_답에서_뺀다():
    풀림 = threading.Event()

    def 대화(메시지들, 한도, **kw):
        번호들 = [p["text"][3:] for p in 메시지들[1]["content"] if p["type"] == "text" and p["text"].startswith("번호 ")]
        if "E2#1" in 번호들:
            풀림.wait(2)  # 느린 묶음
        return {"글": json.dumps({b: {"갈래": "장면", "글자": ""} for b in 번호들}), "모델": "f", "입력토큰": 1,
                "캐시토큰": 0, "출력토큰": 1, "생각토큰": 0, "초": 1}

    판 = 판정관(대화, lambda 답, 열쇠: None, 그림받기)
    후보 = [{"번호": f"E1#{i}", "주소": f"https://cdn/{i}.jpg"} for i in (1, 2, 3, 4)] + [{"번호": "E2#1", "주소": "https://cdn/x.jpg"}]
    시작 = time.monotonic()
    결과 = 판.사진보기(후보, 마감초=0.5)
    풀림.set()
    assert time.monotonic() - 시작 < 1.5 and sorted(결과) == ["E1#1", "E1#2", "E1#3", "E1#4"]


# ── 계획 4 과제 42+ B — 꾸밈·작은 그림 거르기 ──

def test_그림_머리에서_가로_세로를_읽는다():
    # 판정관이 받은 그림의 머리만 보고 크기를 안다 — 표준 라이브러리만
    from fakes_topic import 그림머리
    from topic.judge import 그림크기
    for 꼴 in ("png", "gif", "jpeg", "jpeg-progressive", "webp", "webp-lossless", "webp-extended"):
        assert 그림크기(그림머리(1200, 800, 꼴)) == (1200, 800), 꼴
    assert 그림크기(그림머리(180, 1200, "jpeg")) == (180, 1200)
    assert 그림크기(b"<html><body>") is None and 그림크기(b"") is None
    assert 그림크기(그림머리(1200, 800, "png")[:20]) is None  # 머리가 잘렸다
    assert 그림크기(그림머리(1200, 800, "jpeg")[:30]) is None


def test_길쭉하거나_작은_그림은_모델에_묻지_않고_무관():
    # 메이플 공지의 꾸밈 그림 180×1200(세로 6.7배)을 «장면» 으로 카드에 넣었고 이벤트 배너 285×120 은 흐렸다
    from fakes_topic import 그림머리
    몸들 = {"tall": 그림머리(180, 1200), "small": 그림머리(285, 120), "ok": 그림머리(1200, 800, "jpeg"),
          "three": 그림머리(900, 300), "edge": 그림머리(150, 150)}
    대화 = 그림대화()
    판 = 판정관(대화, lambda 답, 열쇠: None, lambda 주소, 최대바이트=0: (몸들[주소.split("/")[-1]], "image/png", 주소))
    결과 = 판.사진보기([{"번호": f"E1#{i}", "주소": f"https://cdn/{이름}"}
                      for i, 이름 in enumerate(("tall", "small", "ok", "three", "edge"), 1)])
    assert 결과 == {"E1#1": {"갈래": "무관", "글자": "", "크기": [180, 1200]},
                  "E1#2": {"갈래": "무관", "글자": "", "크기": [285, 120]},
                  "E1#3": {"갈래": "장면", "글자": "", "크기": [1200, 800]},
                  "E1#4": {"갈래": "장면", "글자": "", "크기": [900, 300]},   # 딱 3배는 묻는다
                  "E1#5": {"갈래": "장면", "글자": "", "크기": [150, 150]}}   # 짧은 변 딱 150 도 묻는다
    assert {b for x in 대화.받은 for b in x} == {"E1#3", "E1#4", "E1#5"}  # 꾸밈·작은 그림은 모델에 안 보냈다


def test_원본을_못_받으면_작은주소로_한_번_더_보고_그_주소를_알린다():
    # 기사 사진은 원본으로 받는다 — 짐작한 원본이 없으면(4xx·글 페이지) 원래 썸네일로(계획 4 과제 42+ C)
    from fakes_topic import 그림머리
    큰원본 = 그림머리(3000, 2000, "jpeg")

    def 받기(주소, 최대바이트=0):
        if 주소 == "https://n/photo/a.jpg":
            raise RuntimeError("HTTP Error 404: Not Found")
        if 주소 == "https://n/photo/b.jpg":
            return ("<html>없는 쪽</html>".encode(), "text/html; charset=utf-8", 주소)
        if 주소 == "https://n/photo/c.jpg":  # 판정관에게 너무 크다(2MB 에서 잘림) — 머리는 읽힌다
            return (큰원본 + b"\x00" * (최대바이트 - len(큰원본)), "image/jpeg", 주소)
        return (그림머리(300, 225, "jpeg"), "image/jpeg", 주소)

    대화 = 그림대화()
    판 = 판정관(대화, lambda 답, 열쇠: None, 받기)
    결과 = 판.사진보기([{"번호": f"E1#{i}", "주소": f"https://n/photo/{n}.jpg", "작은주소": f"https://n/thumb/{n}_v150.jpg"}
                      for i, n in enumerate("abc", 1)] + [{"번호": "E1#4", "주소": "https://n/photo/d.jpg"}])
    assert 결과["E1#1"] == {"갈래": "장면", "글자": "", "크기": [300, 225], "주소": "https://n/thumb/a_v150.jpg"}
    assert 결과["E1#2"] == {"갈래": "장면", "글자": "", "크기": [300, 225], "주소": "https://n/thumb/b_v150.jpg"}
    assert 결과["E1#3"] == {"갈래": "장면", "글자": "", "크기": [3000, 2000]}  # 갈래만 작은 그림으로, 크기·주소는 원본
    assert 결과["E1#4"] == {"갈래": "장면", "글자": "", "크기": [300, 225]}
    assert {b for x in 대화.받은 for b in x} == {"E1#1", "E1#2", "E1#3", "E1#4"}
