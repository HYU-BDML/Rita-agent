# -*- coding: utf-8 -*-
"""수리공 진짜 시험(계획 4 시험 5·6) — 시험용 장부(weekly/memory/registry-test.json)를 일부러 망가뜨리고 수리공 람다를 부른다.
운영 장부·운영 상태 파일은 안 건드린다. 돈: Apify 몇 센트 · 딥시크 몇 센트(수리 한 번 울타리 $0.20).

    python weekly/tests/repair_try.py 입력틀림   # x_search 입력 칸 이름을 틀리게(searchTerms → searchTermz) — 입력 맞추기
    python weekly/tests/repair_try.py 도구없음   # x_search 도구를 없는 이름으로 — 다른 도구로 갈아타기
    python weekly/tests/repair_try.py 보기       # 시험용 상태·장부 칸만 본다(돈 0)
"""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
from topic import registry, repair  # noqa: E402

통 = "<S3 통 이름>"
시험키 = "memory/registry-test.json"
칸 = "x_search"


def 시험장부만들기(s3, 망가뜨리기: str, 통_: str = 통) -> dict:
    d = {이름: registry._씨앗칸(항목) for 이름, 항목 in registry.읽기().items()}
    d["_씨앗"] = registry._씨앗지문()
    x = d[칸]
    if 망가뜨리기 == "입력틀림":
        x["입력"] = {("searchTermz" if k == "searchTerms" else k): v for k, v in x["입력"].items()}
    elif 망가뜨리기 == "도구없음":
        x["도구"] = "nobody~no-such-actor-for-repair-test"
    else:
        raise ValueError(f"모르는 망가뜨리기 «{망가뜨리기}» — 입력틀림·도구없음")
    registry.장부(s3, 통_, "weekly/", 키=시험키)._두기(시험키, d)
    # 지난 시험의 끝 상태를 지운다 — 기다리다 옛 «고침» 을 이번 것으로 읽지 않게
    repair.상태창고(s3, 통_, "weekly/", 시험키).쓰기(칸, {"상태": "시험 준비", "시작": "", "끝": ""})
    return d


def main() -> None:
    import boto3
    s3 = boto3.client("s3", region_name="ap-northeast-2")
    무엇 = sys.argv[1] if len(sys.argv) > 1 else "보기"
    상태 = repair.상태창고(s3, 통, "weekly/", 시험키)
    if 무엇 != "보기":
        시험장부만들기(s3, 무엇)
        요청 = {"도구": 칸, "job": "수리공-진짜시험", "탈": {"종류": "입력" if 무엇 == "입력틀림" else "고장",
                                                    "말": f"진짜 시험 — {무엇}"},
              "값": {}, "장부키": 시험키, "판남은돈": repair.한번돈}
        boto3.client("lambda", region_name="ap-northeast-2").invoke(
            FunctionName="weekly-ai", InvocationType="Event",
            Payload=json.dumps({"_repair": 요청}, ensure_ascii=False).encode("utf-8"))
        print("수리공을 불렀다 —", 무엇, flush=True)
        끝 = time.time() + 900
        while time.time() < 끝:
            s = 상태.읽기(칸) or {}
            if s.get("상태") in ("고침", "못고침", "글없음"):
                break
            print(time.strftime("%H:%M:%S"), s.get("상태"), flush=True)
            time.sleep(15)
    s = 상태.읽기(칸) or {}
    print("상태:", json.dumps({k: s.get(k) for k in ("상태", "까닭", "사람할일", "돈", "딥시크", "아피파이", "시험수",
                                                    "시작", "끝")}, ensure_ascii=False))
    x = registry.장부(s3, 통, "weekly/", 키=시험키).읽기(새로=True)[칸]
    print("시험용 장부 x_search:", json.dumps({k: x.get(k) for k in ("도구", "입력", "건당", "시작삯")}, ensure_ascii=False))
    print("고친 기록:", json.dumps((x.get("고친기록") or [])[-1:], ensure_ascii=False))


if __name__ == "__main__":
    main()
