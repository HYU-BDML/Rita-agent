# -*- coding: utf-8 -*-
"""작업대를 진짜 브라우저로 누른다 — 글자 효과는 글자에 붙는다(2026-09-28).

플레이라이트(파이썬)와 크로미움이 없으면 건너뛴다. 창고·서버는 안 부른다 —
쪽을 파일로 구워 열고, 화면 안의 `상태.cards` 를 읽는다.
"""
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import edit_store as es   # noqa: E402
import workbench          # noqa: E402

playwright = pytest.importorskip("playwright.sync_api")


def _쪽(tmp_path, 칸):
    카드 = {"index": 1, "역할": "훅", "배경": {"종류": "단색", "hex": "#FFFFFF"},
          "장식영역": [], "글자영역": [칸]}
    길 = tmp_path / "작업대.html"
    길.write_text(workbench.쪽만들기("시험", [카드], []), encoding="utf-8")
    return 길


def _칸(**더):
    return {"종류": "글자", "box": [100, 300, 460, 520], "pt": 40, "weight": "Regular",
            "align": "왼쪽", "font": "프리텐다드", "글자색": "#111111", **더}


@pytest.fixture
def 쪽열기():
    with playwright.sync_playwright() as p:
        try:
            b = p.chromium.launch()
        except Exception as e:  # noqa: BLE001
            pytest.skip(f"크로미움이 없다: {e}")

        def 열기(길):
            page = b.new_page(viewport={"width": 1400, "height": 1000})
            오류 = []
            page.on("pageerror", lambda e: 오류.append(str(e)))
            page.on("dialog", lambda d: (오류.append("알림창: " + d.message), d.dismiss()))
            page.goto(길.as_uri())
            page.wait_for_selector(".칸.글자", timeout=20000)
            page.wait_for_timeout(500)
            return page, 오류
        yield 열기
        b.close()


def _칸고르기(page):
    칸 = page.locator(".칸.글자").first.bounding_box()
    page.mouse.click(칸["x"] + 칸["width"] / 2, 칸["y"] + 칸["height"] / 2)
    page.wait_for_selector(".선택겹 .손잡이", timeout=5000)


def _커서(page, 몸):
    """글자 칸에 입력을 주고(포커스) `몸` 이 셀렉션을 놓는다. `몸` 안에서 `칸`·`줄들` 을 쓴다."""
    page.evaluate("() => { const 칸 = document.querySelector('.칸.글자.골랐음'); 칸.focus();"
                  " const 줄들 = 칸.querySelectorAll(':scope > .줄');"
                  " const s = getSelection(); s.removeAllRanges(); const r = document.createRange();"
                  f" {몸}; s.addRange(r) }}")


def _밖으로(page):
    """칸에서 손을 뗀다 — 고친 글이 모델로 들어간다(`blur`)."""
    page.evaluate("() => document.activeElement && document.activeElement.blur()")
    page.wait_for_timeout(200)


def _글줄(page):
    return page.evaluate("() => 상태.cards[0].글자영역[0].글줄")


def test_칸을_넓혀도_색이_그_글자에_있고_저장_검사를_통과한다(tmp_path, 쪽열기):
    """동료 오류(2026-09-28)의 재현 대본 그대로 — 옛 코드에서는 「색구간2: 2 번 줄이 없다」."""
    page, 오류 = 쪽열기(_쪽(tmp_path, _칸(lines=["가나다라 마바사", "아자차카 타파하"],
                                     색구간=[{"줄번호": 2, "시작": 0, "끝": 4, "색": "#0000FF"}])))
    _칸고르기(page)
    손 = page.locator(".선택겹 .손잡이").nth(3).bounding_box()     # 오른쪽 가운데(e)
    x, y = 손["x"] + 손["width"] / 2, 손["y"] + 손["height"] / 2
    page.mouse.move(x, y)
    page.mouse.down()
    for k in range(1, 11):
        page.mouse.move(x + 40 * k, y)
    page.mouse.up()
    page.wait_for_timeout(300)
    글줄 = _글줄(page)
    assert len(글줄) == 1, 글줄
    assert {"글": "아자차카", "색": "#0000FF"} in 글줄[0]["덩어리"], 글줄
    assert es.설계도_탈(page.evaluate("() => 상태.cards")) == []
    assert not 오류, 오류


def test_첫_줄_가운데서_엔터를_쳐도_굵은_글자만_굵다(tmp_path, 쪽열기):
    칸 = es.글줄로(_칸(lines=["첫줄제목"], 굵기=[{"줄번호": 1, "시작": 0, "끝": 4}]))
    page, 오류 = 쪽열기(_쪽(tmp_path, 칸))
    _칸고르기(page)
    _커서(page, "const t = 줄들[0].querySelector('span.덩').firstChild; r.setStart(t, 2); r.collapse(true)")
    page.keyboard.press("Enter")
    page.wait_for_timeout(100)
    page.keyboard.type("x")
    _밖으로(page)
    assert [d for 줄 in _글줄(page) for d in 줄["덩어리"]] == [
        {"글": "첫줄", "굵게": True}, {"글": "x"}, {"글": "제목", "굵게": True}], _글줄(page)
    assert not 오류, 오류


def test_효과_덩어리_끝에_친_글자는_효과가_없다(tmp_path, 쪽열기):
    칸 = es.글줄로(_칸(lines=["완벽히 된다"], 색구간=[{"줄번호": 1, "시작": 0, "끝": 3, "색": "#FF0000"}]))
    page, 오류 = 쪽열기(_쪽(tmp_path, 칸))
    _칸고르기(page)
    _커서(page, "const t = 줄들[0].querySelector('span.덩').firstChild; r.setStart(t, t.length); r.collapse(true)")
    page.keyboard.type("!")
    _밖으로(page)
    assert _글줄(page)[0]["덩어리"] == [{"글": "완벽히", "색": "#FF0000"}, {"글": "! 된다"}]
    assert not 오류, 오류


def test_효과_덩어리_안에서_친_글자는_그_효과를_받는다(tmp_path, 쪽열기):
    칸 = es.글줄로(_칸(lines=["완벽히"], 색구간=[{"줄번호": 1, "시작": 0, "끝": 3, "색": "#FF0000"}]))
    page, 오류 = 쪽열기(_쪽(tmp_path, 칸))
    _칸고르기(page)
    _커서(page, "const t = 줄들[0].querySelector('span.덩').firstChild; r.setStart(t, 2); r.collapse(true)")
    page.keyboard.type("x")
    _밖으로(page)
    assert _글줄(page)[0]["덩어리"] == [{"글": "완벽x히", "색": "#FF0000"}]
    assert not 오류, 오류


def test_긁은_위에_치면_새_글자는_효과가_없다(tmp_path, 쪽열기):
    """시나리오 10 — 긁은 글자는 지워진 것이라 효과도 끝이다. 새로 친 글자는 새 글자다."""
    칸 = es.글줄로(_칸(lines=["가나다라"], 색구간=[{"줄번호": 1, "시작": 0, "끝": 4, "색": "#FF0000"}]))
    page, 오류 = 쪽열기(_쪽(tmp_path, 칸))
    _칸고르기(page)
    _커서(page, "const t = 줄들[0].querySelector('span.덩').firstChild; r.setStart(t, 1); r.setEnd(t, 3)")
    page.keyboard.type("x")
    _밖으로(page)
    assert _글줄(page)[0]["덩어리"] == [{"글": "가", "색": "#FF0000"}, {"글": "x"},
                                     {"글": "라", "색": "#FF0000"}]
    assert not 오류, 오류


def test_문장_맨_앞_백스페이스는_합치고_앞_문장_글머리만_남는다(tmp_path, 쪽열기):
    """시나리오 23 — 브라우저가 두 줄을 합치면 앞 줄 div 가 남아 앞 문장 것만 남는다."""
    칸 = _칸(lines=["하나", "둘"],
            글줄=[{"새문장": True, "덩어리": [{"글": "하나"}]},
                {"새문장": True, "글머리": "원", "덩어리": [{"글": "둘", "굵게": True}]}])
    page, 오류 = 쪽열기(_쪽(tmp_path, 칸))
    _칸고르기(page)
    _커서(page, "r.setStart(줄들[1], 0); r.collapse(true)")
    page.keyboard.press("Backspace")
    _밖으로(page)
    assert _글줄(page) == [{"새문장": True, "덩어리": [{"글": "하나"}, {"글": "둘", "굵게": True}]}]
    assert not 오류, 오류


def test_글을_비우면_효과도_없어진다(tmp_path, 쪽열기):
    칸 = es.글줄로(_칸(lines=["가나다"], 색구간=[{"줄번호": 1, "시작": 0, "끝": 2, "색": "#FF0000"}]))
    page, 오류 = 쪽열기(_쪽(tmp_path, 칸))
    _칸고르기(page)
    _밖으로(page)
    page.keyboard.press("Delete")      # 칸이 골라진 채(글 편집 아님) Delete 한 번 = 글 비우기
    page.wait_for_timeout(200)
    assert _글줄(page) == [{"새문장": True, "덩어리": []}]
    assert not 오류, 오류


def test_색_고르개를_열어_둔_채_두_번_골라도_같은_글자에(tmp_path, 쪽열기):
    """무지개 판은 창이 열린 채 여러 번 고른다 — 두 번째 색도 같은 글자에 걸려야 한다."""
    칸 = es.글줄로(_칸(lines=["가나다라"]))
    page, 오류 = 쪽열기(_쪽(tmp_path, 칸))
    _칸고르기(page)
    _커서(page, "const t = 줄들[0].firstChild; r.setStart(t, 1); r.setEnd(t, 3)")
    page.locator('button.색칩[title^="글자 색"]').click()
    page.locator("#색고르개 .미리보기").click()          # 무지개 판을 편다
    판 = page.locator("#색고르개 .판").bounding_box()
    for 곳 in ((0.9, 0.1), (0.2, 0.3)):                    # 두 번 고른다
        page.mouse.move(판["x"] + 판["width"] * 곳[0], 판["y"] + 판["height"] * 곳[1])
        page.mouse.down()
        page.mouse.up()
        page.wait_for_timeout(150)
    page.mouse.click(5, 990)                              # 밖을 누르면 창이 닫힌다
    page.wait_for_timeout(200)
    덩어리 = _글줄(page)[0]["덩어리"]
    assert [d["글"] for d in 덩어리] == ["가", "나다", "라"], 덩어리
    assert "색" in 덩어리[1] and all("_고름" not in d for d in 덩어리), 덩어리
    assert page.evaluate("() => 상태.cards[0].글자영역[0].글자색") == "#111111", "칸 전체 색이 바뀌었다"
    assert not 오류, 오류


def test_바깥_붙여넣기는_글만_작업대_안_잘라_붙이기는_효과째(tmp_path, 쪽열기):
    칸 = es.글줄로(_칸(lines=["빨강 보통"], 색구간=[{"줄번호": 1, "시작": 0, "끝": 2, "색": "#FF0000"}]))
    page, 오류 = 쪽열기(_쪽(tmp_path, 칸))
    _칸고르기(page)
    _커서(page, "r.selectNodeContents(줄들[0].querySelector('span.덩'))")
    page.evaluate("""() => {
      const 칸 = document.querySelector('.칸.글자.골랐음')
      const 표 = new DataTransfer()
      칸.dispatchEvent(new ClipboardEvent('cut', { clipboardData: 표, bubbles: true, cancelable: true }))
      window.__표 = 표 }""")
    _커서(page, "r.selectNodeContents(줄들[0]); r.collapse(false)")
    page.evaluate("""() => {
      const 칸 = document.querySelector('.칸.글자.골랐음')
      칸.dispatchEvent(new ClipboardEvent('paste', { clipboardData: window.__표, bubbles: true, cancelable: true }))
      const 밖 = new DataTransfer(); 밖.setData('text/plain', '밖글')
      칸.dispatchEvent(new ClipboardEvent('paste', { clipboardData: 밖, bubbles: true, cancelable: true })) }""")
    _밖으로(page)
    assert _글줄(page)[0]["덩어리"] == [{"글": "보통"}, {"글": "빨강", "색": "#FF0000"}, {"글": "밖글"}]
    assert not 오류, 오류


def test_글머리_칸을_눌렀다_떼기만_하면_고친_것이_없다(tmp_path, 쪽열기):
    """누르기만 한 것으로 달라지면 안 된다(사람 지적 2026-08-27). 줄 칸의 차례가 서버·
    `다시끊기`·화면에서 달라도(여기는 `다시끊기` 차례) 되돌리기 칸·「저장 •」이 안 생긴다."""
    칸 = _칸(lines=["하나 둘"], 글줄=[{"새문장": True, "글머리": "원", "덩어리": [{"글": "하나 둘"}]}])
    page, 오류 = 쪽열기(_쪽(tmp_path, 칸))
    _칸고르기(page)
    _밖으로(page)
    assert page.evaluate("() => [기록.length, 안저장]") == [0, False]
    assert not 오류, 오류


# ── 고침 1회차(2026-09-29) — 줄을 넘는 긁기, 경계, 색값 칸, 작은 것들 ────────────

def _두줄():
    """「가나다」 / 「라」+굵은「마바」 — 두 문장."""
    return _칸(lines=["가나다", "라마바"],
              글줄=[{"새문장": True, "덩어리": [{"글": "가나다"}]},
                  {"새문장": True, "덩어리": [{"글": "라"}, {"글": "마바", "굵게": True}]}])


def _붙이기(page, 글):
    page.evaluate("""(글) => {
      const 칸 = document.querySelector('.칸.글자.골랐음')
      const 표 = new DataTransfer(); 표.setData('text/plain', 글)
      칸.dispatchEvent(new ClipboardEvent('paste', { clipboardData: 표, bubbles: true, cancelable: true })) }""", 글)


def _표에담기(page, 갈래):
    """`copy`·`cut` 을 칸에 보내고 표를 `window.__표` 에 둔다."""
    page.evaluate("""(갈래) => {
      const 칸 = document.querySelector('.칸.글자.골랐음')
      const 표 = new DataTransfer()
      칸.dispatchEvent(new ClipboardEvent(갈래, { clipboardData: 표, bubbles: true, cancelable: true }))
      window.__표 = 표 }""", 갈래)


def _표붙이기(page):
    page.evaluate("""() => {
      const 칸 = document.querySelector('.칸.글자.골랐음')
      칸.dispatchEvent(new ClipboardEvent('paste', { clipboardData: window.__표, bubbles: true, cancelable: true })) }""")


def test_줄을_넘게_긁고_붙여도_붙인_글이_남는다(tmp_path, 쪽열기):
    """Critical 1 — 전부 긁고(Ctrl+A) 붙이면 줄 div 가 빠져 붙인 글이 줄 «밖» 에 들어가 사라졌다."""
    page, 오류 = 쪽열기(_쪽(tmp_path, _두줄()))
    _칸고르기(page)
    _커서(page, "r.setStart(줄들[0].firstChild, 0); r.collapse(true)")
    page.keyboard.press("Control+A")
    _붙이기(page, "새 글")
    _밖으로(page)
    assert _글줄(page) == [{"새문장": True, "덩어리": [{"글": "새 글"}]}]
    assert not 오류, 오류


def test_줄을_넘게_긁고_치면_맨_글자가_되고_두_줄이_합쳐진다(tmp_path, 쪽열기):
    page, 오류 = 쪽열기(_쪽(tmp_path, _두줄()))
    _칸고르기(page)
    _커서(page, "r.setStart(줄들[0].firstChild, 2); r.setEnd(줄들[1].querySelector('span.덩').firstChild, 1)")
    page.keyboard.type("x")
    _밖으로(page)
    assert _글줄(page) == [{"새문장": True, "덩어리": [{"글": "가나x"}, {"글": "바", "굵게": True}]}]
    assert not 오류, 오류


def test_줄을_넘게_긁고_백스페이스해도_굵은_글자가_굵다(tmp_path, 쪽열기):
    page, 오류 = 쪽열기(_쪽(tmp_path, _두줄()))
    _칸고르기(page)
    _커서(page, "r.setStart(줄들[0].firstChild, 1); r.setEnd(줄들[1].firstChild, 1)")
    page.keyboard.press("Backspace")
    _밖으로(page)
    assert _글줄(page) == [{"새문장": True, "덩어리": [{"글": "가"}, {"글": "마바", "굵게": True}]}]
    assert not 오류, 오류


def test_줄을_넘게_잘라_작업대_안에_붙이면_효과째_간다(tmp_path, 쪽열기):
    page, 오류 = 쪽열기(_쪽(tmp_path, _두줄()))
    _칸고르기(page)
    _커서(page, "r.setStart(줄들[0].firstChild, 2); r.setEnd(줄들[1].querySelector('span.덩').firstChild, 2)")
    _표에담기(page, "cut")
    _커서(page, "r.selectNodeContents(줄들[0]); r.collapse(false)")
    _표붙이기(page)
    _밖으로(page)
    assert _글줄(page) == [{"새문장": True, "덩어리": [{"글": "가나다 라"}, {"글": "마바", "굵게": True}]}]
    assert not 오류, 오류


def test_색_고르개에_색값을_쳐도_긁은_데만_바뀐다(tmp_path, 쪽열기):
    """Important 2 — 창을 먼저 닫으면 `_고름` 표가 떨어져 칸 전체 색이 바뀌었다."""
    칸 = es.글줄로(_칸(lines=["가나다라"]))
    page, 오류 = 쪽열기(_쪽(tmp_path, 칸))
    _칸고르기(page)
    _커서(page, "const t = 줄들[0].firstChild; r.setStart(t, 1); r.setEnd(t, 3)")
    page.locator('button.색칩[title^="글자 색"]').click()
    page.locator("#색고르개 .직접 input[type=text]").fill("#00AA00")
    page.locator("#색고르개 .직접 input[type=text]").press("Enter")
    page.wait_for_timeout(200)
    assert _글줄(page)[0]["덩어리"] == [{"글": "가"}, {"글": "나다", "색": "#00AA00"}, {"글": "라"}]
    assert page.evaluate("() => 상태.cards[0].글자영역[0].글자색") == "#111111", "칸 전체 색이 바뀌었다"
    assert page.locator("#색고르개").count() == 0, "창이 안 닫혔다"
    assert not 오류, 오류


def test_합친_자리_바로_뒤에_친_글자는_효과가_없다(tmp_path, 쪽열기):
    """Important 3 — 합치면 커서가 (줄, 몇째) 에 놓인다. 바로 앞이 효과 덩어리여도 새 글자는 맨 글자."""
    칸 = es.글줄로(_칸(lines=["하나", "둘"], 색구간=[{"줄번호": 1, "시작": 0, "끝": 2, "색": "#FF0000"}]))
    page, 오류 = 쪽열기(_쪽(tmp_path, 칸))
    _칸고르기(page)
    _커서(page, "const t = 줄들[0].querySelector('span.덩').firstChild; r.setStart(t, t.length); r.collapse(true)")
    page.keyboard.press("Delete")
    page.keyboard.type("x")
    _밖으로(page)
    assert _글줄(page) == [{"새문장": True, "덩어리": [{"글": "하나", "색": "#FF0000"}, {"글": "x둘"}]}]
    assert not 오류, 오류


def test_작업대_안에서_붙인_효과_덩어리_바로_뒤에_친_글자는_효과가_없다(tmp_path, 쪽열기):
    칸 = es.글줄로(_칸(lines=["빨강 보통"], 색구간=[{"줄번호": 1, "시작": 0, "끝": 2, "색": "#FF0000"}]))
    page, 오류 = 쪽열기(_쪽(tmp_path, 칸))
    _칸고르기(page)
    _커서(page, "r.selectNodeContents(줄들[0].querySelector('span.덩'))")
    _표에담기(page, "copy")
    _커서(page, "r.selectNodeContents(줄들[0]); r.collapse(false)")
    _표붙이기(page)
    page.keyboard.type("y")
    _밖으로(page)
    assert _글줄(page)[0]["덩어리"] == [{"글": "빨강", "색": "#FF0000"}, {"글": " 보통"},
                                     {"글": "빨강", "색": "#FF0000"}, {"글": "y"}]
    assert not 오류, 오류


def test_읽은칸이_남아_다음_blur_를_삼키지_않는다(tmp_path, 쪽열기):
    """M1 — 효과를 걸다 도중에 탈이 나도(`다시그리기` 전) 그 칸의 다음 `blur` 는 친 글을 넣는다."""
    칸 = es.글줄로(_칸(lines=["가나다"]))
    page, 오류 = 쪽열기(_쪽(tmp_path, 칸))
    _칸고르기(page)
    _커서(page, "const t = 줄들[0].firstChild; r.setStart(t, t.length); r.collapse(true)")
    page.keyboard.type("x")
    page.evaluate("() => { window.__원래 = 다시끊기; window.다시끊기 = () => { throw new Error('시험용 탈') } }")
    page.keyboard.press("Control+b")
    page.evaluate("() => { window.다시끊기 = window.__원래 }")
    _밖으로(page)
    assert _글줄(page)[0]["덩어리"] == [{"글": "가나다x"}]
    assert 오류 and all("시험용 탈" in x for x in 오류), 오류


def test_안_긁고_형광펜을_골라도_바꿀_것이_없으면_고친_것이_없다(tmp_path, 쪽열기):
    """M2 — 칠한 형광펜이 없는데 안 긁고 색이나 «없음» 을 고르면 되돌리기 칸·「저장 •」이 안 생긴다."""
    칸 = es.글줄로(_칸(lines=["가나다"]))
    page, 오류 = 쪽열기(_쪽(tmp_path, 칸))
    _칸고르기(page)
    page.locator('button.색칩[title^="형광펜"]').click()
    page.locator('#색고르개 .칩[title="#FFD966"]').click()
    assert page.evaluate("() => [기록.length, 안저장]") == [0, False]
    page.locator('button.색칩[title^="형광펜"]').click()
    page.locator("#색고르개 .칩.없음").click()
    assert page.evaluate("() => [기록.length, 안저장]") == [0, False]
    assert _글줄(page) == [{"새문장": True, "덩어리": [{"글": "가나다"}]}]
    assert not 오류, 오류


def test_색_고르개가_열린_동안_칠할_글자가_보인다(tmp_path, 쪽열기):
    """M3 — 손잡이엔 상태 표시까지. 표(`_고름`)는 저장 전에 떼므로 화면에만 있다."""
    칸 = es.글줄로(_칸(lines=["가나다라"]))
    page, 오류 = 쪽열기(_쪽(tmp_path, 칸))
    _칸고르기(page)
    _커서(page, "const t = 줄들[0].firstChild; r.setStart(t, 1); r.setEnd(t, 3)")
    page.locator('button.색칩[title^="글자 색"]').click()
    모양 = page.evaluate("() => { const x = document.querySelector('.칸.글자 span.덩[data-고름]');"
                       " return x && [x.textContent, getComputedStyle(x).outlineStyle] }")
    assert 모양 == ["나다", "dashed"], 모양
    assert not 오류, 오류


def test_빈_줄에서_Delete_로_합쳐도_br_이_안_남는다(tmp_path, 쪽열기):
    """M4 — 브라우저가 빈 줄에 끼운 `<br>` 이 이은 줄에 남으면 그 줄 안에서 줄이 바뀐다."""
    칸 = _칸(lines=["가", "나다"],
            글줄=[{"새문장": True, "덩어리": [{"글": "가"}]}, {"새문장": True, "덩어리": [{"글": "나다"}]}])
    page, 오류 = 쪽열기(_쪽(tmp_path, 칸))
    _칸고르기(page)
    _커서(page, "const t = 줄들[0].firstChild; r.setStart(t, 1); r.collapse(true)")
    page.keyboard.press("Backspace")     # 「가」를 지운다 — 브라우저가 빈 줄에 <br> 을 끼운다
    page.keyboard.press("Delete")        # 빈 줄 끝에서 Delete — 우리가 합친다
    assert page.evaluate("() => document.querySelector('.칸.글자.골랐음').querySelectorAll('br').length") == 0
    _밖으로(page)
    assert _글줄(page) == [{"새문장": True, "덩어리": [{"글": "나다"}]}]
    assert not 오류, 오류


def test_합치면_넘침을_다시_잰다(tmp_path, 쪽열기):
    """M4 — 합치기는 `input` 을 안 부르므로(우리가 막았다) 넘침 표를 따로 다시 붙인다."""
    칸 = _칸(lines=["가나다라마바", "사아자차카타"],
            글줄=[{"새문장": True, "덩어리": [{"글": "가나다라마바"}]},
                {"새문장": True, "덩어리": [{"글": "사아자차카타"}]}])
    page, 오류 = 쪽열기(_쪽(tmp_path, 칸))
    _칸고르기(page)
    넘침 = "() => document.querySelector('.칸.글자.골랐음 > .줄').classList.contains('넘침')"
    assert page.evaluate(넘침) is False
    _커서(page, "const t = 줄들[0].firstChild; r.setStart(t, t.length); r.collapse(true)")
    page.keyboard.press("Delete")
    assert page.evaluate(넘침) is True
    assert not 오류, 오류


def test_줄을_넘게_끌어_옮겨도_효과째_가고_두_줄이_합쳐진다(tmp_path, 쪽열기):
    """끌어 놓기도 끌던 곳을 `긁은것지우기` 로 지운다(조정 판정 2026-09-29).

    진짜 마우스 끌기 대신 `dragstart`·`drop` 을 같은 표(DataTransfer)로 칸에 보낸다 —
    `dragstart` 가 `el._끌던범위` 를 적는 길을 그대로 탄다. 놓는 곳은 둘째 줄 끝(굵은 「마바」 뒤).
    """
    page, 오류 = 쪽열기(_쪽(tmp_path, _두줄()))
    _칸고르기(page)
    _커서(page, "r.setStart(줄들[0].firstChild, 2); r.setEnd(줄들[1].firstChild, 1)")   # 「다」~「라」
    page.evaluate("""() => {
      const 칸 = document.querySelector('.칸.글자.골랐음')
      const 표 = new DataTransfer()
      칸.dispatchEvent(new DragEvent('dragstart', { dataTransfer: 표, bubbles: true, cancelable: true }))
      const b = 칸.querySelectorAll(':scope > .줄')[1].querySelector('span.덩').getBoundingClientRect()
      칸.dispatchEvent(new DragEvent('drop', { dataTransfer: 표, bubbles: true, cancelable: true,
        clientX: b.right + 4, clientY: b.top + b.height / 2 })) }""")
    _밖으로(page)
    assert _글줄(page) == [{"새문장": True, "덩어리": [
        {"글": "가나"}, {"글": "마바", "굵게": True}, {"글": "다 라"}]}]
    assert not 오류, 오류


# ── 고침 2회차(2026-09-29) — 지운 뒤 남은 빈 글자 노드, Shift+Delete, Ctrl+Backspace ─────

_굵은뒤맨글 = [{"새문장": True, "덩어리": [{"글": "가나", "굵게": True}, {"글": "다"}]}]
_맨글뒤굵은 = [{"새문장": True, "덩어리": [{"글": "라"}, {"글": "마바", "굵게": True}]}]
_맨글긁기 = {"앞": "const t = 줄들[0].lastChild; r.setStart(t, 0); r.setEnd(t, 1)",
          "뒤": "const t = 줄들[0].firstChild; r.setStart(t, 0); r.setEnd(t, 1)"}


@pytest.mark.parametrize("글줄, 긁기, 누를것, 기대", [
    # 지우고 치기 — 1회차의 우리 지우기가 빈 글자 노드를 남겨 새 글자가 옆 굵은 덩어리로 들어갔다
    (_굵은뒤맨글, _맨글긁기["앞"], "Backspace", [{"글": "가나", "굵게": True}, {"글": "x"}]),
    (_맨글뒤굵은, _맨글긁기["뒤"], "Delete", [{"글": "x"}, {"글": "마바", "굵게": True}]),
    # 곧바로 치기(긁은 위에) — 같은 까닭, 전부터 있던 것
    (_굵은뒤맨글, _맨글긁기["앞"], None, [{"글": "가나", "굵게": True}, {"글": "x"}]),
    (_맨글뒤굵은, _맨글긁기["뒤"], None, [{"글": "x"}, {"글": "마바", "굵게": True}]),
], ids=["굵은뒤_백스페이스", "굵은앞_Delete", "굵은뒤_곧바로", "굵은앞_곧바로"])
def test_굵은_덩어리_옆_맨_글을_지우고_친_글자는_맨_글자다(tmp_path, 쪽열기, 글줄, 긁기, 누를것, 기대):
    page, 오류 = 쪽열기(_쪽(tmp_path, _칸(lines=es.글줄글들(글줄), 글줄=글줄)))
    _칸고르기(page)
    _커서(page, 긁기)
    if 누를것:
        page.keyboard.press(누를것)
    page.keyboard.type("x")
    _밖으로(page)
    assert _글줄(page) == [{"새문장": True, "덩어리": 기대}]
    assert not 오류, 오류


@pytest.mark.parametrize("누를것", [None, "Backspace"], ids=["곧바로", "백스페이스뒤"])
def test_줄을_넘게_긁은_두_굵은_덩어리_사이에_친_글자는_맨_글자다(tmp_path, 쪽열기, 누를것):
    칸 = _칸(lines=["가나다", "라마바"], 글줄=[
        {"새문장": True, "덩어리": [{"글": "가나", "굵게": True}, {"글": "다"}]},
        {"새문장": True, "덩어리": [{"글": "라"}, {"글": "마바", "굵게": True}]}])
    page, 오류 = 쪽열기(_쪽(tmp_path, 칸))
    _칸고르기(page)
    _커서(page, "r.setStart(줄들[0].lastChild, 0); r.setEnd(줄들[1].firstChild, 1)")   # 「다」~「라」
    if 누를것:
        page.keyboard.press(누를것)
    page.keyboard.type("x")
    _밖으로(page)
    assert _글줄(page) == [{"새문장": True, "덩어리": [
        {"글": "가나", "굵게": True}, {"글": "x"}, {"글": "마바", "굵게": True}]}]
    assert not 오류, 오류


def test_Shift_Delete_는_잘라내기다(tmp_path, 쪽열기):
    """윈도에서 Shift+Delete 는 잘라내기 — 우리가 가로채면 `cut` 이 안 온다."""
    page, 오류 = 쪽열기(_쪽(tmp_path, _두줄()))
    _칸고르기(page)
    page.evaluate("() => { window.__잘림 = 0; document.addEventListener('cut', () => { window.__잘림 += 1 }) }")
    _커서(page, "r.setStart(줄들[0].firstChild, 2); r.setEnd(줄들[1].firstChild, 1)")   # 「다」~「라」
    page.keyboard.press("Shift+Delete")
    assert page.evaluate("() => window.__잘림") == 1, "cut 이 안 왔다"
    _밖으로(page)
    assert _글줄(page) == [{"새문장": True, "덩어리": [{"글": "가나"}, {"글": "마바", "굵게": True}]}]
    assert not 오류, 오류


def test_줄을_넘게_긁고_Ctrl_Backspace_해도_굵은_글자가_굵다(tmp_path, 쪽열기):
    page, 오류 = 쪽열기(_쪽(tmp_path, _두줄()))
    _칸고르기(page)
    _커서(page, "r.setStart(줄들[0].firstChild, 1); r.setEnd(줄들[1].firstChild, 1)")
    page.keyboard.press("Control+Backspace")
    _밖으로(page)
    assert _글줄(page) == [{"새문장": True, "덩어리": [{"글": "가"}, {"글": "마바", "굵게": True}]}]
    assert not 오류, 오류


# ── 고침 3회차(2026-09-29) — 경계 칸이 쌓이지 않는다 ─────────────────────────────

_경계수 = ("() => { const 줄 = document.querySelector('.칸.글자.골랐음 > .줄');"
         " const w = document.createTreeWalker(줄, NodeFilter.SHOW_TEXT); let n = 0;"
         " for (let x = w.nextNode(); x; x = w.nextNode()) if (x.textContent.includes('\\u200B')) n += 1;"
         " return n }")


def _굵은가나_끝(tmp_path, 쪽열기):
    page, 오류 = 쪽열기(_쪽(tmp_path, _칸(lines=["가나다"], 글줄=_굵은뒤맨글)))
    _칸고르기(page)
    _커서(page, "const t = 줄들[0].querySelector('span.덩').firstChild; r.setStart(t, t.length); r.collapse(true)")
    return page, 오류


def test_치고_지우고_다시_쳐도_경계_칸은_하나다(tmp_path, 쪽열기):
    """커서가 이미 경계 칸 안이면 그 칸을 다시 쓴다 — 새로 끼우면 치고 지울 때마다 쌓였다."""
    page, 오류 = _굵은가나_끝(tmp_path, 쪽열기)
    page.keyboard.type("x")
    page.keyboard.press("Backspace")
    page.keyboard.type("y")
    assert page.evaluate(_경계수) == 1
    page.keyboard.press("Backspace")
    _밖으로(page)
    assert _글줄(page) == _굵은뒤맨글
    assert not 오류, 오류


def test_네_번_치고_지운_뒤에도_경계_칸은_하나고_다_앞_백스페이스는_글자를_지운다(tmp_path, 쪽열기):
    """쌓인 경계 칸이 있으면 「다」 바로 앞에서 백스페이스가 보이지 않는 칸을 지워 아무 일도 안 난 것 같았다."""
    page, 오류 = _굵은가나_끝(tmp_path, 쪽열기)
    for _ in range(4):
        page.keyboard.type("x")
        page.keyboard.press("Backspace")
    page.keyboard.type("q")
    assert page.evaluate(_경계수) == 1
    _커서(page, "const t = 줄들[0].lastChild; r.setStart(t, 0); r.collapse(true)")   # 「다」 바로 앞
    page.keyboard.press("Backspace")
    _밖으로(page)
    assert _글줄(page) == _굵은뒤맨글
    assert not 오류, 오류


# ── 사람 요청(2026-09-29) — 글자색 칩이 누른 글자의 색과 그 색 이름(#RRGGBB)을 보여 준다 ────────

_글자색칩 = "#패널 button.색칩[title^='글자 색']"
_색이름 = f"() => document.querySelector(\"{_글자색칩} + .색이름\").textContent"
_칩배경 = f"() => getComputedStyle(document.querySelector(\"{_글자색칩}\")).backgroundColor"
_빨강속 = "const t = 줄들[0].querySelector('span.덩').firstChild; r.setStart(t, 1); r.collapse(true)"


def _빨강보통(tmp_path, 쪽열기):
    칸 = _칸(lines=["빨강 보통"],
            글줄=[{"새문장": True, "덩어리": [{"글": "빨강", "색": "#FF0000"}, {"글": " 보통"}]}])
    page, 오류 = 쪽열기(_쪽(tmp_path, 칸))
    _칸고르기(page)
    return page, 오류


@pytest.mark.parametrize("자리, 기대", [
    (_빨강속, "#FF0000"),
    ("const t = 줄들[0].lastChild; r.setStart(t, 2); r.collapse(true)", "#111111"),        # « 보통» 안 — 칸 색
    ("r.setStart(줄들[0].querySelector('span.덩').firstChild, 0); r.setEnd(줄들[0].lastChild, 2)",
     "#FF0000"),                                                                          # «빨»~«보» — 첫 글자
], ids=["빨강_안", "보통_안", "빨부터_보까지_긁기"])
def test_글자색_칩이_누른_글자의_색과_색_이름을_보여_준다(tmp_path, 쪽열기, 자리, 기대):
    page, 오류 = _빨강보통(tmp_path, 쪽열기)
    _커서(page, 자리)
    page.wait_for_timeout(100)                       # selectionchange 는 다음 차례에 온다
    assert page.evaluate(_색이름) == 기대
    n = int(기대[1:], 16)
    assert page.evaluate(_칩배경) == f"rgb({n >> 16}, {(n >> 8) & 255}, {n & 255})"
    assert not 오류, 오류


def test_글자색_칩으로_연_고르개도_그_글자의_색에서_시작한다(tmp_path, 쪽열기):
    page, 오류 = _빨강보통(tmp_path, 쪽열기)
    _커서(page, _빨강속)
    page.locator(_글자색칩).click()
    assert page.locator("#색고르개 .직접 input[type=text]").input_value() == "#FF0000"
    assert page.evaluate("() => getComputedStyle(document.querySelector('#색고르개 .미리보기'))"
                         ".backgroundColor") == "rgb(255, 0, 0)"
    assert not 오류, 오류


def test_고르개를_연_채_무지개에서_고르면_칩과_색_이름이_고른_색이다(tmp_path, 쪽열기):
    """고르면 다시 그려져 긁은 것이 풀린다 — 창이 열린 동안은 표(`_고름`) 단 첫 글자의 색을 보여 준다."""
    page, 오류 = 쪽열기(_쪽(tmp_path, es.글줄로(_칸(lines=["가나다라"]))))
    _칸고르기(page)
    _커서(page, "const t = 줄들[0].firstChild; r.setStart(t, 1); r.setEnd(t, 3)")
    page.locator(_글자색칩).click()
    page.locator("#색고르개 .미리보기").click()          # 무지개 판을 편다
    판 = page.locator("#색고르개 .판").bounding_box()
    page.mouse.click(판["x"] + 판["width"] * 0.9, 판["y"] + 판["height"] * 0.1)
    page.wait_for_timeout(150)
    고른색 = page.locator("#색고르개 .직접 input[type=text]").input_value().upper()
    assert 고른색 != "#111111" and _글줄(page)[0]["덩어리"][1]["색"].upper() == 고른색
    assert page.evaluate(_색이름) == 고른색
    assert not 오류, 오류


# ── 최종 검토(2026-09-29) ─────────────────────────────────────────────

def test_친_글이_있는_채_고르개를_열었다_그냥_닫아도_고친_것으로_친다(tmp_path, 쪽열기):
    """고르개를 열면 친 글이 모델에 들어간다 — 되돌리기 칸도 「저장 •」도 없이 들어가서,
    고르지 않고 닫으면 고친 글이 저장 안 된 줄 모르고 창을 닫을 수 있었다."""
    page, 오류 = 쪽열기(_쪽(tmp_path, es.글줄로(_칸(lines=["가나다"]))))
    _칸고르기(page)
    _커서(page, "const t = 줄들[0].firstChild; r.setStart(t, t.length); r.collapse(true)")
    page.keyboard.type("xy")
    _커서(page, "const t = 줄들[0].firstChild; r.setStart(t, 0); r.setEnd(t, 2)")
    page.locator(_글자색칩).click()
    page.wait_for_timeout(100)                            # 밖 누르기 귀는 다음 차례에 단다
    page.mouse.click(5, 990)                              # 고르지 않고 밖을 눌러 닫는다
    page.wait_for_timeout(200)
    assert page.locator("#색고르개").count() == 0, "창이 안 닫혔다"
    assert _글줄(page) == [{"새문장": True, "덩어리": [{"글": "가나다xy"}]}]
    assert page.evaluate("() => [기록.length, 안저장]") == [1, True]
    _밖으로(page)
    page.keyboard.press("Control+z")                      # 친 글이 되돌리기 한 칸이다
    page.wait_for_timeout(200)
    assert _글줄(page) == [{"새문장": True, "덩어리": [{"글": "가나다"}]}]
    assert not 오류, 오류


def test_고르개로_고르고_닫은_뒤_되돌려도_고름_표가_안_남는다(tmp_path, 쪽열기):
    """고르개가 열린 동안 고르면 표(`_고름`) 단 설계도가 되돌리기 칸에 들어간다 — 닫은 뒤
    Ctrl+Z 하면 그 표가 돌아와 창이 없는데도 점선이 남았다."""
    page, 오류 = 쪽열기(_쪽(tmp_path, es.글줄로(_칸(lines=["가나다라"]))))
    _칸고르기(page)
    _커서(page, "const t = 줄들[0].firstChild; r.setStart(t, 1); r.setEnd(t, 3)")
    page.locator(_글자색칩).click()
    page.locator('#색고르개 .칩[title="#CC0000"]').click()     # 고르면 창이 닫힌다
    page.wait_for_timeout(200)
    assert page.locator("#색고르개").count() == 0, "창이 안 닫혔다"
    _밖으로(page)
    page.keyboard.press("Control+z")
    page.wait_for_timeout(200)
    assert _글줄(page) == [{"새문장": True, "덩어리": [{"글": "가나다라"}]}]
    assert page.evaluate("() => JSON.stringify(상태.cards).includes('_고름')") is False
    assert page.locator("span.덩[data-고름]").count() == 0
    page.keyboard.press("Control+Shift+z")               # 다시 — 거기에도 표가 없다
    page.wait_for_timeout(200)
    assert _글줄(page)[0]["덩어리"] == [{"글": "가"}, {"글": "나다", "색": "#CC0000"}, {"글": "라"}]
    assert page.evaluate("() => JSON.stringify(상태.cards).includes('_고름')") is False
    assert page.locator("span.덩[data-고름]").count() == 0
    assert not 오류, 오류
