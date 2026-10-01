# -*- coding: utf-8 -*-
import json
from pathlib import Path

재료 = Path(__file__).resolve().parent / "재료"


def test_소식_재료():
    d = json.loads((재료 / "procure_efbe7c38.json").read_text(encoding="utf-8"))
    assert d["state"] == "됨" and d["count"]["x"] == 185 and d["count"]["blog"] == 28
    assert d["week"]["라벨"] == "9월 3주차"


def test_dify_재료():
    d = json.loads((재료 / "dify_53a92a48.json").read_text(encoding="utf-8"))
    assert d["소식고르기"]["count"] >= 1 and len(d["소식고르기"]["news_sha256"]) == 64
    for 이름 in ("본문 대본", "본문 다시 쓰기", "표지 훅", "훅 다시 쓰기"):
        assert d["글"][이름], 이름
    # 이 실행은 본문이 한 번 걸려 고쳤고, 표지는 옛 사람판정에 세 번 다 걸렸다
    assert d["검사"]["본문 검증"]["ok"] == "0" and d["검사"]["본문 검증 2"]["ok"] == "1"
    assert d["검사"]["훅 검증 3"]["ok"] == "0"
