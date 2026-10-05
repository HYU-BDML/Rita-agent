# -*- coding: utf-8 -*-
"""공개 저장소 사본 — 뺄 것·가릴 것·남은 것 검사(계획 4 D-11). 이 파일도 사본에 들어가므로 진짜 값을 글자로 적지 않는다."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # weekly/ — rita_export 가 있는 곳
import rita_export as r  # noqa: E402


def test_진짜_판_번호가_든_평가_결과는_빼고_정답지는_둔다():
    assert r.뺄까("weekly/tests/평가/결과.json") and r.뺄까("weekly/tests/평가/계획4.json")
    assert r.뺄까("weekly/tests/재료/topic/x.json") and r.뺄까("weekly/rita_export.py")
    assert not r.뺄까("weekly/tests/평가/정답지.json") and not r.뺄까("weekly/server/app.py")


def test_서버_주소_통_이름_넘겨보기_번호_카드_번호를_가린다():
    주소, 빈주소 = r.바꿀것[0]
    통, 빈통 = r.바꿀것[2]
    글 = f"{주소}/jobs · https://{통}.s3.ap-northeast-2.amazonaws.com/viewer/{'ab' * 16}.html · s3://{통}/out/{'cd' * 16}/01.jpg"
    assert r.가리기(글) == (f"{빈주소}/jobs · https://{빈통}.s3.ap-northeast-2.amazonaws.com/viewer/<넘겨보기 번호>.html · "
                         f"s3://{빈통}/out/<카드 번호>/01.jpg")


def test_남은_것은_이름만_말하고_시험_가짜_열쇠는_안_잡는다():
    열쇠 = "apify_api_" + "Z" * 30
    판 = "2099" + "0101-000000-0a0b0c0d"
    글 = f"열쇠 {열쇠} · 판 {판} · https://" + "abcdefghij" + ".execute" + "-api.ap-northeast-2.amazonaws.com"
    남 = r.남은것(글, {판}, [열쇠])
    assert 남 == ["서버 주소", "진짜 열쇠", "진짜 판 번호"] and all(열쇠 not in x for x in 남)
    가짜 = "시험 가짜 apify_api_" + "A" * 30 + " · https://xxxx" + ".execute" + "-api.ap-northeast-2.amazonaws.com"
    assert r.남은것(가짜, set(), [열쇠]) == []
