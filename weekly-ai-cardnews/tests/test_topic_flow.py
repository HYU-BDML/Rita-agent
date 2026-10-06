# -*- coding: utf-8 -*-
import json
from types import SimpleNamespace
from datetime import date

import store
from fakes import 가짜S3
from fakes_topic import KAITO, 가짜대화, 가짜실행, 주문서, 주제손, 트윗
from topic import flow, tools

JOB = "20261001-030000-bbbbbbbb"
좋은 = {"hero": "그룹", "event": "뮤직비디오 공개", "summary": "코르티스가 9월 24일 뮤직비디오 «FaSHioN» 을 공개했다 [E1].",
      "date": "2026-09-24", "source": "E1", "quote": "CORTIS 'FaSHioN' 뮤직비디오 공개", "media": "E1"}
나쁜 = {**좋은, "source": "E99"}
보기 = [("x_account", {"account": "CORTIS_official", "deep": True}),
      ("update_board", {"stage": "④", "judgment": "x:cortis_official 공식 — 인증 계정",
                        "source_verdicts": [{"place": "x:cortis_official", "verdict": "공식", "basis": "인증"}]})]


def 내기(*소식, 칸=()):
    return [("submit_result", {"items": list(소식), "unfilled": list(칸)})]


def 판(지휘대본, **kw):
    실행 = 가짜실행({KAITO: [트윗(1, 좋아요=12400, 영상=True, 글="CORTIS 'FaSHioN' 뮤직비디오 공개"), 트윗(2), 트윗(3)]})
    손, 부른다음 = 주제손(가짜대화(지휘대본), 실행, **kw)
    기록 = flow.새기록(JOB, 주문서)
    기록["started"] = "2026-10-01T03:00:00Z"
    손.창고.쓰기(기록)
    return 손, 부른다음


def 끝까지(손, 부른다음, 처음="모으기", 최대=10):
    flow.달리기(JOB, 처음, 손)
    for _ in range(최대):
        if not 부른다음:
            break
        flow.달리기(*부른다음.pop(0), 손)
    return 손.창고.읽기(JOB)


def test_한_판이_처음부터_끝까지():
    칸 = [{"slot": "음악방송", "searched": ["x:cortis_official"], "why": "그 주 음악방송 글 없음"}]
    손, 부른다음 = 판([보기, 내기(좋은, 칸=칸)])
    기록 = 끝까지(손, 부른다음)
    assert 기록["state"] == "됨" and 기록["pct"] == 100, 기록.get("error")
    assert [s["name"] for s in 기록["steps"]] == ["모으기", "검증", "정리"]
    소식 = 기록["result"]["bundle"][0]
    assert (소식["순서"], 소식["주인공"], 소식["출처"]["계정"], 소식["딱지"]) == (1, "그룹", "cortis_official", [])
    assert 소식["미디어"]["갈래"] == "영상" and 소식["미디어"]["키"] == f"weekly/topic/{JOB}/media/01.mp4"
    assert 기록["result"]["unfilled"] == 칸 and 기록["result"]["dropped"] == []
    assert "④ x:cortis_official 공식 — 인증 계정" in 기록["lines"] and len(기록["board"]["칸"]) == 4
    assert 기록["cost"]["딥시크"] > 0 and 기록["cost"]["아피파이"] > 0
    걸음들 = 기록["spend"]
    assert [x["걸음"] for x in 걸음들] == [1, 2, None] and 걸음들[-1]["단계"] == "검증·정리"  # 판정관은 걸음 밖
    assert abs(sum(x["합계"] for x in 걸음들) - 기록["cost"]["합계"]) < 0.001


def test_되돌려_보내면_모으기로_가서_고쳐_낸다():
    손, 부른다음 = 판([보기, 내기(나쁜), 내기(좋은)])
    기록 = 끝까지(손, 부른다음)
    assert [s["name"] for s in 기록["steps"]] == ["모으기", "검증", "모으기", "검증", "정리"], 기록.get("error")
    assert 기록["재료"]["되돌림"] == 1 and len(기록["result"]["bundle"]) == 1
    둘째구간 = 손.대화.지휘.받은[2]["메시지들"][1]["content"]
    assert "## 관문이 돌려보낸 것" in 둘째구간 and "없는 증거 번호 E99" in 둘째구간


def test_세번_되돌려도_그대로면_빼고_끝낸다():
    손, 부른다음 = 판([보기, 내기(나쁜), 내기(나쁜)])
    기록 = 끝까지(손, 부른다음)
    assert 기록["state"] == "됨" and 기록["result"]["bundle"] == []
    assert 기록["result"]["dropped"] == [{"사건": "뮤직비디오 공개", "까닭": "없는 증거 번호 E99 — 도구 결과의 번호만"}]


def test_시간이_모자라면_이어_달린다():
    손, 부른다음 = 판([보기, 내기(좋은)], 남은=100.0)
    flow.달리기(JOB, "모으기", 손)
    기록 = 손.창고.읽기(JOB)
    assert 부른다음 == [(JOB, "모으기")] and 기록["state"] == "만드는 중" and 기록["steps"][-1]["state"] == "하는 중"


def 대화판(다듬기대본):
    손, _ = 주제손(가짜대화(다듬기대본=다듬기대본))
    손.창고.대화쓰기({"chat": "c1", "state": "생각 중", "messages": [{"who": "사람", "text": "코르티스 소식 보고 싶어"}],
                    "order": None, "error": None})
    return 손


주문 = {"주제": "코르티스(CORTIS)", "범위": "그룹", "기간": {"말": "지난주", "종류": "지난주"}, "넣을것": ["컴백"],
      "뺄것": ["루머"], "목표건수": 5, "한장단위": "소식 하나", "분야이름": "코르티스", "등급": "B"}


def test_대화_한턴은_묻거나_주문서를_낸다():
    손 = 대화판([{"말": "어느 기간을 볼까요? 이번 주 / 지난주", "주문서": None}, {"말": "이렇게 모을게요", "주문서": 주문}])
    flow.대화한턴("c1", 손, date(2026, 10, 1))
    d = 손.창고.대화읽기("c1")
    assert d["state"] == "답함" and d["order"] is None and d["messages"][-1] == {"who": "지휘자", "text": "어느 기간을 볼까요? 이번 주 / 지난주"}
    assert "오늘은 2026-10-01(목요일" in 손.대화.다듬기받은[0][0]["content"]
    d["messages"].append({"who": "사람", "text": "지난주"})
    손.창고.대화쓰기(d)
    flow.대화한턴("c1", 손, date(2026, 10, 1))
    d = 손.창고.대화읽기("c1")
    assert (d["order"]["시작"], d["order"]["끝"], d["order"]["예산"]["호출"]) == ("2026-09-21", "2026-09-27", 50)
    assert [m["role"] for m in 손.대화.다듬기받은[1][1:]] == ["user", "assistant", "user"] and d["cost"]["딥시크"] > 0


def test_틀린_주문서는_한번_고쳐_달라고_한다():
    손 = 대화판([{"말": "이렇게", "주문서": {**주문, "분야이름": "가나다라마바사아자차카타파하가나다라마바사"}}, {"말": "줄였어요", "주문서": 주문}])
    flow.대화한턴("c1", 손, date(2026, 10, 1))
    assert "주문서에 문제가 있다: 분야 이름" in 손.대화.다듬기받은[1][-1]["content"]
    d = 손.창고.대화읽기("c1")
    assert d["order"]["분야이름"] == "코르티스" and d["messages"][-1]["text"] == "줄였어요"


def test_다듬기가_넘치면_한도를_올려_다시_묻는다():
    손 = 대화판(["넘침", {"말": "어느 기간을 볼까요?", "주문서": None}])
    flow.대화한턴("c1", 손, date(2026, 10, 1))
    assert 손.대화.다듬기한도 == [(8000, 160), (16000, 260)]
    assert 손.대화.다듬기받은[1] == 손.대화.다듬기받은[0]  # 넘친 빈 답은 대화에 붙이지 않는다
    d = 손.창고.대화읽기("c1")
    assert d["state"] == "답함" and d["messages"][-1]["text"] == "어느 기간을 볼까요?"


def test_다듬기가_JSON_을_못_내면_실패():
    손 = 대화판(["그냥 글", "또 글"])
    flow.대화한턴("c1", 손, date(2026, 10, 1))
    d = 손.창고.대화읽기("c1")
    assert d["state"] == "실패" and "다시 보내" in d["error"]


def test_창고_목록은_작업판과_판단줄을_빼고_미디어는_서명주소로():
    창 = store.창고(가짜S3(), "통")
    기록 = flow.새기록(JOB, 주문서)
    기록.update(board={"단계": "①"}, lines=["① 시작"])
    창.쓰기(기록)
    줄 = 창.목록()[0]
    assert 줄["kind"] == "주제" and 줄["order"]["분야이름"] == "코르티스" and "board" not in 줄 and "lines" not in 줄 and "spend" not in 줄
    assert store.요약(창.읽기(JOB))["lines"] == ["① 시작"]
    키 = 창.미디어올리기(JOB, "01.mp4", b"x", "video/mp4")
    assert 키 == f"weekly/topic/{JOB}/media/01.mp4" and 창.서명주소(키).startswith("https://fake-s3/")


def test_판_기록에_지휘_판정관_관문이_차례로_쌓인다():
    손, 부른다음 = 판([보기, 내기(좋은)])
    끝까지(손, 부른다음)
    종류들 = [json.loads(v)["종류"] for k, v in sorted(손.창고.s3.것들.items()) if k.startswith(f"weekly/trace/{JOB}/")]
    assert 종류들[:2] == ["지휘", "지휘"] and {"구간끝", "판정관", "관문"} <= set(종류들)
    assert 종류들.index("관문") > 종류들.index("구간끝")


def test_새_답이_오면_이전_판_표시를_지운다():
    # 같은 주문서는 한 번만 모은다(app /topic/make) — 대화로 주문서를 다시 받으면 다시 모을 수 있어야 한다
    손 = 대화판([{"말": "이렇게 모을게요", "주문서": 주문}])
    d = 손.창고.대화읽기("c1")
    d["job"] = "20261001-030000-cccccccc"
    손.창고.대화쓰기(d)
    flow.대화한턴("c1", 손, date(2026, 10, 1))
    assert 손.창고.대화읽기("c1")["job"] is None


def test_도중에_끈_도구와_까닭이_결과에_남는다():
    # 분량이 떨어져 X·인스타를 못 본 결과를 «그 주 소식이 적었다» 로 읽게 된다(최종 검토 I5)
    from topic.apify import 도구탈
    실행 = 가짜실행({KAITO: [트윗(1, 좋아요=12400, 영상=True, 글="CORTIS 'FaSHioN' 뮤직비디오 공개"), 트윗(2)],
                  "apify~instagram-hashtag-scraper": 도구탈("돈", "Apify 이번 달 분량이 모자라요")})
    손, 부른다음 = 주제손(가짜대화([보기 + [("instagram_search", {"query": "cortis"})], 내기(좋은)]), 실행)
    기록 = flow.새기록(JOB, 주문서)
    기록["started"] = "2026-10-01T03:00:00Z"
    손.창고.쓰기(기록)
    기록 = 끝까지(손, 부른다음)
    assert 기록["state"] == "됨", 기록.get("error")
    assert {"도구": "instagram_search", "까닭": "Apify 분량이 모자라다"} in 기록["result"]["blocked"]


def test_다듬기는_지금_주문서를_보고_고친다():
    # 지금 주문서를 안 보여 줘서 «~도 넣어 줘» 를 «그것만» 으로 새로 썼다(진짜 한 판 10-01)
    손 = 대화판([{"말": "멤버 소식도 넣을게요", "주문서": None}])
    d = 손.창고.대화읽기("c1")
    d["order"] = 주문서
    d["messages"].append({"who": "사람", "text": "멤버 개인 소식도 넣어줘"})
    손.창고.대화쓰기(d)
    flow.대화한턴("c1", 손, date(2026, 10, 1))
    보낸 = json.dumps(손.대화.다듬기받은[0], ensure_ascii=False)
    assert "지금 주문서" in 보낸 and "컴백" in 보낸 and "음악방송" in 보낸


def test_통과해서_잠근_소식은_지휘자에게_알리고_결과에_남긴다():
    둘째 = {"hero": "그룹", "event": "소식 둘", "summary": "코르티스가 소식 2 를 올렸다 [E2].", "date": "2026-09-24",
          "source": "E2", "quote": "CORTIS 소식 2", "media": "없음"}
    손, 부른다음 = 판([보기, 내기(좋은, {**둘째, "source": "E99"}), 내기(둘째)])
    기록 = 끝까지(손, 부른다음)
    assert [x["사건"] for x in 기록["result"]["bundle"]] == ["뮤직비디오 공개", "소식 둘"], 기록.get("error")
    둘째구간 = 손.대화.지휘.받은[2]["메시지들"][1]["content"]
    assert "잠근 것" in 둘째구간 and "«뮤직비디오 공개»" in 둘째구간


def test_다듬기에_보여_주는_지금_주문서는_서버가_받는_꼴이다():
    # 정리된 꼴(기간말·시작·끝)을 보여 주며 «같은 꼴로» 라 해서 AI 가 기간 종류를 빠뜨렸고, 검사에 걸려 한 번 더
    # 부르고 «기간 종류를 지난주로 고쳤어요» 가 사람에게 떴다(판 3 대화, 2026-10-03)
    from topic import order
    손 = 대화판([{"말": "음악방송도 넣을게요", "주문서": None}])
    d = 손.창고.대화읽기("c1")
    d["order"] = 주문서
    d["messages"].append({"who": "사람", "text": "음방도 넣어"})
    손.창고.대화쓰기(d)
    flow.대화한턴("c1", 손, date(2026, 10, 1))
    보인 = json.loads(손.대화.다듬기받은[0][0]["content"].split("다시 낸다): ")[1])
    assert "기간말" not in 보인 and "예산" not in 보인
    assert 보인["기간"] == {"말": "9월 3주차", "종류": "직접", "시작": "2026-09-21", "끝": "2026-09-27"}
    assert order.다듬기(보인, date(2026, 10, 1)) == 주문서  # 그대로 다시 내면 같은 주문서로 통과


def test_주문서를_돌려보낼_때_고친_사정은_사람에게_말하지_말라고_한다():
    손 = 대화판([{"말": "이렇게", "주문서": {**주문, "분야이름": "가나다라마바사아자차카타파하가나다라마바사"}}, {"말": "줄였어요", "주문서": 주문}])
    flow.대화한턴("c1", 손, date(2026, 10, 1))
    assert "고친 사정은 사용자에게 말하지 말고" in 손.대화.다듬기받은[1][-1]["content"]


def test_주문서가_두_번_다_틀리면_까닭을_대화에_남긴다():
    # 두 번째도 틀리면 AI 말만 보이고 주문서가 왜 안 나왔는지 없었다(계획 1 최종 검토의 작은 것, 합격 판정 장면 6 — 사용자 «지금고쳐» 10-03)
    긴 = {**주문, "분야이름": "가나다라마바사아자차카타파하가나다라마바사"}
    손 = 대화판([{"말": "이렇게", "주문서": 긴}, {"말": "다시 이렇게 모을게요", "주문서": 긴}])
    flow.대화한턴("c1", 손, date(2026, 10, 1))
    d = 손.창고.대화읽기("c1")
    assert d["state"] == "답함" and d["order"] is None
    assert d["messages"][-2] == {"who": "지휘자", "text": "다시 이렇게 모을게요"}
    assert d["messages"][-1]["who"] == "지휘자"
    assert d["messages"][-1]["text"].startswith("주문서를 아직 못 만들었어요: 분야 이름") and "20자 안으로" in d["messages"][-1]["text"]


def test_판이_끝나면_출처_성적표를_남긴다():
    from topic import memory
    손, 부른다음 = 판([보기, 내기(좋은)])
    끝까지(손, 부른다음)
    카드 = memory.기억창고(손.창고.s3, "통").출처읽기("x:cortis_official")
    assert (카드["판정"], 카드["이름들"], 카드["판들"][0]["쓰인"]) == ("공식", ["코르티스"], 1)


def test_기억_적기가_터져도_판은_끝난다(monkeypatch):
    from topic import memory
    monkeypatch.setattr(memory, "판끝적기", lambda *a: (_ for _ in ()).throw(RuntimeError("S3 흔들림")))
    손, 부른다음 = 판([보기, 내기(좋은)])
    assert 끝까지(손, 부른다음)["state"] == "됨"


def test_판이_끝나면_묵은_긁은_결과를_치운다():
    from datetime import datetime, timezone
    손, 부른다음 = 판([보기, 내기(좋은)])
    손.창고.s3.때 = lambda: datetime(2026, 9, 1, tzinfo=timezone.utc)
    손.창고.s3.put_object(Bucket="통", Key="weekly/memory/scrapes/묵은.json", Body=b"{}")
    손.창고.s3.때 = lambda: datetime.now(timezone.utc)
    끝까지(손, 부른다음)
    assert "weekly/memory/scrapes/묵은.json" not in 손.창고.s3.것들


class 사진판정관:
    def __init__(self, 답, 크기=None):
        self.답, self.크기, self.물은 = 답, dict(크기 or {}), []

    def 사진보기(self, 후보, 마감초=None):
        self.물은.append([c["번호"] for c in 후보])
        return {c["번호"]: {"갈래": self.답.get(c["번호"], "무관"), "글자": "", "크기": self.크기.get(c["번호"])}
                for c in 후보}


def test_미디어_없는_소식엔_기사의_장면_사진을_붙인다():
    # 기사 77건 중 30건이 사진 후보 2~8장을 두고 «미디어 없음» 으로 나갔다 — 지휘자에 안 맡기고 정리가 붙인다(평가 사진 검토)
    from types import SimpleNamespace
    x = {"번호": "E7", "사진후보": [{"주소": "https://n/a.jpg"}, {"주소": "https://n/b.jpg"}, {"주소": "https://n/c.jpg"}]}
    현 = SimpleNamespace(판정관=사진판정관({"E7#1": "로고", "E7#2": "장면"}))
    assert flow._기사사진고르기(현, x) == {"갈래": "사진", "주소": "https://n/b.jpg", "대표화면": ""}
    assert x["사진판정"] == {"1": "로고", "2": "장면", "3": "무관"} and 현.판정관.물은 == [["E7#1", "E7#2", "E7#3"]]
    y = {"번호": "E8", "사진후보": [{"주소": "https://n/d.jpg"}], "사진판정": {"1": "장면"}}  # 이미 판정받은 것은 다시 안 묻는다
    현2 = SimpleNamespace(판정관=사진판정관({}))
    assert flow._기사사진고르기(현2, y)["주소"] == "https://n/d.jpg" and 현2.판정관.물은 == []
    assert flow._기사사진고르기(현2, {"번호": "E9", "사진후보": []}) is None
    assert flow._기사사진고르기(SimpleNamespace(판정관=사진판정관({})), {"번호": "E1", "사진후보": [{"주소": "u"}]}) is None


def test_카드에는_장면_사진만_넣고_영상은_광고·무관만_뺀다():
    # 공식 계정 사진을 아무도 안 보고 카드에 넣었다 — 로고·광고 그림이 들어갈 수 있었다(계획 4 B)
    from fakes_topic import 가짜판정관, 현장만들기
    현 = 현장만들기(판정관=가짜판정관(사진={"E1#1": "로고"}))

    def 넣기(주소, 미디어, 판정=None):
        번, _ = 현.창고.넣기({"플랫폼": "x", "계정": "lafc", "주소": 주소, "날짜": "2026-09-24", "글": "글",
                           "미디어": 미디어, **({"사진판정": 판정} if 판정 else {})}, "x_account#1")
        return 현.창고.꺼내기(번)

    def 사진(n):
        return {"갈래": "사진", "주소": f"https://pbs/{n}.jpg?name=orig", "대표화면": f"https://pbs/{n}.jpg"}

    영상 = {"갈래": "영상", "주소": "https://v/1.mp4", "대표화면": "https://v/1.jpg"}
    x = 넣기("https://x.com/a/1", [사진("a"), 사진("b")])
    assert flow._카드미디어(현, {"media": "E1#1"}, x) == 사진("b")  # 고른 것이 로고 → 같은 글의 장면
    assert x["사진판정"] == {"1": "로고", "2": "장면"} and 현.판정관.받은 == [("사진보기", ["E1#1", "E1#2"])]
    assert flow._카드미디어(현, {"media": "E2#1"}, 넣기("https://x.com/a/2", [사진("c")], {"1": "무관"})) is None
    assert flow._카드미디어(현, {"media": "E3"}, 넣기("https://x.com/a/3", [사진("d"), 영상], {"1": "장면", "2": "로고"})) == 영상
    assert flow._카드미디어(현, {"media": "E4"}, 넣기("https://x.com/a/4", [영상], {"1": "광고"})) is None
    # 지휘자가 «없음» 을 골라도 출처 글의 공식 그림은 쓴다 — 아이브 트랙리스트 그림을 버리고 AI 로 그렸다(진짜 시험, 10-05)
    assert flow._카드미디어(현, {"media": "없음"}, 넣기("https://x.com/a/5", [사진("e")], {"1": "공식그림"})) == 사진("e")
    # 판정이 없는 그림은 지휘자가 고른 게 아니니 «없음» 일 때 넣지 않는다
    assert flow._카드미디어(현, {"media": "없음"}, 넣기("https://x.com/a/6", [사진("f")], {"1": "로고"})) is None


목록제출 = [{"tool": "x_account", "args": {"account": "CORTIS_official", "deep": True}, "why": "코르티스 공식 계정"},
          {"tool": "web_search", "args": {"query": "코르티스"}, "why": "기사"}]


def test_정리는_매주_볼_곳_후보에_이번_판_숫자를_붙인다():
    손, 부른다음 = 판([보기, [("submit_result", {"items": [좋은], "unfilled": [], "weekly_sources": 목록제출})]])
    기록 = 끝까지(손, 부른다음)
    assert 기록["state"] == "됨", 기록.get("error")
    assert [(x["글"], x["까닭"], x["숫자"], x["갈래"]) for x in 기록["result"]["목록후보"]] == [
        ("X @CORTIS_official 최근 글 40개", "코르티스 공식 계정", "이번 판: 기간 안 글 3개 · 소식 1건에 쓰임", None),
        ("웹·뉴스에서 «코르티스» 검색", "기사", "이번 판에서 안 봄", None)]
    assert "목록" not in 기록["result"]  # 목록 판이 아니다


def test_목록_판이면_결과에_본_곳과_못_본_곳_그리고_지금_목록이_앞에():
    손, 부른다음 = 판([보기, [("submit_result", {"items": [좋은], "unfilled": [], "weekly_sources": 목록제출})]])
    기록 = 손.창고.읽기(JOB)
    기록["목록"] = [{"도구": "instagram_account", "인자": {"account": "cortis_official", "deep": True}, "까닭": "공식 인스타"},
                  {"도구": "x_account", "인자": {"account": "CORTIS_official", "deep": True}, "까닭": "공식 X"}]
    기록["재료"]["못본곳"] = [{"글": "인스타 @cortis_official 최근 글 30개", "까닭": "글이 없거나 못 읽음"}]
    손.창고.쓰기(기록)
    기록 = 끝까지(손, 부른다음, 처음="목록보기")  # 목록 판의 모으기는 고르기만 — 증거는 목록보기가 모은다(10-05)
    assert 기록["result"]["목록"] == {"전체": 2, "본곳": 1, "못본곳": [
        {"글": "인스타 @cortis_official 최근 글 30개", "까닭": "글이 없거나 못 읽음"}]}
    assert [(x["글"], x["갈래"]) for x in 기록["result"]["목록후보"]] == [
        ("인스타 @cortis_official 최근 글 30개", "지금 목록"), ("X @CORTIS_official 최근 글 40개", "지금 목록"),
        ("웹·뉴스에서 «코르티스» 검색", "새로 찾은 곳")]


매주목록 = [{"도구": "x_account", "인자": {"account": "CORTIS_official", "deep": True}, "까닭": "공식 X"},
          {"도구": "x_account", "인자": {"account": "gone", "deep": True}, "까닭": "없어진 계정"},
          {"도구": "web_search", "인자": {"query": "코르티스", "use_period": True}, "까닭": "기사"}]


def 목록판(목록, 지휘대본=(), 예산=None):
    # 없어진 계정은 X 도구가 광고·빈 줄만 준다 — 평가 18판에서 76번 중 16번(계획 4 설계 C-3)
    실행 = 가짜실행({KAITO: lambda 입력: [{"type": "광고"}] if "from:gone" in json.dumps(입력) else
                    [트윗(1, 좋아요=12400, 영상=True, 글="CORTIS 'FaSHioN' 뮤직비디오 공개"), 트윗(2), 트윗(3)],
                    "apify~google-search-scraper": [{"organicResults": [{
                        "url": "https://news.example.com/a", "title": "코르티스 음악방송 1위", "description": "코르티스가 1위",
                        "date": "2026-09-25T03:00:00Z"}]}]})
    손, 부른다음 = 주제손(가짜대화(list(지휘대본)), 실행)
    기록 = flow.새기록(JOB, {**주문서, "예산": 예산 or 주문서["예산"]})
    기록.update(started="2026-10-01T03:00:00Z", 목록=목록, 단계="목록보기")
    손.창고.쓰기(기록)
    return 손, 부른다음


def test_목록보기는_지휘자보다_먼저_목록대로_부르고_못_본_곳을_남긴다():
    손, 부른다음 = 목록판(매주목록)
    flow.달리기(JOB, "목록보기", 손)
    기록 = 손.창고.읽기(JOB)
    재 = 기록["재료"]
    assert 부른다음 == [(JOB, "모으기")] and 기록["단계"] == "모으기"
    assert [x["글"] for x in 재["목록글"]] == ["X @CORTIS_official 최근 글 40개", "웹·뉴스에서 «코르티스» 검색"]
    assert "E1 · X @cortis_official" in 재["목록글"][0]["결과"]
    assert 재["못본곳"] == [{"글": "X @gone 최근 글 40개", "까닭": "글이 없거나 못 읽음"}]
    assert 재["작업판"]["목록"] == {"전체": 3, "본곳": 2}
    assert any("X @gone 최근 글 40개" in x for x in 재["작업판"]["경고"])
    assert sorted(x["걸음"] for x in 재["호출기록"]) == [0, 0, 0] and 재.get("지금걸음") is None
    assert all(x.get("목록") for x in 재["호출기록"])  # 목록보기가 부른 호출 표시(계획 4 F)
    assert (기록["steps"][0]["name"], 기록["steps"][0]["note"]) == ("매주 볼 곳 보기", "3곳 중 2곳 봄 · 못 본 곳 1")


def test_목록이_예산_호출_한도를_넘으면_앞에서부터_한도까지만():
    손, _ = 목록판(매주목록, 예산={"호출": 2, "돈": 2.0, "분": 40})
    flow.달리기(JOB, "목록보기", 손)
    재 = 손.창고.읽기(JOB)["재료"]
    assert [x["글"] for x in 재["목록글"]] == ["X @CORTIS_official 최근 글 40개"]
    assert 재["못본곳"] == [{"글": "X @gone 최근 글 40개", "까닭": "글이 없거나 못 읽음"},
                         {"글": "웹·뉴스에서 «코르티스» 검색", "까닭": "이 판의 도구 호출 한도를 넘어서"}]


def test_목록_판은_목록보기부터_정리까지_가고_지휘자는_첫_구간에_목록_결과를_본다():
    손, 부른다음 = 목록판(매주목록, 지휘대본=[[("submit_result", {"items": [좋은], "unfilled": []})]])
    기록 = 끝까지(손, 부른다음, 처음="목록보기")
    assert 기록["state"] == "됨", 기록.get("error")
    assert [s["name"] for s in 기록["steps"]] == ["매주 볼 곳 보기", "모으기", "검증", "정리"]
    assert 기록["result"]["목록"] == {"전체": 3, "본곳": 2, "못본곳": [{"글": "X @gone 최근 글 40개", "까닭": "글이 없거나 못 읽음"}]}
    assert [(x["글"], x["갈래"]) for x in 기록["result"]["목록후보"]] == [
        ("X @CORTIS_official 최근 글 40개", "지금 목록"), ("X @gone 최근 글 40개", "지금 목록"),
        ("웹·뉴스에서 «코르티스» 검색", "지금 목록")]
    첫 = 손.대화.지휘.받은[0]["메시지들"]
    assert len(첫) == 2 and 첫[1]["content"].startswith("# 작업판\n## 매주 볼 곳으로 이미 모은 판")
    assert "## 저장한 목록으로 이미 모았다" in 첫[1]["content"] and "### X @CORTIS_official 최근 글 40개" in 첫[1]["content"]


def test_목록_판의_모으기는_바깥_도구를_한_번도_안_부르고_목록에서_고른다():
    # 저장한 분야는 매주 볼 곳만 본다 — 지휘자가 4분 동안 16번 더 찾아다녔다(사용자 10-05)
    손, 부른다음 = 목록판(매주목록, 지휘대본=[[("x_search", {"query": "코르티스 컴백"})], 내기(좋은)])
    기록 = 끝까지(손, 부른다음, 처음="목록보기")
    assert 기록["state"] == "됨", 기록.get("error")
    assert all(x["걸음"] == 0 for x in 기록["재료"]["호출기록"])  # 목록보기 것만
    assert all("x_search" not in 받은["도구"] for 받은 in 손.대화.지휘.받은)
    assert len(기록["result"]["bundle"]) == 1


def test_목록_판은_관문이_한_번_돌려보낸_뒤에는_통과시킨다():
    나쁜2 = {**좋은, "source": "E98"}
    손, 부른다음 = 목록판(매주목록, 지휘대본=[내기(나쁜), 내기(나쁜2)])
    기록 = 끝까지(손, 부른다음, 처음="목록보기")
    assert 기록["state"] == "됨", 기록.get("error")
    assert [s["name"] for s in 기록["steps"]] == ["매주 볼 곳 보기", "모으기", "검증", "모으기", "검증", "정리"]
    assert 기록["재료"]["되돌림"] == 1
    assert all(x["걸음"] == 0 for x in 기록["재료"]["호출기록"])


# ── 가지 전체 검토(과제 36) ─────────────────────────────────────────────────────

def test_사진_판정이_없으면_지휘자가_고른_사진을_그대로_쓰고_센다(monkeypatch):
    # 판정관이 막힌 날 «판정 없음» 을 «장면 아님» 으로 보고 사진을 다 버려 카드가 전부 AI 그림이 됐다(검토 I-4)
    monkeypatch.setattr(tools, "사진판정채우기", lambda 현, 번호들, 한도무시=False: None)
    현 = SimpleNamespace(재료={})
    x = {"번호": "E3", "미디어": [{"갈래": "사진", "주소": "https://a/1.jpg"}, {"갈래": "사진", "주소": "https://a/2.jpg"}]}
    assert flow._카드미디어(현, {"media": "E3#2"}, x)["주소"] == "https://a/2.jpg"
    assert flow._카드미디어(현, {"media": "E3"}, x)["주소"] == "https://a/1.jpg"
    assert 현.재료["판정없이넣음"] == 2
    x["사진판정"] = {"2": "못받음"}
    assert flow._카드미디어(현, {"media": "E3#2"}, x) is None  # 못 받은 그림은 지금처럼 빼고, 판정 없는 1번을 대신 넣지 않는다
    assert flow._판정없음줄({"판정없이넣음": 2}) == [
        {"도구": "사진 판정", "까닭": "판정관이 그때 답하지 않아 사진 2장은 판정 없이 지휘자가 고른 대로 넣음"}]
    assert flow._판정없음줄({}) == []


def test_목록보기는_글이_0건인_줄을_못_본_곳에_넣는다():
    # 없어진 인스타·스레드 계정은 빈 목록으로 와서 «본 곳» 으로 세어졌다(검토 I-6, Review Focus 1)
    목록 = 매주목록 + [{"도구": "instagram_account", "인자": {"account": "gone_insta", "deep": True}, "까닭": "옛 인스타"}]
    손, _ = 목록판(목록)
    flow.달리기(JOB, "목록보기", 손)
    재 = 손.창고.읽기(JOB)["재료"]
    assert {"글": "인스타 @gone_insta 최근 글 30개", "까닭": "글 없음 — 계정이 없거나 이 기간 글이 없음"} in 재["못본곳"]
    assert "인스타 @gone_insta 최근 글 30개" not in [x["글"] for x in 재["목록글"]]
    assert 재["작업판"]["목록"] == {"전체": 4, "본곳": 2}


def test_목록보기는_람다_시간이_모자라면_한_것까지_적고_이어_달린다():
    # 느린 날 10줄을 끝까지 돌리다 람다 15분을 넘겨 «멈춤» 으로 보였다(검토 I-5)
    목록 = [*매주목록, {"도구": "x_account", "인자": {"account": "cortis_two", "deep": True}, "까닭": "둘째"},
          {"도구": "x_account", "인자": {"account": "cortis_three", "deep": True}, "까닭": "셋째"}]
    손, 부른다음 = 목록판(목록)
    남은들 = iter([900.0, 100.0])
    손.남은초 = lambda: next(남은들, 900.0)
    flow.달리기(JOB, "목록보기", 손)
    기록 = 손.창고.읽기(JOB)
    assert 부른다음 == [(JOB, "목록보기")] and 기록["state"] == "만드는 중"  # 넷을 보고 이어 달리기
    한번 = len(손.실행.받은)
    assert len(기록["재료"]["목록글"]) + len(기록["재료"]["못본곳"]) == 4
    flow.달리기(JOB, "목록보기", 손)
    기록 = 손.창고.읽기(JOB)
    assert 부른다음[-1] == (JOB, "모으기") and len(손.실행.받은) == 한번 + 1  # 남은 하나만 부른다
    assert len(기록["재료"]["목록글"]) + len(기록["재료"]["못본곳"]) == 5
    assert 기록["재료"]["작업판"]["목록"]["전체"] == 5


# ── 계획 4 과제 42+ D — 카드 사진 규칙 ──

def test_카드_사진은_장면·공식그림이고_크기를_알면_짧은_변_600_이상():
    # 기사 썸네일 300×225·이벤트 배너 285×120 이 카드에서 흐렸고, 공식 트랙리스트 그림은 «로고» 라 뺐다
    사진, 영상 = {"갈래": "사진"}, {"갈래": "영상"}
    assert flow._쓸만한가(사진, "장면", [1200, 800]) and flow._쓸만한가(사진, "공식그림", [800, 1199])
    assert flow._쓸만한가(사진, "장면", [600, 600]) and flow._쓸만한가(사진, "공식그림", None)  # 크기 모름은 갈래만
    assert not flow._쓸만한가(사진, "장면", [600, 450]) and not flow._쓸만한가(사진, "공식그림", [599, 900])
    assert not flow._쓸만한가(사진, "로고", [1200, 800]) and not flow._쓸만한가(사진, None, [1200, 800])
    assert flow._쓸만한가(영상, "로고", [320, 240]) and not flow._쓸만한가(영상, "무관", [1920, 1080])  # 영상은 그대로


def test_카드_사진의_크기는_글_미디어가_아는_원본_크기를_먼저(monkeypatch):
    # X 판정관은 작은 대표화면을 받는다 — 카드는 원본(name=orig)을 쓰니 원본 크기로 잰다
    monkeypatch.setattr(tools, "사진판정채우기", lambda 현, 번호들, 한도무시=False, **kw: 0)
    현 = SimpleNamespace(재료={}, 판정관=None)
    x = {"번호": "E3", "미디어": [
        {"갈래": "사진", "주소": "https://p/a?name=orig", "대표화면": "https://p/a", "가로": 720, "세로": 407},
        {"갈래": "사진", "주소": "https://p/b?name=orig", "대표화면": "https://p/b", "가로": 3786, "세로": 2028}],
        "사진판정": {"1": "장면", "2": "공식그림"}, "사진크기": {"1": [720, 407], "2": [1200, 643]}}
    assert flow._카드미디어(현, {"media": "E3#1"}, x)["주소"] == "https://p/b?name=orig"  # 720×407 은 작다
    x["미디어"][1].update(가로=0, 세로=0)  # 원본 크기를 모르면 판정관이 읽은 크기
    x["사진크기"]["2"] = [1200, 500]
    assert flow._카드미디어(현, {"media": "E3#1"}, x) is None
    y = {"번호": "E4", "미디어": [{"갈래": "사진", "주소": "https://p/c", "대표화면": "https://p/c", "가로": 300, "세로": 225}]}
    assert flow._카드미디어(현, {"media": "E4#1"}, y) is None  # 판정이 없어도 작은 줄 알면 안 넣는다
    assert not 현.재료.get("판정없이넣음")


def test_기사_사진_고르기는_공식_그림도_받고_작은_것은_뺀다():
    x = {"번호": "E7", "사진후보": [{"주소": "https://n/a.jpg", "작은주소": "https://n/a_v150.jpg"},
                                 {"주소": "https://n/b.jpg"}, {"주소": "https://n/c.jpg"}]}
    현 = SimpleNamespace(판정관=사진판정관({"E7#1": "장면", "E7#2": "로고", "E7#3": "공식그림"},
                                      크기={"E7#1": [300, 225], "E7#3": [1080, 1350]}))
    assert flow._기사사진고르기(현, x) == {"갈래": "사진", "주소": "https://n/c.jpg", "대표화면": ""}
    assert x["사진판정"] == {"1": "장면", "2": "로고", "3": "공식그림"} and x["사진크기"]["3"] == [1080, 1350]


# ── 계획 4 과제 42+ E — 사진 더 찾기 ──

def test_사진_더_찾기_검색어는_분야_이름들_사건핵심_짧게_여럿():
    # 레이·리즈 출국 — «레이·리즈 Valentino 파리패션위크 출국» 한 줄로 찾아 X 0건이었다(42++ B)
    assert flow._검색어들("레이·리즈", "레이·리즈 Valentino 파리패션위크 출국", "아이브") == [
        "아이브 레이 리즈 Valentino 파리패션위크", "아이브 레이 Valentino 파리패션위크", "아이브 리즈 Valentino 파리패션위크"]
    assert flow._검색어들("안유진", "안유진 우주떡집 출연", "아이브") == ["아이브 안유진 우주떡집 출연"]
    assert flow._검색어들("그룹", "아이브 IVE 트랙리스트 공개", "아이브") == ["아이브 IVE 트랙리스트"]
    assert flow._검색어들("카리나, 윈터 & 닝닝/지젤", "단체 화보", "에스파")[0] == "에스파 카리나 윈터 닝닝 지젤 단체 화보"
    assert len(flow._검색어들("카리나, 윈터 & 닝닝/지젤", "단체 화보", "에스파")) == 3


def test_사진_더_찾기는_네_건까지_시간이_모자라면_그만(monkeypatch):
    한것 = []
    monkeypatch.setattr(flow, "_사진찾기한건", lambda 현, d, 분야: 한것.append(d["사건"]) or (None, [f"{d['사건']} 글"]))
    소식들 = [{"사건": f"사건{i}", "미디어": {"갈래": "영상"} if i == 2 else None, "출처": {"증거": f"E{i}"}} for i in range(1, 8)]
    현 = SimpleNamespace(재료={})
    flow._사진더찾기(현, SimpleNamespace(남은초=lambda: 900.0), 소식들, "코르티스")
    assert 한것 == ["사건1", "사건3", "사건4", "사건5"]  # 미디어 있는 소식은 건너뛰고 넷까지
    assert 현.재료["사진찾기"]["E3"] == ["사건3 글"]
    한것.clear()
    남은 = iter([900.0, 299.0])
    flow._사진더찾기(현, SimpleNamespace(남은초=lambda: next(남은)), 소식들, "코르티스")
    assert 한것 == ["사건1"]  # 남은 람다 시간이 300초 아래면 그만 — 옮기기·기억 적기를 남긴다


def 사진글(번, 계정, 글, 시각="2026-09-24T03:00:00Z"):
    t = 트윗(번, 계정=계정, 시각=시각, 글=글)
    t["extendedEntities"] = {"media": [{"media_url_https": f"https://pbs.twimg.com/{번}_1.jpg"}]}
    return t


# 11 이 뽑혀야 한다 — 12 는 더 크지만 팬, 13~16 은 공식이고 더 크지만 짧은 변 580·주인공 없는 글·기간 밖·날짜 모름
사진크기들 = {11: (1200, 800), 12: (3000, 2000), 13: (1700, 580), 14: (2000, 1500), 15: (2000, 1500), 16: (2400, 1600)}


def 머리받기(주소, 최대바이트=0):
    import re
    from fakes_topic import 그림머리
    m = re.search(r"pbs\.twimg\.com/(\d+)_1\.jpg", 주소)
    if m:
        return 그림머리(*사진크기들[int(m.group(1))], "jpeg"), "image/jpeg", 주소
    if 주소 == "https://news.example.com/img/1.jpg":
        return 그림머리(800, 600, "jpeg"), "image/jpeg", 주소
    return b"MP4", "video/mp4", 주소


def 사진찾기판(남은=900.0, 공식사진=False):
    없음 = {"hero": "그룹", "event": "쇼케이스 개최", "summary": "코르티스가 9월 24일 쇼케이스를 열었다 [E1].",
          "date": "2026-09-24", "source": "E1", "quote": "코르티스 쇼케이스 공지", "media": "없음"}

    def 엑스(입력):
        if "from:CORTIS_official" in json.dumps(입력):  # 미디어 없는 공식 글이 출처 — 공식사진이면 11 도 모을 때 이미 본다
            return [트윗(1, 글="코르티스 쇼케이스 공지")] + ([사진글(11, "CORTIS_official", "코르티스 쇼케이스 현장")] if 공식사진 else [])
        return [사진글(11, "CORTIS_official", "코르티스 쇼케이스 현장"), 사진글(12, "fan_acc", "코르티스 쇼케이스 직캠"),
                사진글(13, "CORTIS_official", "코르티스 쇼케이스"), 사진글(14, "CORTIS_official", "전혀 다른 이야기"),
                사진글(15, "CORTIS_official", "코르티스 쇼케이스", 시각="2026-09-10T03:00:00Z"),
                사진글(16, "CORTIS_official", "코르티스 쇼케이스 사진", 시각=None)]
    실행 = 가짜실행({KAITO: 엑스, "apify~google-search-scraper": [{"organicResults": [{
        "url": "https://news.example.com/s1", "title": "코르티스 쇼케이스 성료", "description": "코르티스가 24일 쇼케이스를 열었다",
        "date": "2026-09-24T03:00:00Z"}]}]})
    손, 부른다음 = 주제손(가짜대화([보기, 내기(없음)]), 실행, 받기=머리받기, 남은=남은)
    손.읽기 = lambda 주소: {"플랫폼": "page", "계정": "news.example.com", "주소": 주소, "제목": "코르티스 쇼케이스 성료",
                         "시각": "", "날짜": "2026-09-24", "글": "코르티스가 24일 쇼케이스를 열었다.", "링크": [],
                         "사진후보": [{"주소": "https://news.example.com/img/1.jpg", "설명": "무대"}], "미디어": [], "반응": {},
                         "답글": False}
    기록 = flow.새기록(JOB, 주문서)
    기록["started"] = "2026-10-01T03:00:00Z"
    손.창고.쓰기(기록)
    return 손, 부른다음


def test_카드_미디어가_없는_소식은_주인공과_사건으로_더_찾아_공식_계정_사진을_빌려_온다():
    # 아이브 «안유진 우주떡집» — 출처 글에 사진이 없어 지어낸 사람을 그렸다. 사용자 «더 찾아볼 생각은 못하나»(42+ E)
    손, 부른다음 = 사진찾기판()
    기록 = 끝까지(손, 부른다음)
    assert 기록["state"] == "됨", 기록.get("error")
    미디어 = 기록["result"]["bundle"][0]["미디어"]
    # 공식 계정 사진(1200×800)이 팬 사진(3000×2000)보다 먼저 — 짧은 변 580·주인공 없는 글·기간 밖·날짜 모르는 글은
    # 공식이고 커도 안 쓴다
    assert (미디어["갈래"], 미디어["원주소"]) == ("사진", "https://pbs.twimg.com/11_1.jpg?name=orig")
    from topic import evidence  # 검색 셋이 나란히 돌아 증거 번호 차례는 그때그때 — 빌려 온 글은 주소로 본다
    빌린글 = evidence.증거창고(손.창고.s3, 손.창고.통, JOB, 손.창고.앞).꺼내기(미디어["빌려온곳"])
    assert 빌린글["주소"] == "https://x.com/CORTIS_official/status/11"
    assert 미디어["키"].endswith("/media/01.jpg")
    받은 = 손.실행.받은
    assert any(입력.get("queryType") == "Latest" and 입력["maxItems"] == 20
               and 입력["searchTerms"][0].startswith("코르티스 쇼케이스 개최 since:") for _, 입력, _ in 받은)
    assert any(입력.get("queries") == "코르티스 쇼케이스 개최" and 입력.get("afterDate") for _, 입력, _ in 받은)  # 기간 안
    재 = 기록["재료"]
    assert sorted(x["도구"] for x in 재["호출기록"] if x.get("사진찾기")) == ["image_search", "read_page", "web_search", "x_search"]
    assert 재["사진찾기"]["E1"] == ["코르티스 쇼케이스 성료 — 코르티스가 24일 쇼케이스를 열었다."]


def test_정리_때_람다_시간이_모자라면_사진을_더_찾지_않는다():
    손, 부른다음 = 사진찾기판()
    flow.달리기(JOB, "모으기", 손)
    flow.달리기(*부른다음.pop(0), 손)  # 검증
    손.남은초 = lambda: 250.0
    flow.달리기(*부른다음.pop(0), 손)  # 정리
    기록 = 손.창고.읽기(JOB)
    assert 기록["state"] == "됨" and 기록["result"]["bundle"][0]["미디어"] is None
    assert len(손.실행.받은) == 1  # 지휘자의 x_account 하나뿐


# ── 계획 4 과제 42+ G — 옛 판정 다시 묻기 ──

def 옛판정으로(손, 번: str, 판정: dict) -> None:
    """모을 때 판정을 크기 없는 옛 꼴로 바꾼다 — 계획 4 과제 42+ 전에 만든 판처럼."""
    from topic import evidence
    창 = evidence.증거창고(손.창고.s3, 손.창고.통, JOB, 손.창고.앞)
    창.것들[번]["사진판정"] = dict(판정)
    창.것들[번].pop("사진크기", None)
    창.쓰기()


def test_정리는_카드에_들어갈_소식의_출처_글에서_크기_없는_옛_판정을_다시_묻는다():
    # 출처 글의 사진이 300×225 — 옛 판정은 «장면» 뿐이라 정리를 다시 돌리면 흐린 사진이 그대로 들어갔을 것
    def 엑스(입력):
        return [사진글(1, "CORTIS_official", "CORTIS 'FaSHioN' 뮤직비디오 공개")]

    사진크기들[1] = (300, 225)
    try:
        손, 부른다음 = 주제손(가짜대화([보기, 내기({**좋은, "media": "E1#1"})]), 가짜실행({KAITO: 엑스}), 받기=머리받기)
        기록 = flow.새기록(JOB, 주문서)
        기록["started"] = "2026-10-01T03:00:00Z"
        손.창고.쓰기(기록)
        flow.달리기(JOB, "모으기", 손)
        flow.달리기(*부른다음.pop(0), 손)  # 검증
        옛판정으로(손, "E1", {"1": "장면"})
        flow.달리기(*부른다음.pop(0), 손)  # 정리
    finally:
        del 사진크기들[1]
    from topic import evidence
    x = evidence.증거창고(손.창고.s3, 손.창고.통, JOB, 손.창고.앞).꺼내기("E1")
    assert x["사진크기"] == {"1": [300, 225]}  # 다시 물어 크기가 붙었다
    assert 손.창고.읽기(JOB)["result"]["bundle"][0]["미디어"] is None  # 짧은 변 225 — 카드에 안 넣는다


def test_사진_더_찾기도_크기_없는_옛_판정은_다시_묻는다():
    손, 부른다음 = 사진찾기판(공식사진=True)
    flow.달리기(JOB, "모으기", 손)
    flow.달리기(*부른다음.pop(0), 손)  # 검증
    옛판정으로(손, "E2", {"1": "로고"})  # 공식 11 의 사진 — 옛 판정은 «로고» 였다
    flow.달리기(*부른다음.pop(0), 손)  # 정리
    미디어 = 손.창고.읽기(JOB)["result"]["bundle"][0]["미디어"]
    assert (미디어["원주소"], 미디어["빌려온곳"]) == ("https://pbs.twimg.com/11_1.jpg?name=orig", "E2")


# ── 계획 4 과제 42++ B — 사람은 진짜 사진만: 이미지 검색·영상 건너뛰고 읽기·자료 사진 ──

from fakes_topic import 가짜판정관, 현장만들기  # noqa: E402

그림액터 = "simple.actor~google-images"
리즈 = {"주인공": "레이·리즈", "사건": "레이·리즈 Valentino 파리패션위크 출국", "요약": "", "발췌": "", "미디어": None,
      "출처": {"증거": "E0"}}


def _그림(주소, 가로, 세로, 제목, 쪽):
    return {"imageUrl": 주소, "imageWidth": 가로, "imageHeight": 세로, "title": 제목, "pageUrl": 쪽, "domain": "news"}


def 찾기현(그림답, 웹=(), 판정관=None):
    실행 = 가짜실행({그림액터: 그림답, KAITO: [],
                    "apify~google-search-scraper": [{"organicResults": [
                        {"url": u, "title": "아이브 출국", "description": "", "date": "2026-09-24T03:00:00Z"} for u in 웹]}]})
    읽은 = []

    def 읽기(주소):
        읽은.append(주소)
        return {"플랫폼": "page", "계정": "news", "주소": 주소, "제목": "기사", "시각": "", "날짜": "2026-09-24", "글": "",
                "링크": [], "사진후보": [], "미디어": [], "반응": {}, "답글": False}
    return 현장만들기(실행, 읽기=읽기, 판정관=판정관 or 가짜판정관()), 실행, 읽은


def test_사진_더_찾기는_이미지_검색까지_부르고_영상_주소는_건너뛰고_다섯_개를_읽는다():
    웹 = ["https://www.youtube.com/watch?v=1", "https://youtu.be/2", "https://www.instagram.com/reel/3/",
         "https://www.tiktok.com/@a/video/4"] + [f"https://news{i}.com/a" for i in range(1, 7)]
    현, 실행, 읽은 = 찾기현([_그림("https://img/big.jpg", 3000, 2000, "다른 가수 공항 패션", "https://n/1"),
                         _그림("https://img/small.jpg", 500, 400, "리즈 출국", "https://n/2"),
                         _그림("https://img/ok.jpg", 1200, 1600, "아이브 리즈 레이, 파리로 출국", "https://n/3")], 웹)
    미디어, _ = flow._사진찾기한건(현, dict(리즈), "아이브")
    # 제목에 이름·사건 낱말이 없는 큰 사진, 짧은 변 600 아래는 빼고 — 이미지 검색 결과는 날짜가 없어도 쓴다
    assert (미디어["주소"], 현.창고.꺼내기(미디어["빌려온곳"])["주소"]) == ("https://img/ok.jpg", "https://n/3")
    assert not 미디어.get("자료사진")
    입력들 = {도구: 입력 for 도구, 입력, _ in 실행.받은}
    assert 입력들[그림액터]["queries"] == flow._검색어들(리즈["주인공"], 리즈["사건"], "아이브")
    assert 입력들[그림액터]["maxItems"] == 10 and 입력들[그림액터]["timeRange"] == "month"
    assert 입력들[KAITO]["searchTerms"][0].startswith("아이브 레이 리즈 Valentino 파리패션위크 since:")
    assert 입력들[KAITO]["queryType"] == "Latest" and 입력들["apify~google-search-scraper"]["queries"] == (
        "아이브 레이 리즈 Valentino 파리패션위크")
    assert sorted(읽은) == [f"https://news{i}.com/a" for i in range(1, 6)]
    assert all(x.get("사진찾기") for x in 현.예산.기록)
    assert sum(1 for 도구, _, _ in 실행.받은 if 도구 == 그림액터) == 1  # 사건 사진이 있으면 자료 사진은 안 찾는다


def _자료답(입력):
    if 입력["timeRange"] != "year":
        return []
    return {"아이브 레이": [_그림("https://img/r1.jpg", 1000, 1500, "아이브 레이 공항", "https://n/r1"),
                         _그림("https://img/both.jpg", 900, 1200, "아이브 레이·리즈 화보", "https://n/both"),
                         _그림("https://img/poster.jpg", 2000, 3000, "아이브 레이 리즈 포스터", "https://n/poster")],
            "아이브 리즈": [_그림("https://img/z1.jpg", 2000, 3000, "아이브 리즈 근황", "https://n/z1")]}[입력["queries"][0]]


포스터 = {"https://img/poster.jpg": "공식그림"}


def test_사건_사진이_없으면_이름마다_자료_사진_둘이_같이_나온_것_먼저_얼굴이_있어야():
    현, 실행, _ = 찾기현(_자료답, 판정관=가짜판정관(사진=포스터))
    미디어, _ = flow._사진찾기한건(현, dict(리즈), "아이브")
    assert (미디어["주소"], 미디어["자료사진"]) == ("https://img/both.jpg", True)
    자료 = [입력 for 도구, 입력, _ in 실행.받은 if 도구 == 그림액터 and 입력["timeRange"] == "year"]
    assert sorted(x["queries"][0] for x in 자료) == ["아이브 레이", "아이브 리즈"] and {x["maxItems"] for x in 자료} == {10}
    assert all(x.get("사진찾기") for x in 현.예산.기록)


def test_자료_사진은_장면이고_얼굴이_있어야_없으면_첫_이름_사진():
    현, _, _ = 찾기현(_자료답, 판정관=가짜판정관(사진=포스터, 얼굴={"https://img/both.jpg": 0}))
    # 포스터(공식그림)는 둘 이름이 있고 커도 자료 사진이 아니다 — 둘이 나온 사진에 얼굴이 없으면 첫 이름(레이) 사진
    미디어, _ = flow._사진찾기한건(현, dict(리즈), "아이브")
    assert 미디어["주소"] == "https://img/r1.jpg" and 미디어["자료사진"] is True


def test_자료_사진이_하나도_안_맞으면_없음():
    판정관 = 가짜판정관(사진=포스터, 얼굴={"https://img/both.jpg": 0, "https://img/r1.jpg": 0, "https://img/poster.jpg": 3})
    현, _, _ = 찾기현(_자료답, 판정관=판정관)
    assert flow._사진찾기한건(현, dict(리즈), "아이브")[0] is None


# ── 계획 4 과제 42++ D — 표지 사진 고르기에 쓸 크기·자료 사진 표시를 옮길 때 남긴다 ──

def test_옮길_때_그림이면_머리에서_읽은_크기와_자료사진_표시를_남긴다():
    from fakes_topic import 그림머리
    손 = SimpleNamespace(받기=lambda 주소, 최대바이트=0: (그림머리(1200, 1600, "jpeg"), "image/jpeg", 주소),
                        창고=store.창고(가짜S3(), "통"))
    난것 = flow._옮기기(JOB, 1, {"갈래": "사진", "주소": "https://img/ok.jpg", "대표화면": "", "빌려온곳": "E3",
                                "자료사진": True}, 손)
    assert (난것["크기"], 난것["자료사진"], 난것["빌려온곳"]) == ([1200, 1600], True, "E3") and 난것["키"].endswith("01.jpg")
    영상 = flow._옮기기(JOB, 2, {"갈래": "영상", "주소": "https://v/1.mp4", "대표화면": ""},
                     SimpleNamespace(받기=lambda 주소, 최대바이트=0: (b"MP4", "video/mp4", 주소), 창고=손.창고))
    assert "크기" not in 영상 and "자료사진" not in 영상


def test_멈춤표가_있으면_다음_단계를_하지_않고_멈춘다():
    # 저장한 분야 판이 30분 넘게 돌아 사람이 «멈춰» — 멈출 길이 없었다(10-05). 창고 비공개 칸에 멈춤표를 두면 다음 단계가 멈춘다
    손, 부른다음 = 판([보기, 내기(좋은)])
    손.창고.s3.put_object(Bucket=손.창고.통, Key=f"{손.창고.앞}memory/stop/{JOB}.json", Body=b'{"why": "\xec\x82\xac\xeb\x9e\x8c"}')
    flow.달리기(JOB, "모으기", 손)
    기록 = 손.창고.읽기(JOB)
    assert 부른다음 == [] and 기록["state"] == "실패" and "멈춤" in 기록["error"]
