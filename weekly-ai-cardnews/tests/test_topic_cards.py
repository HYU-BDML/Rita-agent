# -*- coding: utf-8 -*-
"""계획 3 — 새 분야 카드 만들기."""
from topic import cards


def 소식(i, 주인공="하츠투하츠", 미디어=None, 배수=1.0):
    return {"순서": i, "주인공": 주인공, "사건": f"사건{i}", "요약": f"요약{i} 9월 24일 [E{i}].", "날짜": "2026-09-24",
            "출처": {"주소": f"https://x.com/h/{i}", "계정": "hearts2hearts", "플랫폼": "x", "증거": f"E{i}"},
            "발췌": f"발췌{i}", "미디어": 미디어, "반응": {}, "배수": 배수, "딱지": []}


def test_이름표_한_주면_주차_아니면_날짜():
    assert cards.이름표("2026-09-21", "2026-09-27") == "9월 3주차"
    assert cards.이름표("2026-09-28", "2026-10-04") == "9월 4주차"
    assert cards.이름표("2026-09-28", "2026-10-31") == "9/28~10/31"
    assert cards.이름표("2026-09-23", "2026-09-29") == "9/23~9/29"


def test_넣는_글은_소식N_으로_짝짓는다():
    # 같은 주인공이 여럿이어도 장·미디어 짝이 안 엉키게 brand 는 «소식N»
    글, 순서, picked = cards.넣는글("9월 3주차", [소식(1), 소식(2), 소식(3, "카르멘")])
    assert 글.split("\n\n")[0] == "9월 3주차"
    assert 글.split("\n\n")[1] == ("[소식1] 주인공: 하츠투하츠 · 사건: 사건1 · 날짜: 2026-09-24 · "
                                  "요약: 요약1 9월 24일 [E1]. · 발췌: 발췌1")
    assert "[소식3] 주인공: 카르멘" in 글
    assert [x["brand"] for x in 순서] == ["소식1", "소식2", "소식3"] and [x["brand"] for x in picked] == ["소식1", "소식2", "소식3"]


def test_덧붙임은_분야를_말하고_표지_그림엔_사람이_없다():
    # 표지는 진짜 사진을 깔거나, 없으면 사람 없이 그린다 — 사람 수를 묻지 않는다(42++ D)
    덧 = cards.덧붙임("아이브")
    assert "«아이브» 소식" in 덧 and "[ ] 안 글자 그대로" in 덧 and "no person" in 덧 and "single" not in 덧
    assert "AI 소식" in 덧  # 표지 2행은 검사 꼴대로 쓰고 코드가 바꾼다


def _재():
    return {"표지": {"no": 1, "type": "표지", "eyebrow": "Weekly AI", "headline": ["끝판왕 등장,", "9월 3주차 AI 소식"],
                    "accent_text": "9월 3주차", "brand": "소식1", "meme": "끝판왕", "gen_prompt_en": "A single woman"},
            "굽기장": [{"no": 2, "type": "뉴스", "brand": "소식2", "headline": ["a", "b"], "body": ["c"], "source_kind": "X",
                        "source_name": "소식2", "media_url": "", "gen": "gemini", "gen_prompt_en": "p2"},
                       {"no": 3, "type": "뉴스", "brand": "소식1", "headline": ["a", "b"], "body": ["c"], "source_kind": "X",
                        "source_name": "소식1", "media_url": "", "gen": "gemini", "gen_prompt_en": "p1"},
                       {"no": 4, "type": "CTA", "logo_text": "HANYANG NEWS", "handle": "@hanyang_news",
                        "headline": ["매일 업데이트 되는", "AI 뉴스와 트렌드가 더 궁금하다면?"], "media_url": "", "gen": ""}]}


def _틀():
    import json
    return json.dumps({"slide_types": {"뉴스": {"brand_chip": {"format": "AI NEWS  |  {brand}"}},
                                       "표지": {"eyebrow": {"text": "Weekly AI"}}}}, ensure_ascii=False)


def _넘침없음(장들, 틀):
    return {"ok": True, "넘친것": [], "틀탈": []}


def _묶음():
    return [소식(1, "하츠투하츠", {"갈래": "사진", "키": "w/t/j/media/01.jpg"}),
            소식(2, "카르멘", {"갈래": "영상", "키": "w/t/j/media/02.mp4", "대표키": "w/t/j/media/02_t.jpg"})
            | {"출처": {"주소": "https://instagram.com/p/1", "계정": "hearts2hearts", "플랫폼": "instagram", "증거": "E2"}}]


def 주소(키):
    return f"https://s3/{키}"


def test_소식_장은_칩이_주인공_출처는_플랫폼():
    재 = _재()
    cards.고쳐쓰기(재, _묶음(), "하츠투하츠", "9월 3주차", None, 주소, _넘침없음, _틀())
    둘, 하나 = 재["굽기장"][0], 재["굽기장"][1]
    assert (둘["brand"], 둘["source_kind"], 둘["source_name"]) == ("카르멘", "인스타그램", "hearts2hearts")
    assert (둘["media_url"], 둘["gen"]) == ("https://s3/w/t/j/media/02.mp4", "")
    assert (하나["brand"], 하나["source_kind"], 하나["media_url"]) == ("하츠투하츠", "X", "https://s3/w/t/j/media/01.jpg")


def test_미디어가_없는_장은_그림_단계가_그린다():
    재 = _재()
    묶음 = _묶음()
    묶음[1]["미디어"] = {"갈래": "영상", "원주소": "https://x/v.mp4", "못옮김": "403"}
    cards.고쳐쓰기(재, 묶음, "하츠투하츠", "9월 3주차", None, 주소, _넘침없음, _틀())
    assert (재["굽기장"][0]["media_url"], 재["굽기장"][0]["gen"]) == ("", "gemini")


def test_표지_2행은_분야_소식_넘치면_줄인다():
    재 = _재()
    cards.고쳐쓰기(재, _묶음(), "하츠투하츠", "9월 3주차", None, 주소, _넘침없음, _틀())
    assert 재["표지"]["headline"] == ["끝판왕 등장,", "9월 3주차 하츠투하츠 소식"] and 재["표지"]["accent_text"] == "9월 3주차"
    assert 재["표지"]["eyebrow"] == "Weekly 하츠투하츠"

    def 넘침(장들, 틀):  # 표지 2행이 14자를 넘으면 넘친다고 치자
        return {"ok": False, "넘친것": [{"no": s["no"], "type": s["type"]} for s in 장들
                                       if s["type"] == "표지" and len(s["headline"][1]) > 14], "틀탈": []}
    재 = _재()
    cards.고쳐쓰기(재, _묶음(), "파리 패션위크 2027 봄·여름", "9월 3주차", None, 주소, 넘침, _틀())
    assert 재["표지"]["headline"][1] == "9월 3주차 소식"


def test_마지막_장은_분야():
    재 = _재()
    cards.고쳐쓰기(재, _묶음(), "아이브", "9월 3주차", None, 주소, _넘침없음, _틀())
    assert 재["굽기장"][-1]["headline"] == ["매일 업데이트 되는", "아이브 소식이 더 궁금하다면?"]


def test_틀_칩은_주인공만():
    import json
    틀 = json.loads(cards.고쳐쓰기(_재(), _묶음(), "아이브", "9월 3주차", None, 주소, _넘침없음, _틀()))
    assert 틀["slide_types"]["뉴스"]["brand_chip"]["format"] == "{brand}"
    assert 틀["slide_types"]["표지"]["eyebrow"]["text"] == "Weekly 아이브"


def test_마지막_장만_넘치면_표지_2행은_그대로():
    # 둘이 한 고리라 마지막 장만 넘쳐도 표지 2행이 «{분야} 소식» 으로 줄어 «9월 3주차» 강조가 빠졌다(계획 4 D-1)
    def 끝만넘침(장들, 틀):
        return {"ok": False, "넘친것": [{"no": s["no"], "type": s["type"]} for s in 장들
                                       if s["type"] == "CTA" and len(s["headline"][1]) > 12], "틀탈": []}
    재 = _재()
    cards.고쳐쓰기(재, _묶음(), "하츠투하츠", "9월 3주차", None, 주소, 끝만넘침, _틀())
    assert 재["표지"]["headline"][1] == "9월 3주차 하츠투하츠 소식"
    assert 재["굽기장"][-1]["headline"][1] == "소식이 더 궁금하다면?"


def test_표지_사진이_있으면_그_사진을_깔고_얼굴_없음():
    # 표지는 진짜 사진을 그대로 — GPT 가 사진을 참고해 다시 그려 얼굴이 바뀌었다(42++ D). 얼굴 바꾸기 칸은 안 쓴다
    재 = _재()
    재["표지"]["face_url"] = "https://old/face.jpg"  # 앞 판의 칸이 남아 있어도 지운다
    cards.고쳐쓰기(재, _묶음(), "아이브", "9월 3주차", {"키": "w/t/j/media/01.jpg", "주인공": "리즈", "사람": 1},
                 주소, _넘침없음, _틀())
    표 = 재["표지"]
    assert (표["photo_url"], 표["face_none"], 표["brand"]) == ("https://s3/w/t/j/media/01.jpg", True, "리즈")
    assert not {"face_url", "face_person", "face_count"} & set(표) and 표["gen_prompt_en"] == "A single woman"


def test_표지_사진이_없으면_사람_없이_그린다():
    # 옛 서버가 주인공 이름(엔비디아)으로 위키미디어 얼굴 표를 찾아 그 회사 대표 얼굴을 붙였다(계획 4 D-9)
    재 = _재()
    cards.고쳐쓰기(재, _묶음(), "엔비디아", "9월 3주차", None, 주소, _넘침없음, _틀())
    표 = 재["표지"]
    assert 표["face_none"] is True and "photo_url" not in 표 and 표["brand"] == "하츠투하츠"
    assert 표["gen_prompt_en"] == "A single woman" + cards.사람없이
    cards.표지사진(표, None, 주소, _묶음())  # 다시 해도 두 번 붙이지 않는다
    assert 표["gen_prompt_en"].count("no people") == 1


# ── 카드 네 단계가 판 흐름에 이어지나 (계획 3 과제 4) ──
import json  # noqa: E402
from types import SimpleNamespace  # noqa: E402

import pytest  # noqa: E402

import runs  # noqa: E402
from fakes_topic import KAITO, 가짜대화, 가짜실행, 주문서, 주제손, 트윗  # noqa: E402
from topic import flow  # noqa: E402

JOB = "20261001-030000-cccccccc"
좋은 = {"hero": "그룹", "event": "뮤직비디오 공개", "summary": "코르티스가 9월 24일 뮤직비디오 «FaSHioN» 을 공개했다 [E1].",
      "date": "2026-09-24", "source": "E1", "quote": "CORTIS 'FaSHioN' 뮤직비디오 공개", "media": "E1"}
보기 = [("x_account", {"account": "CORTIS_official", "deep": True}),
      ("update_board", {"stage": "④", "judgment": "공식", "source_verdicts": [
          {"place": "x:cortis_official", "verdict": "공식", "basis": "인증"}]})]


class 옛서버카드:
    def __init__(self):
        self.제목들 = []

    def 폭검사(self, 장들, 틀):
        return {"ok": True, "넘친것": [], "틀탈": []}

    def 넘겨보기(self, 제목, 장들):
        self.제목들.append(제목)
        return "https://v/1.html"


def 카드판(monkeypatch, 소식들=(좋은,), 표지탈=None, 영상=True, **기록칸):
    받은 = {"지시": []}
    대화 = 가짜대화([보기, [("submit_result", {"items": list(소식들), "unfilled": []})]])
    손, 부른다음 = 주제손(대화, 가짜실행({KAITO: [트윗(1, 좋아요=12400, 영상=영상, 글="CORTIS 'FaSHioN' 뮤직비디오 공개")]}))
    틀 = {"slide_types": {"뉴스": {"brand_chip": {"format": "AI NEWS  |  {brand}"}}, "표지": {"eyebrow": {"text": "Weekly AI"}}}}
    옛 = 옛서버카드()
    손.옛서버, 손.그림, 손.잠자기 = 옛, (lambda 글: (b"png", {})), (lambda s: None)

    def 딥(시스템, 사용자, 한도):
        받은["지시"].append(시스템)
        if 시스템 == cards.그림설명지시:  # 사진 없는 소식의 그림 설명(42+ F)
            return {"글": '{"설명": "떡집 가게 앞을 그린다.", "사람": ""}', "넘침": False, "입력토큰": 900, "캐시토큰": 0,
                    "출력토큰": 300, "생각토큰": 0, "초": 1}
        return {"글": "", "넘침": False}
    손.딥시크한번 = 딥
    손.노드 = SimpleNamespace(design_tpl=SimpleNamespace(main=lambda: {"tpl": json.dumps(틀, ensure_ascii=False)}))

    def 본문(기록, 손r):
        받은["본문"] = (기록["week"], 기록["재료"]["news"].split("\n\n")[1][:30], [x["brand"] for x in 기록["재료"]["순서"]])
        손r.딥시크("SYS", "USER", 10)
        기록["재료"]["slides"] = [{"brand": "소식1"}]

    def 표지(기록, 손r):
        if 표지탈:
            raise 표지탈
        기록["재료"]["굽기장"] = [{"no": 2, "type": "뉴스", "brand": "소식1", "source_kind": "X", "source_name": "소식1",
                                  "media_url": "", "gen": "gemini", "headline": ["a", "b"], "body": ["c"]},
                                 {"no": 3, "type": "CTA", "headline": ["매일 업데이트 되는", "AI 뉴스와 트렌드가 더 궁금하다면?"]}]
        기록["재료"]["표지"] = {"no": 1, "type": "표지", "eyebrow": "Weekly AI", "headline": ["훅,", f"{기록['week']} AI 소식"],
                              "accent_text": 기록["week"], "brand": "소식1"}

    def 그림(기록, 손r):
        받은["그림"] = True

    def 굽기(기록, 손r):
        받은["틀"] = json.loads(손r.노드.design_tpl.main()["tpl"])
        손r.옛서버.넘겨보기(f"{기록['week']} AI 소식", [])
        기록["result"] = {"viewer": "https://v/1.html", "slides": 3, "missing_slides": [{"no": 3, "why": "x"}],
                         "missing_brands": []}

    for 이름, 함수 in (("본문", 본문), ("표지", 표지), ("그림", 그림), ("굽기", 굽기)):
        monkeypatch.setattr(runs, 이름, 함수)
    기록 = flow.새기록(JOB, 주문서)
    기록.update(started="2026-10-01T03:00:00Z", **기록칸)
    손.창고.쓰기(기록)
    return 손, 부른다음, 받은, 옛, 대화


def 끝까지(손, 부른다음, 최대=12):
    flow.달리기(JOB, "모으기", 손)
    단계들 = []
    for _ in range(최대):
        if not 부른다음:
            break
        _, 단계 = 부른다음.pop(0)
        단계들.append(단계)
        flow.달리기(JOB, 단계, 손)
    return 손.창고.읽기(JOB), 단계들


def test_정리_다음은_카드_넷을_지나_보기_주소가_결과에(monkeypatch):
    손, 부른다음, 받은, 옛, _ = 카드판(monkeypatch)
    기록, 단계들 = 끝까지(손, 부른다음)
    assert 단계들 == ["검증", "정리", "카드대본", "카드표지", "카드그림", "카드굽기"] and 기록["state"] == "됨"
    assert 기록["result"]["bundle"][0]["사건"] == "뮤직비디오 공개"
    assert 기록["result"]["카드"] == {"보기": "https://v/1.html", "장수": 3, "빠진장": [{"no": 3, "why": "x"}]}
    assert 받은["본문"] == ("9월 3주차", "[소식1] 주인공: 그룹 · 사건: 뮤직비디오 공개 ·", ["소식1"])
    assert 받은["지시"][0].startswith("SYS") and "«코르티스» 소식" in 받은["지시"][0]
    assert 받은["틀"]["slide_types"]["뉴스"]["brand_chip"]["format"] == "{brand}" and 받은["그림"]
    assert 옛.제목들 == ["9월 3주차 코르티스 소식"]
    장 = 기록["재료"]["굽기장"]
    assert 장[0]["brand"] == "그룹" and 장[-1]["headline"][1] == "코르티스 소식이 더 궁금하다면?"
    assert 기록["재료"]["표지"]["headline"][1] == "9월 3주차 코르티스 소식"


def test_카드가_실패해도_소식은_남는다(monkeypatch):
    손, 부른다음, _, _, _ = 카드판(monkeypatch, 표지탈=runs.멈춤("표지 문구가 두 번 고쳐도 규칙에 걸림 — 2행"))
    기록, 단계들 = 끝까지(손, 부른다음)
    assert 단계들[-1] == "카드표지" and 기록["state"] == "됨" and 기록["error"] is None
    assert 기록["result"]["bundle"] and 기록["result"]["카드"] == {"오류": "표지 문구가 두 번 고쳐도 규칙에 걸림 — 2행"}


def test_카드_안_굽는_판은_정리에서_됨(monkeypatch):
    손, 부른다음, 받은, _, _ = 카드판(monkeypatch, 카드=False)
    기록, 단계들 = 끝까지(손, 부른다음)
    assert 단계들 == ["검증", "정리"] and 기록["state"] == "됨" and "카드" not in 기록["result"] and "본문" not in 받은


def test_소식이_0건이면_카드_없이_됨(monkeypatch):
    손, 부른다음, 받은, _, _ = 카드판(monkeypatch, 소식들=())
    기록, 단계들 = 끝까지(손, 부른다음)
    assert 단계들[-1] == "정리" and 기록["state"] == "됨" and not 기록["result"]["bundle"] and "본문" not in 받은


def test_카드_기계가_없으면_카드_없이(monkeypatch):
    손, 부른다음, 받은, _, _ = 카드판(monkeypatch)
    손.옛서버 = None  # 시험·옛 손 — 카드를 굽는 기계가 안 붙어 있으면 소식에서 끝
    기록, 단계들 = 끝까지(손, 부른다음)
    assert 단계들 == ["검증", "정리"] and 기록["state"] == "됨"


def test_지휘모델이_지휘자에게_실린다(monkeypatch):
    손, 부른다음, _, _, 대화 = 카드판(monkeypatch, 지휘모델="deepseek-flash", 카드=False)
    끝까지(손, 부른다음)
    assert 대화.지휘모델들 and set(대화.지휘모델들) == {"deepseek-flash"}


def test_카드_단계는_주제_판으로_간다(monkeypatch):
    import app
    간곳 = []
    monkeypatch.setattr(flow, "달리기", lambda job, 단계, 손: 간곳.append(("주제", 단계)) or {"ok": True})
    monkeypatch.setattr(runs, "달리기", lambda job, 단계, 손: 간곳.append(("주간", 단계)) or {"ok": True})
    monkeypatch.setattr(app, "주제손만들기", lambda context=None: None)
    monkeypatch.setattr(app, "손만들기", lambda context=None: None)
    for 단계 in ("카드대본", "카드표지", "카드그림", "카드굽기", "본문"):
        app.handler({"_job": JOB, "_stage": 단계}, None)
    assert 간곳 == [("주제", "카드대본"), ("주제", "카드표지"), ("주제", "카드그림"), ("주제", "카드굽기"), ("주간", "본문")]


def test_얼굴은_작은_대표_그림으로_세고_못_세면_0명(monkeypatch):
    # 2MB 넘는 원본 사진은 판정관이 못 받아 조용히 0명이 됐고, 판정이 터지면 카드 전체가 실패했다(최종 검토 중요 2)
    손, 부른다음, _, _, 대화 = 카드판(monkeypatch)

    def 터짐(*a, **kw):
        raise RuntimeError("딥시크 잔액 부족")

    monkeypatch.setattr(cards.judge.판정관, "얼굴수", 터짐)
    기록, 단계들 = 끝까지(손, 부른다음)
    assert 단계들[-1] == "카드굽기" and 기록["result"]["카드"].get("보기") and 기록["재료"]["카드"]["표지칸"] is None


def test_카드_굽기_중에_람다가_죽어도_창고엔_소식_묶음이_남는다(monkeypatch):
    # runs.굽기 는 결과를 AI 소식 꼴로 덮어써 저장한다 — 되돌리기 전에 람다가 죽으면 묶음이 사라졌다(계획 4 D-2)
    손, 부른다음, _, _, _ = 카드판(monkeypatch)
    옛굽기 = runs.굽기

    class 람다죽음(BaseException):
        pass

    def 죽는굽기(기록, 손r):
        옛굽기(기록, 손r)      # 결과를 AI 소식 꼴로 덮는다(가짜)
        손r.창고.쓰기(기록)    # runs._끝 이 하는 저장
        raise 람다죽음()

    monkeypatch.setattr(runs, "굽기", 죽는굽기)
    with pytest.raises(람다죽음):
        끝까지(손, 부른다음)
    남은 = 손.창고.읽기(JOB)
    assert 남은["result"]["bundle"][0]["사건"] == "뮤직비디오 공개"
    assert 남은["result"]["카드"]["보기"] == "https://v/1.html"


def _진행붙이기(함수, 값):
    def 감싼(기록, 손r):
        함수(기록, 손r)
        기록["pct"] = 값  # runs 의 진짜 값 — 본문 50 · 표지(대본 합치기) 65 · 그림 70 · 굽기(넘겨보기) 99
        손r.창고.쓰기(기록)
    return 감싼


def test_진행률은_카드까지_줄지_않는다(monkeypatch):
    # 정리 99% → 카드 본문 50% 로 뒤로 갔다(계획 4 D-3)
    손, 부른다음, _, _, _ = 카드판(monkeypatch)
    for 이름, 값 in (("본문", 50), ("표지", 65), ("그림", 70), ("굽기", 99)):
        monkeypatch.setattr(runs, 이름, _진행붙이기(getattr(runs, 이름), 값))
    진행 = []
    옛쓰기 = 손.창고.쓰기
    monkeypatch.setattr(손.창고, "쓰기", lambda 기록: 진행.append(기록.get("pct")) or 옛쓰기(기록))
    기록, _ = 끝까지(손, 부른다음)
    assert 기록["state"] == "됨" and 진행[-1] == 100
    assert 진행 == sorted(진행), 진행


def test_카드_단계_판정관_돈은_카드_줄로():
    # 표지 얼굴을 세는 판정관 돈이 «검증·정리» 로 묶였다(계획 4 D-7)
    재 = {}
    cards._카드적기(재)({"입력토큰": 1, "출력토큰": 1}, "판정")
    assert 재["딥시크기록"][-1]["열쇠"] == "카드판정"


# ── 계획 4 과제 42+ F — 이해하고 그리기 ──

def _그림설명답(설명, 넘침=False):
    return {"글": json.dumps({"설명": 설명}, ensure_ascii=False), "넘침": 넘침, "입력토큰": 900, "캐시토큰": 0,
            "출력토큰": 300, "생각토큰": 200, "초": 9}


def test_사진이_없는_소식만_딥시크로_그림_설명을_정한다():
    # 아이브 «안유진 우주떡집» — 사진이 없어 «A bright studio set with a cheerful young woman» 을 그렸다. 사용자 «우주떡집이
    # 뭔지 이해하고(tvN 예능) 그에 맞게 그리든가»
    물음 = []

    def 딥(시스템, 사용자, 한도):
        물음.append((시스템, 사용자))
        if "우주떡집" in 사용자:
            return _그림설명답("tvN 예능 «우주떡집» 에 안유진이 나온다. 떡집 가게 앞의 따뜻한 분위기를 그린다.")
        return _그림설명답("아이브의 공연 소식이다. 빈 무대와 조명을 그린다.")

    사진 = 소식(1, "아이브", {"갈래": "사진", "키": "w/t/j/media/01.jpg"})
    떡집 = 소식(2, "안유진") | {"사건": "우주떡집 출연"}
    못옮김 = 소식(3, "아이브", {"갈래": "사진", "원주소": "https://x/a.jpg", "못옮김": "403"})
    기록 = {"재료": {"사진찾기": {"E2": ["우주떡집 — tvN 새 예능, 떡집을 차린 이야기"]}}, "result": {"bundle": [사진, 떡집, 못옮김]}}
    cards.그림설명(기록, SimpleNamespace(딥시크한번=딥, 남은초=lambda: 900.0))
    assert len(물음) == 2 and {x[0] for x in 물음} == {cards.그림설명지시}  # 카드 미디어가 있는 소식은 안 묻는다
    떡집물음 = next(x[1] for x in 물음 if "우주떡집" in x[1])
    assert "주인공: 안유진" in 떡집물음 and "요약: 요약2" in 떡집물음 and "발췌: 발췌2" in 떡집물음
    assert "검색 결과:\n- 우주떡집 — tvN 새 예능, 떡집을 차린 이야기" in 떡집물음
    assert 떡집["그림설명"].startswith("tvN 예능 «우주떡집»") and "그림사람" not in 떡집  # 사람은 그리지 않는다(42++ C)
    assert "그림설명" not in 사진 and 못옮김["그림설명"]
    assert [x["열쇠"] for x in 기록["재료"]["딥시크기록"]] == ["카드그림설명", "카드그림설명"]  # 돈은 «카드» 줄로
    cards.그림설명(기록, SimpleNamespace(딥시크한번=딥, 남은초=lambda: 900.0))
    assert len(물음) == 2  # 이어 달려도 다시 안 묻는다


def test_그림_설명_지시는_모르는_이름은_검색_결과로_이해하고_사람을_그리지_않게():
    # 사람은 AI 로 그리지 않는다 — 레이·리즈를 위키 얼굴 참고로 그렸더니 «AI 같고 레이·리즈 같지 않다»(42++ C)
    지 = cards.그림설명지시
    assert "검색 결과" in 지 and "지어내지 않" in 지 and "사람을 그리지 않는다" in 지
    assert '"설명"' in 지 and '"사람"' not in 지


def test_그림_설명은_답을_못_읽으면_빈칸_묻다_터지면_다음에_다시():
    def 넘침(시스템, 사용자, 한도):
        return _그림설명답("x", 넘침=True)

    def 터짐(시스템, 사용자, 한도):
        raise RuntimeError("딥시크 잔액 부족")
    d = 소식(1, "안유진")
    cards.그림설명({"재료": {}, "result": {"bundle": [d]}}, SimpleNamespace(딥시크한번=넘침, 남은초=lambda: 900.0))
    assert d["그림설명"] == "" and "그림사람" not in d
    e = 소식(2, "안유진")
    cards.그림설명({"재료": {}, "result": {"bundle": [e]}}, SimpleNamespace(딥시크한번=터짐, 남은초=lambda: 900.0))
    assert "그림설명" not in e


def test_그림_설명은_람다_시간이_모자라면_이어_달린다():
    with pytest.raises(runs.이어달리기):
        cards.그림설명({"재료": {}, "result": {"bundle": [소식(1, "안유진")]}},
                    SimpleNamespace(딥시크한번=lambda *a: pytest.fail("부르면 안 된다"), 남은초=lambda: 500.0))


def test_넣는_글과_덧붙임에_그림_설명():
    d = 소식(1, "안유진") | {"그림설명": "떡집 가게 앞을 그린다."}
    글, _, _ = cards.넣는글("9월 4주차", [d, 소식(2)])
    assert 글.split("\n\n")[1].endswith(" · 발췌: 발췌1 · 그림 설명: 떡집 가게 앞을 그린다.")
    assert "그림 설명" not in 글.split("\n\n")[2]
    덧 = cards.덧붙임("아이브")
    assert "«그림 설명» 이 있는 소식은 gen_prompt_en 을 그 설명대로" in 덧 and "사람을 그리지 않는다" in 덧


def test_카드_대본은_사진_없는_소식의_그림_설명을_넣는_글에_싣는다(monkeypatch):
    # 출처 글에 미디어가 없어야 «사진 없는 소식» — «없음» 이어도 출처 글의 쓸만한 그림은 먼저 쓴다(10-05)
    손, 부른다음, 받은, _, _ = 카드판(monkeypatch, 소식들=({**좋은, "media": "없음"},), 영상=False)
    기록, 단계들 = 끝까지(손, 부른다음)
    assert 단계들[-1] == "카드굽기" and 기록["result"]["bundle"][0]["그림설명"] == "떡집 가게 앞을 그린다."
    assert "· 그림 설명: 떡집 가게 앞을 그린다." in 기록["재료"]["news"] and 받은["지시"][0] == cards.그림설명지시


def test_카드_그림은_사진_없는_장마다_사람_없이_그려_주간_그림으로(monkeypatch):
    # 사람은 절대 AI 로 그리지 않는다(사용자 «ㅇㅇ», 42++ C) — 위키 얼굴 참고 고쳐 그리기는 없앴다
    받은 = []
    monkeypatch.setattr(runs, "그림", lambda 기록, 손r: 받은.append([s.get("gen_prompt_en") for s in 기록["재료"]["굽기장"]]))
    손 = SimpleNamespace(노드=SimpleNamespace(), 옛서버=None, 딥시크한번=None, 그림=None, 창고=None, 잠자기=None,
                        지금=None, 다음부르기=None, 남은초=None)
    장들 = [{"no": 2, "type": "뉴스", "media_url": "", "gen_prompt_en": "scene 1"},
           {"no": 3, "type": "뉴스", "media_url": "https://s3/a.jpg", "gen_prompt_en": "scene 2"},
           {"no": 4, "type": "CTA", "media_url": ""}]
    기록 = {"재료": {"카드": {"분야": "아이브", "이름표": "9월 4주차"}, "굽기장": 장들}}
    assert cards.카드그림(기록, 손) == "카드굽기"
    cards.카드그림(기록, 손)  # 이어 달려도 두 번 붙이지 않는다
    assert 받은[-1] == ["scene 1" + cards.사람없이, "scene 2", None]
    assert not hasattr(cards, "얼굴그림") and not hasattr(flow.손, "고쳐그리기")


def test_그림_표지가_안전_검사에_막히면_사진_없이_한_번만_다시_굽는다(monkeypatch):
    # 아이브 9월 4주차 표지가 OpenAI 안전 검사에 막혀 표지 없이 나갔다(10-05). 사진 표지는 그리지 않아 막힐 일이 없다(42++ D)
    손, 부른다음, 받은, _, _ = 카드판(monkeypatch)
    구운표지 = []
    거절 = ("굽기 실패 — RuntimeError: OpenAI 그림 실패 HTTP 400: {\n  \"error\": {\n    \"message\": "
            "\"Your request was rejected by the safety system.")

    def 굽기(기록, 손r):
        구운표지.append(dict(기록["재료"]["표지"]))
        기록["result"] = {"viewer": f"https://v/{len(구운표지)}.html", "slides": 3, "missing_slides": [{"no": 1, "why": 거절}],
                         "missing_brands": []}

    monkeypatch.setattr(runs, "굽기", 굽기)
    기록, 단계들 = 끝까지(손, 부른다음)
    assert 단계들[-2:] == ["카드굽기", "카드굽기"] and 기록["state"] == "됨" and len(구운표지) == 2
    assert 구운표지[1].get("face_none") and "photo_url" not in 구운표지[1]
    assert 기록["재료"]["카드"]["표지다시"] == 1 and 기록["result"]["카드"]["보기"] == "https://v/2.html"


def test_표지가_다른_까닭으로_빠지면_다시_굽지_않는다(monkeypatch):
    손, 부른다음, 받은, _, _ = 카드판(monkeypatch)
    횟수 = []

    def 굽기(기록, 손r):
        횟수.append(1)
        기록["result"] = {"viewer": "https://v/1.html", "slides": 2, "missing_slides": [{"no": 1, "why": "시간 초과(5분)"}],
                         "missing_brands": []}

    monkeypatch.setattr(runs, "굽기", 굽기)
    기록, 단계들 = 끝까지(손, 부른다음)
    assert 단계들.count("카드굽기") == 1 and len(횟수) == 1 and 기록["state"] == "됨"



# ── 계획 4 과제 42++ D — 표지는 진짜 사진 ──

def test_표지_사진은_소식_차례로_큰_사진이고_얼굴이_있는_첫_것():
    사진 = lambda 키, 크기, **더: {"갈래": "사진", "키": 키, "크기": 크기, **더}  # noqa: E731
    소식들 = [소식(1, "아이브", {"갈래": "영상", "키": "m/1.mp4", "대표키": "m/1_t.jpg"}),   # 영상 대표화면은 작다 — 안 쓴다
             소식(2, "그룹", 사진("m/2.jpg", [800, 500])),                             # 짧은 변 500
             소식(3, "안유진", 사진("m/3.jpg", [1200, 900])),                           # 얼굴 0
             소식(4, "리즈", 사진("m/4.jpg", [1200, 1600], 대표키="m/4_t.jpg", 자료사진=True)),
             소식(5, "레이", 사진("m/5.jpg", [2000, 3000]))]
    센 = []

    def 얼굴수(주소):
        센.append(주소)
        return {"https://s3/m/3.jpg": 0}.get(주소, 1)
    assert cards.표지사진고르기(소식들, 얼굴수, 주소, "아이브") == {"키": "m/4.jpg", "주인공": "리즈", "사람": 1}
    assert 센 == ["https://s3/m/3.jpg", "https://s3/m/4_t.jpg"]  # 작은 대표 그림이 있으면 그것으로 센다
    그룹 = [소식(1, "그룹", 사진("m/9.jpg", [1080, 1350]))]
    assert cards.표지사진고르기(그룹, lambda 주소: 3, 주소, "아이브")["주인공"] == "아이브"
    assert cards.표지사진고르기(소식들[:3], 얼굴수, 주소, "아이브") is None

    def 터짐(주소):
        raise RuntimeError("판정 실패")
    assert cards.표지사진고르기(그룹, 터짐, 주소, "아이브") is None  # 못 세면 그 사진은 안 쓴다


def test_카드_대본이_고른_표지_사진이_표지_장에_깔린다(monkeypatch):
    손, 부른다음, 받은, _, _ = 카드판(monkeypatch)
    monkeypatch.setattr(cards, "표지사진고르기", lambda 소식들, 얼굴수, 주소r, 분야: {"키": "k/01.jpg", "주인공": "리즈", "사람": 1})
    구운 = []
    monkeypatch.setattr(runs, "굽기", lambda 기록, 손r: 구운.append(dict(기록["재료"]["표지"])) or 기록.update(
        result={"viewer": "https://v/1.html", "slides": 2, "missing_slides": [], "missing_brands": []}))
    기록, _ = 끝까지(손, 부른다음)
    assert 구운[0]["photo_url"].endswith("/k/01.jpg") and 구운[0]["face_none"] is True and 구운[0]["brand"] == "리즈"
    assert "no person" in 받은["지시"][0]
